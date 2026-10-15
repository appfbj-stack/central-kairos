import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { nextInstallationId } from "../lib/sequence";

const router = Router();
router.use(authMiddleware);

const STATUS_VALUES = ["TRIAL", "ACTIVE", "BLOCKED", "EXPIRED", "ARCHIVED"] as const;
const PLAN_VALUES = ["FREE", "BASIC", "PRO", "ULTRA", "ENTERPRISE"] as const;

// Planos com mensagens incluídas (Sprint v0.2.0+)
const PLAN_LIMITS: Record<string, number> = {
  FREE: 10,         // 10 msgs/dia (Sprint 2026-10-15)
  BASIC: 70,        // 70 msgs/mês
  PRO: 150,         // 150 msgs/mês
  ULTRA: 350,       // 350 msgs/mês
  ENTERPRISE: 999999, // ilimitado
};

// Planos com tokens incluídos (Sprint 2026-10-15) — controla custo real
const PLAN_TOKEN_LIMITS: Record<string, number> = {
  FREE: 30000,      // ~20 msgs
  BASIC: 200000,    // ~200 msgs
  PRO: 750000,      // ~500 msgs
  ULTRA: 2500000,   // ~1500 msgs
  ENTERPRISE: 999999999, // ilimitado
};

// Output token cap por request (Sprint 2026-10-15) — defesa contra respostas gigantes
const PLAN_OUTPUT_TOKEN_CAPS: Record<string, number> = {
  FREE: 500,
  BASIC: 1000,
  PRO: 2000,
  ULTRA: 4000,
  ENTERPRISE: 8000,
};

// Período de reset por plan (Sprint 2026-10-15) — FREE reseta a cada 24h
const PLAN_PERIOD_TYPE: Record<string, "DAILY" | "MONTHLY"> = {
  FREE: "DAILY",
  BASIC: "MONTHLY",
  PRO: "MONTHLY",
  ULTRA: "MONTHLY",
  ENTERPRISE: "MONTHLY",
};

const CreateSchema = z.object({
  productName: z.string().min(1).max(120),
  clientName: z.string().min(1).max(120),
  companyName: z.string().max(120).optional().nullable(),
  appUrl: z.string().url().max(500),
  dbIdentifier: z.string().max(120).optional().nullable(),
  status: z.enum(STATUS_VALUES).default("TRIAL"),
  trialStartAt: z.string().datetime().optional().nullable(),
  trialEndsAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const UpdateSchema = CreateSchema.partial().extend({
  reason: z.string().max(500).optional(),
});

// GET /api/installations  (lista todas, filtros opcionais)
router.get("/", async (req: AuthRequest, res: Response) => {
  const { status, product, search } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (status && STATUS_VALUES.includes(status as any)) where.status = status;
  if (product) where.productName = { contains: product, mode: "insensitive" };
  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { productName: { contains: search, mode: "insensitive" } },
      { clientName: { contains: search, mode: "insensitive" } },
      { companyName: { contains: search, mode: "insensitive" } },
      { appUrl: { contains: search, mode: "insensitive" } },
    ];
  }

  const installations = await prisma.installation.findMany({
    where,
    orderBy: { id: "asc" },
  });

  // Stats
  const total = installations.length;
  const byStatus = installations.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  res.json({
    installations,
    total,
    byStatus,
  });
});

// GET /api/installations/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const installation = await prisma.installation.findUnique({
    where: { id: req.params.id },
    include: {
      history: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!installation) {
    return res.status(404).json({ error: "Instalação não encontrada" });
  }
  res.json({ installation });
});

// POST /api/installations  (cria nova)
router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const newId = await nextInstallationId();

  // Default FREE: 10/dia; resto: 30d (Sprint 2026-10-15)
  const defaultPlan: keyof typeof PLAN_PERIOD_TYPE = "FREE";
  const defaultPeriodType = PLAN_PERIOD_TYPE[defaultPlan];
  const defaultUsageLimit = PLAN_LIMITS[defaultPlan];
  const defaultTokenLimit = PLAN_TOKEN_LIMITS[defaultPlan];
  const defaultOutputCap = PLAN_OUTPUT_TOKEN_CAPS[defaultPlan];

  const created = await prisma.installation.create({
    data: {
      id: newId,
      productName: data.productName,
      clientName: data.clientName,
      companyName: data.companyName || null,
      appUrl: data.appUrl,
      dbIdentifier: data.dbIdentifier || null,
      status: data.status,
      trialStartAt: data.trialStartAt ? new Date(data.trialStartAt) : null,
      trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null,
      notes: data.notes || null,
      // Sprint 2026-10-15: defaults alinhados com o plano
      plan: "FREE",
      usageLimit: defaultUsageLimit,
      usageUsed: 0,
      periodType: defaultPeriodType,
      tokensLimit: defaultTokenLimit,
      tokensUsed: 0,
      outputTokenCap: defaultOutputCap,
    },
  });

  // Loga criação (null → status inicial)
  await prisma.installationStatusHistory.create({
    data: {
      installationId: created.id,
      fromStatus: null,
      toStatus: created.status,
      reason: "Instalação criada",
      changedBy: req.user!.userId,
    },
  });

  res.status(201).json({ installation: created });
});

// PATCH /api/installations/:id  (atualiza dados; se mudar status, registra)
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const existing = await prisma.installation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Instalação não encontrada" });
  }

  const data = parsed.data;
  const updateData: any = {};
  if (data.productName !== undefined) updateData.productName = data.productName;
  if (data.clientName !== undefined) updateData.clientName = data.clientName;
  if (data.companyName !== undefined) updateData.companyName = data.companyName;
  if (data.appUrl !== undefined) updateData.appUrl = data.appUrl;
  if (data.dbIdentifier !== undefined) updateData.dbIdentifier = data.dbIdentifier;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.trialStartAt !== undefined)
    updateData.trialStartAt = data.trialStartAt ? new Date(data.trialStartAt) : null;
  if (data.trialEndsAt !== undefined)
    updateData.trialEndsAt = data.trialEndsAt ? new Date(data.trialEndsAt) : null;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const updated = await prisma.installation.update({
    where: { id: req.params.id },
    data: updateData,
  });

  // Se mudou status, registra no histórico
  if (data.status !== undefined && data.status !== existing.status) {
    await prisma.installationStatusHistory.create({
      data: {
        installationId: updated.id,
        fromStatus: existing.status,
        toStatus: updated.status,
        reason: data.reason || "Mudança de status",
        changedBy: req.user!.userId,
      },
    });
  }

  res.json({ installation: updated });
});

// POST /api/installations/:id/block  (atalho pra bloquear)
router.post("/:id/block", async (req: AuthRequest, res: Response) => {
  const { reason } = req.body || {};
  const existing = await prisma.installation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Instalação não encontrada" });
  }
  if (existing.status === "BLOCKED") {
    return res.json({ installation: existing, message: "Já estava bloqueada" });
  }

  const updated = await prisma.installation.update({
    where: { id: req.params.id },
    data: { status: "BLOCKED" },
  });
  await prisma.installationStatusHistory.create({
    data: {
      installationId: updated.id,
      fromStatus: existing.status,
      toStatus: "BLOCKED",
      reason: reason || "Bloqueio manual",
      changedBy: req.user!.userId,
    },
  });
  res.json({ installation: updated });
});

// POST /api/installations/:id/unblock  (atalho pra desbloquear)
router.post("/:id/unblock", async (req: AuthRequest, res: Response) => {
  const { reason, newStatus } = req.body || {};
  const existing = await prisma.installation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Instalação não encontrada" });
  }
  if (existing.status !== "BLOCKED") {
    return res.json({ installation: existing, message: "Não estava bloqueada" });
  }

  const targetStatus = newStatus === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const updated = await prisma.installation.update({
    where: { id: req.params.id },
    data: { status: targetStatus },
  });
  await prisma.installationStatusHistory.create({
    data: {
      installationId: updated.id,
      fromStatus: "BLOCKED",
      toStatus: targetStatus,
      reason: reason || "Desbloqueio manual",
      changedBy: req.user!.userId,
    },
  });
  res.json({ installation: updated });
});

// POST /api/installations/:id/plan  (muda plano + reseta contador + define período 30 dias)
router.post("/:id/plan", async (req: AuthRequest, res: Response) => {
  const { plan, periodDays } = req.body || {};
  if (!PLAN_VALUES.includes(plan)) {
    return res.status(400).json({ error: `Plano inválido. Use um de: ${PLAN_VALUES.join(", ")}` });
  }
  const days = Number.isFinite(periodDays) && periodDays > 0 ? Math.min(periodDays, 365) : 30;
  const newLimit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
  const newTokenLimit = PLAN_TOKEN_LIMITS[plan as keyof typeof PLAN_TOKEN_LIMITS];
  const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const existing = await prisma.installation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Instalação não encontrada" });
  }

  const newOutputCap = PLAN_OUTPUT_TOKEN_CAPS[plan as keyof typeof PLAN_OUTPUT_TOKEN_CAPS];
  const newPeriodType = PLAN_PERIOD_TYPE[plan as keyof typeof PLAN_PERIOD_TYPE];
  const updated = await prisma.installation.update({
    where: { id: req.params.id },
    data: {
      plan,
      usageLimit: newLimit,
      usageUsed: 0,
      tokensLimit: newTokenLimit,
      tokensUsed: 0,
      outputTokenCap: newOutputCap,
      periodType: newPeriodType,
      currentPeriodEnd: periodEnd,
      // Mudar pra plano pago também desbloqueia (se estava bloqueado)
      status: existing.status === "BLOCKED" || existing.status === "EXPIRED" ? "ACTIVE" : existing.status,
    },
  });
  await prisma.installationStatusHistory.create({
    data: {
      installationId: updated.id,
      fromStatus: existing.status,
      toStatus: updated.status,
      reason: `Plano alterado: ${existing.plan} → ${plan} (${days} dias, ${newLimit} msgs)`,
      changedBy: req.user!.userId,
    },
  });
  res.json({ installation: updated });
});

// POST /api/installations/:id/usage/reset  (zera contador sem mudar plano)
router.post("/:id/usage/reset", async (req: AuthRequest, res: Response) => {
  const existing = await prisma.installation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Instalação não encontrada" });
  }
  const updated = await prisma.installation.update({
    where: { id: req.params.id },
    data: {
      usageUsed: 0,
      tokensUsed: 0,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  res.json({ installation: updated });
});

// GET /api/plans  (lista planos disponíveis + limites)
router.get("/plans/list", (_req: AuthRequest, res: Response) => {
  const plans = PLAN_VALUES.map((p) => ({
    id: p,
    name: p,
    messagesPerMonth: PLAN_LIMITS[p as keyof typeof PLAN_LIMITS],
  }));
  res.json({ plans });
});

export default router;