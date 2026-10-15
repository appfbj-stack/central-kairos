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
    select: { id: true, status: true, plan: true, usageLimit: true, usageUsed: true, tokensLimit: true, tokensUsed: true, outputTokenCap: true, periodType: true, currentPeriodEnd: true },
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
    tokensLimit: installation.tokensLimit,
    tokensUsed: installation.tokensUsed,
    tokensRemaining: Math.max(0, installation.tokensLimit - installation.tokensUsed),
    outputTokenCap: installation.outputTokenCap,
    periodType: installation.periodType,
    currentPeriodEnd: installation.currentPeriodEnd,
  });
});

const CheckUsageSchema = z.object({
  /** Opcional — se vier, verifica que bate com a instalação cadastrada. */
  installationSecret: z.string().optional(),
  /** Quantos tokens foram consumidos nessa mensagem (input+output). Default 0. */
  tokensToAdd: z.number().int().nonnegative().max(1000000).optional(),
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

  // Reset automático DAILY (24h) ou MONTHLY (30d) se o período venceu
  const now = new Date();
  let effective = installation;
  const periodMs = installation.periodType === "DAILY"
    ? 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;
  if (!installation.currentPeriodEnd || installation.currentPeriodEnd < now) {
    const nextEnd = new Date(now.getTime() + periodMs);
    effective = await prisma.installation.update({
      where: { id: installation.id },
      data: {
        usageUsed: 0,
        tokensUsed: 0,
        currentPeriodEnd: nextEnd,
      },
    });
  }

  // Calcula se está bloqueado (considera tokensToAdd para evitar estouro)
  const tokensToAdd = parsed.data.tokensToAdd || 0;
  const usedOverLimit = effective.usageUsed >= effective.usageLimit;
  const usedOverTokens = (effective.tokensUsed + tokensToAdd) > effective.tokensLimit;
  const statusBlocked = effective.status === "BLOCKED" || effective.status === "EXPIRED";
  const periodExpired =
    effective.currentPeriodEnd !== null && effective.currentPeriodEnd < now;
  const allowed = !statusBlocked && !usedOverLimit && !usedOverTokens && !periodExpired;

  if (allowed) {
    // Incrementa os contadores
    await prisma.installation.update({
      where: { id: effective.id },
      data: {
        usageUsed: { increment: 1 },
        tokensUsed: { increment: tokensToAdd },
      },
    });
  }

  res.json({
    installation_id: effective.id,
    allowed,
    plan: effective.plan,
    usageLimit: effective.usageLimit,
    usageUsed: allowed ? effective.usageUsed + 1 : effective.usageUsed,
    remaining: Math.max(0, effective.usageLimit - (allowed ? effective.usageUsed + 1 : effective.usageUsed)),
    tokensLimit: effective.tokensLimit,
    tokensUsed: allowed ? effective.tokensUsed + tokensToAdd : effective.tokensUsed,
    tokensRemaining: Math.max(0, effective.tokensLimit - (allowed ? effective.tokensUsed + tokensToAdd : effective.tokensUsed)),
    outputTokenCap: effective.outputTokenCap,
    periodType: effective.periodType,
    blocked: !allowed,
    reason: statusBlocked
      ? `Status: ${effective.status}`
      : periodExpired
        ? "Período expirou"
        : usedOverTokens
          ? `Limite de tokens do plano ${effective.plan} atingido (${effective.tokensUsed}/${effective.tokensLimit})`
          : usedOverLimit
            ? `Limite de mensagens do plano ${effective.plan} atingido (${effective.usageUsed}/${effective.usageLimit})`
            : null,
    currentPeriodEnd: effective.currentPeriodEnd,
    renewUrl: "https://central.fbautomacao.space",
  });
});

export default router;