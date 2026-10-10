import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, Installation, InstallationStatus, InstallationHistory, Plan, PLAN_LIMITS } from "../lib/api";
import { ArrowLeft, Save, X, Lock, Unlock, ExternalLink, Clock, CheckCircle2, XCircle, Archive, AlertTriangle, Zap, RefreshCw } from "lucide-react";

const STATUS_META: Record<InstallationStatus, { label: string; color: string; icon: any }> = {
  TRIAL: { label: "Em teste", color: "bg-amber-100 text-amber-800", icon: Clock },
  ACTIVE: { label: "Ativo", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  BLOCKED: { label: "Bloqueado", color: "bg-red-100 text-red-800", icon: XCircle },
  EXPIRED: { label: "Expirado", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
  ARCHIVED: { label: "Arquivado", color: "bg-gray-100 text-gray-700", icon: Archive },
};

const PLAN_META: Record<Plan, { label: string; color: string }> = {
  FREE:       { label: "Free (15 msgs/mês)",       color: "bg-slate-100 text-slate-700" },
  BASIC:      { label: "Basic (100 msgs/mês)",     color: "bg-blue-100 text-blue-800" },
  PRO:        { label: "Pro (200 msgs/mês)",       color: "bg-violet-100 text-violet-800" },
  ULTRA:      { label: "Ultra (300 msgs/mês)",     color: "bg-amber-100 text-amber-800" },
  ENTERPRISE: { label: "Enterprise (ilimitado)",   color: "bg-emerald-100 text-emerald-800" },
};

export default function InstallationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [installation, setInstallation] = useState<(Installation & { history: InstallationHistory[] }) | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Installation>>({});

  function load() {
    if (!id) return;
    api
      .getInstallation(id)
      .then((d) => {
        setInstallation(d.installation);
        setForm(d.installation);
      })
      .catch((e) => setError(e.message));
  }

  async function loadAsync(): Promise<void> {
    if (!id) return;
    try {
      const d = await api.getInstallation(id);
      setInstallation(d.installation);
      setForm(d.installation);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(load, [id]);

  if (error) return <div className="p-4 md:p-8 text-red-700">{error}</div>;
  if (!installation) return <div className="p-4 md:p-8 text-gray-500">Carregando...</div>;

  const meta = STATUS_META[installation.status];
  const Icon = meta.icon;

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateInstallation(id, {
        productName: form.productName,
        clientName: form.clientName,
        companyName: form.companyName,
        appUrl: form.appUrl,
        dbIdentifier: form.dbIdentifier,
        status: form.status,
        trialStartAt: form.trialStartAt,
        trialEndsAt: form.trialEndsAt,
        notes: form.notes,
      });
      setEditing(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleBlock() {
    if (!installation) return;
    const reason = prompt("Motivo do bloqueio (opcional):");
    if (reason === null) return;
    try {
      await api.blockInstallation(installation.id, reason || undefined);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleUnblock() {
    if (!installation) return;
    const reason = prompt("Motivo do desbloqueio (opcional):");
    if (reason === null) return;
    try {
      await api.unblockInstallation(installation.id, reason || undefined);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleChangePlan(plan: Plan) {
    if (!installation) return;
    const period = 30;
    if (!confirm(`Mudar para ${plan} (${PLAN_LIMITS[plan]} msgs) por ${period} dias?\nO contador de uso será ZERADO.`)) return;
    try {
      setSaving(true);
      await api.changePlan(installation.id, plan, period);
      await loadAsync();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetUsage() {
    if (!installation) return;
    if (!confirm("Zerar contador de uso e estender período por mais 30 dias?")) return;
    try {
      await api.resetUsage(installation.id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link to="/installations" className="inline-flex items-center gap-1 text-sm text-kairos-600 hover:text-kairos-700 mb-4">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-1 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate">{installation.productName}</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${meta.color}`}>
              <Icon size={12} /> {meta.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 font-mono">{installation.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-secondary text-sm">Editar</button>
              {installation.status === "BLOCKED" ? (
                <button onClick={handleUnblock} className="btn btn-primary text-sm">
                  <Unlock size={14} /> Desbloquear
                </button>
              ) : (
                <button onClick={handleBlock} className="btn btn-danger text-sm">
                  <Lock size={14} /> Bloquear
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setEditing(false); setForm(installation); }} className="btn btn-secondary text-sm">
                <X size={14} /> Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary text-sm">
                <Save size={14} /> Salvar
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Dados principais */}
        <div className="lg:col-span-2 card p-4 md:p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Dados da instalação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRead label="Produto" value={installation.productName} />
            <FieldRead label="Cliente" value={installation.clientName} />
            <FieldRead label="Empresa" value={installation.companyName} />
            <FieldRead
              label="URL"
              value={
                <a href={installation.appUrl} target="_blank" rel="noreferrer" className="text-kairos-600 hover:underline inline-flex items-center gap-1 break-all">
                  {installation.appUrl} <ExternalLink size={12} />
                </a>
              }
            />
            <FieldRead label="Banco" value={installation.dbIdentifier || "—"} />
            <FieldRead label="Cadastrado em" value={new Date(installation.registeredAt).toLocaleDateString("pt-BR")} />
            {installation.trialStartAt && (
              <FieldRead label="Início do teste" value={new Date(installation.trialStartAt).toLocaleDateString("pt-BR")} />
            )}
            {installation.trialEndsAt && (
              <FieldRead label="Fim do teste" value={new Date(installation.trialEndsAt).toLocaleDateString("pt-BR")} />
            )}
          </div>

          {installation.notes && (
            <div className="mt-4">
              <label className="label">Observações</label>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-kairos-50 p-3 rounded-lg">
                {installation.notes}
              </p>
            </div>
          )}

          {/* Plano & Uso (Sprint v0.2.0) */}
          <div className="mt-6 border-t pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Zap size={16} /> Plano & Uso
              </h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${PLAN_META[installation.plan].color}`}>
                {installation.plan}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs text-gray-500">Mensagens usadas</p>
                <p className="text-2xl font-bold text-gray-800">
                  {installation.usageUsed}
                  <span className="text-sm text-gray-400"> / {installation.usageLimit === 999999 ? "∞" : installation.usageLimit}</span>
                </p>
                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      installation.usageUsed / Math.max(1, installation.usageLimit) > 0.8
                        ? "bg-red-500"
                        : installation.usageUsed / Math.max(1, installation.usageLimit) > 0.5
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, (installation.usageUsed / Math.max(1, installation.usageLimit)) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs text-gray-500">Tokens usados</p>
                <p className="text-2xl font-bold text-gray-800">
                  {installation.tokensUsed >= 1000 ? `${(installation.tokensUsed / 1000).toFixed(1)}k` : installation.tokensUsed}
                  <span className="text-sm text-gray-400"> / {installation.tokensLimit >= 999999 ? "∞" : installation.tokensLimit >= 1000 ? `${(installation.tokensLimit / 1000).toFixed(0)}k` : installation.tokensLimit}</span>
                </p>
                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      installation.tokensUsed / Math.max(1, installation.tokensLimit) > 0.8
                        ? "bg-red-500"
                        : installation.tokensUsed / Math.max(1, installation.tokensLimit) > 0.5
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, (installation.tokensUsed / Math.max(1, installation.tokensLimit)) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs text-gray-500">Renova em</p>
                <p className="text-sm font-semibold text-gray-800">
                  {installation.currentPeriodEnd
                    ? new Date(installation.currentPeriodEnd).toLocaleDateString("pt-BR")
                    : "—"}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">Reset automático do uso</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs text-gray-500">Plano atual</p>
                <p className="text-sm font-semibold text-gray-800">{PLAN_META[installation.plan].label}</p>
                <p className="text-[10px] text-gray-400 mt-1">R$ {installation.plan === "FREE" ? "0" : installation.plan === "BASIC" ? "29" : installation.plan === "PRO" ? "79" : installation.plan === "ULTRA" ? "199" : "499"}/mês sugerido</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 self-center mr-2">Mudar para:</span>
              {(["FREE", "BASIC", "PRO", "ULTRA", "ENTERPRISE"] as Plan[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleChangePlan(p)}
                  disabled={installation.plan === p}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    installation.plan === p
                      ? "bg-kairos-100 text-kairos-700 border-kairos-300 cursor-default"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={handleResetUsage}
                className="ml-auto px-2.5 py-1 text-xs rounded border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1"
                title="Zerar uso e renovar 30 dias"
              >
                <RefreshCw size={12} /> Zerar uso
              </button>
            </div>
          </div>
        </div>

        {/* Histórico */}
        <div className="card p-4 md:p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Histórico</h2>
          {installation.history.length === 0 ? (
            <p className="text-sm text-gray-500">Sem alterações ainda.</p>
          ) : (
            <div className="space-y-3">
              {installation.history.map((h) => {
                const fromM = h.fromStatus ? STATUS_META[h.fromStatus] : null;
                const toM = STATUS_META[h.toStatus];
                return (
                  <div key={h.id} className="text-sm border-l-2 border-kairos-300 pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {fromM && <span className={`px-1.5 py-0.5 rounded text-xs ${fromM.color}`}>{fromM.label}</span>}
                      {fromM && <span className="text-gray-400">→</span>}
                      <span className={`px-1.5 py-0.5 rounded text-xs ${toM.color}`}>{toM.label}</span>
                    </div>
                    {h.reason && <p className="text-gray-600 mt-1">{h.reason}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(h.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
            <h2 className="text-lg font-semibold mb-4">Editar instalação</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Produto</label>
                <input className="input" value={form.productName || ""} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
              </div>
              <div>
                <label className="label">Cliente</label>
                <input className="input" value={form.clientName || ""} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div>
                <label className="label">Empresa</label>
                <input className="input" value={form.companyName || ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>
              <div>
                <label className="label">URL</label>
                <input className="input" value={form.appUrl || ""} onChange={(e) => setForm({ ...form, appUrl: e.target.value })} />
              </div>
              <div>
                <label className="label">Banco</label>
                <input className="input" value={form.dbIdentifier || ""} onChange={(e) => setForm({ ...form, dbIdentifier: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as InstallationStatus })}
                >
                  <option value="TRIAL">Em teste</option>
                  <option value="ACTIVE">Ativo</option>
                  <option value="BLOCKED">Bloqueado</option>
                  <option value="EXPIRED">Expirado</option>
                  <option value="ARCHIVED">Arquivado</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Observações</label>
              <textarea
                className="input min-h-[100px]"
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6">
              <button onClick={() => { setEditing(false); setForm(installation); }} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRead({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="text-sm text-gray-800">{value || "—"}</div>
    </div>
  );
}