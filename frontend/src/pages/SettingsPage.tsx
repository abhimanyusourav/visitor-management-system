import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2, ShieldCheck, FileText, Clock } from 'lucide-react';
import api from '../services/api.js';

export const SettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [approvalVendors, setApprovalVendors] = useState(true);
  const [approvalGuests, setApprovalGuests] = useState(false);
  const [approvalContractors, setApprovalContractors] = useState(true);
  const [badgeFormat, setBadgeFormat] = useState('STANDARD_A4');
  const [dataRetentionDays, setDataRetentionDays] = useState(90);
  const [safetyInstructions, setSafetyInstructions] = useState('');
  const [workingHoursStart, setWorkingHoursStart] = useState('08:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState('18:00');

  useEffect(() => {
    api.get('/api/settings')
      .then((res) => {
        if (res.data.success) {
          const s = res.data.data;
          setApprovalVendors(s.approvalRequiredForVendors ?? true);
          setApprovalGuests(s.approvalRequiredForGuests ?? false);
          setApprovalContractors(s.approvalRequiredForContractors ?? true);
          setBadgeFormat(s.badgePrintFormat || 'STANDARD_A4');
          setDataRetentionDays(s.dataRetentionDays || 90);
          setSafetyInstructions(s.safetyInstructions || '');
          setWorkingHoursStart(s.workingHoursStart || '08:00');
          setWorkingHoursEnd(s.workingHoursEnd || '18:00');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/api/settings', {
        approvalRequiredForVendors: approvalVendors,
        approvalRequiredForGuests: approvalGuests,
        approvalRequiredForContractors: approvalContractors,
        badgePrintFormat: badgeFormat,
        dataRetentionDays: Number(dataRetentionDays),
        safetyInstructions,
        workingHoursStart,
        workingHoursEnd,
      });

      if (res.data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 4000);
      }
    } catch (err: any) {
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Plant Configuration & Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure visitor approval workflows, safety pass guidelines, and data retention policies
        </p>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>System configuration updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Visitor Approval Policies */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span>Category Approval Requirements</span>
          </h2>

          <div className="space-y-3 text-xs">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={approvalVendors}
                onChange={(e) => setApprovalVendors(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded"
              />
              <div>
                <div className="font-bold text-slate-800">Require Host Approval for Vendors & Suppliers</div>
                <div className="text-slate-400 text-[11px]">Vendors must receive electronic approval before check-in</div>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={approvalContractors}
                onChange={(e) => setApprovalContractors(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded"
              />
              <div>
                <div className="font-bold text-slate-800">Require Host Approval for Labor Contractors</div>
                <div className="text-slate-400 text-[11px]">Contractors require authorization from plant production head</div>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={approvalGuests}
                onChange={(e) => setApprovalGuests(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded"
              />
              <div>
                <div className="font-bold text-slate-800">Require Host Approval for General Guests</div>
                <div className="text-slate-400 text-[11px]">If unchecked, front desk reception can directly admit guests</div>
              </div>
            </label>
          </div>
        </div>

        {/* Safety Pass & Printing Format */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Visitor Pass Layout & Plant Safety Rules</span>
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Default Pass Print Format</label>
              <select
                value={badgeFormat}
                onChange={(e) => setBadgeFormat(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              >
                <option value="STANDARD_A4">Standard A4 Sheet Pass with Sign-off Blocks</option>
                <option value="STICKER">Thermal Sticky Badge Label (4" x 3" / 80mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Safety & Entry Instructions on Pass</label>
              <textarea
                value={safetyInstructions}
                onChange={(e) => setSafetyInstructions(e.target.value)}
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Data Retention */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Compliance & Data Retention Policy</span>
          </h2>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Visitor Records Retention Period</label>
            <select
              value={dataRetentionDays}
              onChange={(e) => setDataRetentionDays(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            >
              <option value="30">30 Days</option>
              <option value="90">90 Days (Recommended)</option>
              <option value="180">180 Days (6 Months)</option>
              <option value="365">365 Days (1 Year)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/30 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Settings...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
