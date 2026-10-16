// PWA banner endpoint — gera PNG 1080x1350 com texto sobre fundo.
// POST /api/pwa/banner         (manual)  Body: { title, subtitle?, verse?, brand?, backgroundUrl?, width?, height? }
// POST /api/pwa/banner/compose (AI)      Body: { topic: string, brand?, width?, height? }
//                                            -> LLM escolhe versículo, escreve título + subtítulo
// Retorna: image/png
import { Router, Response } from "express";
import { z } from "zod";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";
import { composeBanner } from "../lib/banner.js";
import { streamChat } from "../lib/llm.js";

const router = Router();

// ---------- Schema do endpoint manual ----------
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

async function loadBackground(backgroundUrl: string | undefined): Promise<Buffer | undefined> {
  if (!backgroundUrl) return undefined;
  if (backgroundUrl.startsWith("data:")) {
    const m = backgroundUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!m) throw new Error("backgroundUrl data URL invalido");
    return Buffer.from(m[1], "base64");
  } else if (/^https?:\/\//.test(backgroundUrl)) {
    const r = await fetch(backgroundUrl);
    if (!r.ok) throw new Error("Falha ao baixar backgroundUrl");
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("backgroundUrl deve ser data URL ou http(s)");
}

function sendPng(res: Response, buf: Buffer, width: number, height: number) {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename="banner-${Date.now()}.png"`);
  res.setHeader("X-Banner-Width", String(width));
  res.setHeader("X-Banner-Height", String(height));
  res.send(buf);
}

router.post("/", clientAuthMiddleware, async (req: ClientAuthRequest, res: Response) => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });

  const { title, subtitle, verse, brand, backgroundUrl, width, height, gradient } = parsed.data;

  try {
    const base = await loadBackground(backgroundUrl);
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
    sendPng(res, buf, w, h);
  } catch (err: any) {
    console.error("[pwa-banner] erro:", err);
    res.status(500).json({ error: err?.message || "Erro ao gerar banner" });
  }
});

// ---------- Endpoint AI: LLM escolhe versículo e escreve ----------
const ComposeBodySchema = z.object({
  topic: z.string().min(3).max(500).describe("O que o usuario quer no banner (ex: 'versiculo sobre paz')"),
  brand: z.string().max(60).optional(),
  width: z.number().int().min(400).max(4000).optional(),
  height: z.number().int().min(400).max(4000).optional(),
  gradient: z.tuple([z.string(), z.string()]).optional(),
});

const ComposeFieldsSchema = z.object({
  title: z.string().min(2).max(60),
  subtitle: z.string().min(2).max(150),
  verse: z.string().min(5).max(200),
  reference: z.string().min(2).max(40),
});

router.post("/compose", clientAuthMiddleware, async (req: ClientAuthRequest, res: Response) => {
  const parsed = ComposeBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });

  const { topic, brand, width, height, gradient } = parsed.data;

  const systemPrompt = `Voce e um designer de banners evangelicos brasileiros.
O usuario descreve o que quer no banner. Voce deve:
1. Escolher UM versiculo biblico (A Biblia Sagrada) apropriado ao tema.
2. Escrever um TITULO curto e impactante (3-6 palavras, em maiusculas, sem ponto final).
3. Escrever um SUBTITULO (1 frase, maximo 12 palavras, tom pastoral/inspirador).
4. Devolver ESTRITAMENTE JSON: {"title":"...","subtitle":"...","verse":"<texto do versiculo>","reference":"<Livro Cap:Ver>"}.

REGRAS:
- Versiculo DEVE ser texto biblico real (NAO invente).
- Use ARA (Almeida Revista e Atualizada) — fonte mais confiavel.
- NUNCA inclua markdown, code blocks, ou texto fora do JSON.
- NUNCA inclua aspas duplas dentro das strings (use aspas simples se necessario).
- Responda APENAS o JSON.`;

  let fields: z.infer<typeof ComposeFieldsSchema>;
  try {
    let acc = "";
    await streamChat(
      [{ role: "user", content: `Tema do banner: ${topic}${brand ? `\nMarca/igreja: ${brand}` : ""}` }],
      (delta) => { acc += delta; },
    );
    // Limpa code fences caso a LLM retorne
    acc = acc.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    // Pega o primeiro objeto {...} da resposta
    const m = acc.match(/\{[\s\S]*\}/);
    const jsonStr = m ? m[0] : acc;
    const parsedJson = JSON.parse(jsonStr);
    const safe = ComposeFieldsSchema.safeParse(parsedJson);
    if (!safe.success) {
      console.error("[pwa-banner/compose] LLM retornou JSON invalido:", parsedJson, "errors:", safe.error.issues);
      return res.status(502).json({ error: "LLM retornou JSON invalido", details: safe.error.issues, raw: acc.slice(0, 500) });
    }
    fields = safe.data;
  } catch (err: any) {
    console.error("[pwa-banner/compose] erro LLM:", err);
    return res.status(500).json({ error: `Erro na LLM: ${err?.message || "desconhecido"}` });
  }

  try {
    const { buf, width: w, height: h } = await composeBanner({
      title: fields.title,
      subtitle: fields.subtitle,
      verse: `${fields.verse} — ${fields.reference}`,
      brand: brand,
      width,
      height,
      gradient: gradient as [string, string] | undefined,
    });
    // Headers extras pra debug/inspecao no front
    res.setHeader("X-Banner-Title", encodeURIComponent(fields.title));
    res.setHeader("X-Banner-Subtitle", encodeURIComponent(fields.subtitle));
    res.setHeader("X-Banner-Verse", encodeURIComponent(`${fields.verse} — ${fields.reference}`));
    res.setHeader("X-Banner-Topic", encodeURIComponent(topic));
    sendPng(res, buf, w, h);
  } catch (err: any) {
    console.error("[pwa-banner/compose] erro sharp:", err);
    res.status(500).json({ error: `Erro ao renderizar banner: ${err?.message || "desconhecido"}` });
  }
});

export default router;
