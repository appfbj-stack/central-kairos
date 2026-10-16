// Detector de intencao de mensagens do cliente no chat.
// Identifica se o user quer:
//   - criar lembrete (reuniao, aniversario, tarefa, compromisso)
//   - criar gasto (comprei, gastei, paguei)
//   - consultar gastos ("quanto gastei")
//   - listar lembretes ("quais meus compromissos")
//
// Retorna uma lista de intents detectadas (pode ter mais de uma).
import type { ExpenseCategory, ReminderType } from "@prisma/client";

export type DetectedIntent =
  | {
      type: "create_reminder";
      when: Date;
      message: string;
      reminderType: ReminderType;
    }
  | { type: "create_expense"; amount: number; description: string; category: ExpenseCategory; occurredAt: Date }
  | { type: "query_expenses"; from: Date; to: Date }
  | { type: "list_reminders"; from: Date; to: Date };

// --- helpers de data em PT-BR ---

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6,
};

/** "16/10", "16/10/2026", "16-10-26" → Date (ano default = atual) */
function parseDateBR(s: string): Date | null {
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** "sexta", "sexta-feira", "sexta que vem" → Date */
function parseWeekdayBR(s: string): Date | null {
  const m = s.toLowerCase().match(/\b(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)\b(?:\s*-\s*feira)?/);
  if (!m) return null;
  const target = DIAS_SEMANA[m[1]];
  if (target === undefined) return null;
  const today = new Date();
  const cur = today.getDay();
  let diff = (target - cur + 7) % 7;
  if (diff === 0) diff = 7; // se for hoje, vai pra próxima (a menos que tenha "hoje")
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

/** "amanhã" → Date */
function parseAmanha(s: string): Date | null {
  return /\bamanh[ãa]\b/i.test(s) ? new Date(Date.now() + 86400000) : null;
}

/** "hoje" → Date */
function parseHoje(s: string): Date | null {
  return /\bhoje\b/i.test(s) ? new Date() : null;
}

/** Combina todos os parsers de data e retorna o primeiro match. */
function detectDate(text: string): Date | null {
  // tenta match de data absoluta dd/mm[/yyyy] ou dd-mm-yy
  const dm = text.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (dm) {
    const d = parseDateBR(dm[0]);
    if (d) return d;
  }
  return (
    parseAmanha(text) ||
    parseHoje(text) ||
    parseWeekdayBR(text) ||
    null
  );
}

/** Extrai categoria de gasto baseado em palavras-chave. */
function detectExpenseCategory(text: string): ExpenseCategory {
  const t = text.toLowerCase();
  if (/(com[ií]da|almo[çc]o|janta|caf[ée]|lanche|mercado|supermerc|feira|restaurante|pizza|hamb[úu]rguer|sushi|ifood|rappi)/.test(t)) return "FOOD";
  if (/(roupa|camisa|cal[çc]a|tenis|sapato|bermuda|vestido|blusa|jaqueta)/.test(t)) return "CLOTHING";
  if (/(uber|taxi|99|gasolina|combust[ií]vel|passagem|ônibus|onibus|metrô|metro|estacionamento)/.test(t)) return "TRANSPORT";
  if (/(rem[eé]dio|medic[ao]|farm[áa]cia|hospital|consulta|exame|m[eé]dico)/.test(t)) return "HEALTH";
  if (/(aluguel|conta|luz|[\áa]gua|g[áa]s|internet|condom[ií]nio|iptu)/.test(t)) return "HOUSING";
  if (/(cinema|netflix|spotify|lazer|show|bar|balada|parque)/.test(t)) return "ENTERTAINMENT";
  return "OTHER";
}

/** "comprei café 30", "gastei 30 no café", "paguei 40 pela camisa" → {amount, description} */
function parseExpense(text: string): { amount: number; description: string } | null {
  const m = text.match(/\b(comprei|gastei|paguei|despesa|gasto)\b[^\d]*(\d+(?:[.,]\d{1,2})?)\b([^\n.!?]*)/i);
  if (!m) return null;
  const amount = parseFloat(m[2].replace(",", "."));
  if (!isFinite(amount) || amount <= 0) return null;
  const description = (m[3] || "").trim().replace(/^(no|na|em|com|de|por|pelo|pela)\s+/i, "").slice(0, 200) || "despesa";
  return { amount, description };
}

function parseReminderType(text: string): ReminderType {
  const t = text.toLowerCase();
  if (/(anivers[áa]rio|nascimento|completa\s+anos)/.test(t)) return "BIRTHDAY";
  if (/(tarefa|afazer|lembrar\s+de|preciso\s+(fazer|de))/i.test(t)) return "TASK";
  if (/(reuni[ãa]o|consulta|compromisso|encontro|evento|agendar|agenda)/.test(t)) return "MEETING";
  return "OTHER";
}

/** Mensagem pura (sem o que vem antes/depois da data/keyword). */
function extractMessage(text: string, dateStr?: string): string {
  let m = text;
  // tira verbos comuns
  m = m.replace(/^(anota|lembra|lembrar|agendar|agenda|me\s+lembra|por\s+favor|pfv|favor)\s*[:,-]?\s*/i, "");
  // tira datas comuns
  if (dateStr) m = m.replace(dateStr, "");
  m = m.replace(/\b(hoje|amanh[ãa])\b/gi, "");
  m = m.replace(/\b(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:\s*-\s*feira)?\b/gi, "");
  m = m.replace(/\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/g, "");
  m = m.replace(/\b(que\s+vem|pr[óo]xima?)\b/gi, "");
  m = m.replace(/^(de|para|sobre)\s+/i, "");
  m = m.replace(/\s+/g, " ").trim();
  return m.replace(/^[.,;:!\-]+|[.,;:!\-]+$/g, "") || "Lembrete";
}

export function detectIntents(text: string): DetectedIntent[] {
  const intents: DetectedIntent[] = [];
  const t = text.trim();
  if (!t) return intents;

  // ---- 1. CRIAR GASTO ----
  if (/\b(comprei|gastei|paguei)\b/i.test(t) && /\d/.test(t)) {
    const exp = parseExpense(t);
    if (exp) {
      intents.push({
        type: "create_expense",
        amount: exp.amount,
        description: exp.description,
        category: detectExpenseCategory(t),
        occurredAt: new Date(),
      });
    }
  }

  // ---- 2. CRIAR LEMBRETE ----
  // Padroes: "lembra X dia 16/10", "tenho reuniao sexta 16/10", "aniversario do Joao 20/10"
  const reminderKeywords = /\b(lembra|lembrar|anota|agenda|agendar|reuni[ãa]o|compromisso|tarefa|anivers[áa]rio)\b/i;
  if (reminderKeywords.test(t)) {
    const d = detectDate(t);
    if (d) {
      // confirma se nao e so uma consulta ("quais sao meus lembretes")
      if (!/quais?|lista|meus?|me\s+mostra/i.test(t)) {
        const dateStr = (t.match(/\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?/) || [])[0];
        intents.push({
          type: "create_reminder",
          when: d,
          message: extractMessage(t, dateStr),
          reminderType: parseReminderType(t),
        });
      }
    }
  }

  // ---- 3. CONSULTAR GASTOS ----
  if (/\b(quanto\s+(?:gastei|tenho\s+gasto|gastei|foi\s+gasto)|total\s+(?:de\s+)?gastos?|meu\s+gasto|gastos?\s+do\s+m[êe]s|gastos?\s+deste?\s*m[êe]s)/i.test(t)) {
    // Tenta achar range: "este mes", "hoje", "semana passada"
    let from = new Date();
    let to = new Date();
    if (/hoje/i.test(t)) {
      from = new Date(); from.setHours(0,0,0,0);
    } else if (/semana/i.test(t)) {
      const start = new Date(); start.setDate(start.getDate() - 7); from = start;
    } else {
      // default: mes atual
      from = new Date(); from.setDate(1); from.setHours(0,0,0,0);
    }
    to.setHours(23,59,59,999);
    intents.push({ type: "query_expenses", from, to });
  }

  // ---- 4. LISTAR LEMBRETES ----
  if (/\b(quais?|meus?|me\s+mostra|lista|ver)\s+(meus?\s+)?(lembretes?|compromissos?|anivers[áa]rios?|agenda|tarefas?)/i.test(t)) {
    const from = new Date(); from.setHours(0,0,0,0);
    const to = new Date(); to.setDate(to.getDate() + 30); to.setHours(23,59,59,999);
    intents.push({ type: "list_reminders", from, to });
  }

  return intents;
}
