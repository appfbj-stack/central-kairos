import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { api } from "./lib/api";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import InstallationList from "./components/InstallationList";
import InstallationForm from "./components/InstallationForm";
import InstallationDetail from "./components/InstallationDetail";
import {
  LogOut, LayoutDashboard, ListChecks, Plus, Menu, X, Sparkles, Bell, ChevronRight,
} from "lucide-react";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(api.isAuthed());
  const [user, setUser] = useState(api.getUser());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!authed) return;
    api
      .me()
      .then((d) => setUser(d.user as any))
      .catch(() => {
        api.logout();
        setAuthed(false);
        navigate("/login");
      });
  }, [authed]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={(u) => { setUser(u); setAuthed(true); navigate("/"); }} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen flex bg-kairos-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 w-64 bg-gradient-to-b from-kairos-800 to-kairos-900 text-white flex flex-col z-40 transform transition-transform duration-200 md:transform-none shadow-xl ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-kairos-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <span className="text-lg font-bold">K</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Central Kairos</h1>
              <p className="text-[10px] text-kairos-200 uppercase tracking-wider">Admin</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 hover:bg-kairos-700 rounded"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <SideLink to="/" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <SideLink to="/installations" icon={<ListChecks size={18} />} label="Instalações" />
          <SideLink to="/installations/new" icon={<Plus size={18} />} label="Nova instalação" />
        </nav>

        <div className="p-3 border-t border-kairos-700/50">
          <div className="px-3 py-2.5 mb-1 bg-kairos-900/50 rounded-lg">
            <div className="font-semibold text-sm text-white truncate">{user?.name}</div>
            <div className="text-xs text-kairos-200 truncate">{user?.email}</div>
          </div>
          <button
            onClick={async () => {
              await api.logout();
              setAuthed(false);
              navigate("/login");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-kairos-700 transition-colors"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="md:hidden sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-kairos-700 hover:bg-kairos-50 rounded"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="font-semibold text-gray-800 text-sm">Central Kairos</div>
        </div>

        <div className="fade-in">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/installations" element={<InstallationList />} />
            <Route path="/installations/new" element={<InstallationForm />} />
            <Route path="/installations/:id" element={<InstallationDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function SideLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const active = useLocation().pathname === to;
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-all ${
        active
          ? "bg-kairos-600 text-white shadow-sm"
          : "text-kairos-100 hover:bg-kairos-700/50 hover:text-white"
      }`}
    >
      <span className={active ? "text-white" : "text-kairos-300"}>{icon}</span>
      <span className="font-medium">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto" />}
    </Link>
  );
}
