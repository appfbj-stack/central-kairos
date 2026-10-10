import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "central-kairos-dev-secret-CHANGEME";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email e senha obrigatórios" });
  }

  const { email, password } = parsed.data;
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as any }
  );

  res.cookie("central_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// GET /api/auth/me
router.get("/me", authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("central_token", { path: "/" });
  res.json({ ok: true });
});

export default router;