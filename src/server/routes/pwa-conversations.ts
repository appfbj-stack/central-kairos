// Conversas PWA (Etapa 3b) + chat com streaming SSE.
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";
import { streamChat, isClientBlocked } from "../lib/llm";

const router = Router();
router.use(clientAuthMiddleware);

const CreateSchema = z.object({ title: z.string().min(1).max(200).optional() });

// GET /api/pwa/conversations - lista as 50 mais recentes do cliente.
router.get("/", async (req: ClientAuthRequest, res: Response) => {
  const list = await prisma.conversation.findMany({
    where: { clientId: req.client!.clientId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  res.json({ conversations: list });
});

// POST /api/pwa/conversations - cria nova conversa.
router.post("/", async (req: ClientAuthRequest, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body ?? {});
  const title = parsed.success && parsed.data.title ? parsed.data.title : "Nova conversa";
  const conv = await prisma.conversation.create({
    data: { clientId: req.client!.clientId, title },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  res.status(201).json({ conversation: conv });
});

// GET /api/pwa/conversations/:id - conversa + todas as mensagens.
router.get("/:id", async (req: ClientAuthRequest, res: Response) => {
  const conv = await prisma.conversation.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, createdAt: true, status: true } },
    },
  });
  if (!conv) return res.status(404).json({ error: "Conversa nao encontrada" });
  res.json({ conversation: conv });
});

// DELETE /api/pwa/conversations/:id
router.delete("/:id", async (req: ClientAuthRequest, res: Response) => {
  const conv = await prisma.conversation.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
    select: { id: true },
  });
  if (!conv) return res.status(404).json({ error: "Conversa nao encontrada" });
  await prisma.conversation.delete({ where: { id: conv.id } });
  res.status(204).end();
});

// POST /api/pwa/conversations/:id/messages - envia msg, stream SSE da resposta.
const MsgSchema = z.object({ content: z.string().min(1).max(8000) });

router.post("/:id/messages", async (req: ClientAuthRequest, res: Response) => {
  const parsed = MsgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  // Verifica que conversa pertence ao cliente.
  const conv = await prisma.conversation.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
    select: { id: true, title: true },
  });
  if (!conv) return res.status(404).json({ error: "Conversa nao encontrada" });

  // Verifica limite de tokens.
  const client = await prisma.client.findUnique({ where: { id: req.client!.clientId } });
  if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
  const guard = isClientBlocked(client, 0);
  if (!guard.ok) return res.status(403).json({ error: guard.reason });

  // Salva a msg do usuario.
  const userMsg = await prisma.message.create({
    data: { conversationId: conv.id, role: "user", content: parsed.data.content },
    select: { id: true, createdAt: true },
  });

  // Carrega historico (ultimas 20 mensagens para nao estourar contexto).
  const history = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true },
  });

  // Setup SSE.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Envia um evento inicial com id da msg do user.
  res.write(`event: user-msg\ndata: ${JSON.stringify({ id: userMsg.id })}\n\n`);

  // Cria placeholder da msg do assistant.
  const assistantMsg = await prisma.message.create({
    data: { conversationId: conv.id, role: "assistant", content: "", status: "pending" },
    select: { id: true },
  });
  res.write(`event: assistant-start\ndata: ${JSON.stringify({ id: assistantMsg.id })}\n\n`);

  let fullText = "";
  try {
    const result = await streamChat(
      history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      (delta) => {
        fullText += delta;
        res.write(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`);
      },
    );

    // Atualiza msg final + tokens do cliente.
    await prisma.$transaction([
      prisma.message.update({
        where: { id: assistantMsg.id },
        data: { content: fullText, status: "done", tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      }),
      prisma.client.update({
        where: { id: client.id },
        data: { tokensUsed: { increment: result.tokensIn + result.tokensOut } },
      }),
      prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } }),
    ]);

    res.write(
      `event: done\ndata: ${JSON.stringify({
        text: fullText,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        remaining: client.tokensLimit - (client.tokensUsed + result.tokensIn + result.tokensOut),
      })}\n\n`,
    );
  } catch (err: any) {
    await prisma.message.update({
      where: { id: assistantMsg.id },
      data: { content: fullText || "(erro)", status: "error" },
    });
    res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || "erro" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
