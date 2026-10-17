// Extracao de texto de PDF usando pdf-parse.
// Recebe Buffer (PDF binario), retorna {text, numPages, info, truncated}.
// Limita texto a maxChars pra nao estourar contexto da LLM.
import pdfParse from "pdf-parse";

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
  const data = await pdfParse(buffer);
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
