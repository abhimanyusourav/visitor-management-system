import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, ShieldCheck, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [email, setEmail] = useState('superadmin@vms.local');
  const [password, setPassword] = useState('Password@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/api/auth/login', { email, password });
      if (res.data.success) {
        const { user, token } = res.data.data;
        setAuth(user, token);
        navigate('/dashboard');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Login failed. Please check credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password@123');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-sky-600 to-indigo-600 text-white shadow-xl shadow-sky-500/20 mb-3">
            <Factory className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            AKRITI JEWELCRAFTZ
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Visitor Management System • Baghpat & Basi Branches
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span>Signing In...</span>
              ) : (
                <>
                  <span>Sign In to Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Role Switchers */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 text-center">
              Instant Demo Role Switchers
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickLogin('superadmin@vms.local')}
                className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-300 text-left border border-slate-800 truncate"
              >
                👑 Super Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@vms.local')}
                className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-300 text-left border border-slate-800 truncate"
              >
                🏢 Org Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('siteadmin@vms.local')}
                className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-300 text-left border border-slate-800 truncate"
              >
                🏭 Site Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('security@vms.local')}
                className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-300 text-left border border-slate-800 truncate"
              >
                🛡️ Gate Security
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('reception@vms.local')}
                className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-300 text-left border border-slate-800 truncate"
              >
                🛎️ Front Desk
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('employee@vms.local')}
                className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-300 text-left border border-slate-800 truncate"
              >
                👤 Host Employee
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-[11px] text-slate-500">
          Akriti JewelCraftz Pvt Ltd • Visitor Management System
        </div>
      </div>
    </div>
  );
};
