import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Factory, User, Building, Clock, ArrowLeft, LogIn } from 'lucide-react';
import api from '../services/api.js';
import { resolveImageUrl } from '../utils/image.js';
import { extractPassToken } from '../components/qr/QRScannerModal.js';

export const PassVerifyPage: React.FC = () => {
  const { token: rawToken } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    const cleanToken = extractPassToken(rawToken || '');
    if (!cleanToken) {
      setLoading(false);
      setError('No pass token provided or URL is invalid.');
      return;
    }

    setLoading(true);
    setPhotoError(false);
    setError(null);

    api.get(`/api/passes/verify/${encodeURIComponent(cleanToken)}`)
      .then((res) => {
        if (res.data.success && res.data.data) {
          setData(res.data.data);
        } else {
          setError('Pass verification failed. QR token is invalid or expired.');
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error?.message || 'Pass verification failed. QR token is invalid or expired.');
      })
      .finally(() => setLoading(false));
  }, [rawToken]);

  const visitorInitials = data?.visitorName
    ? data.visitorName
        .split(' ')
        .filter(Boolean)
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VP';

  const photoSrc = resolveImageUrl(data?.visitorPhoto);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-xl mb-2">
            <Factory className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-black text-white tracking-wide">
            FACTORY VISITOR BADGE VERIFICATION
          </h1>
          <p className="text-[11px] text-slate-400">Authentic Digital Verification Portal</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-slate-500 text-xs font-semibold">
                Verifying digital badge token...
              </div>
            </div>
          ) : error ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-base text-slate-900">Pass Verification Failed</h2>
                <p className="text-xs text-rose-600 font-medium mt-1">{error}</p>
              </div>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Go to Staff Login</span>
                </Link>
              </div>
            </div>
          ) : data ? (
            <div>
              {/* Status Header */}
              <div
                className={`p-4 text-white font-bold text-xs flex items-center justify-between ${
                  data.isValid
                    ? 'bg-emerald-600'
                    : data.verificationStatus === 'ALREADY_CHECKED_OUT'
                    ? 'bg-slate-700'
                    : 'bg-rose-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  {data.isValid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>
                    {data.isValid
                      ? 'AUTHORIZED SITE VISITOR'
                      : data.verificationStatus
                      ? String(data.verificationStatus).replace(/_/g, ' ')
                      : 'NOT AUTHORIZED'}
                  </span>
                </div>
                <span className="font-mono text-[10px] bg-black/20 px-2 py-0.5 rounded">
                  {data.passNumber || data.visitCode}
                </span>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="flex items-center space-x-4 border-b border-slate-100 pb-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 relative">
                    {photoSrc && !photoError ? (
                      <img
                        src={photoSrc}
                        alt={data.visitorName}
                        className="w-full h-full object-cover"
                        onError={() => setPhotoError(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-sky-100 text-sky-800 font-black text-sm">
                        {visitorInitials}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-base font-black text-slate-900">{data.visitorName}</div>
                    <div className="text-xs font-bold text-sky-700">{data.companyName || 'Individual Guest'}</div>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                      {data.visitorType || 'Visitor'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Host Employee:</span>
                    <span className="font-bold text-slate-800">{data.hostName} ({data.department})</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Factory Site:</span>
                    <span className="font-bold text-slate-800">{data.siteName}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Visit Status:</span>
                    <span className="font-bold text-slate-800">{data.visitStatus}</span>
                  </div>

                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Entry Time:</span>
                    <span className="font-bold text-slate-800">
                      {data.checkInTime ? new Date(data.checkInTime).toLocaleString() : 'Not checked in yet'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-3 text-center border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between px-4">
                <span>Secured by {data.organizationName || 'Bharat MFG'} VMS</span>
                <Link to="/login" className="text-sky-600 font-bold hover:underline">
                  Staff Login &rarr;
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
