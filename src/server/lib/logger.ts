// Logger simples sem dep externa.
// Formato: [ts] LEVEL [modulo] msg {key: val}
// Nivel controlado por env LOG_LEVEL (default: info).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const currentLevel: number = LEVELS[(process.env.LOG_LEVEL as Level) || "info"] ?? 20;

function ts(): string {
  return new Date().toISOString();
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel) return;
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  const line = `${ts()} ${level.toUpperCase()} ${msg}${metaStr}`;
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
