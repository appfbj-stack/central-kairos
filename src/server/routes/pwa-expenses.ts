// PWA Expenses (Sprint v0.6.0+)
// GET  /api/pwa/expenses            - lista com filtro opcional from/to
// POST /api/pwa/expenses            - cria gasto (body: {amount, description, category?, occurredAt?})
// GET  /api/pwa/expenses/summary    - resumo (total + por categoria) com from/to
// DELETE /api/pwa/expenses/:id     - remove
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";

const router = Router();
router.use(clientAuthMiddleware);

const CATEGORIES = ["FOOD", "CLOTHING", "TRANSPORT", "HEALTH", "HOUSING", "ENTERTAINMENT", "OTHER"] as const;

const CreateSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  description: z.string().min(1).max(200),
  category: z.enum(CATEGORIES).optional(),
  occurredAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
});

function parseRange(req: ClientAuthRequest): { from: Date; to: Date } {
  const now = new Date();
  const fromStr = req.query.from as string | undefined;
  const toStr = req.query.to as string | undefined;
  if (fromStr && toStr) {
    return { from: new Date(fromStr), to: new Date(toStr) };
  }
  // default: mes atual
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

router.get("/", async (req: ClientAuthRequest, res: Response) => {
  const { from, to } = parseRange(req);
  const list = await prisma.expense.findMany({
    where: { clientId: req.client!.clientId, occurredAt: { gte: from, lte: to } },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
  const total = list.reduce((acc, e) => acc + e.amount, 0);
  res.json({ expenses: list, total, from: from.toISOString(), to: to.toISOString() });
});

router.get("/summary", async (req: ClientAuthRequest, res: Response) => {
  const { from, to } = parseRange(req);
  const list = await prisma.expense.findMany({
    where: { clientId: req.client!.clientId, occurredAt: { gte: from, lte: to } },
  });
  const total = list.reduce((acc, e) => acc + e.amount, 0);
  // soma por categoria
  const byCategory: Record<string, number> = {};
  for (const e of list) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }
  const top = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, sum]) => ({ category: cat, total: sum }));
  res.json({
    total,
    count: list.length,
    byCategory: top,
    from: from.toISOString(),
    to: to.toISOString(),
  });
});

router.post("/", async (req: ClientAuthRequest, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
  const created = await prisma.expense.create({
    data: {
      clientId: req.client!.clientId,
      amount: parsed.data.amount,
      description: parsed.data.description,
      category: parsed.data.category || "OTHER",
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
    },
  });
  res.status(201).json({ expense: created });
});

router.delete("/:id", async (req: ClientAuthRequest, res: Response) => {
  const existing = await prisma.expense.findFirst({
    where: { id: req.params.id, clientId: req.client!.clientId },
  });
  if (!existing) return res.status(404).json({ error: "Gasto nao encontrado" });
  await prisma.expense.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
