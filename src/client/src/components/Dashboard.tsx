import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Installation, InstallationStatus } from "../lib/api";
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, Archive,
  Plus, Sparkles, Users, TrendingUp, Zap, Smartphone, ListTodo, ArrowRight,
} from "lucide-react";

const STATUS_META: Record<InstallationStatus, { label: string; color: string; bg: string; icon: any }> = {
  TRIAL:     { label: "Em teste",     color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",   icon: Clock },
  ACTIVE:    { label: "Ativo",        color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  BLOCKED:   { label: "Bloqueado",    color: "text-red-700",     bg: "bg-red-50 border-red-200",       icon: XCircle },
  EXPIRED:   { label: "Expirado",     color: "text-orange-700",  bg: "bg-orange-50 border-orange-200",   icon: AlertTriangle },
  ARCHIVED:  { label: "Arquivado",    color: "text-gray-600",    bg: "bg-gray-50 border-gray-200",      icon: Archive },
};

const STATUS_STYLE: Record<InstallationStatus, string> = {
  TRIAL: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  BLOCKED: "bg-red-100 text-red-800",
  EXPIRED: "bg-orange-100 text-orange-800",
  ARCHIVED: "bg-gray-100 text-gray-700",
};

export default function Dashboard() {
  const [items, setItems] = useState<Installation[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [pwaStats, setPwaStats] = useState<{ clients: number; devices: number; tasks: number; tokens: number }>({ clients: 0, devices: 0, tasks: 0, tokens: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listInstallations()
      .then((c) => { setItems(c.installations); setByStatus(c.byStatus); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Carrega stats PWA em paralelo (silencioso se falhar)
    Promise.allSettled([
      api.listAdminClients(),
      api.listAdminDevices(),
      api.listAdminTasks(),
    ]).then((results) => {
      const [c, d, t] = results;
      setPwaStats({
        clients: c.status === "fulfilled" ? c.value.total : 0,
        tokens: c.status === "fulfilled" ? c.value.totalTokensUsed : 0,
        devices: d.status === "fulfilled" ? d.value.total : 0,
        tasks: t.status === "fulfilled" ? t.value.total : 0,
      });
    });
  }, []);

  const recent = [...items].sort((a, b) => +new Date(b.registeredAt) - +new Date(a.registeredAt)).slice(0, 5);

  // Stats
  const total = items.length;
  const active = byStatus["ACTIVE"] || 0;
  const trial = byStatus["TRIAL"] || 0;
  const totalTokens = items.reduce((acc, i) => acc + (i.tokensUsed || 0), 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral das instalações cadastradas</p>
        </div>
        <Link to="/installations/new" className="btn btn-primary self-start md:self-auto shadow-lg shadow-kairos-600/20">
          <Plus size={16} /> Nova instalação
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard icon={Users} color="from-blue-500 to-blue-600" label="Total" value={total} subLabel="instalações" />
        <StatCard icon={CheckCircle2} color="from-emerald-500 to-emerald-600" label="Ativas" value={active} subLabel="em produção" />
        <StatCard icon={Clock} color="from-amber-500 to-amber-600" label="Em teste" value={trial} subLabel="trial ativo" />
        <StatCard icon={Zap} color="from-violet-500 to-violet-600" label="Tokens" value={Math.round(totalTokens / 1000)} subLabel="mil no mês" />
      </div>

      {/* PWA SaaS stats */}
      <div className="card p-4 md:p-5 mb-6 md:mb-8 bg-gradient-to-br from-kairos-50 to-white border-kairos-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm md:text-base flex items-center gap-2">
              <Sparkles size={16} className="text-kairos-600" />
              PWA SaaS (Sprint 1.20)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Contas PWA + devices Electron pareados</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PwaStatCard icon={Users} label="Clients" value={pwaStats.clients} to="/pwa/clients" />
          <PwaStatCard icon={Smartphone} label="Devices" value={pwaStats.devices} to="/pwa/devices" />
          <PwaStatCard icon={ListTodo} label="Tasks" value={pwaStats.tasks} to="/pwa/tasks" />
          <PwaStatCard icon={Zap} label="Tokens PWA" value={Math.round(pwaStats.tokens / 1000)} sub="mil" to="/pwa/clients" />
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
        {(["TRIAL", "ACTIVE", "BLOCKED", "EXPIRED", "ARCHIVED"] as InstallationStatus[]).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <div key={s} className={`card p-4 md:p-5 border ${meta.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className={meta.color} />
                <span className={`text-[10px] md:text-xs uppercase tracking-wide font-semibold ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
              <div className="text-2xl md:text-3xl font-bold text-gray-800">
                {byStatus[s] || 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recentes */}
      <div className="card">
        <div className="px-4 md:px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm md:text-base flex items-center gap-2">
              <TrendingUp size={16} className="text-kairos-600" />
              Últimas instalações
            </h2>
          </div>
          <Link to="/installations" className="text-xs md:text-sm text-kairos-600 hover:text-kairos-700 font-medium">
            Ver todas →
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="inline-block animate-pulse">Carregando...</div>
          </div>
        ) : recent.length === 0 ? (
          <div className="p-12 text-center">
            <Sparkles size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">Nenhuma instalação cadastrada ainda.</p>
            <Link to="/installations/new" className="text-kairos-600 hover:underline text-sm mt-2 inline-block">
              Cadastrar a primeira →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.map((c) => {
              const m = STATUS_META[c.status];
              return (
                <li key={c.id}>
                  <Link
                    to={`/installations/${c.id}`}
                    className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 hover:bg-kairos-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-semibold text-kairos-700">{c.id}</span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full ${STATUS_STYLE[c.status]}`}>
                          {m.label}
                        </span>
                      </div>
                      <div className="font-medium text-sm text-gray-800 truncate">{c.productName}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {c.clientName} · {c.appUrl.replace(/^https?:\/\//, "")}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] text-gray-400">
                        {new Date(c.registeredAt).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value, subLabel }: { icon: any; color: string; label: string; value: number; subLabel: string }) {
  return (
    <div className="card p-4 md:p-5 relative overflow-hidden">
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${color} opacity-10`} />
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${color} text-white mb-3 shadow-sm`}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{value}</p>
      <p className="text-[10px] text-gray-400 mt-1">{subLabel}</p>
    </div>
  );
}

function PwaStatCard({ icon: Icon, label, value, sub, to }: { icon: any; label: string; value: number; sub?: string; to: string }) {
  return (
    <Link to={to} className="block p-3 bg-white rounded-lg border border-kairos-100 hover:border-kairos-300 hover:shadow-sm transition-all group">
      <div className="flex items-center justify-between mb-1.5">
        <div className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-kairos-100 text-kairos-700">
          <Icon size={14} />
        </div>
        <ArrowRight size={12} className="text-gray-300 group-hover:text-kairos-600 group-hover:translate-x-0.5 transition-all" />
      </div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-xl font-bold text-gray-800 mt-0.5">
        {value}
        {sub && <span className="text-xs text-gray-400 ml-1 font-normal">{sub}</span>}
      </p>
    </Link>
  );
}
