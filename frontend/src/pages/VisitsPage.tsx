import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  UserPlus,
  ShieldCheck,
  Clock,
  Car,
  Printer,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  User,
  X
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';
import { Visit } from '../types/index.js';
import { VisitorPassModal } from '../components/pass/VisitorPassModal.js';

export const VisitsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeSite, hasPermission } = useAuthStore();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [visitorType, setVisitorType] = useState(searchParams.get('visitorType') || '');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');

  const [selectedPassVisitId, setSelectedPassVisitId] = useState<string | null>(null);

  const fetchVisits = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (visitorType) params.set('visitorType', visitorType);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await api.get(`/api/visits?${params.toString()}`);
      if (res.data.success) {
        setVisits(res.data.data);
        setTotal(res.data.meta?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch visits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchVisits();
    }, 250);
    return () => clearTimeout(handler);
  }, [search, page, status, visitorType, startDate, endDate, activeSite?.id]);

  const displayedVisits = useMemo(() => {
    if (!search.trim()) return visits;
    const q = search.toLowerCase().trim();
    return visits.filter(v =>
      (v.visitor_name && v.visitor_name.toLowerCase().includes(q)) ||
      (v.mobile_number && v.mobile_number.toLowerCase().includes(q)) ||
      (v.company_name && v.company_name.toLowerCase().includes(q)) ||
      (v.visit_code && v.visit_code.toLowerCase().includes(q)) ||
      (v.vehicle_number && v.vehicle_number.toLowerCase().includes(q)) ||
      (v.host_first_name && v.host_first_name.toLowerCase().includes(q)) ||
      (v.host_last_name && v.host_last_name.toLowerCase().includes(q)) ||
      (v.department_name && v.department_name.toLowerCase().includes(q)) ||
      (v.purpose && v.purpose.toLowerCase().includes(q)) ||
      (v.pass_number && v.pass_number.toLowerCase().includes(q))
    );
  }, [visits, search]);

  const handleCheckIn = async (visitId: string) => {
    try {
      const res = await api.post(`/api/visits/${visitId}/check-in`, {});
      if (res.data.success) {
        fetchVisits();
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Check-in failed');
    }
  };

  const handleCheckOut = async (visitId: string) => {
    try {
      const res = await api.post(`/api/visits/${visitId}/check-out`);
      if (res.data.success) {
        fetchVisits();
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Check-out failed');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Factory Visits Register</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Full historical and active visits log for <span className="font-bold text-slate-700">{activeSite?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('visitor:create') && (
            <button
              onClick={() => navigate('/visits/new')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Walk-In</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Search Box */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search visitor, phone, company, code, vehicle, host..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1); }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Dropdown */}
          <div>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="CHECKED_IN">Currently Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="APPROVED">Approved / Expected</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="REGISTERED">Registered</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Visitor Type */}
          <div>
            <select
              value={visitorType}
              onChange={(e) => { setVisitorType(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
            >
              <option value="">All Visitor Types</option>
              <option value="Guest">Guest</option>
              <option value="Vendor">Vendor</option>
              <option value="Contractor">Contractor</option>
              <option value="Service Engineer">Service Engineer</option>
              <option value="Customer">Customer</option>
              <option value="Interview Candidate">Candidate</option>
              <option value="Delivery">Delivery</option>
            </select>
          </div>

          {/* Filter Button */}
          <button
            onClick={() => { setPage(1); fetchVisits(); }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Apply Filters</span>
          </button>
        </div>
      </div>

      {/* Visits Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Visitor & ID</th>
                <th className="py-3 px-4">Host Employee</th>
                <th className="py-3 px-4">Category & Purpose</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Entry / Exit Timing</th>
                <th className="py-3 px-4">Vehicle</th>
                <th className="py-3 px-4 text-right">Pass / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading visits register...
                  </td>
                </tr>
              ) : displayedVisits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No visit records found matching criteria.
                  </td>
                </tr>
              ) : (
                displayedVisits.map((v) => (
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
                      <div className="text-[10px] text-slate-500">{v.company_name || 'Individual'} • {v.mobile_number}</div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">{v.visit_code}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{v.host_first_name}{v.host_last_name ? ` ${v.host_last_name}` : ''}</div>
                      <div className="text-[10px] text-slate-500">{v.department_name}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                        {v.visitor_type}
                      </span>
                      <div className="text-[11px] text-slate-600 mt-1 truncate max-w-xs">{v.purpose}</div>
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
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase">In:</span>
                            <span>{new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>

                          {v.check_out_time ? (
                            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                              <span className="text-[10px] text-slate-500 font-bold uppercase">Out:</span>
                              <span>{new Date(v.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          ) : v.status === 'CHECKED_IN' ? (
                            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>Inside</span>
                            </div>
                          ) : null}

                          <div className="text-[10px] text-slate-400 font-medium">{v.expected_date}</div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-700">
                            Exp: {v.expected_time || 'Anytime'}
                          </div>
                          <div className="text-[10px] text-slate-400">{v.expected_date}</div>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {v.vehicle_number ? (
                        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded w-fit">
                          <Car className="w-3.5 h-3.5 text-slate-400" />
                          <span>{v.vehicle_number}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => setSelectedPassVisitId(v.id)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                        title="Print Pass Badge"
                      >
                        Pass
                      </button>

                      {v.status !== 'CHECKED_IN' && v.status !== 'CHECKED_OUT' && hasPermission('visit:checkin') && (
                        <button
                          onClick={() => handleCheckIn(v.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm"
                        >
                          Check In
                        </button>
                      )}

                      {v.status === 'CHECKED_IN' && hasPermission('visit:checkout') && (
                        <button
                          onClick={() => handleCheckOut(v.id)}
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

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} visits
            </div>
            <div className="flex items-center space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-800">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <VisitorPassModal
        visitId={selectedPassVisitId}
        isOpen={Boolean(selectedPassVisitId)}
        onClose={() => setSelectedPassVisitId(null)}
      />
    </div>
  );
};
