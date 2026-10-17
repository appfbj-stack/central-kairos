// Auth PWA (Sprint 1.20 — Etapa 3a)
// 6 endpoints: register, login, logout, me, password-reset/request, password-reset/confirm
// JWT em cookie httpOnly + Bearer; 30 dias; revogavel via ClientSession.jti.
import { Router, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";
import { logger } from "../lib/logger.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "central-kairos-dev-secret-CHANGEME";
const JWT_EXPIRES_IN = "30d";
const COOKIE_NAME = "kairos_client_token";

function signToken(clientId: string, email: string, jti: string) {
  return jwt.sign({ clientId, email, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// ---------- REGISTER ----------
const RegisterSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(120),
  name: z.string().min(1).max(120),
});

router.post("/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });

  const { email, password, name } = parsed.data;
  const exists = await prisma.client.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: "Email ja cadastrado" });

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  const client = await prisma.client.create({
    data: {
      email,
      passwordHash,
      name,
      status: "TRIAL",
      trialStartAt: now,
      trialEndsAt,
      tokensLimit: 50000,
      // Plano padrão: FREE com 10 msgs/dia (limite generoso de trial)
      plan: "FREE",
      usageLimit: 10,
      usageUsed: 0,
      periodType: "DAILY",
      outputTokenCap: 500,
      lastUsageReset: now,
    },
  });

  const jti = crypto.randomBytes(16).toString("hex");
  await prisma.clientSession.create({
    data: {
      clientId: client.id,
      jwtId: jti,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      userAgent: req.headers["user-agent"] ?? null,
      ip: req.ip ?? null,
    },
  });

  const token = signToken(client.id, client.email, jti);
  setAuthCookie(res, token);

  res.status(201).json({
    token,
    client: {
      id: client.id,
      email: client.email,
      name: client.name,
      status: client.status,
      trialEndsAt: client.trialEndsAt,
      plan: client.plan,
      usageLimit: client.usageLimit,
      usageUsed: client.usageUsed,
      periodType: client.periodType,
      outputTokenCap: client.outputTokenCap,
      tokensLimit: client.tokensLimit,
      tokensUsed: client.tokensUsed,
    },
  });
});

// ---------- AUTO-LOGIN (dev) ----------
// Se env AUTO_LOGIN_EMAIL estiver setado, esse endpoint cria/busca esse client
// e devolve token direto, sem pedir senha. Usado pra demo / teste local.
// EM PRODUCAO: NUNCA setar essa env. Login real (com senha) sempre funciona.
router.get("/auto-login", async (_req, res) => {
  const email = process.env.AUTO_LOGIN_EMAIL?.toLowerCase().trim();
  if (!email) return res.status(404).json({ error: "Auto-login desabilitado" });

  // Cria se nao existir
  let client = await prisma.client.findUnique({ where: { email } });
  if (!client) {
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 8);
    client = await prisma.client.create({
      data: { email, name: email.split("@")[0], passwordHash, status: "TRIAL" },
    });
    logger.info({ email }, "[auto-login] cliente demo criado");
  }

  // Cria session + emite JWT
  const jwtId = crypto.randomUUID();
  const token = jwt.sign(
    { clientId: client.id, email: client.email, jti: jwtId },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
  await prisma.clientSession.create({
    data: { clientId: client.id, jwtId, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
  });

  res.json({
    token,
    client: {
      id: client.id,
      email: client.email,
      name: client.name,
      status: client.status,
      trialEndsAt: client.trialEndsAt,
      plan: client.plan,
      usageLimit: client.usageLimit,
      usageUsed: client.usageUsed,
      periodType: client.periodType,
      outputTokenCap: client.outputTokenCap,
      tokensLimit: client.tokensLimit,
      tokensUsed: client.tokensUsed,
    },
  });
});

// ---------- LOGIN ----------
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  const { email, password } = parsed.data;
  const client = await prisma.client.findUnique({ where: { email } });
  if (!client) return res.status(401).json({ error: "Email ou senha invalidos" });
  if (client.status === "BLOCKED") return res.status(403).json({ error: "Conta bloqueada. Fale com o suporte." });

  const ok = await bcrypt.compare(password, client.passwordHash);
  if (!ok) return res.status(401).json({ error: "Email ou senha invalidos" });

  const jti = crypto.randomBytes(16).toString("hex");
  await prisma.clientSession.create({
    data: {
      clientId: client.id,
      jwtId: jti,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: req.headers["user-agent"] ?? null,
      ip: req.ip ?? null,
    },
  });

  const token = signToken(client.id, client.email, jti);
  setAuthCookie(res, token);

  res.json({
    token,
    client: {
      id: client.id,
      email: client.email,
      name: client.name,
      status: client.status,
      trialEndsAt: client.trialEndsAt,
      plan: client.plan,
      usageLimit: client.usageLimit,
      usageUsed: client.usageUsed,
      periodType: client.periodType,
      outputTokenCap: client.outputTokenCap,
      tokensLimit: client.tokensLimit,
      tokensUsed: client.tokensUsed,
    },
  });
});

// ---------- LOGOUT ----------
router.post("/logout", clientAuthMiddleware, async (req: ClientAuthRequest, res) => {
  if (req.client?.jti) {
    await prisma.clientSession.deleteMany({ where: { jwtId: req.client.jti } });
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.status(204).end();
});

// ---------- ME ----------
router.get("/me", clientAuthMiddleware, async (req: ClientAuthRequest, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.client!.clientId },
    select: {
      id: true, email: true, name: true, status: true,
      trialEndsAt: true,
      // Plano + mensagens (Sprint v0.5.0+)
      plan: true, usageLimit: true, usageUsed: true, periodType: true, outputTokenCap: true, lastUsageReset: true,
      currentPeriodEnd: true,
      // Tokens (legado, mantido pra back-compat)
      tokensLimit: true, tokensUsed: true,
      createdAt: true,
    },
  });
  if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });

  // Reset automático DAILY: se passou 1 dia desde lastUsageReset, zera usageUsed
  let { usageUsed, lastUsageReset, periodType, usageLimit } = client;
  if (periodType === "DAILY" && lastUsageReset) {
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - lastUsageReset.getTime();
    if (elapsed >= dayMs) {
      const zero = await prisma.client.update({
        where: { id: client.id },
        data: { usageUsed: 0, lastUsageReset: new Date() },
        select: { usageUsed: true, lastUsageReset: true },
      });
      usageUsed = zero.usageUsed;
      lastUsageReset = zero.lastUsageReset;
    }
  }

  res.json({
    client: {
      ...client,
      usageUsed,
      lastUsageReset,
      usageLimit,
    },
  });
});

// ---------- PASSWORD RESET: REQUEST ----------
// Se SMTP_HOST estiver configurado (env), envia o codigo por email.
// Sem SMTP, volta ao modo dev: codigo na propria response (devCode).
const ResetReqSchema = z.object({ email: z.string().email() });

router.post("/password-reset/request", async (req, res) => {
  const parsed = ResetReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  const client = await prisma.client.findUnique({ where: { email: parsed.data.email } });
  // Resposta generica (nao revela se email existe)
  const resp: any = { ok: true, hint: "Se o email existir, um codigo foi gerado." };
  if (client) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    await prisma.otpCode.create({
      data: {
        clientId: client.id,
        codeHash,
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    // Tenta enviar via SMTP. Em modo dev (sem SMTP_HOST), devCode vai na response.
    const { sendPasswordResetCode } = await import("../lib/email.js");
    const result = await sendPasswordResetCode(client.email, code, client.name);
    if (!result.viaSmtp) {
      // Dev mode: retorna o codigo pra UI exibir (back-compat MVP)
      resp.devCode = code;
    }
  }
  res.json(resp);
});

// ---------- PASSWORD RESET: CONFIRM ----------
const ResetConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8).max(120),
});

router.post("/password-reset/confirm", async (req, res) => {
  const parsed = ResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  const { email, code, newPassword } = parsed.data;
  const client = await prisma.client.findUnique({ where: { email } });
  if (!client) return res.status(400).json({ error: "Codigo invalido" });

  const otp = await prisma.otpCode.findFirst({
    where: { clientId: client.id, purpose: "PASSWORD_RESET", usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return res.status(400).json({ error: "Codigo expirado" });

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) return res.status(400).json({ error: "Codigo invalido" });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.client.update({ where: { id: client.id }, data: { passwordHash } }),
    prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
    prisma.clientSession.deleteMany({ where: { clientId: client.id } }),
  ]);

  res.status(204).end();
});

export default router;
