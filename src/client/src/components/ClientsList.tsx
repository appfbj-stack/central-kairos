import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AdminClient, ClientStatus } from "../lib/api";
import { Users, Search, CheckCircle2, XCircle, Clock, AlertTriangle, Inbox, ShieldOff, ShieldCheck, RotateCcw, Trash2 } from "lucide-react";

const STATUS_META: Record<ClientStatus, { label: string; color: string; icon: any }> = {
  TRIAL:   { label: "Trial",     color: "bg-amber-100 text-amber-800",   icon: Clock },
  ACTIVE:  { label: "Ativo",     color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  BLOCKED: { label: "Bloqueado", color: "bg-red-100 text-red-800",       icon: XCircle },
  EXPIRED: { label: "Expirado",  color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
};

export default function ClientsList() {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [totalTokens, setTotalTokens] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  function load() {
    setLoading(true);
    api.listAdminClients()
      .then((d) => {
        setClients(d.clients);
        setByStatus(d.byStatus);
        setTotalTokens(d.totalTokensUsed);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const filtered = clients.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!c.email.toLowerCase().includes(s) && !c.name.toLowerCase().includes(s) && !c.id.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  async function toggleBlock(c: AdminClient) {
    if (c.status === "BLOCKED") {
      if (!confirm(`Desbloquear ${c.email}?`)) return;
      await api.unblockAdminClient(c.id);
    } else {
      const reason = prompt(`Motivo do bloqueio (opcional):`) || undefined;
      await api.blockAdminClient(c.id, reason);
    }
    load();
  }
  async function resetTokens(c: AdminClient) {
    if (!confirm(`Zerar tokensUsed de ${c.email}?`)) return;
    await api.resetAdminClientTokens(c.id);
    load();
  }
  async function removeClient(c: AdminClient) {
    if (!confirm(`REMOVER ${c.email}? Isso apaga devices/sessions/tasks/conversations. Irreversivel.`)) return;
    await api.deleteAdminClient(c.id);
    load();
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">Clients PWA</h1>
          <p className="text-sm text-gray-500 mt-1">
            {clients.length} {clients.length === 1 ? "conta" : "contas"} · {totalTokens.toLocaleString("pt-BR")} tokens consumidos
          </p>
        </div>
      </div>

      {/* Stats por status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
        {(["TRIAL", "ACTIVE", "BLOCKED", "EXPIRED"] as ClientStatus[]).map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          return (
            <div key={s} className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="text-gray-500" />
                <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">{m.label}</span>
              </div>
              <div className="text-2xl font-bold text-gray-800">{byStatus[s] || 0}</div>
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
            placeholder="Buscar por id, email ou nome..."
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[
            { v: "", label: "Todos" },
            { v: "TRIAL", label: "Trial" },
            { v: "ACTIVE", label: "Ativo" },
            { v: "BLOCKED", label: "Bloqueado" },
            { v: "EXPIRED", label: "Expirado" },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setStatusFilter(opt.v)}
              className={`px-3 py-2 text-xs rounded-md whitespace-nowrap transition-colors ${
                statusFilter === opt.v ? "bg-kairos-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block animate-pulse text-gray-500">Carregando...</div></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-700 font-medium mb-1">Nenhum client</p>
            <p className="text-sm text-gray-500">Crie uma conta na PWA para aparecer aqui.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-kairos-50/50">
                <th className="px-3 py-3 font-semibold">Email</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Trial expira</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Tokens</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Devices</th>
                <th className="px-3 py-3 font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const m = STATUS_META[c.status];
                const pct = c.tokensLimit > 0 ? Math.min(100, Math.round((c.tokensUsed / c.tokensLimit) * 100)) : 0;
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-kairos-50/40">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.email}</div>
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">{c.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${m.color}`}>
                        {m.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-600">
                      {c.trialEndsAt ? new Date(c.trialEndsAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="text-xs text-gray-700">
                        {c.tokensUsed.toLocaleString("pt-BR")} / {c.tokensLimit.toLocaleString("pt-BR")}
                      </div>
                      <div className="w-24 h-1.5 mt-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}
                          style={{ width: `${pct}%`, height: "100%" }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-700">
                      {c._count.devices} dev · {c._count.conversations} conv
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleBlock(c)}
                          title={c.status === "BLOCKED" ? "Desbloquear" : "Bloquear"}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                        >
                          {c.status === "BLOCKED" ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                        </button>
                        <button
                          onClick={() => resetTokens(c)}
                          title="Resetar tokens"
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={() => removeClient(c)}
                          title="Remover (irreversivel)"
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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
