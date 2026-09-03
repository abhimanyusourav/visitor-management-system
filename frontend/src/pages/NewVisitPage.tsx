import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Camera,
  Upload,
  Car,
  User,
  Building,
  Phone,
  Mail,
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Check,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore.js';
import api from '../services/api.js';
import { Employee, VisitorType } from '../types/index.js';
import { WebcamModal } from '../components/camera/WebcamModal.js';
import { VisitorPassModal } from '../components/pass/VisitorPassModal.js';
import { resolveImageUrl } from '../utils/image.js';
import { SearchableEmployeeSelect } from '../components/common/SearchableEmployeeSelect.js';

export const NewVisitPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeSite } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  // Form State
  const [mobileNumber, setMobileNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [visitorType, setVisitorType] = useState<VisitorType>('Guest');
  const [idType, setIdType] = useState('Aadhaar');
  const [idNumber, setIdNumber] = useState('');
  
  const [hostEmployeeId, setHostEmployeeId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [accompanyingCount, setAccompanyingCount] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [vehicleType, setVehicleType] = useState('FOUR_WHEELER');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [autoCheckIn, setAutoCheckIn] = useState(true);

  const [isExistingProfile, setIsExistingProfile] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdVisitId, setCreatedVisitId] = useState<string | null>(null);
  const [createdQrToken, setCreatedQrToken] = useState<string | null>(null);

  // Fetch host employees
  useEffect(() => {
    api.get('/api/employees')
      .then((res) => {
        if (res.data.success) {
          setEmployees(res.data.data);
        }
      })
      .catch((err) => console.error('Failed to load employees:', err));
  }, [activeSite?.id]);

  // Auto-Lookup Visitor Profile on Phone Input
  const handlePhoneChange = async (val: string) => {
    setMobileNumber(val);
    if (val.trim().length >= 10) {
      try {
        const res = await api.post('/api/visitors/lookup', { mobile_number: val.trim() });
        if (res.data.success && res.data.data) {
          const v = res.data.data;
          setFirstName(v.first_name || '');
          setLastName(v.last_name || '');
          setEmail(v.email || '');
          setCompanyName(v.company_name || '');
          setDesignation(v.designation || '');
          if (v.default_visitor_type) setVisitorType(v.default_visitor_type);
          if (v.photo_url) setPhotoBase64(v.photo_url);
          setIsExistingProfile(true);
          setLookupMessage(`Existing profile found: ${v.full_name} (${v.company_name || 'Individual'})`);
        } else {
          setIsExistingProfile(false);
          setLookupMessage(null);
        }
      } catch (err) {
        setIsExistingProfile(false);
      }
    } else {
      setIsExistingProfile(false);
      setLookupMessage(null);
    }
  };

  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoBase64(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hostEmployeeId) {
      setError('Please select a host employee.');
      return;
    }

    if (!purpose.trim()) {
      setError('Please enter the purpose of visit.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        email: email || undefined,
        mobile_number: mobileNumber,
        company_name: companyName || undefined,
        designation: designation || undefined,
        visitor_type: visitorType,
        id_type: idType,
        id_number: idNumber || undefined,
        photo_base64: photoBase64 && photoBase64.startsWith('data:image') ? photoBase64 : undefined,
        host_employee_id: hostEmployeeId,
        purpose,
        accompanying_count: Number(accompanyingCount),
        remarks: remarks || undefined,
        vehicle_type: vehicleNumber ? vehicleType : undefined,
        vehicle_number: vehicleNumber ? vehicleNumber.trim().toUpperCase() : undefined,
        auto_check_in: autoCheckIn,
      };

      const res = await api.post('/api/visits', payload);
      if (res.data.success) {
        setCreatedVisitId(res.data.data.id);
        setCreatedQrToken(res.data.data.qrToken || res.data.data.qr_token || null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to register visit. Please verify form data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-sky-600" />
            <span>Walk-In Visitor Registration</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Register arriving visitor and generate factory gate entry pass for <span className="font-bold text-slate-700">{activeSite?.name}</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Visitor Identity & Contact */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs flex items-center justify-center font-bold">1</span>
              <span>Visitor Profile Information</span>
            </div>
            {isExistingProfile && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                Profile Auto-Filled
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. First Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Rahul"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            {/* 2. Last Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Kumar"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            {/* 3. Phone Number with Auto-Lookup */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mobile Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  value={mobileNumber}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+91-9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
                />
              </div>
              {lookupMessage && (
                <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                  {lookupMessage}
                </div>
              )}
            </div>

            {/* 4. Company / Organization */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Company / Organization
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ABC Pvt Ltd / Self"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            {/* 5. Email Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="visitor@company.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            {/* 6. Visitor Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Visitor Category *
              </label>
              <select
                value={visitorType}
                onChange={(e) => setVisitorType(e.target.value as VisitorType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              >
                <option value="Guest">Guest / General</option>
                <option value="Customer">Customer / Client</option>
                <option value="Vendor">Vendor / Supplier</option>
                <option value="Contractor">Contractor / Labor</option>
                <option value="Service Engineer">Service / Maintenance Engineer</option>
                <option value="Interview Candidate">Interview Candidate</option>
                <option value="Delivery">Delivery / Logistics</option>
                <option value="Government Official">Government Official</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Photo Capture Section */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-16 h-16 rounded-xl border border-slate-300 bg-slate-100 overflow-hidden flex items-center justify-center relative shadow-inner">
                {photoBase64 ? (
                  <img
                    src={resolveImageUrl(photoBase64)}
                    alt="Visitor"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Visitor Photograph</span>
                  {photoBase64 && (
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Ready
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  {photoBase64 ? 'Photo attached to visitor profile' : 'Capture live photo with webcam or upload from device'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleDirectFileUpload}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Upload File</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Camera className="w-3.5 h-3.5 text-sky-400" />
                <span>{photoBase64 ? 'Retake Photo' : 'Camera Capture'}</span>
              </button>

              {photoBase64 && (
                <button
                  type="button"
                  onClick={() => setPhotoBase64(null)}
                  title="Remove Photo"
                  className="p-2 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Visit & Host Details */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3 font-bold text-sm text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs flex items-center justify-center font-bold">2</span>
            <span>Visit Purpose & Host Employee</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <SearchableEmployeeSelect
                employees={employees}
                value={hostEmployeeId}
                onChange={setHostEmployeeId}
                required
                label="Host Employee *"
                placeholder="Type name, code or dept..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Purpose of Visit *
              </label>
              <input
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Meeting, Machine Maintenance, Delivery..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Accompanying Persons Count
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={accompanyingCount}
                onChange={(e) => setAccompanyingCount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Vehicle Information (Optional) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 font-bold text-sm text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs flex items-center justify-center font-bold">3</span>
            <span>Vehicle Details (Optional)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Vehicle Type
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              >
                <option value="FOUR_WHEELER">4-Wheeler Car / SUV</option>
                <option value="TWO_WHEELER">2-Wheeler Motorcycle / Scooter</option>
                <option value="COMMERCIAL">Commercial Van / Pickup</option>
                <option value="TRUCK">Heavy Truck / Trailer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Vehicle Number
              </label>
              <div className="relative">
                <Car className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="UP-14-EA-1234"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase font-mono focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCheckIn}
              onChange={(e) => setAutoCheckIn(e.target.checked)}
              className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
            />
            <span className="text-xs font-bold text-slate-800">
              Immediately Check In Visitor at Gate (Set status = CHECKED_IN)
            </span>
          </label>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => navigate('/visits')}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Registering Visit...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Register & Generate Gate Pass</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Webcam Modal */}
      <WebcamModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(photo) => {
          setPhotoBase64(photo);
        }}
      />

      {/* Visitor Pass Modal (opens automatically after registration) */}
      <VisitorPassModal
        visitId={createdVisitId}
        initialQrToken={createdQrToken}
        isOpen={Boolean(createdVisitId)}
        onClose={() => {
          setCreatedVisitId(null);
          setCreatedQrToken(null);
          navigate('/visits/currently-inside');
        }}
      />
    </div>
  );
};
