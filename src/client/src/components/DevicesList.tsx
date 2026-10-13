import { useEffect, useState } from "react";
import { api, AdminDevice, DeviceStatus, DeviceKind } from "../lib/api";
import { Smartphone, Search, CheckCircle2, XCircle, Clock, Inbox, ShieldOff, Cpu } from "lucide-react";

const STATUS_META: Record<DeviceStatus, { label: string; color: string; icon: any }> = {
  PENDING: { label: "Aguardando pareamento", color: "bg-amber-100 text-amber-800", icon: Clock },
  ACTIVE:  { label: "Ativo", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  REVOKED: { label: "Revogado", color: "bg-red-100 text-red-800", icon: XCircle },
};

const KIND_META: Record<DeviceKind, { label: string; color: string; icon: any }> = {
  PWA:      { label: "PWA", color: "bg-violet-100 text-violet-800", icon: Smartphone },
  ELECTRON: { label: "Electron", color: "bg-sky-100 text-sky-800", icon: Cpu },
};

export default function DevicesList() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [byKind, setByKind] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<string>("");

  function load() {
    setLoading(true);
    api.listAdminDevices({ status: statusFilter, kind: kindFilter })
      .then((d) => {
        setDevices(d.devices);
        setByStatus(d.byStatus);
        setByKind(d.byKind);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [statusFilter, kindFilter]);

  const filtered = devices.filter((d) => {
    if (search) {
      const s = search.toLowerCase();
      const owner = `${d.client.email} ${d.client.name}`.toLowerCase();
      const dev = `${d.name || ""} ${d.os || ""} ${d.hardware || ""} ${d.id}`.toLowerCase();
      if (!owner.includes(s) && !dev.includes(s)) return false;
    }
    return true;
  });

  async function revoke(d: AdminDevice) {
    if (!confirm(`Revogar device ${d.name || d.id.slice(0, 8)}?`)) return;
    await api.revokeAdminDevice(d.id);
    load();
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">Devices</h1>
          <p className="text-sm text-gray-500 mt-1">
            {devices.length} devices cadastrados
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="card p-4">
          <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1">Total</div>
          <div className="text-2xl font-bold text-gray-800">{byStatus["PENDING"] + byStatus["ACTIVE"] + byStatus["REVOKED"] || devices.length}</div>
        </div>
        {(["PENDING", "ACTIVE", "REVOKED"] as DeviceStatus[]).map((s) => {
          const m = STATUS_META[s];
          return (
            <div key={s} className="card p-4">
              <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-bold text-gray-800">{byStatus[s] || 0}</div>
            </div>
          );
        })}
        <div className="card p-4">
          <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1">PWA / Electron</div>
          <div className="text-2xl font-bold text-gray-800">
            {byKind["PWA"] || 0} / {byKind["ELECTRON"] || 0}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 md:p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, OS, dono, id..."
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="input text-xs"
          >
            <option value="">Todos tipos</option>
            <option value="PWA">PWA</option>
            <option value="ELECTRON">Electron</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input text-xs"
          >
            <option value="">Todos status</option>
            <option value="PENDING">Pendente</option>
            <option value="ACTIVE">Ativo</option>
            <option value="REVOKED">Revogado</option>
          </select>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block animate-pulse text-gray-500">Carregando...</div></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-700 font-medium">Nenhum device encontrado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-kairos-50/50">
                <th className="px-3 py-3 font-semibold">Device</th>
                <th className="px-3 py-3 font-semibold">Tipo</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Dono</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Visto por ultimo</th>
                <th className="px-3 py-3 font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const s = STATUS_META[d.status];
                const k = KIND_META[d.kind as DeviceKind] ?? { label: d.kind, color: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-kairos-50/40">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{d.name || "(sem nome)"}</div>
                      <div className="text-[10px] font-mono text-gray-400">{d.id.slice(0, 12)}...</div>
                      {d.hardware && <div className="text-[10px] text-gray-500 mt-0.5 truncate max-w-xs">{d.hardware}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${k.color}`}>
                        {k.label}
                      </span>
                      {d.os && <div className="text-[10px] text-gray-500 mt-0.5">{d.os}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${s.color}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="text-sm text-gray-700">{d.client.name}</div>
                      <div className="text-[10px] text-gray-500">{d.client.email}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-600">
                      {d.lastSeenAt ? (
                        <div>
                          {new Date(d.lastSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      ) : (
                        <span className="text-gray-400">nunca</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {d.status !== "REVOKED" && (
                        <button
                          onClick={() => revoke(d)}
                          title="Revogar"
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        >
                          <ShieldOff size={14} />
                        </button>
                      )}
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
