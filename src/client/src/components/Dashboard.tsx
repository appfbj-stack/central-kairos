import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Installation } from "../lib/api";
import { CheckCircle2, AlertTriangle, XCircle, Clock, Archive, Plus } from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  TRIAL: { label: "Em teste", color: "bg-amber-100 text-amber-800", icon: Clock },
  ACTIVE: { label: "Ativo", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  BLOCKED: { label: "Bloqueado", color: "bg-red-100 text-red-800", icon: XCircle },
  EXPIRED: { label: "Expirado", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
  ARCHIVED: { label: "Arquivado", color: "bg-gray-100 text-gray-700", icon: Archive },
};

export default function Dashboard() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listInstallations()
      .then((d) => {
        setInstallations(d.installations);
        setByStatus(d.byStatus);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const recent = [...installations]
    .sort((a, b) => (b.registeredAt > a.registeredAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral das instalações cadastradas.</p>
        </div>
        <Link to="/installations/new" className="btn btn-primary self-start sm:self-auto">
          <Plus size={16} /> Nova instalação
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Stats: 2 colunas em mobile, 5 em md+ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
        {["TRIAL", "ACTIVE", "BLOCKED", "EXPIRED", "ARCHIVED"].map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <div key={s} className="card p-4 md:p-5">
              <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                <Icon size={14} className="text-gray-500 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">{meta.label}</span>
              </div>
              <div className="text-xl md:text-2xl font-bold text-gray-800">{byStatus[s] || 0}</div>
            </div>
          );
        })}
      </div>

      {/* Recent */}
      <div className="card">
        <div className="px-4 md:px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm md:text-base">Últimas instalações</h2>
          <Link to="/installations" className="text-xs md:text-sm text-kairos-600 hover:text-kairos-700">
            Ver todas →
          </Link>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma instalação cadastrada.{" "}
            <Link to="/installations/new" className="text-kairos-600 hover:underline">
              Cadastrar a primeira
            </Link>
            .
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {recent.map((i) => {
                const meta = STATUS_META[i.status];
                return (
                  <Link key={i.id} to={`/installations/${i.id}`} className="block p-4 hover:bg-kairos-50">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-semibold text-kairos-700">{i.id}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="font-medium text-sm text-gray-800 truncate">{i.productName}</div>
                    <div className="text-xs text-gray-500 truncate">{i.clientName} · {i.appUrl.replace(/^https?:\/\//, "")}</div>
                  </Link>
                );
              })}
            </div>

            {/* Desktop: tabela */}
            <table className="hidden md:table w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                  <th className="px-5 py-2">ID</th>
                  <th className="px-5 py-2">Produto</th>
                  <th className="px-5 py-2">Cliente</th>
                  <th className="px-5 py-2">URL</th>
                  <th className="px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((i) => {
                  const meta = STATUS_META[i.status];
                  return (
                    <tr key={i.id} className="border-b border-gray-100 hover:bg-kairos-50">
                      <td className="px-5 py-3 font-mono text-sm">{i.id}</td>
                      <td className="px-5 py-3">{i.productName}</td>
                      <td className="px-5 py-3">{i.clientName}</td>
                      <td className="px-5 py-3 text-sm text-kairos-600">
                        <a href={i.appUrl} target="_blank" rel="noreferrer" className="hover:underline break-all">
                          {i.appUrl}
                        </a>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
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