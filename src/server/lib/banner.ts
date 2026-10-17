// Compositor de banner (carrossel/post) pra PWA / endpoint /api/pwa/banner.
// Gera SVG com texto, depois sharp sobrepoe em fundo (Buffer ou gradiente gerado).
// Retorna Buffer PNG.
//
// v0.5.0+: design rico pra rede social (1080x1350), gradiente 3-stop,
// glow dourado, ornamento + linha decorativa, fontes Noto Serif.
import sharp from "sharp";

export interface TextBlock {
  text: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  top?: number;
  marginX?: number;
  family?: "serif" | "sans-serif" | "cursive";
  lineSpacing?: number;
  bgOpacity?: number;
  letterSpacing?: number;
  italic?: boolean;
}

export interface BannerOptions {
  /** Imagem base (Buffer, path, ou URL). Se omitido, gera gradiente rico. */
  base?: Buffer | string;
  /** Largura final (px). Default 1080. */
  width?: number;
  /** Altura final (px). Default 1350 (formato 4:5 pra Instagram/Facebook) ou 1920 (Reel 9:16). */
  height?: number;
  title?: string;
  subtitle?: string;
  verse?: string;
  brand?: string;
  /** Paleta do gradiente (2 ou 3 cores). */
  gradient?: string[];
  /** Qualidade do PNG (1-100). Default 90. */
  quality?: number;
  /** Tom: claro/escuro (default "dark"). */
  tone?: "dark" | "light";
  /** Formato: "post" (4:5, 1080x1350) ou "reel" (9:16, 1080x1920). Se omitido, inferido de width/height. */
  format?: "post" | "reel";
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = current ? current + " " + w : w;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** SVG com fundo (gradiente 3-stop + textura) + textos. */
function buildBannerSvg(
  width: number,
  height: number,
  texts: TextBlock[],
  palette: string[]
): string {
  const [c1, c2, c3] = palette.length >= 3
    ? palette
    : palette.length === 2
      ? [palette[0], palette[1], palette[0]]
      : ["#1a3a5c", "#0a1d3a", "#1a3a5c"];

  const isDark = true; // dark sempre por enquanto

  const chunks: string[] = [];
  chunks.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );

  // === Fundo: gradiente diagonal 3-stop ===
  chunks.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="50%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="55%">
      <stop offset="0%" stop-color="rgba(255,220,140,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,220,140,0)"/>
    </radialGradient>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="2" result="offsetblur"/>
      <feFlood flood-color="rgba(0,0,0,0.55)"/>
      <feComposite in2="offsetblur" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`);

  chunks.push(`<rect width="${width}" height="${height}" fill="url(#bg)"/>`);

  // Glow radial central (foco atrás do título)
  chunks.push(`<rect width="${width}" height="${height}" fill="url(#glow)"/>`);

  // Textura sutil de ruído (pontos pequenos pra dar profundidade)
  // Gera 60 pontos pseudo-aleatórios com posições determinísticas
  let noiseDots = "";
  for (let i = 0; i < 60; i++) {
    const x = ((i * 173) % width);
    const y = ((i * 89 + 50) % height);
    const r = 1 + ((i * 7) % 3);
    const op = 0.04 + ((i % 5) * 0.01);
    noiseDots += `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,${op})"/>`;
  }
  chunks.push(noiseDots);

  // Moldura decorativa (borda dourada fina)
  const border = Math.round(Math.min(width, height) * 0.012);
  chunks.push(
    `<rect x="${border / 2}" y="${border / 2}" width="${width - border}" height="${height - border}" fill="none" stroke="rgba(212,175,55,0.55)" stroke-width="${border}"/>`
  );

  // Ornamento topo (losango + linhas)
  const ornY = Math.round(height * 0.13);
  chunks.push(
    `<g transform="translate(${width / 2}, ${ornY})">
      <line x1="${-width * 0.18}" y1="0" x2="${-width * 0.04}" y2="0" stroke="rgba(212,175,55,0.7)" stroke-width="2"/>
      <line x1="${width * 0.04}" y1="0" x2="${width * 0.18}" y2="0" stroke="rgba(212,175,55,0.7)" stroke-width="2"/>
      <polygon points="0,-10 12,0 0,10 -12,0" fill="rgba(212,175,55,0.85)"/>
    </g>`
  );

  // === Textos ===
  for (const t of texts) {
    const fontSize = t.fontSize ?? Math.round(width * 0.085);
    const color = t.color ?? "#FFF8E7";
    const family = t.family ?? "serif";
    const marginX = t.marginX ?? Math.round(width * 0.10);
    const align = t.align ?? "center";
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    const x = align === "left" ? marginX : align === "right" ? width - marginX : width / 2;
    const lineSpacing = t.lineSpacing ?? fontSize * 1.15;
    const letterSpacing = t.letterSpacing ?? 0;
    const bgOpacity = t.bgOpacity ?? 0;
    const italic = t.italic ? ` font-style="italic"` : "";

    // wrap mais conservador: 0.55 ao invés de 0.48 pra nunca estourar a borda
    const maxCharsPerLine = Math.floor((width - 2 * marginX) / (fontSize * 0.55));
    const lines = wrapText(t.text, maxCharsPerLine);
    const topPx = t.top ?? Math.round(height * 0.05);

    if (bgOpacity > 0) {
      const blockHeight = lines.length * lineSpacing + 24;
      chunks.push(
        `<rect x="${marginX - 12}" y="${topPx - 12}" width="${width - 2 * (marginX - 12)}" height="${blockHeight}" fill="rgba(0,0,0,${bgOpacity})" rx="${fontSize * 0.3}"/>`
      );
    }

    const lsAttr = letterSpacing ? ` letter-spacing="${letterSpacing}"` : "";
    lines.forEach((line, i) => {
      const y = topPx + (i + 1) * lineSpacing;
      // sombra
      chunks.push(
        `<text x="${x}" y="${y + 3}" font-family="${family}" font-size="${fontSize}" font-weight="700" fill="rgba(0,0,0,0.55)" text-anchor="${anchor}"${lsAttr}${italic}>${escapeXml(line)}</text>`
      );
      // principal com filtro de sombra suave
      chunks.push(
        `<text x="${x}" y="${y}" font-family="${family}" font-size="${fontSize}" font-weight="700" fill="${color}" text-anchor="${anchor}" filter="url(#textShadow)"${lsAttr}${italic}>${escapeXml(line)}</text>`
      );
    });
  }

  // Ornamento inferior (linha + losango + linha) antes do versículo
  if (texts.some((t) => t.text.toLowerCase().includes("versículo") || (t.top ?? 0) > height * 0.7)) {
    const ornY2 = Math.round(height * 0.86);
    chunks.push(
      `<g transform="translate(${width / 2}, ${ornY2})">
        <line x1="${-width * 0.18}" y1="0" x2="${-width * 0.04}" y2="0" stroke="rgba(212,175,55,0.7)" stroke-width="2"/>
        <line x1="${width * 0.04}" y1="0" x2="${width * 0.18}" y2="0" stroke="rgba(212,175,55,0.7)" stroke-width="2"/>
        <polygon points="0,-7 9,0 0,7 -9,0" fill="rgba(212,175,55,0.85)"/>
      </g>`
    );
  }

  // Marca d'água canto inferior direito
  const wmX = Math.round(width * 0.04);
  chunks.push(
    `<text x="${width - wmX}" y="${height - Math.round(height * 0.015)}" font-family="serif" font-size="${Math.round(width * 0.018)}" fill="rgba(255,248,231,0.55)" text-anchor="end" font-style="italic">Kair\u00f3s</text>`
  );

  chunks.push(`</svg>`);
  return chunks.join("");
}

/** Paletas pré-definidas por tema pastoral. */
export const PALETTES: Record<string, string[]> = {
  paz: ["#0d3b66", "#1a5490", "#3e92cc"],
  coragem: ["#5e2a0c", "#a0420c", "#e6a23c"],
  amor: ["#7a1a3a", "#c2185b", "#ff7a9c"],
  fe: ["#3a1a5c", "#6a3a9c", "#c4a0ff"],
  esperanca: ["#1a3a5c", "#3a6a9c", "#9ec5fe"],
  gratidao: ["#3d2c0c", "#7a5a1a", "#d4af37"],
  default: ["#0d3b66", "#1a3a5c", "#3e92cc"],
};

function paletteForTopic(topic: string): string[] {
  const t = topic.toLowerCase();
  for (const [key, palette] of Object.entries(PALETTES)) {
    if (key === "default") continue;
    if (t.includes(key) || (key === "paz" && /paz|calma|tranquil/i.test(t))) return palette;
  }
  if (/natal/i.test(t)) return ["#0a3d2a", "#1a6a4a", "#d4af37"];
  if (/pascoa|ressurrei[cç][aã]o|cristo/i.test(t)) return ["#3a1a5c", "#7a3a9c", "#e6c87c"];
  if (/juvenvent|jovens|juventude/i.test(t)) return ["#0c3d4a", "#1a7a8c", "#ffb84d"];
  if (/casamento|noiva|noivo|família/i.test(t)) return ["#5c1a2a", "#a02a4a", "#e6b8c4"];
  return PALETTES.default;
}

export async function composeBanner(opts: BannerOptions): Promise<{ buf: Buffer; width: number; height: number }> {
  // Resolve dimensões pelo format se width/height não foram passados
  let width = opts.width;
  let height = opts.height;
  if (opts.format === "reel" && (!width || !height)) {
    width = 1080; height = 1920;
  } else if (opts.format === "post" && (!width || !height)) {
    width = 1080; height = 1350;
  } else {
    width ??= 1080;
    height ??= 1350;
  }
  const isReel = height > width * 1.4; // 9:16 = 1.78, 4:5 = 1.25
  const quality = opts.quality ?? 90;
  const palette = opts.gradient ?? PALETTES.default;

  // Offsets verticais dependem do formato
  // POST (4:5, 1080x1350): título 22%, subtítulo 72%, versículo 88%, brand 95%
  // REEL (9:16, 1080x1920): título 30%, subtítulo 75%, versículo 90%, brand 96%
  const titleTop = isReel ? 0.30 : 0.22;
  const subTop = isReel ? 0.74 : 0.72;
  const verseTop = isReel ? 0.89 : 0.88;
  const brandTop = isReel ? 0.96 : 0.95;
  const titleFs = isReel ? 0.090 : 0.095;
  const subFs = isReel ? 0.036 : 0.034;

  const texts: TextBlock[] = [];
  if (opts.title) {
    texts.push({
      text: opts.title.toUpperCase(),
      fontSize: Math.round(width * titleFs),
      top: Math.round(height * titleTop),
      color: "#FFF8E7",
      family: "serif",
      letterSpacing: 4,
    });
  }
  if (opts.subtitle) {
    texts.push({
      text: opts.subtitle,
      fontSize: Math.round(width * subFs),
      top: Math.round(height * subTop),
      color: "rgba(255,248,231,0.92)",
      family: "serif",
      italic: true,
      lineSpacing: Math.round(width * subFs) * 1.4,
    });
  }
  if (opts.verse) {
    texts.push({
      text: opts.verse,
      fontSize: Math.round(width * 0.030),
      top: Math.round(height * verseTop),
      color: "#F4D27A",
      family: "serif",
      lineSpacing: Math.round(width * 0.030) * 1.3,
    });
  }
  if (opts.brand) {
    texts.push({
      text: opts.brand,
      fontSize: Math.round(width * 0.022),
      top: Math.round(height * brandTop),
      color: "rgba(255,248,231,0.75)",
      family: "serif",
    });
  }

  const svg = buildBannerSvg(width, height, texts, palette);
  const buf = await sharp(Buffer.from(svg))
    .png({ quality, compressionLevel: 9 })
    .toBuffer();

  return { buf, width, height };
}

// === Geração via prompt (LLM escolhe versículo + título) ===

export interface BannerContent {
  title: string;
  subtitle: string;
  verse: string;
  palette: string[];
}

const FALLBACK_BIBLE: Record<string, BannerContent> = {
  paz: {
    title: "A Paz que Vem de Deus",
    subtitle: "Quando o mundo parece incerto, Ele é o nosso refúgio.",
    verse: "Deixo-vos a paz, a minha paz vos dou. — João 14:27",
    palette: PALETTES.paz,
  },
  coragem: {
    title: "Coragem pra Continuar",
    subtitle: "Não temas, porque Eu sou contigo.",
    verse: "Sê forte e corajoso. — Josué 1:9",
    palette: PALETTES.coragem,
  },
  amor: {
    title: "O Amor que Tudo Transforma",
    subtitle: "Porque Deus amou o mundo de tal maneira.",
    verse: "João 3:16",
    palette: PALETTES.amor,
  },
  fe: {
    title: "Viva pela Fé",
    subtitle: "Confie no Senhor de todo o coração.",
    verse: "Provérbios 3:5",
    palette: PALETTES.fe,
  },
  esperanca: {
    title: "A Esperança não Decepciona",
    subtitle: "Porque o Senhor é bom e a sua misericórdia dura pra sempre.",
    verse: "Salmos 33:18",
    palette: PALETTES.esperanca,
  },
  gratidao: {
    title: "Coração Grato",
    subtitle: "Em tudo dai graças.",
    verse: "1 Tessalonicenses 5:18",
    palette: PALETTES.gratidao,
  },
  default: {
    title: "Palavra pra Hoje",
    subtitle: "Medite nesta palavra durante o seu dia.",
    verse: "Lâmpada para os meus pés é a tua palavra. — Salmos 119:105",
    palette: PALETTES.default,
  },
};

function pickFallback(topic: string): BannerContent {
  const t = topic.toLowerCase();
  for (const key of Object.keys(FALLBACK_BIBLE)) {
    if (key !== "default" && t.includes(key)) return FALLBACK_BIBLE[key];
  }
  if (/jovens|juventude/i.test(t)) return {
    ...FALLBACK_BIBLE.fe,
    title: "Jovens em Missão",
    subtitle: "Use seus dons pra Glória de Deus.",
    verse: "Não apagueis o Espírito. — 1 Tessalonicenses 5:19",
  };
  if (/retiro/i.test(t)) return {
    ...FALLBACK_BIBLE.esperanca,
    title: "Retiro: Tempo com Deus",
    subtitle: "Afaste-se do mundo e encontre o Pai.",
    verse: "Venham a mim, todos os que estão cansados. — Mateus 11:28",
  };
  if (/anivers[aá]rio/i.test(t)) return {
    ...FALLBACK_BIBLE.gratidao,
    title: "Feliz Aniversário!",
    subtitle: "Que Deus abençoe seu novo ciclo.",
    verse: "O Senhor te abençoe e te guarde. — Números 6:24",
  };
  return FALLBACK_BIBLE.default;
}

interface LLMCaller {
  (messages: Array<{ role: "system" | "user"; content: string }>): Promise<string>;
}

/** Gera conteúdo de banner a partir de um prompt livre (chama LLM, com fallback). */
export async function generateBannerFromTopic(
  topic: string,
  brand: string | undefined,
  llmCall: LLMCaller,
  format: "post" | "reel" = "post"
): Promise<{ content: BannerContent; buf: Buffer; width: number; height: number; format: "post" | "reel" }> {
  let content: BannerContent;
  try {
    const sys = `Você é um assistente que cria conteúdo para banners religiosos/pastorais em português.
Responda SOMENTE um JSON válido (sem markdown, sem explicações) com este formato exato:
{"title":"","subtitle":"","verse":""}
- title: até 6 palavras, marcante, em CAIXA ALTA conceitual (você pode usar minúsculas se for mais natural)
- subtitle: 1 frase curta (até 80 caracteres), complementar ao título
- verse: 1 versículo ARA (Almeida Revista e Atualizada) no formato "Livro Cap.Verso" (ex: "João 14:27") ou citação curta
- NÃO use aspas duplas dentro dos campos
- NÃO adicione campos extras`;

    const user = `Tema: ${topic}${brand ? `\nMarca/Igreja: ${brand}` : ""}`;

    const raw = await llmCall([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);

    // Extrai JSON da resposta (LLM pode devolver markdown)
    const jsonMatch = raw.match(/\{[\s\S]*?"title"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.verse) {
        content = {
          title: String(parsed.title).slice(0, 80),
          subtitle: String(parsed.subtitle || "").slice(0, 120),
          verse: String(parsed.verse).slice(0, 100),
          palette: paletteForTopic(topic),
        };
      } else {
        content = pickFallback(topic);
      }
    } else {
      content = pickFallback(topic);
    }
  } catch (e) {
    console.warn("[banner] LLM falhou, usando fallback:", (e as any)?.message);
    content = pickFallback(topic);
  }

  const { buf, width, height } = await composeBanner({
    format,
    title: content.title,
    subtitle: content.subtitle,
    verse: content.verse,
    brand,
    gradient: content.palette,
  });

  return { content, buf, width, height, format };
}
