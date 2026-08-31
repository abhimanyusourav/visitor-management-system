import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  UserPlus,
  ShieldCheck,
  Building2,
  Briefcase,
  FileText,
  History,
  Settings,
  QrCode,
  AlertTriangle,
  LogOut,
  ChevronRight,
  Shield,
  Factory
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { user, activeSite, hasPermission, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { to: '/gate-scan', label: 'Gate QR Scanner', icon: QrCode, show: hasPermission('pass:verify') },
    { to: '/visits/currently-inside', label: 'Currently Inside', icon: ShieldCheck, show: hasPermission('inside:view'), badge: 'Live' },
    { to: '/visits/new', label: 'Walk-In Register', icon: UserPlus, show: hasPermission('visitor:create') },
    { to: '/visits/pre-register', label: 'Pre-Register Expected', icon: UserCheck, show: true },
    { to: '/visits', label: 'All Visits Log', icon: History, show: true },
    { to: '/visitors', label: 'Visitors Directory', icon: Users, show: true },
    { to: '/approvals', label: 'Host Approvals', icon: AlertTriangle, show: hasPermission('visit:approve') },
    { to: '/directory/employees', label: 'Employee Directory', icon: Briefcase, show: hasPermission('employee:manage') },
    { to: '/directory/departments', label: 'Departments', icon: Building2, show: hasPermission('employee:manage') },
    { to: '/users', label: 'User Administration', icon: Shield, show: hasPermission('user:manage') },
    { to: '/reports', label: 'Visitor Reports', icon: FileText, show: hasPermission('report:view') },
    { to: '/audit-logs', label: 'Audit Trail', icon: History, show: hasPermission('audit:view') },
    { to: '/settings', label: 'Site & Pass Settings', icon: Settings, show: hasPermission('settings:manage') },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white tracking-wide text-sm flex items-center gap-1.5">
                AKRITI VMS
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  PRO
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[130px]" title={activeSite?.name}>
                {activeSite?.name || 'Akriti JewelCraftz'}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Operations & Gate
          </div>

          {navItems.filter(item => item.show).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center space-x-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-sky-700/60 border border-sky-500/30 flex items-center justify-center font-bold text-xs text-sky-200 uppercase">
                {user?.firstName?.[0] || 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-[10px] text-sky-400 font-medium truncate">
                  {user?.roleName || user?.role}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
