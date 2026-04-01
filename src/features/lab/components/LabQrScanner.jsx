import React, { useCallback, useEffect, useRef, useState } from "react";

const SCANNER_ELEMENT_ID = "lab-intake-qr-scanner-root";

/**
 * Inline camera QR scanner for the lab intake flow.
 * Shows a toggle button; when active, renders a live camera view via html5-qrcode.
 * On a successful scan, calls onScan(decodedText) and stops automatically.
 */
export default function LabQrScanner({ onScan }) {
  const [isActive, setIsActive] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const qrModuleRef = useRef(null);
  const scannerRef = useRef(null);

  const teardown = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    scannerRef.current = null;
    const tasks = [];
    if (typeof instance.stop === "function") tasks.push(instance.stop().catch(() => {}));
    if (typeof instance.clear === "function") tasks.push(instance.clear().catch(() => {}));
    if (typeof instance.close === "function") tasks.push(instance.close().catch(() => {}));
    if (tasks.length) await Promise.allSettled(tasks);
  }, []);

  const ensureQrModule = useCallback(async () => {
    if (qrModuleRef.current) return qrModuleRef.current;
    let imported = null;
    try {
      imported = await import("html5-qrcode");
    } catch {
      return null;
    }
    const normalized = {
      Html5Qrcode: imported?.Html5Qrcode ?? imported?.default?.Html5Qrcode ?? window.Html5Qrcode ?? null,
      Html5QrcodeScanner: imported?.Html5QrcodeScanner ?? imported?.default?.Html5QrcodeScanner ?? window.Html5QrcodeScanner ?? null,
    };
    if (!normalized.Html5Qrcode && !normalized.Html5QrcodeScanner) return null;
    qrModuleRef.current = normalized;
    return normalized;
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!isActive) {
      teardown().catch(() => {});
      return () => {
        isMounted = false;
        teardown().catch(() => {});
      };
    }

    setScannerError("");

    const startScanner = async () => {
      await teardown().catch(() => {});

      const module = await ensureQrModule();
      if (!isMounted) return;
      if (!module) {
        setScannerError("QR scanner library failed to load.");
        setIsActive(false);
        return;
      }

      const { Html5QrcodeScanner, Html5Qrcode } = module;

      try {
        if (Html5QrcodeScanner) {
          const instance = new Html5QrcodeScanner(
            SCANNER_ELEMENT_ID,
            { fps: 10, qrbox: 250 },
            /* verbose */ false
          );
          scannerRef.current = instance;
          instance.render(
            (decoded) => {
              if (!isMounted) return;
              teardown().catch(() => {});
              setIsActive(false);
              onScan?.(decoded);
            },
            () => {}
          );
        } else if (Html5Qrcode) {
          const instance = new Html5Qrcode(SCANNER_ELEMENT_ID);
          scannerRef.current = instance;
          await instance.start(
            { facingMode: { ideal: "environment" } },
            { fps: 10, qrbox: 250 },
            (decoded) => {
              if (!isMounted) return;
              teardown().catch(() => {});
              setIsActive(false);
              onScan?.(decoded);
            },
            () => {}
          );
        } else {
          throw new Error("html5-qrcode module unavailable");
        }
      } catch {
        if (isMounted) {
          setScannerError("Unable to start camera. Check camera permissions and try again.");
          setIsActive(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      teardown().catch(() => {});
    };
  }, [isActive, ensureQrModule, onScan, teardown]);

  const handleStop = () => {
    setIsActive(false);
    teardown().catch(() => {});
  };

  return (
    <div className="space-y-2">
      {!isActive ? (
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          onClick={() => { setScannerError(""); setIsActive(true); }}
        >
          <CameraIcon />
          Scan QR Code with Camera
        </button>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-300 bg-neutral-50">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
            <div className="text-xs font-medium text-neutral-700">Camera active — point at QR code label</div>
            <button
              type="button"
              className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600"
              onClick={handleStop}
            >
              Stop
            </button>
          </div>
          <div id={SCANNER_ELEMENT_ID} className="p-2" />
        </div>
      )}
      {scannerError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {scannerError}
        </div>
      ) : null}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
