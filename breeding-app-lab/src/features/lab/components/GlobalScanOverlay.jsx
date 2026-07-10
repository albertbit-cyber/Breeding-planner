import React, { useCallback, useState } from "react";
import LabQrScanner from "./LabQrScanner.jsx";
import { createLabApiClient } from "../api/client";

/**
 * Full-screen scan action reachable from the bottom nav on every lab page.
 * Resolves the scanned sample's current order status and routes straight to
 * the next step the lab needs to do for it — intake if not yet received,
 * Result Entry if awaiting/undergoing testing, or the order record if the
 * order is already completed/cancelled — instead of making the tech pick
 * the right page first.
 */
export default function GlobalScanOverlay({ onClose }) {
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);

  const handleScan = useCallback(async (decoded) => {
    const normalized = String(decoded || "").trim();
    if (!normalized) return;
    setError("");
    setResolving(true);
    try {
      const api = createLabApiClient();
      const resolved = await api.resolveLabSampleByQrToken(normalized);
      const orderId = String(resolved?.testOrder?.id || "").trim();
      if (!orderId) throw new Error("Scanned code did not resolve to an order.");
      const status = String(resolved?.testOrder?.status || "").trim();

      if (status === "submitted") {
        window.location.hash = `/lab/sample-intake?token=${encodeURIComponent(normalized)}`;
      } else if (status === "received" || status === "in_progress") {
        window.location.hash = `/lab/result-entry?orderId=${encodeURIComponent(orderId)}`;
      } else {
        window.location.hash = `/lab/orders/${encodeURIComponent(orderId)}`;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resolve scanned code.");
      setResolving(false);
    }
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950/90 p-4">
      <div className="flex items-center justify-between text-white">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">ProHerper Lab</div>
          <div className="text-base font-semibold">Scan Sample QR Code</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto rounded-2xl bg-white p-3">
        {resolving ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            Looking up sample…
          </div>
        ) : (
          <>
            <p className="mb-2 text-sm text-neutral-600">
              Point the camera at the sample's QR label. The app figures out what stage it's at —
              intake, result entry, or a finished order — and takes you straight there.
            </p>
            <LabQrScanner onScan={handleScan} autoStart />
          </>
        )}
        {error ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
