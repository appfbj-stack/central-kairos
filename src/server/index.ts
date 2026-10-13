import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma";
import authRoutes from "./routes/auth";
import installationsRoutes from "./routes/installations";
import publicRoutes from "./routes/public";
import pwaAuthRoutes from "./routes/pwa-auth";
import pwaConversationsRoutes from "./routes/pwa-conversations";
import pwaDevicesRoutes from "./routes/pwa-devices";
import pwaTasksRoutes from "./routes/pwa-tasks";
import agentRoutes from "./routes/agent";
import adminPwaRoutes from "./routes/admin-pwa";

// Carrega .env em dev (em prod, variáveis vêm do docker run)
if (process.env.NODE_ENV !== "production") {
  try {
    const dotenv = require("dotenv");
    dotenv.config();
  } catch {}
}

const PORT = Number(process.env.PORT || 3013);
const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Central Kairos",
    version: "0.1.0",
    ts: new Date().toISOString(),
  });
});

// Public status API (no auth — apps consultam)
app.use("/api/public", publicRoutes);

// Authenticated routes
app.use("/api/auth", authRoutes);
app.use("/api/installations", installationsRoutes);
app.use("/api/pwa/auth", pwaAuthRoutes);
app.use("/api/pwa/conversations", pwaConversationsRoutes);
app.use("/api/pwa/devices", pwaDevicesRoutes);
app.use("/api/pwa/tasks", pwaTasksRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/admin-pwa", adminPwaRoutes);

// Serve frontend estático
// OBS: __dirname em bundle CJS do esbuild vira apenas ".", por isso usamos process.cwd().
// CWD = /app quando rodado via Dockerfile CMD.
const distDir = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  console.warn(`[central-kairos] dist/ nao existe em ${distDir} - somente API disponivel`);
}

// Bootstrap: garante admin user existe
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@central-kairos.com";
  const password = process.env.ADMIN_PASSWORD || "Troque@Senha123";
  const name = process.env.ADMIN_NAME || "Fernando Borges";

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`[bootstrap] admin ja existe: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: { email, passwordHash, name },
  });
  console.log(`[bootstrap] admin criado: ${email} / ${password}`);
  console.log(`[bootstrap] IMPORTANTE: troque a senha apos o primeiro login!`);
}

ensureAdmin()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[central-kairos] listening on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[bootstrap] erro:", err);
    process.exit(1);
  });