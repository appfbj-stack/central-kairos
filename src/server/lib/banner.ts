// Compositor de banner (carrossel/post) pra PWA / endpoint /api/pwa/banner.
// Gera SVG com texto, depois sharp sobrepoe em fundo (Buffer ou gradiente gerado).
// Retorna Buffer PNG.
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
}

export interface BannerOptions {
  /** Imagem base (Buffer, path, ou URL). Se omitido, gera gradiente. */
  base?: Buffer | string;
  width?: number;
  height?: number;
  title?: string;
  subtitle?: string;
  verse?: string;
  brand?: string;
  /** Paleta do gradiente (caso nao tenha base) */
  gradient?: [string, string];
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

function buildTextSvg(width: number, height: number, texts: TextBlock[]): string {
  const chunks: string[] = [];
  chunks.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );

  for (const t of texts) {
    const fontSize = t.fontSize ?? Math.round(width * 0.06);
    const color = t.color ?? "#FFF8E7";
    const family = t.family ?? "serif";
    const marginX = t.marginX ?? Math.round(width * 0.06);
    const align = t.align ?? "center";
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    const x = align === "left" ? marginX : align === "right" ? width - marginX : width / 2;
    const lineSpacing = t.lineSpacing ?? fontSize * 1.2;
    const bgOpacity = t.bgOpacity ?? 0;

    const maxCharsPerLine = Math.floor(width / (fontSize * 0.5)) - 4;
    const lines = wrapText(t.text, maxCharsPerLine);
    const topPx = t.top ?? Math.round(height * 0.05);

    if (bgOpacity > 0) {
      const blockHeight = lines.length * lineSpacing + 20;
      chunks.push(
        `<rect x="0" y="${topPx - 10}" width="${width}" height="${blockHeight}" fill="rgba(0,0,0,${bgOpacity})" />`
      );
    }

    lines.forEach((line, i) => {
      const y = topPx + (i + 1) * lineSpacing;
      chunks.push(
        `<text x="${x + 2}" y="${y + 2}" font-family="${family}" font-size="${fontSize}" font-weight="700" fill="rgba(180,140,60,0.6)" text-anchor="${anchor}">${escapeXml(line)}</text>`
      );
      chunks.push(
        `<text x="${x}" y="${y}" font-family="${family}" font-size="${fontSize}" font-weight="700" fill="${color}" text-anchor="${anchor}">${escapeXml(line)}</text>`
      );
    });
  }

  chunks.push(`</svg>`);
  return chunks.join("");
}

function makeGradient(width: number, height: number, c1: string, c2: string): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: c1,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="${c1}"/>
                <stop offset="100%" stop-color="${c2}"/>
              </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" fill="url(#g)"/>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

export async function composeBanner(opts: BannerOptions): Promise<{ buf: Buffer; width: number; height: number }> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1350;
  const texts: TextBlock[] = [];

  if (opts.title) {
    texts.push({
      text: opts.title.toUpperCase(),
      fontSize: Math.round(width * 0.11),
      top: Math.round(height * 0.06),
      color: "#FFF8E7",
      family: "serif",
      bgOpacity: 0,
    });
  }
  if (opts.subtitle) {
    texts.push({
      text: opts.subtitle,
      fontSize: Math.round(width * 0.045),
      top: Math.round(height * 0.82),
      color: "#FFF8E7",
      family: "serif",
      bgOpacity: 0.45,
    });
  }
  if (opts.verse) {
    texts.push({
      text: opts.verse,
      fontSize: Math.round(width * 0.035),
      top: Math.round(height * 0.93),
      color: "#D4AF37",
      family: "serif",
    });
  }
  if (opts.brand) {
    texts.push({
      text: opts.brand,
      fontSize: Math.round(width * 0.028),
      top: Math.round(height * 0.97),
      color: "#D4AF37",
      family: "serif",
    });
  }

  let baseBuffer: Buffer;
  if (opts.base) {
    baseBuffer = Buffer.isBuffer(opts.base)
      ? opts.base
      : await sharp(opts.base).resize(width, height, { fit: "cover" }).toBuffer();
  } else {
    const [c1, c2] = opts.gradient ?? ["#1a3a5c", "#0a1d3a"];
    baseBuffer = await makeGradient(width, height, c1, c2);
  }

  const textSvg = buildTextSvg(width, height, texts);
  const buf = await sharp(baseBuffer)
    .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  return { buf, width, height };
}
