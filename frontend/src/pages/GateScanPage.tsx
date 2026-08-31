import React, { useState } from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  Printer,
  User,
  Building,
  Clock,
  ArrowRight,
  RefreshCw,
  LogOut,
  LogIn,
  RotateCcw
} from 'lucide-react';
import api from '../services/api.js';
import { QRScannerModal, extractPassToken } from '../components/qr/QRScannerModal.js';
import { VisitorPassModal } from '../components/pass/VisitorPassModal.js';
import { resolveImageUrl } from '../utils/image.js';

export const GateScanPage: React.FC = () => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [verifiedPass, setVerifiedPass] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [printVisitId, setPrintVisitId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);

  const handleVerifyToken = async (rawToken: string) => {
    setError(null);
    setActionSuccess(null);
    setPhotoError(false);

    const token = extractPassToken(rawToken);
    if (!token) {
      setError('Please provide a valid QR pass code or token.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.get(`/api/passes/verify/${encodeURIComponent(token)}`);
      if (res.data.success && res.data.data) {
        setVerifiedPass(res.data.data);
        setManualToken(token);
      } else {
        setVerifiedPass(null);
        setError('Pass verification failed. QR token is invalid.');
      }
    } catch (err: any) {
      setVerifiedPass(null);
      setError(err.response?.data?.error?.message || 'Invalid or expired QR pass token.');
    } finally {
      setLoading(false);
    }
  };

  const handleGateCheckIn = async () => {
    if (!verifiedPass?.visitId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.post(`/api/visits/${verifiedPass.visitId}/check-in`, {});
      if (res.data.success) {
        setActionSuccess(`Visitor ${verifiedPass.visitorName} checked in successfully.`);
        // Reload verification status
        const lookupToken = verifiedPass.qrToken || verifiedPass.passNumber || verifiedPass.visitCode;
        if (lookupToken) {
          handleVerifyToken(lookupToken);
        } else {
          setVerifiedPass((prev: any) => ({ ...prev, visitStatus: 'CHECKED_IN', checkInTime: new Date().toISOString() }));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGateCheckOut = async () => {
    if (!verifiedPass?.visitId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.post(`/api/visits/${verifiedPass.visitId}/check-out`);
      if (res.data.success) {
        setActionSuccess(`Visitor ${verifiedPass.visitorName} checked out successfully. QR pass has been invalidated.`);
        setVerifiedPass((prev: any) => ({ ...prev, visitStatus: 'CHECKED_OUT', isValid: false, verificationStatus: 'ALREADY_CHECKED_OUT', checkOutTime: new Date().toISOString() }));
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Check-out failed');
    } finally {
      setLoading(false);
    }
  };

  const visitorInitials = verifiedPass?.visitorName
    ? verifiedPass.visitorName
        .split(' ')
        .filter(Boolean)
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VP';

  const photoSrc = resolveImageUrl(verifiedPass?.visitorPhoto);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 font-black text-lg">
            <QrCode className="w-5 h-5 text-sky-400" />
            <span>Gate QR Scanner & Verification</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Scan visitor badge or enter pass token for instant gate check-in & check-out
          </p>
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" />
          <span>Launch Camera Scanner</span>
        </button>
      </div>

      {/* Manual Input Fallback */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
        <input
          type="text"
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          placeholder="Paste or enter pass QR token / Pass ID (e.g. qr_6b47...)"
          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
          onKeyDown={(e) => e.key === 'Enter' && handleVerifyToken(manualToken)}
        />
        <button
          onClick={() => handleVerifyToken(manualToken)}
          disabled={!manualToken.trim() || loading}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
        >
          Verify
        </button>
      </div>

      {/* Alert Messages */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Verified Pass Card */}
      {verifiedPass && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden animate-in fade-in">
          {/* Header Status Bar */}
          <div
            className={`p-4 text-white font-bold text-xs flex items-center justify-between ${
              verifiedPass.isValid
                ? 'bg-emerald-600'
                : verifiedPass.verificationStatus === 'ALREADY_CHECKED_OUT'
                ? 'bg-slate-700'
                : 'bg-rose-600'
            }`}
          >
            <div className="flex items-center gap-2">
              {verifiedPass.isValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>PASS VERIFIED - AUTHORIZED FOR SITE ACCESS</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>PASS INVALID: {verifiedPass.verificationStatus ? String(verifiedPass.verificationStatus).replace(/_/g, ' ') : 'NOT AUTHORIZED'}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] bg-black/20 px-2 py-0.5 rounded">
                {verifiedPass.passNumber || verifiedPass.visitCode}
              </span>
              <button
                onClick={() => {
                  setVerifiedPass(null);
                  setManualToken('');
                  setError(null);
                  setActionSuccess(null);
                }}
                title="Clear / Scan Next"
                className="p-1 rounded hover:bg-black/20 text-white/80 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Details Body */}
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* Photo */}
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 shadow-inner flex items-center justify-center relative">
                  {photoSrc && !photoError ? (
                    <img
                      src={photoSrc}
                      alt={verifiedPass.visitorName}
                      className="w-full h-full object-cover"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600">
                      <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-800 font-black text-base flex items-center justify-center shadow-sm">
                        {visitorInitials}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                        {verifiedPass.visitorType || 'Visitor'}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-bold uppercase mt-2">
                  {verifiedPass.visitorType || 'Visitor'}
                </span>
              </div>

              {/* Visitor & Host Info */}
              <div className="sm:col-span-2 space-y-3 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Visitor</div>
                  <div className="text-lg font-black text-slate-900">{verifiedPass.visitorName}</div>
                  <div className="text-xs font-bold text-sky-700">{verifiedPass.companyName || 'Individual Guest'}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Host Employee</div>
                    <div className="font-bold text-slate-800">{verifiedPass.hostName || 'Duty Host'}</div>
                    <div className="text-[11px] text-slate-500">{verifiedPass.department || 'Operations'}</div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Site / Location</div>
                    <div className="font-bold text-slate-800">{verifiedPass.siteName || 'Factory Plant'}</div>
                    <div className="text-[11px] text-slate-500">{verifiedPass.organizationName || 'Bharat MFG'}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Visit Purpose</span>
                  <span className="font-medium text-slate-700">{verifiedPass.purpose || 'Official Visit'}</span>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setPrintVisitId(verifiedPass.visitId)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Pass Badge</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setVerifiedPass(null);
                    setManualToken('');
                    setError(null);
                    setActionSuccess(null);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Clear
                </button>

                {verifiedPass.visitStatus !== 'CHECKED_IN' && verifiedPass.visitStatus !== 'CHECKED_OUT' && (
                  <button
                    onClick={handleGateCheckIn}
                    disabled={loading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Confirm Gate Check-In</span>
                  </button>
                )}

                {verifiedPass.visitStatus === 'CHECKED_IN' && (
                  <button
                    onClick={handleGateCheckOut}
                    disabled={loading}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Confirm Gate Check-Out</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(token) => {
          setIsScannerOpen(false);
          handleVerifyToken(token);
        }}
      />

      {/* Pass Print Modal */}
      <VisitorPassModal
        visitId={printVisitId}
        isOpen={Boolean(printVisitId)}
        onClose={() => setPrintVisitId(null)}
      />
    </div>
  );
};
