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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
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
2. Escrever um TITULO curto e impactante (3-6 palavras, sem ponto final, sem prefixos tipo "Banner:").
3. Escrever um SUBTITULO (1 frase, maximo 12 palavras, tom pastoral/inspirador, sem prefixo "Subtitle:").
4. Devolver SOMENTE o objeto JSON. Nada antes, nada depois.

FORMATO EXATO (sem markdown, sem code fences):
{"title":"NOME IMPACTO","subtitle":"frase pastoral","verse":"texto do versiculo aqui","reference":"Livro Capitulo:Versiculo"}

REGRAS RIGOROSAS:
- Versiculo DEVE ser real (NAO invente). Use ARA (Almeida Revista e Atualizada).
- Aspas duplas DENTRO das strings PROIBIDAS. Use aspas simples se precisar.
- NUNCA inclua "Banner:", "Title:", "Subtitle:" ou outros prefixos nos valores.
- A PRIMEIRA LINHA do output DEVE ser o caractere { abrindo o JSON.
- NAO inclua explicacoes, comentarios, markdown, ou texto fora do JSON.`;

  let fields: z.infer<typeof ComposeFieldsSchema>;
  try {
    let acc = "";
    await streamChat(
      [{ role: "user", content: `Tema do banner: ${topic}${brand ? `\nMarca/igreja: ${brand}` : ""}` }],
      (delta) => { acc += delta; },
    );
    // Filtra blocos <think>...</think> do MiniMax (chain-of-thought)
    acc = acc.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trimStart();

    // Tenta 1: JSON direto
    const cleaned = acc.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    const m = cleaned.match(/\{[\s\S]*\}/);

    let parsed: any = null;
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* tenta parser de texto livre */ }
    }

    // Tenta 2: parser de texto livre
    if (!parsed) {
      parsed = parseFreeformBanner(cleaned);
    }

    if (!parsed) {
      console.error("[pwa-banner/compose] LLM nao retornou JSON nem texto reconhecivel:", cleaned.slice(0, 500));
      // Fallback: escolhe versículo default baseado em keyword do tema
      parsed = fallbackBanner(topic);
      console.log("[pwa-banner/compose] usando fallback:", parsed);
    }

    const safe = ComposeFieldsSchema.safeParse(parsed);
    if (!safe.success) {
      console.error("[pwa-banner/compose] parser nao casou schema:", parsed, "errors:", safe.error.issues);
      return res.status(502).json({ error: "Parser nao casou schema esperado", details: safe.error.issues, raw: cleaned.slice(0, 500) });
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

/**
 * Parser de texto livre: quando a LLM ignora o pedido de JSON e devolve
 * markdown, extrai titulo (linha curta em CAIXA ALTA), subtitulo (linha
 * seguinte nao-vazia), versiculo (linha entre aspas) e referencia (ultimo
 * token com formato "Livro Capitulo:Versiculo").
 */
function parseFreeformBanner(text: string): {
  title?: string; subtitle?: string; verse?: string; reference?: string;
} | null {
  const result: { title?: string; subtitle?: string; verse?: string; reference?: string } = {};
  // 1) Referencia biblica: "Livro Cap:Ver" (ex: "Joao 3:16", "1 Pedro 5:7", "Salmos 23:1")
  // Aceita acentos basicos.
  const refMatch = text.match(/\b((?:1|2|3|)?\s?[A-ZÁÉÍÓÚÂÊÔÇ][a-záéíóúâêôçãõ]+(?:\s[A-ZÁÉÍÓÚÂÊÔÇ][a-záéíóúâêôçãõ]+)?)\s+(\d{1,3}):(\d{1,3}(?:-\d{1,3})?)\b/);
  if (refMatch) {
    result.reference = `${refMatch[1]} ${refMatch[2]}:${refMatch[3]}`;
  }

  // 2) Versiculo: maior bloco entre aspas duplas OU linha com "..."
  const verseMatch = text.match(/"([^"]{10,300})"/);
  if (verseMatch) {
    result.verse = verseMatch[1].trim();
  } else {
    // Pega o maior paragrafo entre a referencia e o titulo
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const refIdx = refMatch ? lines.findIndex((l) => l.includes(refMatch[0])) : lines.length;
    const titleIdx = lines.findIndex((l) => /^[A-ZÁÉÍÓÚÂÊÔÇ0-9 ,.'!?-]{3,60}$/.test(l) && l === l.toUpperCase());
    if (titleIdx >= 0 && refIdx > titleIdx + 1) {
      // entre titulo e referencia: pega o paragrafo mais longo
      const between = lines.slice(titleIdx + 1, refIdx).filter((l) => l.length > 20);
      if (between.length > 0) result.verse = between[0];
    }
  }

  // 3) Titulo: linha curta em CAIXA ALTA (sem pontos finais)
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (/^#+\s*/.test(l)) {
      const t = l.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();
      // Limpa prefixos indesejados tipo "Banner: ", "Banner — ", "Title: "
      const cleaned = t.replace(/^banner\s*[:\-—|]\s*/i, "").replace(/^titulo\s*[:\-—|]\s*/i, "").trim();
      if (cleaned.length >= 3 && cleaned.length <= 60) { result.title = cleaned; break; }
    }
    if (l === l.toUpperCase() && l.length >= 3 && l.length <= 60 && /[A-ZÁÉÍÓÚÂÊÔÇ]/.test(l)) {
      const cleaned = l.replace(/[*_`]/g, "").replace(/^banner\s*[:\-—|]\s*/i, "").replace(/^titulo\s*[:\-—|]\s*/i, "").trim();
      result.title = cleaned;
      break;
    }
  }

  // 4) Subtitulo: linha nao-vazia logo apos o titulo
  if (result.title) {
    const titleIdx = lines.findIndex((l) => l.replace(/[#*_`]/g, "").trim() === result.title);
    if (titleIdx >= 0) {
      for (let i = titleIdx + 1; i < lines.length; i++) {
        const l = lines[i].replace(/[#*_`]/g, "").trim()
          // Limpa prefixo "Subtitle: " etc
          .replace(/^subtitulo\s*[:\-—|]\s*/i, "").replace(/^subtitle\s*[:\-—|]\s*/i, "")
          // Limpa prefixo "Sujestao/Sugestao" que a LLM gosta de botar
          .replace(/^suge(?:r|sta|ren)(?:stoes|tao|coes)?\s*(?:de\s+)?(?:vers[ií]culos?|frases?)?\s*[:\-—|]?\s*/i, "")
          .trim();
        if (l.length >= 5 && l.length <= 150 && l !== result.title && !l.startsWith(result.reference || "_")) {
          result.subtitle = l;
          break;
        }
      }
    }
  }

  // Validação minima
  if (!result.title || !result.verse || !result.reference) {
    return null;
  }
  return result;
}

/**
 * Fallback usado quando a LLM nao devolve JSON nem texto parseavel.
 * Escolhe versículo default baseado em keywords do tema.
 */
function fallbackBanner(topic: string): { title: string; subtitle: string; verse: string; reference: string } {
  const t = topic.toLowerCase();
  if (/paz|ansied|descans/.test(t)) {
    return {
      title: "A Paz Que Vem De Deus",
      subtitle: "Confianca em meio a todas as circunstancias",
      verse: "Deixo-vos a paz, a minha paz vos dou; nao vo-la dou como o mundo a da.",
      reference: "Joao 14:27",
    };
  }
  if (/coragem|forc|medo|valente|destem/.test(t)) {
    return {
      title: "Seja Forte E Corajoso",
      subtitle: "Deus esta com voce em cada passo",
      verse: "Nao te ordenei eu: seja forte e corajoso? Nao se apavore, nem se desanime, porque o Senhor, o seu Deus, estara com voce por onde quer que andar.",
      reference: "Josue 1:9",
    };
  }
  if (/amor|cari/.test(t)) {
    return {
      title: "O Maior De Todos",
      subtitle: "O amor de Deus revelado em Cristo",
      verse: "Porque Deus tanto amou o mundo que deu o seu Filho Unigenito, para que todo o que nele crer nao pereca, mas tenha a vida eterna.",
      reference: "Joao 3:16",
    };
  }
  if (/fe|confianc|crer/.test(t)) {
    return {
      title: "A Fe Que Move Montanhas",
      subtitle: "Confie no Senhor de todo o coracao",
      verse: "Confie no Senhor de todo o coracao e nao se apoie no seu proprio entendimento.",
      reference: "Proverbios 3:5",
    };
  }
  // Default
  return {
    title: "Deus E Fiel",
    subtitle: "Uma palavra para o seu dia",
    verse: "O Senhor é a minha força e o meu escudo; nele o meu coracao confia.",
    reference: "Salmos 28:7",
  };
}
