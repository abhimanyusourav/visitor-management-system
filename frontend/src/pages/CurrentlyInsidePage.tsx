import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Printer,
  Search,
  LogOut,
  Car,
  User,
  Building,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';
import { Visit } from '../types/index.js';
import { VisitorPassModal } from '../components/pass/VisitorPassModal.js';

export const CurrentlyInsidePage: React.FC = () => {
  const { activeSite, hasPermission } = useAuthStore();

  const [insideVisits, setInsideVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPassVisitId, setSelectedPassVisitId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchInsideVisits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/visits/currently-inside');
      if (res.data.success) {
        setInsideVisits(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch currently inside visits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsideVisits();
    const interval = setInterval(fetchInsideVisits, 15000);
    return () => clearInterval(interval);
  }, [activeSite?.id]);

  const handleCheckout = async (visitId: string, visitorName: string) => {
    if (!confirm(`Confirm check-out for ${visitorName}?`)) return;
    try {
      const res = await api.post(`/api/visits/${visitId}/check-out`);
      if (res.data.success) {
        setActionSuccess(`Checked out ${visitorName} successfully.`);
        setTimeout(() => setActionSuccess(null), 4000);
        fetchInsideVisits();
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Check-out failed.');
    }
  };

  const handleEmergencyExport = async () => {
    try {
      const res = await api.get('/api/visits/emergency-export');
      if (res.data.success) {
        const manifest = res.data.data;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Please allow popups to print the emergency manifest.');
          return;
        }

        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>EMERGENCY EVACUATION MANIFEST - ${manifest.site?.name}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
              .header { border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
              .title { font-size: 20px; font-weight: bold; color: #b91c1c; }
              .meta { font-size: 12px; margin-top: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
              th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
              th { background: #eee; font-weight: bold; }
              .footer { margin-top: 30px; font-size: 11px; display: flex; justify-content: space-between; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">🚨 EMERGENCY EVACUATION VISITOR MANIFEST</div>
              <div class="meta">
                <strong>Site:</strong> ${manifest.site?.name} (${manifest.site?.code}) | <strong>Address:</strong> ${manifest.site?.address}, ${manifest.site?.city}<br/>
                <strong>Generated At:</strong> ${new Date(manifest.exportedAt).toLocaleString()} | <strong>Total Headcount:</strong> ${manifest.totalHeadcount} persons<br/>
                <strong>Exported By:</strong> ${manifest.exportedBy}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pass / Code</th>
                  <th>Visitor Name</th>
                  <th>Company</th>
                  <th>Mobile</th>
                  <th>Host Employee</th>
                  <th>Department</th>
                  <th>Check-In Time</th>
                  <th>Accompanying</th>
                  <th>Vehicle No</th>
                  <th>Rollcall Check (✓)</th>
                </tr>
              </thead>
              <tbody>
                ${manifest.records.map((r: any, i: number) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${r.pass_number || r.visit_code}</td>
                    <td><strong>${r.visitor_name}</strong></td>
                    <td>${r.company_name || '-'}</td>
                    <td>${r.mobile_number}</td>
                    <td>${r.host_name}</td>
                    <td>${r.department}</td>
                    <td>${new Date(r.check_in_time).toLocaleTimeString()}</td>
                    <td>${r.accompanying_count || 0}</td>
                    <td>${r.vehicle_number || '-'}</td>
                    <td style="width: 80px; height: 20px;"></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">
              <div>Incident Commander Signature: _______________________</div>
              <div>Security Head Signature: _______________________</div>
            </div>

            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
          </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch (err) {
      alert('Failed to generate emergency manifest');
    }
  };

  const filtered = insideVisits.filter(v => {
    const q = search.toLowerCase();
    return (
      v.visitor_name?.toLowerCase().includes(q) ||
      v.company_name?.toLowerCase().includes(q) ||
      v.mobile_number?.toLowerCase().includes(q) ||
      v.host_first_name?.toLowerCase().includes(q) ||
      v.host_last_name?.toLowerCase().includes(q) ||
      v.visit_code?.toLowerCase().includes(q) ||
      v.vehicle_number?.toLowerCase().includes(q)
    );
  });

  const totalHeadcount = insideVisits.reduce((acc, v) => acc + 1 + (v.accompanying_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h1 className="text-xl font-black tracking-tight">Currently Inside Premises</h1>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Live real-time security roster for <span className="font-bold text-emerald-400">{activeSite?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Headcount Chip */}
          <div className="bg-slate-800/90 border border-slate-700 px-4 py-2 rounded-xl text-center">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Headcount</div>
            <div className="text-xl font-black text-emerald-400">{totalHeadcount} persons</div>
          </div>

          {/* Emergency Evacuation Export */}
          {hasPermission('emergency:export') && (
            <button
              onClick={handleEmergencyExport}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
              title="Print Emergency Rollcall Roster"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Emergency Evacuation Manifest</span>
            </button>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Search and Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by visitor name, company, phone, host, vehicle..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
            />
          </div>

          <div className="text-xs font-semibold text-slate-500">
            Showing {filtered.length} active visitor passes
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Visitor Details</th>
                <th className="py-3 px-4">Host & Department</th>
                <th className="py-3 px-4">Category & Purpose</th>
                <th className="py-3 px-4">Check-In Time</th>
                <th className="py-3 px-4">Vehicle</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading on-site visitors roster...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No visitors are currently checked inside this site.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{v.visitor_name}</span>
                        {v.accompanying_count > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">
                            +{v.accompanying_count}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {v.company_name || 'Individual'} • {v.mobile_number}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {v.pass_number || v.visit_code}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">
                        {v.host_first_name} {v.host_last_name}
                      </div>
                      <div className="text-[10px] text-slate-500">{v.department_name}</div>
                      {v.host_phone && <div className="text-[9px] text-slate-400">{v.host_phone}</div>}
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                        {v.visitor_type}
                      </span>
                      <div className="text-[11px] text-slate-600 mt-1 truncate max-w-xs">{v.purpose}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-emerald-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{v.check_in_time ? new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {v.check_in_time ? new Date(v.check_in_time).toLocaleDateString() : v.expected_date}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {v.vehicle_number ? (
                        <div className="flex items-center gap-1 font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded w-fit text-[11px]">
                          <Car className="w-3.5 h-3.5 text-slate-500" />
                          <span>{v.vehicle_number}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">None</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => setSelectedPassVisitId(v.id)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                      >
                        Pass
                      </button>

                      {hasPermission('visit:checkout') && (
                        <button
                          onClick={() => handleCheckout(v.id, v.visitor_name)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm"
                        >
                          Check Out
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VisitorPassModal
        visitId={selectedPassVisitId}
        isOpen={Boolean(selectedPassVisitId)}
        onClose={() => setSelectedPassVisitId(null)}
      />
    </div>
  );
};
