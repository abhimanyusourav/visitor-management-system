import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  UserCheck,
  Clock,
  AlertTriangle,
  HardHat,
  QrCode,
  UserPlus,
  ArrowRight,
  TrendingUp,
  PieChart
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';
import { DashboardStats, DashboardCharts, Visit } from '../types/index.js';
import { VisitorPassModal } from '../components/pass/VisitorPassModal.js';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, activeSite, hasPermission } = useAuthStore();

  const [stats, setStats] = useState<DashboardStats>({
    todayVisitors: 0,
    currentlyInside: 0,
    expectedToday: 0,
    pendingApproval: 0,
    checkedOutToday: 0,
    contractorsInside: 0,
  });

  const [charts, setCharts] = useState<DashboardCharts>({
    visitsByDay: [],
    visitsByDepartment: [],
    visitorTypeDistribution: [],
    visitsByPurpose: [],
  });

  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [selectedPassVisitId, setSelectedPassVisitId] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, chartsRes, visitsRes] = await Promise.all([
        api.get('/api/dashboard/stats'),
        api.get('/api/dashboard/charts'),
        api.get('/api/visits?limit=6'),
      ]);

      if (statsRes.data?.success && statsRes.data?.data) {
        setStats(statsRes.data.data);
      }
      if (chartsRes.data?.success && chartsRes.data?.data) {
        setCharts({
          visitsByDay: Array.isArray(chartsRes.data.data.visitsByDay) ? chartsRes.data.data.visitsByDay : [],
          visitsByDepartment: Array.isArray(chartsRes.data.data.visitsByDepartment) ? chartsRes.data.data.visitsByDepartment : [],
          visitorTypeDistribution: Array.isArray(chartsRes.data.data.visitorTypeDistribution) ? chartsRes.data.data.visitorTypeDistribution : [],
          visitsByPurpose: Array.isArray(chartsRes.data.data.visitsByPurpose) ? chartsRes.data.data.visitsByPurpose : [],
        });
      }
      if (visitsRes.data?.success && Array.isArray(visitsRes.data?.data)) {
        setRecentVisits(visitsRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [activeSite?.id]);

  const statCards = [
    { label: "Today's Visitors", value: stats.todayVisitors || 0, icon: Users, color: 'sky', link: '/visits' },
    { label: 'Currently Inside', value: stats.currentlyInside || 0, icon: ShieldCheck, color: 'emerald', highlight: true, link: '/visits/currently-inside' },
    { label: 'Expected Today', value: stats.expectedToday || 0, icon: UserCheck, color: 'indigo', link: '/visits?status=APPROVED' },
    { label: 'Pending Approval', value: stats.pendingApproval || 0, icon: AlertTriangle, color: 'amber', link: '/approvals' },
    { label: 'Checked Out Today', value: stats.checkedOutToday || 0, icon: Clock, color: 'slate', link: '/visits?status=CHECKED_OUT' },
    { label: 'Contractors Inside', value: stats.contractorsInside || 0, icon: HardHat, color: 'orange', link: '/visits/currently-inside' },
  ];

  const visitsByDay = charts.visitsByDay || [];
  const visitorTypeDistribution = charts.visitorTypeDistribution || [];
  const visitsByDepartment = charts.visitsByDepartment || [];

  return (
    <div className="space-y-6">
      {/* Page Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Welcome, {user?.firstName || 'User'}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold uppercase">
              {user?.roleName || user?.role || 'Guest'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operating Site: <span className="font-bold text-slate-800">{activeSite?.name || 'All Sites'}</span> {activeSite?.city ? `(${activeSite.city})` : ''}
          </p>
        </div>

        {/* Quick Operations Bar */}
        <div className="flex items-center gap-2">
          {hasPermission('pass:verify') && (
            <button
              onClick={() => navigate('/gate-scan')}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <QrCode className="w-4 h-4 text-sky-400" />
              <span>Gate Scanner</span>
            </button>
          )}

          {hasPermission('visitor:create') && (
            <button
              onClick={() => navigate('/visits/new')}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>Walk-In Registration</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => navigate(card.link)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                card.highlight
                  ? 'bg-gradient-to-br from-emerald-950 to-slate-900 text-white border-emerald-800 shadow-lg shadow-emerald-950/20'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    card.highlight ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {card.highlight && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>
              <div className={`text-2xl font-black ${card.highlight ? 'text-white' : 'text-slate-900'}`}>
                {card.value}
              </div>
              <div className={`text-[11px] font-semibold truncate ${card.highlight ? 'text-emerald-300' : 'text-slate-500'}`}>
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Trend Bar Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-600" />
              <h2 className="font-bold text-sm text-slate-900">Weekly Visitor Traffic Trend</h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Last 7 Days</span>
          </div>

          <div className="h-44 flex items-end justify-between gap-2 pt-6 px-2">
            {visitsByDay.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                No recent visit traffic recorded
              </div>
            ) : (
              visitsByDay.map((d, i) => {
                const maxCount = Math.max(...visitsByDay.map(x => Number(x.count) || 0), 1);
                const countVal = Number(d.count) || 0;
                const heightPct = Math.max((countVal / maxCount) * 100, 10);
                const dateLabel = d.date ? String(d.date).slice(5) : `D${i + 1}`;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <span className="text-[10px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      {countVal}
                    </span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[36px] bg-sky-500 hover:bg-sky-600 rounded-t-lg transition-all shadow-sm"
                    />
                    <span className="text-[10px] font-medium text-slate-400 truncate w-full text-center">
                      {dateLabel}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Visitor Type Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-indigo-600" />
              <h2 className="font-bold text-sm text-slate-900">Visitor Category Breakdown</h2>
            </div>

            <div className="space-y-2.5">
              {visitorTypeDistribution.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No category data</div>
              ) : (
                visitorTypeDistribution.map((t, idx) => {
                  const total = visitorTypeDistribution.reduce((acc, x) => acc + (Number(x.count) || 0), 0);
                  const countVal = Number(t.count) || 0;
                  const pct = total > 0 ? Math.round((countVal / total) * 100) : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>{t.type || 'General'}</span>
                        <span className="text-slate-500">{countVal} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Visits by Department:</span>
            <span className="font-bold text-slate-700">{visitsByDepartment.length} active depts</span>
          </div>
        </div>
      </div>

      {/* Live Recent Gate Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-slate-900">Recent Gate Operations</h2>
            <p className="text-[11px] text-slate-400">Real-time visitor logs at active site</p>
          </div>
          <button
            onClick={() => navigate('/visits')}
            className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
          >
            <span>View All Visits</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Visitor</th>
                <th className="py-3 px-4">Host & Dept</th>
                <th className="py-3 px-4">Type & Purpose</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4 text-right">Pass / Badge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentVisits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No recent visits found for this site.
                  </td>
                </tr>
              ) : (
                recentVisits.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{v.visitor_name}</div>
                      <div className="text-[10px] text-slate-500">{v.company_name || 'Individual'} • {v.mobile_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{v.host_first_name}{v.host_last_name ? ` ${v.host_last_name}` : ''}</div>
                      <div className="text-[10px] text-slate-500">{v.department_name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{v.visitor_type}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{v.purpose}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          v.status === 'CHECKED_IN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : v.status === 'CHECKED_OUT'
                            ? 'bg-slate-100 text-slate-700'
                            : v.status === 'APPROVED'
                            ? 'bg-sky-100 text-sky-800'
                            : v.status === 'PENDING_APPROVAL'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {v.check_in_time ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 font-semibold text-slate-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span className="text-[10px] text-slate-500">In:</span>
                            <span>{new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          {v.check_out_time && (
                            <div className="flex items-center gap-1 font-semibold text-slate-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              <span className="text-[10px] text-slate-500">Out:</span>
                              <span>{new Date(v.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400">{v.expected_date}</div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-700">
                            Exp: {v.expected_time || 'Anytime'}
                          </div>
                          <div className="text-[10px] text-slate-400">{v.expected_date}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedPassVisitId(v.id)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold"
                      >
                        Pass Badge
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visitor Pass Modal */}
      <VisitorPassModal
        visitId={selectedPassVisitId}
        isOpen={Boolean(selectedPassVisitId)}
        onClose={() => setSelectedPassVisitId(null)}
      />
    </div>
  );
};
