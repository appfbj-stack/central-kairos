// Devices PWA/Electron (Sprint 1.20 / Etapa 3e)
// Vincula um device a um Client. Sem SMTP, retorna otpToken na response
// pra PWA EXISTENTE confirmar manualmente (modelo MVP).
import { Router, Response } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";

const router = Router();
router.use(clientAuthMiddleware);

// POST /api/pwa/devices - cria device PENDING + devolve otpToken.
const RegisterSchema = z.object({
  kind: z.enum(["PWA", "ELECTRON"]),
  name: z.string().min(1).max(120).optional(),
  os: z.string().max(60).optional(),
  hardware: z.string().max(200).optional(),
});

router.post("/", async (req: ClientAuthRequest, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });

  // Cria token unico; otpCodeHash eh o hash do token (reaproveita modelo OTP).
  const deviceToken = crypto.randomBytes(32).toString("hex");
  const otpCode = crypto.randomBytes(6).toString("hex");
  const otpTokenPlain = `${otpCode}.${deviceToken}`; // MVP: codigo + token concatenado
  const otpHash = crypto.createHash("sha256").update(otpTokenPlain).digest("hex");

  const dev = await prisma.device.create({
    data: {
      clientId: req.client!.clientId,
      kind: parsed.data.kind,
      name: parsed.data.name,
      os: parsed.data.os,
      hardware: parsed.data.hardware,
      deviceToken,
      status: "PENDING",
    },
  });

  // Salva otpCode com purpose DEVICE_LINK (reusa tabela OtpCode)
  await prisma.otpCode.create({
    data: {
      clientId: req.client!.clientId,
      codeHash: otpHash,
      purpose: "DEVICE_LINK",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  res.status(201).json({
    deviceId: dev.id,
    otpToken: otpTokenPlain, // MVP: PWA logada EXIBE esse codigo; user digita no Electron
    otpHint: "Mostre este codigo no agent para confirmar o vinculo",
  });
});

// POST /api/pwa/devices/link/confirm - confirma com otpToken, devolve deviceToken pra usar.
const ConfirmSchema = z.object({ otpToken: z.string().min(10) });

router.post("/link/confirm", async (req: ClientAuthRequest, res: Response) => {
  const parsed = ConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos" });
  const otpTokenPlain = parsed.data.otpToken;
  const otpHash = crypto.createHash("sha256").update(otpTokenPlain).digest("hex");

  const otp = await prisma.otpCode.findFirst({
    where: {
      clientId: req.client!.clientId,
      purpose: "DEVICE_LINK",
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.codeHash !== otpHash) {
    return res.status(400).json({ error: "Codigo invalido ou expirado" });
  }
  // Extrai o deviceToken da string (parte depois do ".")
  const dotIdx = otpTokenPlain.indexOf(".");
  if (dotIdx < 0) return res.status(400).json({ error: "Codigo malformado" });
  const deviceToken = otpTokenPlain.slice(dotIdx + 1);

  const dev = await prisma.device.findUnique({ where: { deviceToken } });
  if (!dev || dev.clientId !== req.client!.clientId) {
    return res.status(404).json({ error: "Device nao encontrado" });
  }

  await prisma.$transaction([
    prisma.device.update({ where: { id: dev.id }, data: { status: "ACTIVE" } }),
    prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
  ]);

  res.json({ deviceId: dev.id, deviceToken });
});

// GET /api/pwa/devices/by-otp - retorna deviceToken quando o vinculo foi confirmado na PWA.
// Usado pelo agent (Electron) em modo polling: faz login uma vez (gera clientJwt
// salvo localmente), cria o device PENDING, e fica chamando esse endpoint com o JWT
// + otpToken completo (codigo.deviceToken) ate' ver status=ACTIVE + deviceToken.
// Auth-pwa garante que o agent so' consulta devices da conta logada.
const ByOtpQuery = z.object({ otpToken: z.string().min(10) });
router.get("/by-otp", async (req: ClientAuthRequest, res: Response) => {
  const parsed = ByOtpQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "otpToken obrigatorio" });
  const otpTokenPlain = parsed.data.otpToken;
  const dotIdx = otpTokenPlain.indexOf(".");
  if (dotIdx < 0) return res.status(400).json({ error: "Codigo malformado" });
  const candidateDeviceToken = otpTokenPlain.slice(dotIdx + 1);

  const dev = await prisma.device.findFirst({
    where: { clientId: req.client!.clientId, deviceToken: candidateDeviceToken },
    select: { id: true, status: true, deviceToken: true, name: true, createdAt: true, lastSeenAt: true },
  });
  if (!dev) return res.status(404).json({ status: "not_found" });
  if (dev.status === "ACTIVE") {
    return res.json({ status: "active", deviceId: dev.id, deviceToken: dev.deviceToken });
  }
  res.json({ status: "pending" });
});

// GET /api/pwa/devices - lista devices do client.
router.get("/", async (req: ClientAuthRequest, res: Response) => {
  const list = await prisma.device.findMany({
    where: { clientId: req.client!.clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, name: true, os: true, status: true, lastSeenAt: true, createdAt: true },
  });
  res.json({ devices: list });
});

// DELETE /api/pwa/devices/:id - revoga um device.
router.delete("/:id", async (req: ClientAuthRequest, res: Response) => {
  const dev = await prisma.device.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
  });
  if (!dev) return res.status(404).json({ error: "Device nao encontrado" });
  await prisma.device.update({ where: { id: dev.id }, data: { status: "REVOKED" } });
  res.status(204).end();
});

export default router;
