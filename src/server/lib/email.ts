// Email sender — usa nodemailer quando SMTP_HOST esta' configurado.
// Em modo dev (sem SMTP), loga o codigo no console e retorna o codigo na
// response (back-compat com o MVP `devCode`).
//
// Env vars (todas opcionais):
//   SMTP_HOST       ex.: smtp.gmail.com, smtp.sendgrid.net
//   SMTP_PORT       default 587
//   SMTP_SECURE     "true" para 465, "false" para STARTTLS (default false)
//   SMTP_USER       usuario de auth
//   SMTP_PASS       senha ou app-password
//   SMTP_FROM       default "Kairos <noreply@fbautomacao.space>"
//   SMTP_REPLY_TO   default igual ao FROM
//   EMAIL_DEV_MODE  "true" para forcar dev (sem SMTP) mesmo com env vars setadas
//
// Qualquer provider SMTP funciona (Gmail, SendGrid, Mailgun, SES, Zoho, etc).

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

let transporter: Transporter | null = null;
let smtpInitialized = false;

function isDevMode(): boolean {
  if (process.env.EMAIL_DEV_MODE === "true") return true;
  return !process.env.SMTP_HOST;
}

function initTransporter(): Transporter | null {
  if (smtpInitialized) return transporter;
  smtpInitialized = true;
  if (isDevMode()) {
    logger.info("[email] modo DEV (sem SMTP) — codigos serao logados no console");
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
  logger.info(
    { host: process.env.SMTP_HOST, port, secure, user: process.env.SMTP_USER || "(no-auth)" },
    "[email] transporter SMTP configurado"
  );
  return transporter;
}

function fromAddress(): string {
  return process.env.SMTP_FROM || "Kairos <noreply@fbautomacao.space>";
}

function replyToAddress(): string {
  return process.env.SMTP_REPLY_TO || fromAddress();
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** true se foi enviado via SMTP real; false se dev mode (logou no console). */
  viaSmtp: boolean;
}

export async function sendPasswordResetCode(
  to: string,
  code: string,
  clientName?: string
): Promise<SendResult> {
  const t = initTransporter();
  const subject = "Kairos - Codigo de recuperacao de senha";
  const html = renderResetEmail(code, clientName);
  const text =
    `Ola ${clientName || ""}!\n\n` +
    `Seu codigo de recuperacao de senha do Kairos e: ${code}\n\n` +
    `Valido por 15 minutos. Se voce nao pediu isso, ignore este email.\n\n` +
    `-- Kairos`;

  if (!t) {
    // Dev mode — loga no console com destaque
    logger.warn(`\n${"=".repeat(60)}\n[email DEV] Password reset code for ${to}: ${code}\n${"=".repeat(60)}\n`);
    return { ok: true, viaSmtp: false };
  }

  try {
    const info = await t.sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
      replyTo: replyToAddress(),
    });
    logger.info({ to, messageId: info.messageId }, "[email] password reset enviado");
    return { ok: true, messageId: info.messageId, viaSmtp: true };
  } catch (err) {
    logger.error({ to, err: String(err) }, "[email] falha ao enviar");
    return { ok: false, error: String(err), viaSmtp: true };
  }
}

function renderResetEmail(code: string, name?: string): string {
  const greet = name ? `Ola, <strong>${escapeHtml(name)}</strong>` : "Ola";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Recuperacao de senha - Kairos</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f6fa;padding:24px;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05)">
    <div style="background:linear-gradient(135deg,#0a1d3a 0%,#1e6fff 100%);padding:24px 32px;text-align:center">
      <div style="display:inline-block;width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:10px;line-height:48px;color:#22ffb3;font-size:24px;font-weight:bold">K</div>
      <h1 style="color:#fff;font-size:20px;margin:12px 0 0">Kairos</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${greet},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4b5563">
        Recebemos um pedido de recuperacao de senha. Use o codigo abaixo para definir uma nova senha.
      </p>
      <div style="background:#0a1d3a;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
        <div style="color:#22ffb3;font-size:32px;font-weight:bold;letter-spacing:6px;font-family:monospace">${escapeHtml(code)}</div>
        <div style="color:#9ca3af;font-size:12px;margin-top:8px">Valido por 15 minutos</div>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280">
        Se voce nao fez este pedido, pode ignorar este email com seguranca.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280">
        Por questoes de seguranca, o codigo expira automaticamente.
      </p>
    </div>
    <div style="background:#f9fafb;padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af">
      <p style="margin:0">Kairos - Seu assistente pessoal com IA</p>
      <p style="margin:4px 0 0">https://app.fbautomacao.space</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
