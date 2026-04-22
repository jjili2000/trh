import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  Calendar,
  Receipt,
  Settings,
  LogOut,
  User,
  ChevronRight,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

function TennisBallSmall() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill="#d4e157" stroke="#c6c900" strokeWidth="2" />
      <path d="M 10 22 Q 32 32 10 42" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 54 22 Q 32 32 54 42" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  user: 'Utilisateur',
};

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-600',
};

export default function AppLayout() {
  const { currentUser, logout, appSettings } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-tennis-green text-white'
        : 'text-gray-300 hover:bg-white/10 hover:text-white'
    }`;

  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / Branding */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <TennisBallSmall />
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">{appSettings.clubName}</h1>
            <p className="text-tennis-green-light text-xs">Gestion RH</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/dashboard" className={navLinkClass} end onClick={closeSidebar}>
          <LayoutDashboard size={18} />
          Tableau de bord
        </NavLink>

        <NavLink to="/time" className={navLinkClass} onClick={closeSidebar}>
          <Clock size={18} />
          Gestion du temps
        </NavLink>

        <NavLink to="/absences" className={navLinkClass} onClick={closeSidebar}>
          <Calendar size={18} />
          Absences
        </NavLink>

        <NavLink to="/expenses" className={navLinkClass} onClick={closeSidebar}>
          <Receipt size={18} />
          Notes de frais
        </NavLink>

        {isAdminOrManager ? (
          <NavLink to="/documents" className={navLinkClass} onClick={closeSidebar}>
            <FileText size={18} />
            Documents
          </NavLink>
        ) : (
          <NavLink to="/my-documents" className={navLinkClass} onClick={closeSidebar}>
            <FileText size={18} />
            Mes documents
          </NavLink>
        )}

        {isAdminOrManager && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-4 text-xs font-semibold text-tennis-green-light uppercase tracking-wider">
                Administration
              </p>
            </div>
            <NavLink to="/admin" className={navLinkClass} onClick={closeSidebar}>
              <Settings size={18} />
              Paramètres
              <ChevronRight size={14} className="ml-auto" />
            </NavLink>
          </>
        )}
      </nav>

      {/* User Info + Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 mb-2">
          <div className="w-8 h-8 rounded-full bg-tennis-green flex items-center justify-center flex-shrink-0">
            <User size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">
              {currentUser?.firstName} {currentUser?.lastName}
            </p>
            <span
              className={`inline-block text-xs px-1.5 py-0.5 rounded-full mt-0.5 ${
                roleBadgeColors[currentUser?.role ?? 'user']
              }`}
            >
              {roleLabels[currentUser?.role ?? 'user']}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ── Sidebar desktop (toujours visible ≥ md) ── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-tennis-green-dark flex-col">
        <SidebarContent />
      </aside>

      {/* ── Overlay mobile ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar mobile (slide-in) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-tennis-green-dark flex flex-col transform transition-transform duration-200 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Bouton fermeture */}
        <button
          onClick={closeSidebar}
          className="absolute top-4 right-4 text-white/60 hover:text-white"
        >
          <X size={20} />
        </button>
        <SidebarContent />
      </aside>

      {/* ── Zone principale ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Barre supérieure mobile */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-tennis-green-dark shadow-md flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <TennisBallSmall />
            <span className="text-white font-bold text-sm">{appSettings.clubName}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
