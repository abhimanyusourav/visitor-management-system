import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Calendar, Clock, User, Phone, Mail, Building, Check, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';
import { Employee, VisitorType } from '../types/index.js';
import { VisitorPassModal } from '../components/pass/VisitorPassModal.js';

export const PreRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, activeSite } = useAuthStore();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [visitorType, setVisitorType] = useState<VisitorType>('Guest');
  
  const [hostEmployeeId, setHostEmployeeId] = useState('');
  const [expectedDate, setExpectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedTime, setExpectedTime] = useState('11:00 AM');
  const [purpose, setPurpose] = useState('Scheduled Meeting');
  const [accompanyingCount, setAccompanyingCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdVisitId, setCreatedVisitId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/employees')
      .then((res) => {
        if (res.data.success) {
          setEmployees(res.data.data);
          // Default to logged-in user if they are an employee
          const myEmp = res.data.data.find((e: Employee) => e.user_id === user?.id);
          if (myEmp) {
            setHostEmployeeId(myEmp.id);
          } else if (res.data.data.length > 0) {
            setHostEmployeeId(res.data.data[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load employees:', err));
  }, [user, activeSite?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        email: email || undefined,
        mobile_number: mobileNumber,
        company_name: companyName || undefined,
        visitor_type: visitorType,
        host_employee_id: hostEmployeeId,
        purpose,
        expected_date: expectedDate,
        expected_time: expectedTime,
        accompanying_count: Number(accompanyingCount),
        auto_check_in: false,
      };

      const res = await api.post('/api/visits', payload);
      if (res.data.success) {
        setCreatedVisitId(res.data.data.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to pre-register visit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-600" />
          <span>Pre-Register Expected Visitor</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Schedule upcoming guest arrival and send pre-approved QR pass ahead of time
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 font-bold text-sm text-slate-900">
            Expected Visitor Information
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Vikram"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Singh"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number *</label>
              <input
                type="tel"
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="+91-9876543210"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="visitor@company.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Company / Organization</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Tech Solutions Ltd"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Visitor Category *</label>
              <select
                value={visitorType}
                onChange={(e) => setVisitorType(e.target.value as VisitorType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              >
                <option value="Guest">Guest / Client</option>
                <option value="Vendor">Vendor / Supplier</option>
                <option value="Contractor">Contractor</option>
                <option value="Service Engineer">Service Engineer</option>
                <option value="Interview Candidate">Interview Candidate</option>
                <option value="Government Official">Government Official</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 font-bold text-sm text-slate-900">
            Schedule & Host Assignment
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expected Date *</label>
              <input
                type="date"
                required
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expected Time *</label>
              <input
                type="text"
                required
                value={expectedTime}
                onChange={(e) => setExpectedTime(e.target.value)}
                placeholder="10:30 AM"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Host Employee *</label>
              <select
                required
                value={hostEmployeeId}
                onChange={(e) => setHostEmployeeId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.department_name || emp.department_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Purpose of Visit *</label>
              <input
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Quarterly Review, Inspection, Meeting..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/visits')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Schedule Pre-Registration</span>
          </button>
        </div>
      </form>

      <VisitorPassModal
        visitId={createdVisitId}
        isOpen={Boolean(createdVisitId)}
        onClose={() => {
          setCreatedVisitId(null);
          navigate('/visits');
        }}
      />
    </div>
  );
};
