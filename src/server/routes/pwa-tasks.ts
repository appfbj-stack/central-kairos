// Tasks PWA (Sprint 1.20 / Etapa 3e)
// Cliente PWA cria tasks pra serem executadas pelo agent local (Electron).
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";

const router = Router();
router.use(clientAuthMiddleware);

const CreateSchema = z.object({
  kind: z.string().min(1).max(100),
  params: z.record(z.any()).optional(),
  convId: z.string().optional(),
  deviceId: z.string().optional(), // se null, server processa (em Etapa 4+)
});

// POST /api/pwa/tasks - cria task PENDING.
router.post("/", async (req: ClientAuthRequest, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  // Se deviceId fornecido, verifica que pertence ao client.
  if (parsed.data.deviceId) {
    const dev = await prisma.device.findFirst({
      where: { id: parsed.data.deviceId, clientId: req.client!.clientId, status: "ACTIVE" },
    });
    if (!dev) return res.status(400).json({ error: "Device invalido ou inativo" });
  }

  const task = await prisma.task.create({
    data: {
      clientId: req.client!.clientId,
      deviceId: parsed.data.deviceId || null,
      convId: parsed.data.convId || null,
      kind: parsed.data.kind,
      params: parsed.data.params || {},
    },
  });
  res.status(201).json({ task });
});

// GET /api/pwa/tasks - lista tasks do client (default ultimas 50).
router.get("/", async (req: ClientAuthRequest, res: Response) => {
  const status = (req.query.status as string | undefined) || undefined;
  const where: any = { clientId: req.client!.clientId };
  if (status) where.status = status;
  const list = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ tasks: list });
});

// GET /api/pwa/tasks/:id - detalhe de uma task.
router.get("/:id", async (req: ClientAuthRequest, res: Response) => {
  const t = await prisma.task.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
  });
  if (!t) return res.status(404).json({ error: "Task nao encontrada" });
  res.json({ task: t });
});

// DELETE /api/pwa/tasks/:id - cancela task PENDING.
router.delete("/:id", async (req: ClientAuthRequest, res: Response) => {
  const t = await prisma.task.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
  });
  if (!t) return res.status(404).json({ error: "Task nao encontrada" });
  if (t.status === "DONE" || t.status === "RUNNING" || t.status === "SENT") {
    return res.status(400).json({ error: `Task ja em ${t.status.toLowerCase()}, nao pode cancelar` });
  }
  await prisma.task.update({ where: { id: t.id }, data: { status: "CANCELLED" } });
  res.status(204).end();
});

export default router;
