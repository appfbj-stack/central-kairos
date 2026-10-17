// Extracao de texto de PDF usando pdf-parse (lib pdfjs-dist wrapped).
// Recebe Buffer (PDF binario), retorna {text, numPages, info, truncated}.
// pdf-parse v2 expõe classes em module.exports (PDFParse, etc) - nao e uma funcao.
// API: new PDFParse({data: buffer}).parse() ou (new PDFParse()).parse(buffer)
// Compat: aceita a API antiga (data, info, numpages) via wrap.
import { createRequire } from "module";
const requireCjs = createRequire(import.meta.url);
const pdfParseModule = requireCjs("pdf-parse") as any;
// pdf-parse v2 tem classe PDFParse; v1 exporta funcao direto. Suporte aos dois.
const PDFParseClass: any = pdfParseModule.PDFParse ?? null;
const pdfParseFn: ((buf: Buffer) => Promise<any>) | null = typeof pdfParseModule === "function" ? pdfParseModule : null;

async function parsePdf(buffer: Buffer): Promise<{ text: string; numpages: number; info: any }> {
  if (PDFParseClass) {
    // v2 (pdfjs-dist wrapped): new PDFParse({data}).load() -> getText()/getInfo()
    const parser = new PDFParseClass({ data: buffer });
    if (typeof parser.load === "function") {
      await parser.load();
    }
    const textResult = typeof parser.getText === "function" ? await parser.getText() : null;
    const info = typeof parser.getInfo === "function" ? await parser.getInfo() : null;
    // getText() pode retornar string OU {text, pages, total}. Normalizar.
    let text = "";
    let numpages = 0;
    if (typeof textResult === "string") {
      text = textResult;
    } else if (textResult && typeof textResult === "object") {
      text = textResult.text ?? "";
      numpages = textResult.total ?? 0;
    }
    if (numpages === 0 && info?.info?.NumPages) numpages = info.info.NumPages;
    if (numpages === 0 && info?.total) numpages = info.total;
    return { text, numpages, info: info?.info ?? info ?? null };
  }
  if (pdfParseFn) {
    // v1: pdfParse(buffer) retorna {text, numpages, info}
    const result = await pdfParseFn(buffer);
    return { text: result.text ?? "", numpages: result.numpages ?? 0, info: result.info ?? null };
  }
  throw new Error("pdf-parse nao expoe API conhecida (nem PDFParse class nem funcao)");
}

export interface PdfExtractOptions {
  /** Tamanho maximo do texto retornado (chars). Default 50000 (~12k tokens). */
  maxChars?: number;
  /** Incluir metadata (titulo, autor, etc). */
  includeInfo?: boolean;
}

export interface PdfExtractResult {
  text: string;
  numPages: number;
  info: Record<string, any> | null;
  truncated: boolean;
  bytes: number;
}

export async function extractTextFromPdf(
  buffer: Buffer,
  opts: PdfExtractOptions = {}
): Promise<PdfExtractResult> {
  const maxChars = opts.maxChars ?? 50000;
  const data = await parsePdf(buffer);
  let text = data.text || "";
  const truncated = text.length > maxChars;
  if (truncated) {
    text = text.slice(0, maxChars) + "\n\n... [texto truncado em " + maxChars + " chars]";
  }
  return {
    text,
    numPages: data.numpages || 0,
    info: opts.includeInfo === false ? null : (data.info || null),
    truncated,
    bytes: buffer.length,
  };
}


