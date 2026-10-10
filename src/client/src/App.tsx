import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { api } from "./lib/api";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import InstallationList from "./components/InstallationList";
import InstallationForm from "./components/InstallationForm";
import InstallationDetail from "./components/InstallationDetail";
import { LogOut, Settings, LayoutDashboard, ListChecks, Menu, X } from "lucide-react";

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

  // Fecha sidebar ao navegar (mobile)
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
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 w-64 bg-kairos-700 text-white flex flex-col z-40 transform transition-transform md:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-kairos-600 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Central Kairos</h1>
            <p className="text-xs text-kairos-100 mt-1">Painel de Instalações</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 hover:bg-kairos-600 rounded"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <SideLink to="/" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <SideLink to="/installations" icon={<ListChecks size={18} />} label="Instalações" />
          <SideLink to="/installations/new" icon={<Settings size={18} />} label="Nova instalação" />
        </nav>
        <div className="p-3 border-t border-kairos-600">
          <div className="px-3 py-2 text-sm text-kairos-100">
            <div className="font-medium text-white truncate">{user?.name}</div>
            <div className="text-xs truncate">{user?.email}</div>
          </div>
          <button
            onClick={async () => {
              await api.logout();
              setAuthed(false);
              navigate("/login");
            }}
            className="mt-1 w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-kairos-600"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-kairos-700 hover:bg-kairos-50 rounded"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="font-semibold text-gray-800 text-sm">Central Kairos</div>
        </div>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/installations" element={<InstallationList />} />
          <Route path="/installations/new" element={<InstallationForm />} />
          <Route path="/installations/:id" element={<InstallationDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function SideLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const active = useLocation().pathname === to;
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
        active ? "bg-kairos-600 text-white" : "text-kairos-100 hover:bg-kairos-600"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}