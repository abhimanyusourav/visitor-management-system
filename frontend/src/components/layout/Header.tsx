import React, { useState, useEffect } from 'react';
import {
  Menu,
  Bell,
  Building,
  ChevronDown,
  UserPlus,
  QrCode,
  CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import api from '../../services/api.js';
import { NotificationItem, Site } from '../../types/index.js';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, activeSite, setActiveSite, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/api/notifications');
      if (res.data.success) {
        setNotifications(res.data.data);
        setUnreadCount(res.data.data.filter((n: NotificationItem) => !n.is_read).length);
      }
    } catch (err) {
      // silent
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // silent
    }
  };

  const handleSiteSelect = (site: Site) => {
    setActiveSite(site);
    setIsSiteDropdownOpen(false);
    window.location.reload();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 shadow-sm">
      {/* Left section: Hamburger & Active Site Switcher */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Site Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
            className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="w-6 h-6 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center">
              <Building className="w-3.5 h-3.5" />
            </div>
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                Active Factory Site
              </div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                {activeSite?.name || 'Select Site'}
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </div>
            </div>
          </button>

          {isSiteDropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                Authorized Factory Sites
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {user?.authorizedSites?.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => handleSiteSelect(site)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-sky-50 transition-colors ${
                      activeSite?.id === site.id ? 'bg-sky-50/80 font-bold text-sky-700' : 'text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{site.name}</div>
                      <div className="text-[10px] text-slate-400">{site.code} • {site.city}</div>
                    </div>
                    {activeSite?.id === site.id && (
                      <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right section: Action Buttons & Notifications */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Quick Gate Scan */}
        {hasPermission('pass:verify') && (
          <button
            onClick={() => navigate('/gate-scan')}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-sky-400" />
            <span>Gate Scanner</span>
          </button>
        )}

        {/* Quick Walk-In Button */}
        {hasPermission('visitor:create') && (
          <button
            onClick={() => navigate('/visits/new')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Visitor</span>
          </button>
        )}

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100">
                <div className="font-bold text-xs text-slate-900">Notifications</div>
                <div className="text-[11px] text-slate-500">{unreadCount} unread</div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No recent notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      className={`p-3 text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                        !n.is_read ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-semibold text-slate-800">{n.title}</div>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-1" />
                        )}
                      </div>
                      <div className="text-slate-600 mt-1 text-[11px] line-clamp-2">{n.message}</div>
                      <div className="text-[9px] text-slate-400 mt-1.5">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User initials chip */}
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center border border-slate-300 shadow-sm">
          {user?.firstName?.[0] || 'U'}
        </div>
      </div>
    </header>
  );
};
