// Agent endpoints (Sprint 1.20 / Etapa 3e)
// Long-poll HTTP. Electron agent chama periodicamente.
// Auth via deviceToken (header X-Device-Token).
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const router = Router();

async function authDevice(req: any, res: Response): Promise<NonNullable<Awaited<ReturnType<typeof prisma.device.findUnique>>> | null> {
  const token = (req.headers["x-device-token"] as string | undefined)?.trim();
  if (!token) { res.status(401).json({ error: "Device token ausente" }); return null; }
  const dev = await prisma.device.findUnique({ where: { deviceToken: token } });
  if (!dev) { res.status(401).json({ error: "Device token invalido" }); return null; }
  if (dev.status !== "ACTIVE") { res.status(403).json({ error: `Device ${dev.status.toLowerCase()}` }); return null; }
  return dev;
}

// POST /api/agent/heartbeat - agent marca que ta vivo.
const HeartbeatSchema = z.object({
  online: z.boolean().default(true),
  meta: z.record(z.any()).optional(),
});

router.post("/heartbeat", async (req, res) => {
  const dev = await authDevice(req, res);
  if (!dev) return;
  // dev eh NonNullable<...> a partir daqui
  if (dev.status !== "ACTIVE") return; // type narrow redundante, mas seguro
  const parsed = HeartbeatSchema.safeParse(req.body ?? {});
  const online = parsed.success ? parsed.data.online : true;
  const meta = parsed.success ? parsed.data.meta : null;

  await prisma.$transaction([
    prisma.device.update({ where: { id: dev.id }, data: { lastSeenAt: new Date() } }),
    prisma.deviceHeartbeat.create({ data: { deviceId: dev.id, online, meta: meta ?? undefined } }),
  ]);
  res.status(204).end();
});

// GET /api/agent/tasks/pending - long-poll (max 25s) por uma task PENDING.
router.get("/tasks/pending", async (req, res) => {
  const dev = await authDevice(req, res);
  if (!dev) return;
  // dev eh NonNullable<...> a partir daqui
  if (dev.status !== "ACTIVE") return; // type narrow redundante, mas seguro

  const start = Date.now();
  const POLL_MS = 25000;
  const INTERVAL_MS = 1000;

  while (Date.now() - start < POLL_MS) {
    const task = await prisma.task.findFirst({
      where: { clientId: dev.clientId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    if (task) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "SENT", startedAt: new Date(), deviceId: dev.id },
      });
      res.json({ task });
      return;
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  res.json({ task: null });
});

// POST /api/agent/tasks/:id/result - devolve resultado.
const ResultSchema = z.object({
  result: z.any().optional(),
  error: z.string().max(2000).optional(),
  tokensIn: z.number().int().nonnegative().max(1000000).optional(),
  tokensOut: z.number().int().nonnegative().max(1000000).optional(),
});

router.post("/tasks/:id/result", async (req, res) => {
  const dev = await authDevice(req, res);
  if (!dev) return;
  // dev eh NonNullable<...> a partir daqui
  if (dev.status !== "ACTIVE") return; // type narrow redundante, mas seguro
  const parsed = ResultSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  const task = await prisma.task.findFirst({
    where: { id: req.params.id, clientId: dev.clientId },
  });
  if (!task) return res.status(404).json({ error: "Task nao encontrada" });

  const ok = !parsed.data.error;
  const tokensIn = parsed.data.tokensIn ?? 0;
  const tokensOut = parsed.data.tokensOut ?? 0;

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: {
        status: ok ? "DONE" : "ERROR",
        result: parsed.data.result ?? null,
        errorMsg: parsed.data.error ?? null,
        completedAt: new Date(),
        deviceId: dev.id,
      },
    }),
    prisma.client.update({
      where: { id: dev.clientId },
      data: { tokensUsed: { increment: tokensIn + tokensOut } },
    }),
  ]);
  res.json({ ok: true });
});

export default router;
