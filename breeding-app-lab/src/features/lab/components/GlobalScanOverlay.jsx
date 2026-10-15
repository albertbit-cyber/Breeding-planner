import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import LabQrScanner from "./LabQrScanner.jsx";
import { createLabApiClient } from "../api/client";
import { canResolveLabQrInput } from "../utils/qrLookupInput";

const navigate = (hash) => {
  if (typeof window !== "undefined") window.location.hash = hash;
};

const resultEntryHash = (resolved) => {
  const orderId = String(resolved?.testOrder?.id || "").trim();
  const animalId = String(resolved?.animal?.id || "").trim();
  const query = new URLSearchParams({ orderId });
  if (animalId) query.set("animalId", animalId);
  return `/lab/result-entry?${query.toString()}`;
};

/**
 * The scan button on every lab page. Two scans cover a sample's whole life
 * at the bench:
 *
 *   1. A tube that just arrived (order still "submitted") is received and the
 *      order moves into testing in that one scan. No form; the card confirms
 *      what was scanned and offers "problem with sample" for the rare tube
 *      that must wait.
 *   2. A tube already in testing opens the result sheet on that snake.
 *
 * A finished or cancelled order opens its record.
 */
export default function GlobalScanOverlay({ onClose }) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("scanning"); // scanning | resolving | received | holding
  const [received, setReceived] = useState(null);
  const [scannerKey, setScannerKey] = useState(0);
  // A handheld barcode scanner types the code and presses Enter; a tech with a
  // smudged label types the sample id. Both land here.
  const [typed, setTyped] = useState("");

  const handleScan = useCallback(async (decoded) => {
    const normalized = String(decoded || "").trim();
    if (!normalized) return;
    setError("");
    setPhase("resolving");
    try {
      const api = createLabApiClient();
      const resolved = await api.receiveSampleAndStartTesting(normalized);
      const orderId = String(resolved?.testOrder?.id || "").trim();
      if (!orderId) {
        throw new Error(t("lab.scan.noOrder", { defaultValue: "Scanned code did not resolve to an order." }));
      }
      const status = String(resolved?.testOrder?.status || "").trim();

      if (resolved.changed) {
        setReceived(resolved);
        setPhase("received");
        return;
      }
      if (status === "received" || status === "in_progress") {
        navigate(resultEntryHash(resolved));
      } else {
        navigate(`/lab/orders/${encodeURIComponent(orderId)}`);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("lab.scan.resolveFailed", { defaultValue: "Unable to resolve scanned code." })
      );
      setPhase("scanning");
      setScannerKey((value) => value + 1);
    }
  }, [onClose, t]);

  const scanNext = () => {
    setReceived(null);
    setError("");
    setTyped("");
    setPhase("scanning");
    setScannerKey((value) => value + 1);
  };

  const submitTyped = (event) => {
    event?.preventDefault?.();
    const normalized = String(typed || "").trim();
    if (!canResolveLabQrInput(normalized)) return;
    handleScan(normalized);
  };

  const holdSample = async () => {
    const orderId = String(received?.testOrder?.id || "").trim();
    if (!orderId) return;
    setPhase("holding");
    setError("");
    try {
      const api = createLabApiClient();
      await api.holdSampleAtReceived(orderId);
      navigate(`/lab/orders/${encodeURIComponent(orderId)}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lab.scan.holdFailed", { defaultValue: "Could not hold the sample." }));
      setPhase("received");
    }
  };

  const openOrder = () => {
    const orderId = String(received?.testOrder?.id || "").trim();
    if (!orderId) return;
    navigate(`/lab/orders/${encodeURIComponent(orderId)}`);
    onClose();
  };

  const requestedTests = Array.isArray(received?.requestedTests) ? received.requestedTests : [];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950/90 p-4">
      <div className="flex items-center justify-between text-white">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            {t("lab.shell.laboratory", { defaultValue: "Laboratory" })}
          </div>
          <div className="text-base font-semibold">{t("lab.scan.title", { defaultValue: "Scan Sample QR Code" })}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
        >
          {t("lab.scan.close", { defaultValue: "Close" })}
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto rounded-2xl bg-white p-3">
        {phase === "resolving" ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            {t("lab.scan.lookingUp", { defaultValue: "Looking up sample…" })}
          </div>
        ) : null}

        {phase === "scanning" ? (
          <>
            <p className="mb-2 text-sm text-neutral-600">
              {t("lab.scan.helpTwoScans", {
                defaultValue:
                  "Scan a tube when it arrives and it goes straight into testing. Scan it again when the test is done to enter the results.",
              })}
            </p>
            <LabQrScanner key={scannerKey} onScan={handleScan} autoStart />
            <form className="mt-3" onSubmit={submitTyped}>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="text-xs text-neutral-500">{t("lab.intake.orManual", { defaultValue: "or enter manually" })}</span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm"
                  placeholder={t("lab.intake.tokenPlaceholder", {
                    defaultValue: "Paste 64-char QR token, sample ID, or full QR payload JSON",
                  })}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  aria-label={t("lab.intake.lookupTitle", { defaultValue: "QR Token Lookup" })}
                />
                <button
                  type="submit"
                  disabled={!canResolveLabQrInput(String(typed || "").trim())}
                  className="shrink-0 rounded-xl border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("lab.intake.resolve", { defaultValue: "Resolve Token" })}
                </button>
              </div>
            </form>
          </>
        ) : null}

        {phase === "received" || phase === "holding" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {t("lab.scan.receivedTitle", { defaultValue: "Sample received. Testing started." })}
              </div>
              <div className="mt-2 text-lg font-semibold text-neutral-900">
                {received?.animal?.name || t("lab.intake.unknownAnimal", { defaultValue: "Unknown" })}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-neutral-700">
                <dt className="text-neutral-500">{t("lab.intake.sampleId", { defaultValue: "Sample ID" })}</dt>
                <dd className="font-mono text-xs"><bdi>{received?.sample?.id || "-"}</bdi></dd>
                <dt className="text-neutral-500">{t("lab.common.colOrder", { defaultValue: "Order" })}</dt>
                <dd><bdi>{received?.testOrder?.orderNumber || received?.testOrder?.id}</bdi></dd>
                <dt className="text-neutral-500">{t("lab.intake.breeder", { defaultValue: "Breeder" })}</dt>
                <dd>{received?.breeder?.displayName || received?.breeder?.userId || "-"}</dd>
                <dt className="text-neutral-500">{t("lab.common.requestedTests", { defaultValue: "Requested Tests" })}</dt>
                <dd>{requestedTests.join(", ") || "-"}</dd>
              </dl>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={scanNext}
                disabled={phase === "holding"}
                className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("lab.scan.scanNext", { defaultValue: "Scan next sample" })}
              </button>
              <button
                type="button"
                onClick={openOrder}
                disabled={phase === "holding"}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
              >
                {t("lab.intake.openFullOrder", { defaultValue: "Open Full Order Details" })}
              </button>
              <button
                type="button"
                onClick={holdSample}
                disabled={phase === "holding"}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 disabled:opacity-50"
              >
                {phase === "holding"
                  ? t("lab.scan.holding", { defaultValue: "Holding…" })
                  : t("lab.scan.problem", { defaultValue: "Problem with sample" })}
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              {t("lab.scan.problemHelp", {
                defaultValue:
                  "Problem with sample keeps the order at Sample Received so nothing is tested until you have followed up with the breeder.",
              })}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
