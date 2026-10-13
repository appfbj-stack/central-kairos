// Cliente LLM minimalista (Etapa 3b).
// Streaming via SSE no formato OpenAI-compatible.
// Env vars: LLM_API_URL, LLM_API_KEY, LLM_MODEL.
import type { Client } from "@prisma/client";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

const DEFAULT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback) return fallback;
  throw new Error(`Env var ${name} nao definida`);
}

const SYSTEM_PROMPT = `Voce e o KAIROS, um assistente pessoal inteligente.
Responda em portugues brasileiro, tom profissional e acessivel.
Seja conciso e direto. Use listas quando ajudar.
Se nao souber, diga que nao sabe.`;

export async function streamChat(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const url = getEnv("LLM_API_URL", DEFAULT_URL);
  const apiKey = getEnv("LLM_API_KEY", "");
  const model = getEnv("LLM_MODEL", DEFAULT_MODEL);

  const body = {
    model,
    stream: true,
    temperature: 0.7,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`LLM HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let tokensIn = 0;
  let tokensOut = 0;

  // Heuristica simples: ~4 chars por token.
  tokensIn = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE: linhas separadas por \n, eventos por \n\n.
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            onDelta(delta);
          }
          // OpenAI envia usage no final (stream_options.include_usage=true).
          // Sem essa flag, calculamos heuristica.
          if (json.usage?.completion_tokens) tokensOut = json.usage.completion_tokens;
        } catch {
          // ignora linha malformada
        }
      }
    }
  }

  if (!tokensOut) tokensOut = Math.ceil(full.length / 4);
  return { text: full, tokensIn, tokensOut };
}

export function isClientBlocked(client: Client, extraTokens: number): { ok: boolean; reason?: string } {
  if (client.status === "BLOCKED" || client.status === "EXPIRED") {
    return { ok: false, reason: `Conta ${client.status.toLowerCase()}` };
  }
  if (client.trialEndsAt && client.trialEndsAt < new Date()) {
    return { ok: false, reason: "Periodo de teste expirou" };
  }
  if (client.tokensUsed + extraTokens > client.tokensLimit) {
    return { ok: false, reason: `Limite de tokens do plano atingido (${client.tokensUsed}/${client.tokensLimit})` };
  }
  return { ok: true };
}
