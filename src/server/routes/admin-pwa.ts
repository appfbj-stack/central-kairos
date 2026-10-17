// Admin PWA (Sprint 1.20) — visualizacao e gestao de Clients / Devices / Tasks
// que pertencem ao SaaS PWA. Auth admin (nao auth-pwa).
import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/admin-pwa/clients - lista clients PWA (ordenado por mais recente)
router.get("/clients", async (_req: AuthRequest, res: Response) => {
  const [clients, byStatus, totals] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        plan: true,
        usageLimit: true,
        usageUsed: true,
        periodType: true,
        outputTokenCap: true,
        lastUsageReset: true,
        trialStartAt: true,
        trialEndsAt: true,
        tokensLimit: true,
        tokensUsed: true,
        currentPeriodEnd: true,
        createdAt: true,
        _count: { select: { devices: true, conversations: true, sessions: true } },
      },
    }),
    prisma.client.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.client.aggregate({ _sum: { tokensUsed: true } }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const r of byStatus) statusMap[r.status] = r._count._all;

  res.json({
    clients,
    total: clients.length,
    byStatus: statusMap,
    totalTokensUsed: totals._sum.tokensUsed || 0,
  });
});

// GET /api/admin-pwa/clients/:id - detalhe de um client (devices + conversations count)
router.get("/clients/:id", async (req: AuthRequest, res: Response) => {
  const c = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      devices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, kind: true, name: true, os: true, hardware: true,
          status: true, lastSeenAt: true, createdAt: true,
        },
      },
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      },
      _count: { select: { conversations: true } },
    },
  });
  if (!c) return res.status(404).json({ error: "Client nao encontrado" });
  res.json({ client: c });
});

// POST /api/admin-pwa/clients/:id/block - bloqueia client
router.post("/clients/:id/block", async (req: AuthRequest, res: Response) => {
  const reason = String(req.body?.reason || "blocked-by-admin").slice(0, 500);
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { status: "BLOCKED" },
  });
  res.json({ client: c, reason });
});

// POST /api/admin-pwa/clients/:id/unblock - reativa client
router.post("/clients/:id/unblock", async (req: AuthRequest, res: Response) => {
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { status: "ACTIVE" },
  });
  res.json({ client: c });
});

// POST /api/admin-pwa/clients/:id/reset-tokens - zera tokensUsed
router.post("/clients/:id/reset-tokens", async (req: AuthRequest, res: Response) => {
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { tokensUsed: 0 },
  });
  res.json({ client: c });
});

// POST /api/admin-pwa/clients/:id/set-plan - muda plano + limites do cliente
// Body: { plan?: "FREE"|"BASIC"|"PRO"|"ULTRA", usageLimit?: number, periodType?: "DAILY"|"MONTHLY", outputTokenCap?: number, resetUsage?: bool }
// Dica: para deixar SEM limite, use { plan: "ULTRA", usageLimit: 999999, periodType: "MONTHLY" }
router.post("/clients/:id/set-plan", async (req: AuthRequest, res: Response) => {
  const { plan, usageLimit, periodType, outputTokenCap, resetUsage } = req.body || {};
  const data: any = {};
  if (plan && ["FREE", "BASIC", "PRO", "ULTRA"].includes(plan)) data.plan = plan;
  if (typeof usageLimit === "number" && usageLimit >= 0) data.usageLimit = Math.floor(usageLimit);
  if (periodType && ["DAILY", "MONTHLY"].includes(periodType)) data.periodType = periodType;
  if (typeof outputTokenCap === "number" && outputTokenCap >= 0) data.outputTokenCap = Math.floor(outputTokenCap);
  if (resetUsage === true) {
    data.usageUsed = 0;
    data.lastUsageReset = new Date();
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nenhum campo pra atualizar. Envie plan/usageLimit/periodType/outputTokenCap/resetUsage." });
  }
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data,
    select: {
      id: true, email: true, plan: true, usageLimit: true, usageUsed: true,
      periodType: true, outputTokenCap: true, lastUsageReset: true,
    },
  });
  res.json({ client: c, applied: data });
});

// DELETE /api/admin-pwa/clients/:id - remove client (cascade: devices/sessions/tasks/conversations)
router.delete("/clients/:id", async (req: AuthRequest, res: Response) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// GET /api/admin-pwa/devices - lista todos devices
router.get("/devices", async (req: AuthRequest, res: Response) => {
  const status = String(req.query.status || "");
  const kind = String(req.query.kind || "");
  const where: any = {};
  if (status) where.status = status;
  if (kind) where.kind = kind;

  const [devices, byStatus, byKind] = await Promise.all([
    prisma.device.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { client: { select: { id: true, email: true, name: true } } },
    }),
    prisma.device.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.device.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const r of byStatus) statusMap[r.status] = r._count._all;
  const kindMap: Record<string, number> = {};
  for (const r of byKind) kindMap[r.kind] = r._count._all;

  res.json({ devices, total: devices.length, byStatus: statusMap, byKind: kindMap });
});

// POST /api/admin-pwa/devices/:id/revoke - revoga device
router.post("/devices/:id/revoke", async (req: AuthRequest, res: Response) => {
  const d = await prisma.device.update({
    where: { id: req.params.id },
    data: { status: "REVOKED" },
  });
  res.json({ device: d });
});

// GET /api/admin-pwa/tasks - lista tasks (com filtro kind/status)
router.get("/tasks", async (req: AuthRequest, res: Response) => {
  const status = String(req.query.status || "");
  const kind = String(req.query.kind || "");
  const where: any = {};
  if (status) where.status = status;
  if (kind) where.kind = kind;

  const [tasks, byStatus, byKind] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        client: { select: { id: true, email: true, name: true } },
        device: { select: { id: true, kind: true, name: true } },
      },
    }),
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.task.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const r of byStatus) statusMap[r.status] = r._count._all;
  const kindMap: Record<string, number> = {};
  for (const r of byKind) kindMap[r.kind] = r._count._all;

  res.json({ tasks, total: tasks.length, byStatus: statusMap, byKind: kindMap });
});

export default router;
