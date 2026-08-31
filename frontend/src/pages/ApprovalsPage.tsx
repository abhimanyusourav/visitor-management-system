import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Building,
  Calendar,
  AlertCircle,
  Loader2,
  Phone,
  ShieldAlert
} from 'lucide-react';
import api from '../services/api.js';
import { Visit } from '../types/index.js';

export const ApprovalsPage: React.FC = () => {
  const [pendingVisits, setPendingVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectModalVisit, setRejectModalVisit] = useState<Visit | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPendingVisits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/visits?status=PENDING_APPROVAL');
      if (res.data.success) {
        setPendingVisits(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load pending approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingVisits();
  }, []);

  const handleApprove = async (visitId: string, visitorName: string) => {
    setActionLoadingId(visitId);
    setActionError(null);
    try {
      const res = await api.post(`/api/visits/${visitId}/approve`);
      if (res.data.success) {
        setActionSuccess(`Visit for ${visitorName} approved successfully. Gate pass is now valid for entry.`);
        setTimeout(() => setActionSuccess(null), 5000);
        await fetchPendingVisits();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || 'Failed to approve visit.');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModalVisit) return;
    setActionLoadingId(rejectModalVisit.id);
    setActionError(null);
    try {
      const res = await api.post(`/api/visits/${rejectModalVisit.id}/reject`, {
        rejection_reason: rejectReason.trim() || 'Host is unavailable or request unauthorized.'
      });
      if (res.data.success) {
        setActionSuccess(`Visit request for ${rejectModalVisit.visitor_name} has been rejected.`);
        setRejectModalVisit(null);
        setRejectReason('');
        setTimeout(() => setActionSuccess(null), 5000);
        await fetchPendingVisits();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || 'Failed to reject visit.');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <span>Pending Visitor Approvals</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review and approve visitor requests requiring host or administrative authorization
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-xs">
          {pendingVisits.length} Pending
        </span>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
            <span>Loading pending approvals...</span>
          </div>
        ) : pendingVisits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-80" />
            <div className="font-black text-base text-slate-800">All clear!</div>
            <div>There are no pending visitor requests awaiting approval at this time.</div>
          </div>
        ) : (
          pendingVisits.map((v) => {
            const isActing = actionLoadingId === v.id;
            return (
              <div
                key={v.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-base text-slate-900">{v.visitor_name}</span>
                    <span className="text-xs font-bold text-sky-700">({v.company_name || 'Individual'})</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {v.visitor_type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Host</span>
                      <span className="font-semibold text-slate-800">{v.host_first_name} {v.host_last_name}</span>
                      <span className="text-[10px] text-slate-500 block">{v.department_name}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Expected Schedule</span>
                      <span className="font-semibold text-slate-800">{v.expected_date}</span>
                      <span className="text-[10px] text-slate-500 block">{v.expected_time}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Mobile</span>
                      <span className="font-semibold text-slate-800">{v.mobile_number}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-900">Purpose: </span> {v.purpose}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 sm:flex-col sm:space-x-0 sm:space-y-2 shrink-0">
                  <button
                    onClick={() => handleApprove(v.id, v.visitor_name)}
                    disabled={isActing}
                    className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {isActing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Approve Visit</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setRejectModalVisit(v)}
                    disabled={isActing}
                    className="flex-1 sm:flex-none px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Reject Visit Request</h3>
                <p className="text-xs text-slate-500">{rejectModalVisit.visitor_name} ({rejectModalVisit.company_name || 'Individual'})</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Rejection</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Host unavailable, schedule conflict, unauthorized visit..."
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-rose-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setRejectModalVisit(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={Boolean(actionLoadingId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5"
              >
                {actionLoadingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
