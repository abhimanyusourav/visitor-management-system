import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QrCode, X, AlertCircle } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

/**
 * Robustly extracts the pass token / number from decoded QR payload
 * Handles full URLs, relative paths, query params, hashes, trailing slashes, and JSON objects
 */
export function extractPassToken(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();

  // If payload is a JSON object string
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.qr_token) return String(parsed.qr_token).trim();
      if (parsed.token) return String(parsed.token).trim();
      if (parsed.qrToken) return String(parsed.qrToken).trim();
      if (parsed.passNumber) return String(parsed.passNumber).trim();
      if (parsed.pass_number) return String(parsed.pass_number).trim();
      if (parsed.visitCode) return String(parsed.visitCode).trim();
      if (parsed.visit_code) return String(parsed.visit_code).trim();
    } catch {
      // ignore json parse error and proceed
    }
  }

  // If decoded text contains standard verification URL /v/<token>
  if (text.includes('/v/')) {
    const afterV = text.substring(text.indexOf('/v/') + 3);
    // Strip query parameters (?key=val), hash fragments (#sec), and trailing slashes
    text = afterV.split('?')[0].split('#')[0].replace(/\/+$/, '');
  } else if (text.startsWith('http://') || text.startsWith('https://')) {
    // If other URL structure, extract the last valid path component
    try {
      const url = new URL(text);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        text = segments[segments.length - 1];
      }
    } catch {
      // fallback to original text
    }
  }

  return text.trim();
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose, onScanSuccess }) => {
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef<boolean>(false);
  const readerElementId = 'vms-qr-reader-region';

  useEffect(() => {
    let isMounted = true;
    hasScannedRef.current = false;

    if (isOpen) {
      setScanError(null);
      // Wait for modal DOM element to mount
      const timer = setTimeout(() => {
        const html5QrCode = new Html5Qrcode(readerElementId);
        scannerRef.current = html5QrCode;

        html5QrCode
          .start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => {
              if (isMounted && !hasScannedRef.current) {
                hasScannedRef.current = true;
                const token = extractPassToken(decodedText);

                // Stop camera before notifying parent to prevent camera lock
                html5QrCode
                  .stop()
                  .then(() => {
                    if (isMounted) onScanSuccess(token);
                  })
                  .catch(() => {
                    if (isMounted) onScanSuccess(token);
                  });
              }
            },
            () => {
              // Ignore standard frame scan errors
            }
          )
          .catch((err) => {
            console.warn('QR scanner start error:', err);
            if (isMounted) {
              setScanError('Unable to start camera for QR scanning. Please ensure camera permissions are allowed.');
            }
          });
      }, 250);

      return () => {
        isMounted = false;
        clearTimeout(timer);
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              scannerRef.current.stop().catch(() => {});
            }
          } catch {
            // silent catch
          }
        }
      };
    }
  }, [isOpen]);

  const handleClose = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
      } catch {
        // silent catch
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2 font-bold text-sm">
            <QrCode className="w-4 h-4 text-sky-400" />
            <span>Scan Visitor Gate Pass QR</span>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-white p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 mb-3 text-center">
            Align the visitor pass QR code inside the camera scanner frame.
          </div>

          <div
            id={readerElementId}
            className="w-full aspect-square bg-slate-950 rounded-xl overflow-hidden relative border border-slate-800"
          />

          {scanError && (
            <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={handleClose}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
