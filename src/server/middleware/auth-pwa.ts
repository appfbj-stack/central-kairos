// Middleware que valida JWT do Client (PWA) e popula req.client.
// Reaproveita JWT_SECRET do AdminUser (mesma central).
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "central-kairos-dev-secret-CHANGEME";

export interface ClientAuthPayload {
  clientId: string;
  email: string;
  jti: string;
}

export interface ClientAuthRequest extends Request {
  client?: ClientAuthPayload;
}

export function clientAuthMiddleware(req: ClientAuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const tokenFromHeader = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const tokenFromCookie = (req as any).cookies?.kairos_client_token;
  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    return res.status(401).json({ error: "Nao autenticado" });
  }

  let payload: ClientAuthPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as ClientAuthPayload;
  } catch {
    return res.status(401).json({ error: "Token invalido ou expirado" });
  }

  // Verifica que a session ainda existe e nao foi revogada (logout).
  // Isso permite logout imediato: deleta ClientSession e o token morre.
  prisma.clientSession
    .findUnique({ where: { jwtId: payload.jti } })
    .then((session) => {
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: "Sessao expirada ou revogada" });
      }
      req.client = { clientId: payload.clientId, email: payload.email, jti: payload.jti };
      next();
    })
    .catch(() => res.status(500).json({ error: "Erro ao validar sessao" }));
}
