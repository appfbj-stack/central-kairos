import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Installation, InstallationStatus } from "../lib/api";
import { Plus, Search, CheckCircle2, XCircle, Clock, Archive, AlertTriangle } from "lucide-react";

const STATUS_META: Record<InstallationStatus, { label: string; color: string; icon: any }> = {
  TRIAL: { label: "Em teste", color: "bg-amber-100 text-amber-800", icon: Clock },
  ACTIVE: { label: "Ativo", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  BLOCKED: { label: "Bloqueado", color: "bg-red-100 text-red-800", icon: XCircle },
  EXPIRED: { label: "Expirado", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
  ARCHIVED: { label: "Arquivado", color: "bg-gray-100 text-gray-700", icon: Archive },
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
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Instalações</h1>
          <p className="text-sm text-gray-500 mt-1">{installations.length} cadastradas</p>
        </div>
        <Link to="/installations/new" className="btn btn-primary self-start sm:self-auto">
          <Plus size={16} /> Nova
        </Link>
      </div>

      <div className="card p-3 md:p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, produto, cliente, URL..."
            className="input pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input md:w-48"
        >
          <option value="">Todos os status</option>
          <option value="TRIAL">Em teste</option>
          <option value="ACTIVE">Ativo</option>
          <option value="BLOCKED">Bloqueado</option>
          <option value="EXPIRED">Expirado</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : installations.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Nenhuma instalação encontrada.{" "}
            <Link to="/installations/new" className="text-kairos-600 hover:underline">
              Cadastrar
            </Link>
            .
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {installations.map((i) => {
                const meta = STATUS_META[i.status];
                return (
                  <Link key={i.id} to={`/installations/${i.id}`} className="block p-4 hover:bg-kairos-50">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-semibold text-kairos-700">{i.id}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
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
                      className="text-xs text-kairos-600 mt-1 break-all hover:underline block"
                    >
                      {i.appUrl}
                    </a>
                  </Link>
                );
              })}
            </div>

            {/* Desktop: tabela */}
            <table className="hidden md:table w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-kairos-50">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {installations.map((i) => {
                  const meta = STATUS_META[i.status];
                  return (
                    <tr key={i.id} className="border-b border-gray-100 hover:bg-kairos-50/50">
                      <td className="px-4 py-3 font-mono text-sm font-medium">{i.id}</td>
                      <td className="px-4 py-3">{i.productName}</td>
                      <td className="px-4 py-3">{i.clientName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{i.companyName || "—"}</td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={i.appUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-kairos-600 hover:underline break-all"
                        >
                          {i.appUrl}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/installations/${i.id}`} className="text-sm text-kairos-600 hover:text-kairos-700">
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