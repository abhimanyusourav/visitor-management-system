import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X, Download, ShieldCheck, Factory, Clock, User, Building, Car, AlertTriangle } from 'lucide-react';
import api from '../../services/api.js';
import { resolveImageUrl } from '../../utils/image.js';

interface VisitorPassModalProps {
  visitId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VisitorPassModal: React.FC<VisitorPassModalProps> = ({ visitId, isOpen, onClose }) => {
  const [passData, setPassData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [badgeFormat, setBadgeFormat] = useState<'A4' | 'STICKER'>('A4');
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    if (isOpen && visitId) {
      setLoading(true);
      setPhotoError(false);
      api.get(`/api/passes/${visitId}`)
        .then((res) => {
          if (res.data.success) {
            setPassData(res.data.data);
            setPhotoError(false);
          }
        })
        .catch((err) => {
          console.error('Failed to load pass details:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, visitId]);

  useEffect(() => {
    setPhotoError(false);
  }, [passData?.visitor_photo]);

  const handlePrint = async () => {
    if (passData?.id) {
      try {
        await api.post(`/api/passes/${passData.id}/reprint`);
      } catch (err) {
        // silent
      }
    }
    window.print();
  };

  if (!isOpen || !visitId) return null;

  const visitorInitials = passData?.visitor_name
    ? passData.visitor_name
        .split(' ')
        .filter(Boolean)
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VP';

  const photoSrc = resolveImageUrl(passData?.visitor_photo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      {/* Print Stylesheet injection */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-pass-area, #printable-pass-area * {
            visibility: visible;
          }
          #printable-pass-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 100vw;
            height: 100vh;
            background: white !important;
            color: black !important;
            padding: 20px;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 my-8">
        {/* Modal Controls Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center space-x-2 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>Factory Visitor Pass & Badge</span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="bg-slate-800 p-1 rounded-lg flex text-[11px] font-semibold">
              <button
                onClick={() => setBadgeFormat('A4')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  badgeFormat === 'A4' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Standard A4
              </button>
              <button
                onClick={() => setBadgeFormat('STICKER')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  badgeFormat === 'STICKER' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Thermal Sticker (4"x3")
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pass Render Area */}
        <div className="p-6 bg-slate-100/70">
          {loading ? (
            <div className="h-96 flex items-center justify-center text-slate-400 text-xs font-bold">
              Generating visitor pass...
            </div>
          ) : passData ? (
            <div
              id="printable-pass-area"
              className={`bg-white rounded-xl border border-slate-300 shadow-md p-6 mx-auto ${
                badgeFormat === 'STICKER' ? 'max-w-sm' : 'max-w-xl'
              }`}
            >
              {/* Badge Top Header */}
              <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                    {passData.organization_name}
                  </div>
                  <div className="text-lg font-black text-slate-950 flex items-center gap-1.5">
                    <Factory className="w-4 h-4 text-sky-700" />
                    {passData.site_name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">{passData.site_address}</div>
                </div>

                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-900 text-white">
                    {passData.visitor_type} PASS
                  </span>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    {passData.pass_number}
                  </div>
                </div>
              </div>

              {/* Main Badge Body */}
              <div className="grid grid-cols-3 gap-4 items-center">
                {/* Photo */}
                <div className="col-span-1 flex flex-col items-center">
                  <div className="w-28 h-28 rounded-lg overflow-hidden border-2 border-slate-300 bg-slate-100 shadow-inner flex items-center justify-center relative">
                    {photoSrc && !photoError ? (
                      <img
                        key={photoSrc}
                        src={photoSrc}
                        alt={passData.visitor_name}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                        onError={() => setPhotoError(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600">
                        <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-800 font-black text-base flex items-center justify-center shadow-sm">
                          {visitorInitials}
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                          Verified
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono mt-1">ID: {passData.id_number_masked || 'VERIFIED'}</span>
                </div>

                {/* Visitor Info */}
                <div className="col-span-2 space-y-1.5">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Visitor Name</div>
                    <div className="text-base font-extrabold text-slate-900 leading-tight">
                      {passData.visitor_name}
                    </div>
                    {passData.company_name && (
                      <div className="text-xs font-bold text-sky-800">
                        {passData.company_name}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Host</div>
                      <div className="font-semibold text-slate-800">
                        {passData.host_first_name} {passData.host_last_name}
                      </div>
                      <div className="text-[10px] text-slate-500">{passData.department_name}</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Entry Time</div>
                      <div className="font-semibold text-slate-800">
                        {passData.check_in_time
                          ? new Date(passData.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : passData.expected_time}
                      </div>
                      <div className="text-[10px] text-slate-500">{passData.expected_date}</div>
                    </div>
                  </div>

                  <div className="pt-1 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Purpose: </span>
                    <span className="font-medium text-slate-800 line-clamp-1">{passData.purpose}</span>
                  </div>
                </div>
              </div>

              {/* QR & Security Footer */}
              <div className="mt-4 pt-3 border-t-2 border-slate-200 flex items-center justify-between">
                <div className="flex-1 pr-3">
                  <div className="text-[10px] font-bold text-slate-900 uppercase flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    Plant Safety Rules
                  </div>
                  <p className="text-[9px] text-slate-600 leading-tight mt-0.5">
                    Wear safety helmet and shoes at all times. Pass must remain visibly displayed while inside the premises. Return to security upon departure.
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-center">
                  <div className="p-1 bg-white border border-slate-300 rounded shadow-sm">
                    <QRCodeSVG
                      value={passData.qrCodeUrl || `${window.location.origin}/v/${passData.qr_token}`}
                      size={badgeFormat === 'STICKER' ? 65 : 75}
                      level="M"
                    />
                  </div>
                  <span className="text-[8px] font-mono text-slate-500 mt-0.5 font-bold">
                    SCAN AT GATE
                  </span>
                </div>
              </div>

              {/* A4 Additional Sign-off Section */}
              {badgeFormat === 'A4' && (
                <div className="mt-4 pt-4 border-t border-dashed border-slate-300 grid grid-cols-2 gap-6 text-[10px] text-slate-500">
                  <div className="border-t border-slate-400 pt-1 text-center font-medium">
                    Host Employee Signature & Stamp
                  </div>
                  <div className="border-t border-slate-400 pt-1 text-center font-medium">
                    Security Gate Exit Officer Signature
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-rose-500 text-xs">Pass data not found</div>
          )}
        </div>
      </div>
    </div>
  );
};
