import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  QrCode,
  ShieldCheck,
  UserPlus,
  History
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';

export const MobileNav: React.FC = () => {
  const { hasPermission } = useAuthStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800 lg:hidden px-2 py-1.5 flex items-center justify-around text-slate-400">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${
            isActive ? 'text-sky-400 font-bold' : 'hover:text-slate-200'
          }`
        }
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span>Dashboard</span>
      </NavLink>

      {hasPermission('pass:verify') && (
        <NavLink
          to="/gate-scan"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${
              isActive ? 'text-sky-400 font-bold' : 'hover:text-slate-200'
            }`
          }
        >
          <div className="w-9 h-9 -mt-4 bg-sky-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-sky-500/30">
            <QrCode className="w-5 h-5" />
          </div>
          <span className="mt-0.5">Gate Scan</span>
        </NavLink>
      )}

      {hasPermission('inside:view') && (
        <NavLink
          to="/visits/currently-inside"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${
              isActive ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`
          }
        >
          <ShieldCheck className="w-5 h-5 mb-0.5" />
          <span>Inside</span>
        </NavLink>
      )}

      {hasPermission('visitor:create') && (
        <NavLink
          to="/visits/new"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${
              isActive ? 'text-sky-400 font-bold' : 'hover:text-slate-200'
            }`
          }
        >
          <UserPlus className="w-5 h-5 mb-0.5" />
          <span>Register</span>
        </NavLink>
      )}

      <NavLink
        to="/visits"
        className={({ isActive }) =>
          `flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${
            isActive ? 'text-sky-400 font-bold' : 'hover:text-slate-200'
          }`
        }
      >
        <History className="w-5 h-5 mb-0.5" />
        <span>Visits</span>
      </NavLink>
    </nav>
  );
};
