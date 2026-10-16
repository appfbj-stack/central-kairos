// PWA banner endpoint — gera PNG 1080x1350 com texto sobre fundo.
// POST /api/pwa/banner
// Body: { title, subtitle?, verse?, brand?, backgroundUrl? (data URL or http URL) }
// Retorna: image/png
import { Router, Response } from "express";
import { z } from "zod";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";
import { composeBanner } from "../lib/banner.js";

const router = Router();

const BodySchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(300).optional(),
  verse: z.string().max(120).optional(),
  brand: z.string().max(60).optional(),
  backgroundUrl: z.string().max(2_000_000).optional(), // data URL grande pode passar 1MB
  width: z.number().int().min(400).max(4000).optional(),
  height: z.number().int().min(400).max(4000).optional(),
  gradient: z.tuple([z.string(), z.string()]).optional(),
});

router.post("/", clientAuthMiddleware, async (req: ClientAuthRequest, res: Response) => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });

  const { title, subtitle, verse, brand, backgroundUrl, width, height, gradient } = parsed.data;

  try {
    let base: Buffer | undefined;
    if (backgroundUrl) {
      if (backgroundUrl.startsWith("data:")) {
        // data URL: extrair base64
        const m = backgroundUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (!m) return res.status(400).json({ error: "backgroundUrl data URL invalido" });
        base = Buffer.from(m[1], "base64");
      } else if (/^https?:\/\//.test(backgroundUrl)) {
        const r = await fetch(backgroundUrl);
        if (!r.ok) return res.status(400).json({ error: "Falha ao baixar backgroundUrl" });
        base = Buffer.from(await r.arrayBuffer());
      } else {
        return res.status(400).json({ error: "backgroundUrl deve ser data URL ou http(s)" });
      }
    }

    const { buf, width: w, height: h } = await composeBanner({
      title,
      subtitle,
      verse,
      brand,
      base,
      width,
      height,
      gradient: gradient as [string, string] | undefined,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="banner-${Date.now()}.png"`);
    res.setHeader("X-Banner-Width", String(w));
    res.setHeader("X-Banner-Height", String(h));
    res.send(buf);
  } catch (err: any) {
    console.error("[pwa-banner] erro:", err);
    res.status(500).json({ error: err?.message || "Erro ao gerar banner" });
  }
});

export default router;
