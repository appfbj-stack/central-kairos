// PWA Reminders (Sprint v0.6.0+)
// GET    /api/pwa/reminders        - lista lembretes futuros (ate 30 dias)
// POST   /api/pwa/reminders        - cria lembrete (body: {when, message, type?})
// PATCH  /api/pwa/reminders/:id    - edita lembrete
// DELETE /api/pwa/reminders/:id    - remove
// GET    /api/pwa/reminders/today  - lista lembretes do dia (para exibir no chat)
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";

const router = Router();
router.use(clientAuthMiddleware);

const CreateSchema = z.object({
  when: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  message: z.string().min(1).max(500),
  type: z.enum(["MEETING", "BIRTHDAY", "TASK", "OTHER"]).optional(),
});

const UpdateSchema = z.object({
  when: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  message: z.string().min(1).max(500).optional(),
  type: z.enum(["MEETING", "BIRTHDAY", "TASK", "OTHER"]).optional(),
  sent: z.boolean().optional(),
});

router.get("/", async (req: ClientAuthRequest, res: Response) => {
  const from = new Date(); from.setHours(0,0,0,0);
  const to = new Date(); to.setDate(to.getDate() + 30); to.setHours(23,59,59,999);
  const list = await prisma.reminder.findMany({
    where: { clientId: req.client!.clientId, when: { gte: from, lte: to } },
    orderBy: { when: "asc" },
  });
  res.json({ reminders: list });
});

router.get("/today", async (req: ClientAuthRequest, res: Response) => {
  const from = new Date(); from.setHours(0,0,0,0);
  const to = new Date(); to.setHours(23,59,59,999);
  const list = await prisma.reminder.findMany({
    where: { clientId: req.client!.clientId, when: { gte: from, lte: to } },
    orderBy: { when: "asc" },
  });
  res.json({ reminders: list, date: from.toISOString() });
});

router.post("/", async (req: ClientAuthRequest, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
  const created = await prisma.reminder.create({
    data: {
      clientId: req.client!.clientId,
      when: new Date(parsed.data.when),
      message: parsed.data.message,
      type: parsed.data.type || "MEETING",
    },
  });
  res.status(201).json({ reminder: created });
});

router.patch("/:id", async (req: ClientAuthRequest, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
  });
  if (!existing) return res.status(404).json({ error: "Lembrete nao encontrado" });
  const updated = await prisma.reminder.update({
    where: { id: existing.id },
    data: {
      when: parsed.data.when ? new Date(parsed.data.when) : undefined,
      message: parsed.data.message,
      type: parsed.data.type,
      sent: parsed.data.sent,
    },
  });
  res.json({ reminder: updated });
});

router.delete("/:id", async (req: ClientAuthRequest, res: Response) => {
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
  });
  if (!existing) return res.status(404).json({ error: "Lembrete nao encontrado" });
  await prisma.reminder.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
