import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  User,
  Building,
  Phone,
  Mail,
  ShieldAlert,
  ShieldCheck,
  History,
  Calendar,
  X,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';
import { Visitor } from '../types/index.js';
import { resolveImageUrl } from '../utils/image.js';

export const VisitorsDirectoryPage: React.FC = () => {
  const { hasPermission } = useAuthStore();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVisitor, setSelectedVisitor] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [blacklistModalVisitor, setBlacklistModalVisitor] = useState<Visitor | null>(null);
  const [blacklistReason, setBlacklistReason] = useState('');

  const fetchVisitors = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/visitors?search=${encodeURIComponent(search.trim())}`);
      if (res.data.success) {
        setVisitors(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch visitors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVisitors();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const displayedVisitors = useMemo(() => {
    if (!search.trim()) return visitors;
    const q = search.toLowerCase().trim();
    return visitors.filter((v) => {
      const name = (v.full_name || `${v.first_name || ''} ${v.last_name || ''}`).toLowerCase();
      const phone = (v.mobile_number || '').toLowerCase();
      const comp = (v.company_name || '').toLowerCase();
      const mail = (v.email || '').toLowerCase();
      const idNum = (v.id_number_masked || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || comp.includes(q) || mail.includes(q) || idNum.includes(q);
    });
  }, [visitors, search]);

  const openVisitorProfile = async (id: string) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/api/visitors/${id}`);
      if (res.data.success) {
        setSelectedVisitor(res.data.data);
      }
    } catch (err) {
      alert('Failed to load visitor profile');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleBlacklist = async () => {
    if (!blacklistModalVisitor) return;
    try {
      const newStatus = !blacklistModalVisitor.is_blacklisted;
      const res = await api.post(`/api/visitors/${blacklistModalVisitor.id}/blacklist`, {
        is_blacklisted: newStatus,
        blacklist_reason: newStatus ? blacklistReason : null,
      });

      if (res.data.success) {
        setBlacklistModalVisitor(null);
        setBlacklistReason('');
        fetchVisitors();
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Action failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Visitors Directory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Master reusable identity profiles and visit histories across all organization sites
          </p>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by visitor name, mobile, company, ID..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Directory Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 text-xs">
            Loading visitor directory...
          </div>
        ) : displayedVisitors.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 text-xs">
            No visitor profiles found matching your query.
          </div>
        ) : (
          displayedVisitors.map((v) => {
            const photoSrc = resolveImageUrl(v.photo_url);
            const initials = v.full_name
              ? v.full_name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
              : 'V';

            return (
              <div
                key={v.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                  v.is_blacklisted ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 relative shadow-inner">
                        {photoSrc ? (
                          <img src={photoSrc} alt={v.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-sky-100 text-sky-800 font-bold text-xs">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">{v.full_name}</div>
                        <div className="text-xs font-semibold text-sky-700">{v.company_name || 'Individual'}</div>
                      </div>
                    </div>

                    {v.is_blacklisted && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Blacklisted
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{v.mobile_number}</span>
                    </div>
                    {v.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{v.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    <span className="font-bold text-slate-800">{v.total_visits_count || 0}</span> visits recorded
                  </div>

                  <div className="flex items-center gap-2">
                    {hasPermission('visitor:blacklist') && (
                      <button
                        onClick={() => setBlacklistModalVisitor(v)}
                        className={`p-1.5 rounded-lg border text-xs ${
                          v.is_blacklisted
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                            : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                        }`}
                        title={v.is_blacklisted ? 'Remove Blacklist' : 'Flag / Blacklist'}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => openVisitorProfile(v.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                    >
                      Profile & History
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Visitor Profile & History Modal */}
      {selectedVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2 font-bold text-sm">
                <User className="w-4 h-4 text-sky-400" />
                <span>Visitor Profile & Historical Logs</span>
              </div>
              <button onClick={() => setSelectedVisitor(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Profile Card Header */}
              <div className="flex items-center space-x-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                  {selectedVisitor.photo_url ? (
                    <img src={resolveImageUrl(selectedVisitor.photo_url)} alt={selectedVisitor.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="text-base font-black text-slate-900">{selectedVisitor.full_name}</div>
                  <div className="text-xs font-bold text-sky-700">{selectedVisitor.company_name || 'Individual'} • {selectedVisitor.designation || selectedVisitor.default_visitor_type}</div>
                  <div className="text-xs text-slate-500 mt-1">{selectedVisitor.mobile_number} {selectedVisitor.email && `• ${selectedVisitor.email}`}</div>
                </div>
              </div>

              {/* Visits History Timeline */}
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-3">
                  Historical Visits Log ({selectedVisitor.visits?.length || 0})
                </h3>

                <div className="space-y-2">
                  {selectedVisitor.visits?.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">No past visits recorded.</div>
                  ) : (
                    selectedVisitor.visits?.map((vt: any) => (
                      <div key={vt.id} className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-800">{vt.site_name} ({vt.site_code})</div>
                          <div className="text-[11px] text-slate-500">Host: {vt.host_first_name} {vt.host_last_name} ({vt.department_name})</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{vt.visit_code} • {vt.purpose}</div>
                        </div>

                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            vt.status === 'CHECKED_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {vt.status}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1">{vt.expected_date}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blacklist Confirmation Modal */}
      {blacklistModalVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {blacklistModalVisitor.is_blacklisted ? 'Remove Blacklist Status' : 'Blacklist Visitor Profile'}
                </h3>
                <p className="text-xs text-slate-500">{blacklistModalVisitor.full_name} ({blacklistModalVisitor.mobile_number})</p>
              </div>
            </div>

            {!blacklistModalVisitor.is_blacklisted && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Blacklisting *</label>
                <textarea
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder="Security violation, unauthorized entry attempt, expired credentials..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-rose-500 focus:bg-white"
                  rows={3}
                />
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setBlacklistModalVisitor(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleBlacklist}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold ${
                  blacklistModalVisitor.is_blacklisted ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {blacklistModalVisitor.is_blacklisted ? 'Confirm Removal' : 'Confirm Blacklist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
