import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

export default function InstallationForm() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    productName: "",
    clientName: "",
    companyName: "",
    appUrl: "",
    dbIdentifier: "",
    status: "TRIAL" as const,
    trialStartAt: new Date().toISOString().slice(0, 10),
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: "",
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        productName: form.productName,
        clientName: form.clientName,
        companyName: form.companyName || undefined,
        appUrl: form.appUrl,
        dbIdentifier: form.dbIdentifier || undefined,
        status: form.status,
        notes: form.notes || undefined,
      };
      if (form.trialStartAt) payload.trialStartAt = new Date(form.trialStartAt).toISOString();
      if (form.trialEndsAt) payload.trialEndsAt = new Date(form.trialEndsAt).toISOString();
      const res = await api.createInstallation(payload);
      navigate(`/installations/${res.installation.id}`);
    } catch (err: any) {
      setError(err.message || "Erro ao criar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link to="/installations" className="inline-flex items-center gap-1 text-sm text-kairos-600 hover:text-kairos-700 mb-4">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-1">Nova instalação</h1>
      <p className="text-sm text-gray-500 mb-4 md:mb-6">
        O ID será gerado automaticamente (APP-0001, APP-0002, ...) e não pode ser alterado depois.
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Produto / Aplicativo *</label>
            <input
              required
              value={form.productName}
              onChange={(e) => setField("productName", e.target.value)}
              className="input"
              placeholder="Ex: Kairos Igreja"
            />
          </div>
          <div>
            <label className="label">Nome do cliente *</label>
            <input
              required
              value={form.clientName}
              onChange={(e) => setField("clientName", e.target.value)}
              className="input"
              placeholder="Ex: Igreja OBPC"
            />
          </div>
          <div>
            <label className="label">Nome da empresa</label>
            <input
              value={form.companyName}
              onChange={(e) => setField("companyName", e.target.value)}
              className="input"
              placeholder="Ex: OBPC Sede Sorocaba"
            />
          </div>
          <div>
            <label className="label">URL do aplicativo *</label>
            <input
              required
              type="url"
              value={form.appUrl}
              onChange={(e) => setField("appUrl", e.target.value)}
              className="input"
              placeholder="https://exemplo.com"
            />
          </div>
          <div>
            <label className="label">Identificação do banco</label>
            <input
              value={form.dbIdentifier}
              onChange={(e) => setField("dbIdentifier", e.target.value)}
              className="input"
              placeholder="ex: kairos_igreja_db_v2"
            />
          </div>
          <div>
            <label className="label">Status inicial</label>
            <select
              value={form.status}
              onChange={(e) => setField("status", e.target.value as any)}
              className="input"
            >
              <option value="TRIAL">Em teste</option>
              <option value="ACTIVE">Ativo</option>
              <option value="BLOCKED">Bloqueado</option>
            </select>
          </div>
          <div>
            <label className="label">Início do teste</label>
            <input
              type="date"
              value={form.trialStartAt}
              onChange={(e) => setField("trialStartAt", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Fim do teste</label>
            <input
              type="date"
              value={form.trialEndsAt}
              onChange={(e) => setField("trialEndsAt", e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Observações</label>
          <textarea
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="input min-h-[100px]"
            placeholder="Notas internas sobre esta instalação..."
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t border-gray-200">
          <Link to="/installations" className="btn btn-secondary">Cancelar</Link>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Salvando..." : "Cadastrar"}
          </button>
        </div>
      </form>
    </div>
  );
}