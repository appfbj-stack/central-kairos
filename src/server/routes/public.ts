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
    select: { id: true, status: true, plan: true, usageLimit: true, usageUsed: true, tokensLimit: true, tokensUsed: true, currentPeriodEnd: true },
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

  // Calcula se está bloqueado (considera tokensToAdd para evitar estouro)
  const now = new Date();
  const periodExpired =
    installation.currentPeriodEnd !== null &&
    installation.currentPeriodEnd < now;
  const tokensToAdd = parsed.data.tokensToAdd || 0;
  const usedOverLimit = installation.usageUsed >= installation.usageLimit;
  const usedOverTokens = (installation.tokensUsed + tokensToAdd) > installation.tokensLimit;
  const statusBlocked = installation.status === "BLOCKED" || installation.status === "EXPIRED";
  const allowed = !statusBlocked && !usedOverLimit && !usedOverTokens && !periodExpired;

  if (allowed) {
    // Incrementa os contadores
    await prisma.installation.update({
      where: { id: installation.id },
      data: {
        usageUsed: { increment: 1 },
        tokensUsed: { increment: tokensToAdd },
      },
    });
  }

  res.json({
    installation_id: installation.id,
    allowed,
    plan: installation.plan,
    usageLimit: installation.usageLimit,
    usageUsed: allowed ? installation.usageUsed + 1 : installation.usageUsed,
    remaining: Math.max(0, installation.usageLimit - (allowed ? installation.usageUsed + 1 : installation.usageUsed)),
    tokensLimit: installation.tokensLimit,
    tokensUsed: allowed ? installation.tokensUsed + tokensToAdd : installation.tokensUsed,
    tokensRemaining: Math.max(0, installation.tokensLimit - (allowed ? installation.tokensUsed + tokensToAdd : installation.tokensUsed)),
    blocked: !allowed,
    reason: statusBlocked
      ? `Status: ${installation.status}`
      : periodExpired
        ? "Período mensal expirou"
        : usedOverTokens
          ? `Limite de tokens do plano ${installation.plan} atingido (${installation.tokensUsed}/${installation.tokensLimit})`
          : usedOverLimit
            ? `Limite de mensagens do plano ${installation.plan} atingido`
            : null,
    currentPeriodEnd: installation.currentPeriodEnd,
    renewUrl: "https://central.fbautomacao.space",
  });
});

export default router;