// Conversas PWA (Etapa 3b) + chat com streaming SSE.
// Aceita attachments (imagens inline em data URL base64) pra LLM multimodal.
// Detecta intencoes (lembretes, gastos, consultas) via regex antes de chamar a LLM.
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";
import { streamChat, isClientBlocked } from "../lib/llm";
import { detectIntents, type DetectedIntent } from "../lib/intent.js";

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
// Aceita attachments (imagens inline em data URL base64) pra LLM multimodal.
const AttachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().regex(/^image\/(png|jpe?g|webp|gif)$/i),
  size: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB por imagem
  dataUrl: z.string().min(1).max(20 * 1024 * 1024), // data URL base64 (sobe ~33% sobre binario)
});

const MsgSchema = z.object({
  content: z.string().min(1).max(8000),
  attachments: z.array(AttachmentSchema).max(4).optional(),
});

type Attachment = z.infer<typeof AttachmentSchema>;

router.post("/:id/messages", async (req: ClientAuthRequest, res: Response) => {
  const parsed = MsgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  const { content, attachments = [] } = parsed.data;

  // Verifica que conversa pertence ao cliente.
  const conv = await prisma.conversation.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
    select: { id: true, title: true },
  });
  if (!conv) return res.status(404).json({ error: "Conversa nao encontrada" });

  // Verifica cliente e checa limite de MENSAGENS (nao tokens).
  // Auto-reset DAILY: se passou 1 dia desde lastUsageReset, zera usageUsed.
  const client = await prisma.client.findUnique({ where: { id: req.client!.clientId } });
  if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });

  // Auto-reset DAILY
  if (client.periodType === "DAILY" && client.lastUsageReset) {
    const dayMs = 24 * 60 * 60 * 1000;
    if (Date.now() - client.lastUsageReset.getTime() >= dayMs) {
      await prisma.client.update({
        where: { id: client.id },
        data: { usageUsed: 0, lastUsageReset: new Date() },
      });
      client.usageUsed = 0;
    }
  }

  // Checagem de status (BLOCKED/EXPIRED/trial) via helper
  const guard = isClientBlocked(client, 0);
  if (!guard.ok) return res.status(403).json({ error: guard.reason });

  // Checagem de limite de MENSAGENS do plano
  if (client.usageUsed >= client.usageLimit) {
    const periodLabel = client.periodType === "DAILY" ? "do dia" : "do mes";
    return res.status(403).json({
      error: `Limite de mensagens do plano ${client.plan} atingido (${client.usageUsed}/${client.usageLimit}) ${periodLabel}`,
    });
  }

  // Salva a msg do usuario (com attachments em JSON).
  const userMsg = await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: "user",
      content,
      attachments: attachments.length > 0 ? (attachments as unknown as object) : undefined,
    },
    select: { id: true, createdAt: true },
  });

  // Carrega historico (ultimas 20 mensagens para nao estourar contexto).
  const history = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true, attachments: true },
  });

  // Setup SSE.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Envia um evento inicial com id da msg do user.
  res.write(`event: user-msg\ndata: ${JSON.stringify({ id: userMsg.id })}\n\n`);

  // ---- Detecta intencoes (lembretes, gastos, consultas) ----
  // Roda ANTES da LLM. Persiste no DB. Emite evento SSE `intent-result` com
  // os dados pra UI mostrar cards. A LLM depois recebe o historico e responde
  // de forma natural.
  const intents = detectIntents(content);
  const intentResults: any[] = [];
  for (const it of intents) {
    try {
      if (it.type === "create_expense") {
        const created = await prisma.expense.create({
          data: {
            clientId: client.id,
            amount: it.amount,
            description: it.description,
            category: it.category,
            occurredAt: it.occurredAt,
          },
        });
        intentResults.push({ kind: "expense_created", expense: created });
      } else if (it.type === "create_reminder") {
        const created = await prisma.reminder.create({
          data: {
            clientId: client.id,
            when: it.when,
            message: it.message,
            type: it.reminderType,
          },
        });
        intentResults.push({ kind: "reminder_created", reminder: created });
      } else if (it.type === "query_expenses") {
        const list = await prisma.expense.findMany({
          where: { clientId: client.id, occurredAt: { gte: it.from, lte: it.to } },
          orderBy: { occurredAt: "desc" },
          take: 100,
        });
        const total = list.reduce((acc, e) => acc + e.amount, 0);
        intentResults.push({ kind: "expense_summary", total, count: list.length, expenses: list.slice(0, 10) });
      } else if (it.type === "list_reminders") {
        const list = await prisma.reminder.findMany({
          where: { clientId: client.id, when: { gte: it.from, lte: it.to } },
          orderBy: { when: "asc" },
        });
        intentResults.push({ kind: "reminder_list", reminders: list });
      }
    } catch (e: any) {
      console.error("[intent] erro:", e);
    }
  }
  if (intentResults.length > 0) {
    res.write(`event: intent-result\ndata: ${JSON.stringify({ results: intentResults })}\n\n`);
  }

  // Cria placeholder da msg do assistant.
  const assistantMsg = await prisma.message.create({
    data: { conversationId: conv.id, role: "assistant", content: "", status: "pending" },
    select: { id: true },
  });
  res.write(`event: assistant-start\ndata: ${JSON.stringify({ id: assistantMsg.id })}\n\n`);

  let fullText = "";
  let visibleText = "";
  try {
    // Monta payload pro LLM. A ULTIMA msg do user pode ter attachments
    // (imagens), que viram ContentPart[]. As demais viram string pura.
    const llmMessages = history.map((m, idx) => {
      const isLastUser = idx === history.length - 1 && m.role === "user";
      const att = isLastUser ? (m.attachments as Attachment[] | null) : null;
      if (att && Array.isArray(att) && att.length > 0) {
        const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
          { type: "text", text: m.content },
          ...att.map((a) => ({ type: "image_url" as const, image_url: { url: a.dataUrl } })),
        ];
        return { role: "user" as const, content: parts };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const result = await streamChat(
      llmMessages,
      (delta) => {
        fullText += delta;
        // Filtra blocos <think>...</think> do MiniMax (chain-of-thought)
        const clean = fullText.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trimStart();
        if (clean.length > 0) {
          // Calcula o delta que ainda nao foi emitido (pula o que estava dentro de <think>)
          const visibleDelta = clean.slice(visibleText.length);
          if (visibleDelta) {
            visibleText = clean;
            res.write(`event: delta\ndata: ${JSON.stringify({ delta: visibleDelta })}\n\n`);
          }
        }
      },
    );

    // Atualiza msg final + incrementa uso do cliente.
    await prisma.$transaction([
      prisma.message.update({
        where: { id: assistantMsg.id },
        data: { content: visibleText, status: "done", tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      }),
      prisma.client.update({
        where: { id: client.id },
        data: {
          // Incrementa contador de MENSAGENS (uma msg do user = +1)
          usageUsed: { increment: 1 },
          // Mantem tokens para billing futuro
          tokensUsed: { increment: result.tokensIn + result.tokensOut },
        },
      }),
      prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } }),
    ]);

    res.write(
      `event: done\ndata: ${JSON.stringify({
        text: visibleText,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        remaining: client.usageLimit - (client.usageUsed + 1),
        plan: client.plan,
        usageUsed: client.usageUsed + 1,
        usageLimit: client.usageLimit,
      })}\n\n`,
    );
  } catch (err: any) {
    await prisma.message.update({
      where: { id: assistantMsg.id },
      data: { content: visibleText || "(erro)", status: "error" },
    });
    res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || "erro" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
