import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

/**
 * Rota PÚBLICA (sem auth) — usada pelos próprios apps pra checar status + uso.
 * Quando o status está "BLOCKED" ou usageUsed >= usageLimit, o app mostra
 * tela de bloqueio e pede renovação.
 *
 * GET  /api/public/installation/:id/status       → status + plan
 * POST /api/public/installation/:id/check-usage → { allowed, remaining, plan, blocked, periodEnd }
 *
 * check-usage INCREMENTA o usageUsed. Cliente chama ANTES de cada mensagem.
 */
const router = Router();

// GET simples (status só)
router.get("/installation/:id/status", async (req: Request, res: Response) => {
  const installation = await prisma.installation.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, plan: true, usageLimit: true, usageUsed: true, currentPeriodEnd: true },
  });
  if (!installation) {
    return res.status(404).json({
      installation_id: req.params.id,
      status: "unknown",
      plan: "FREE",
      error: "Instalação não encontrada na Central",
    });
  }
  res.json({
    installation_id: installation.id,
    status: installation.status.toLowerCase(),
    plan: installation.plan,
    usageLimit: installation.usageLimit,
    usageUsed: installation.usageUsed,
    remaining: Math.max(0, installation.usageLimit - installation.usageUsed),
    currentPeriodEnd: installation.currentPeriodEnd,
  });
});

const CheckUsageSchema = z.object({
  /** Opcional — se vier, verifica que bate com a instalação cadastrada. */
  installationSecret: z.string().optional(),
});

// POST: checa + incrementa contador. Retorna se pode rodar.
router.post("/installation/:id/check-usage", async (req: Request, res: Response) => {
  const parsed = CheckUsageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  const installation = await prisma.installation.findUnique({
    where: { id: req.params.id },
  });
  if (!installation) {
    return res.status(404).json({
      allowed: false,
      error: "Instalação não encontrada na Central",
    });
  }

  // Calcula se está bloqueado
  const now = new Date();
  const periodExpired =
    installation.currentPeriodEnd !== null &&
    installation.currentPeriodEnd < now;
  const usedOverLimit = installation.usageUsed >= installation.usageLimit;
  const statusBlocked = installation.status === "BLOCKED" || installation.status === "EXPIRED";
  const allowed = !statusBlocked && !usedOverLimit && !periodExpired;

  if (allowed) {
    // Incrementa o contador
    await prisma.installation.update({
      where: { id: installation.id },
      data: { usageUsed: { increment: 1 } },
    });
  }

  res.json({
    installation_id: installation.id,
    allowed,
    plan: installation.plan,
    usageLimit: installation.usageLimit,
    usageUsed: allowed ? installation.usageUsed + 1 : installation.usageUsed,
    remaining: Math.max(0, installation.usageLimit - (allowed ? installation.usageUsed + 1 : installation.usageUsed)),
    blocked: !allowed,
    reason: statusBlocked
      ? `Status: ${installation.status}`
      : periodExpired
        ? "Período mensal expirou"
        : usedOverLimit
          ? `Limite do plano ${installation.plan} atingido`
          : null,
    currentPeriodEnd: installation.currentPeriodEnd,
    renewUrl: "https://central.fbautomacao.space",
  });
});

export default router;