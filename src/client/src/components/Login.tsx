import { useState } from "react";
import { api } from "../lib/api";
import { Mail, Lock, Loader2, Sparkles, Shield } from "lucide-react";

function Login({ onLogin }: { onLogin: (u: { id: string; email: string; name: string }) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.login(email, password);
      onLogin(data.user);
    } catch (e: any) {
      setError(e.message || "Erro ao logar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kairos-700 via-kairos-800 to-kairos-900 p-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-kairos-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
      <div className="absolute -bottom-8 right-0 w-72 h-72 bg-emerald-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: "2s" }} />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm shadow-2xl mb-4">
            <span className="text-3xl font-bold text-white">K</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Central Kairos</h1>
          <p className="text-kairos-100 mt-2 text-sm">Painel de controle de instalações</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Entrar</h2>
          <p className="text-sm text-gray-500 mb-6">Acesso restrito ao administrador</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <Shield size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="voce@central.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full mt-6 justify-center shadow-lg shadow-kairos-600/20"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Entrando...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Entrar
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-6">
            Acesso restrito ao administrador central.
          </p>
        </form>
      </div>
    </div>
  );
}

export default Login;
