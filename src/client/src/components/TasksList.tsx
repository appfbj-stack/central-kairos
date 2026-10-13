import { useEffect, useState } from "react";
import { api, AdminTask, TaskStatus } from "../lib/api";
import { ListChecks, Search, CheckCircle2, XCircle, Clock, Loader2, Ban, Inbox } from "lucide-react";

const STATUS_META: Record<TaskStatus, { label: string; color: string; icon: any }> = {
  PENDING:    { label: "Pendente",  color: "bg-gray-100 text-gray-700",     icon: Clock },
  SENT:       { label: "Enviada",   color: "bg-sky-100 text-sky-800",       icon: Loader2 },
  RUNNING:    { label: "Rodando",   color: "bg-amber-100 text-amber-800",   icon: Loader2 },
  DONE:       { label: "Concluida", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  ERROR:      { label: "Erro",      color: "bg-red-100 text-red-800",       icon: XCircle },
  CANCELLED:  { label: "Cancelada", color: "bg-gray-100 text-gray-600",     icon: Ban },
};

const KIND_META: Record<string, { color: string }> = {
  ping:       { color: "bg-slate-100 text-slate-700" },
  agent_chat: { color: "bg-violet-100 text-violet-800" },
  read_file:  { color: "bg-blue-100 text-blue-800" },
  list_dir:   { color: "bg-cyan-100 text-cyan-800" },
  exec_command: { color: "bg-red-100 text-red-800" },
  write_file: { color: "bg-orange-100 text-orange-800" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - +new Date(iso);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function TasksList() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [byKind, setByKind] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<string>("");

  function load() {
    setLoading(true);
    api.listAdminTasks({ status: statusFilter, kind: kindFilter })
      .then((d) => {
        setTasks(d.tasks);
        setByStatus(d.byStatus);
        setByKind(d.byKind);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [statusFilter, kindFilter]);

  const filtered = tasks.filter((t) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const owner = `${t.client.email} ${t.client.name}`.toLowerCase();
    if (owner.includes(s)) return true;
    if (t.id.toLowerCase().includes(s)) return true;
    if (t.kind.toLowerCase().includes(s)) return true;
    if (t.errorMsg?.toLowerCase().includes(s)) return true;
    return false;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tasks.length} tasks no historico recente
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-4">
        {(["PENDING", "SENT", "RUNNING", "DONE", "ERROR", "CANCELLED"] as TaskStatus[]).map((s) => {
          const m = STATUS_META[s];
          return (
            <div key={s} className="card p-3">
              <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1">{m.label}</div>
              <div className="text-xl font-bold text-gray-800">{byStatus[s] || 0}</div>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="card p-3 md:p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por id, kind, cliente, error..."
            className="input pl-10"
          />
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="input text-xs">
          <option value="">Todos kinds</option>
          {Object.keys(KIND_META).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input text-xs">
          <option value="">Todos status</option>
          {(["PENDING", "SENT", "RUNNING", "DONE", "ERROR", "CANCELLED"] as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block animate-pulse text-gray-500">Carregando...</div></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-700 font-medium">Nenhuma task encontrada</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-kairos-50/50">
                <th className="px-3 py-3 font-semibold">Kind</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Cliente</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Device</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Tokens</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Tempo</th>
                <th className="px-3 py-3 font-semibold">Idade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const s = STATUS_META[t.status];
                const k = KIND_META[t.kind] ?? { color: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-kairos-50/40">
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-mono ${k.color}`}>
                        {t.kind}
                      </span>
                      {t.errorMsg && (
                        <div className="text-[10px] text-red-600 mt-1 truncate max-w-xs" title={t.errorMsg}>
                          {t.errorMsg}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${s.color}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="text-sm text-gray-700">{t.client.name}</div>
                      <div className="text-[10px] text-gray-500">{t.client.email}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-600">
                      {t.device ? `${t.device.kind} · ${t.device.name || t.device.id.slice(0, 8)}` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-700">
                      in:{t.tokensIn ?? 0} / out:{t.tokensOut ?? 0}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-600">
                      {t.startedAt && t.completedAt
                        ? `${Math.round((+new Date(t.completedAt) - +new Date(t.startedAt)) / 100) / 10}s`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">
                      {timeAgo(t.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
