import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Installation, InstallationStatus, Plan } from "../lib/api";
import { Plus, Search, CheckCircle2, XCircle, Clock, Archive, AlertTriangle, Inbox, ExternalLink } from "lucide-react";

const STATUS_META: Record<InstallationStatus, { label: string; color: string; icon: any }> = {
  TRIAL: { label: "Em teste", color: "bg-amber-100 text-amber-800", icon: Clock },
  ACTIVE: { label: "Ativo", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  BLOCKED: { label: "Bloqueado", color: "bg-red-100 text-red-800", icon: XCircle },
  EXPIRED: { label: "Expirado", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
  ARCHIVED: { label: "Arquivado", color: "bg-gray-100 text-gray-700", icon: Archive },
};

const PLAN_META: Record<Plan, { label: string; color: string }> = {
  FREE:       { label: "Free",       color: "bg-slate-100 text-slate-700" },
  BASIC:      { label: "Basic",      color: "bg-blue-100 text-blue-800" },
  PRO:        { label: "Pro",        color: "bg-violet-100 text-violet-800" },
  ULTRA:      { label: "Ultra",      color: "bg-amber-100 text-amber-800" },
  ENTERPRISE: { label: "Enterprise", color: "bg-emerald-100 text-emerald-800" },
};

export default function InstallationList() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  function load() {
    setLoading(true);
    api
      .listInstallations({ search, status: statusFilter })
      .then((d) => setInstallations(d.installations))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [search, statusFilter]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">Instalações</h1>
          <p className="text-sm text-gray-500 mt-1">
            {installations.length} {installations.length === 1 ? "cadastrada" : "cadastradas"}
          </p>
        </div>
        <Link to="/installations/new" className="btn btn-primary self-start sm:self-auto shadow-lg shadow-kairos-600/20">
          <Plus size={16} /> Nova instalação
        </Link>
      </div>

      {/* Filtros */}
      <div className="card p-3 md:p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, produto, cliente, URL..."
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[
            { v: "", label: "Todos" },
            { v: "TRIAL", label: "Em teste" },
            { v: "ACTIVE", label: "Ativo" },
            { v: "BLOCKED", label: "Bloqueado" },
            { v: "EXPIRED", label: "Expirado" },
            { v: "ARCHIVED", label: "Arquivado" },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setStatusFilter(opt.v)}
              className={`px-3 py-2 text-xs rounded-md whitespace-nowrap transition-colors ${
                statusFilter === opt.v
                  ? "bg-kairos-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-pulse text-gray-500">Carregando...</div>
          </div>
        ) : installations.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-700 font-medium mb-1">
              {search || statusFilter ? "Nenhuma instalação encontrada" : "Nenhuma instalação cadastrada"}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {search || statusFilter ? "Tente outros filtros" : "Comece cadastrando a primeira"}
            </p>
            {!search && !statusFilter && (
              <Link to="/installations/new" className="btn btn-primary inline-flex">
                <Plus size={16} /> Cadastrar
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {installations.map((i) => {
                const meta = STATUS_META[i.status];
                const plan = PLAN_META[i.plan];
                return (
                  <Link key={i.id} to={`/installations/${i.id}`} className="block p-4 hover:bg-kairos-50">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-semibold text-kairos-700">{i.id}</span>
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full font-medium ${plan.color}`}>
                          {plan.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    <div className="font-medium text-sm text-gray-800">{i.productName}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{i.clientName}</div>
                    {i.companyName && (
                      <div className="text-xs text-gray-500">{i.companyName}</div>
                    )}
                    <a
                      href={i.appUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-kairos-600 mt-1 break-all hover:underline inline-flex items-center gap-1"
                    >
                      {i.appUrl} <ExternalLink size={10} />
                    </a>
                  </Link>
                );
              })}
            </div>

            {/* Desktop: tabela */}
            <table className="hidden md:table w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-kairos-50/50">
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">URL</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {installations.map((i) => {
                  const meta = STATUS_META[i.status];
                  const plan = PLAN_META[i.plan];
                  return (
                    <tr key={i.id} className="border-b border-gray-100 hover:bg-kairos-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-kairos-700">{i.id}</td>
                      <td className="px-4 py-3 font-medium">{i.productName}</td>
                      <td className="px-4 py-3 text-sm">
                        <div>{i.clientName}</div>
                        {i.companyName && <div className="text-xs text-gray-500">{i.companyName}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={i.appUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-kairos-600 hover:underline break-all inline-flex items-center gap-1"
                        >
                          <span className="truncate max-w-xs">{i.appUrl.replace(/^https?:\/\//, "")}</span>
                          <ExternalLink size={10} />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ${plan.color}`}>
                          {plan.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/installations/${i.id}`} className="text-sm text-kairos-600 hover:text-kairos-700 font-medium">
                          Detalhes →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
