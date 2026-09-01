import React, { useMemo, useState } from "react";
import { useSharedBackend } from "../contexts/SharedBackendContext.jsx";

const bannerTone = {
  checking: "border-sky-200 bg-sky-50 text-sky-800",
  connected: "border-emerald-200 bg-emerald-50 text-emerald-800",
  disconnected: "border-rose-200 bg-rose-50 text-rose-800",
  "config-error": "border-amber-200 bg-amber-50 text-amber-900",
  unauthorized: "border-amber-200 bg-amber-50 text-amber-900",
};

const bannerTitle = {
  checking: "Checking shared backend",
  connected: "Connected to shared backend",
  disconnected: "Backend unreachable - shared features disabled",
  "config-error": "Backend configuration error",
  unauthorized: "Unauthorized session",
};

export default function SharedBackendBanner() {
  const { snapshot, retry } = useSharedBackend();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const toneClass = bannerTone[snapshot.state] || bannerTone.checking;
  const title = bannerTitle[snapshot.state] || bannerTitle.checking;
  const diagnostics = useMemo(() => ({
    viteApiUrl: snapshot.config.rawUrl || "(missing)",
    normalizedApiUrl: snapshot.baseUrl || "(missing)",
    envLoaded: snapshot.envLoaded ? "yes" : "no",
    configured: snapshot.configured ? "yes" : "no",
    reachable: snapshot.reachable ? "yes" : "no",
    backendModeEnabled: snapshot.backendModeEnabled ? "yes" : "no",
    reason: snapshot.reason || "(none)",
    state: snapshot.state,
    authStatus: snapshot.authStatus,
    checkedAt: snapshot.checkedAt || "(not checked yet)",
    sharedMode: snapshot.backendModeEnabled ? "enabled" : "blocked",
    activeStorageMode: snapshot.activeStorageMode,
    storageProviders: snapshot.storageProviders,
    warnings: snapshot.config.warnings,
  }), [snapshot]);

  return (
    <div className={`border-b px-4 py-3 text-sm ${toneClass}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-xs opacity-90">{snapshot.message || "Shared backend status updated."}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg border border-current/25 bg-white/70 px-2.5 py-1 text-xs" onClick={retry}>
            Retry
          </button>
          <button type="button" className="rounded-lg border border-current/25 bg-white/70 px-2.5 py-1 text-xs" onClick={() => setShowDiagnostics((prev) => !prev)}>
            {showDiagnostics ? "Hide Diagnostics" : "Diagnostics"}
          </button>
        </div>
      </div>
      {showDiagnostics ? (
        <div className="mx-auto mt-3 max-w-7xl rounded-xl border border-current/20 bg-white/70 p-3 text-xs">
          <div><strong>VITE_API_URL:</strong> {diagnostics.viteApiUrl}</div>
          <div><strong>Normalized API base:</strong> {diagnostics.normalizedApiUrl}</div>
          <div><strong>Env loaded:</strong> {diagnostics.envLoaded}</div>
          <div><strong>Configured:</strong> {diagnostics.configured}</div>
          <div><strong>Reachable:</strong> {diagnostics.reachable}</div>
          <div><strong>Backend state:</strong> {diagnostics.state}</div>
          <div><strong>Auth status:</strong> {diagnostics.authStatus}</div>
          <div><strong>Backend mode enabled:</strong> {diagnostics.backendModeEnabled}</div>
          <div><strong>Reason:</strong> {diagnostics.reason}</div>
          <div><strong>Last check:</strong> {diagnostics.checkedAt}</div>
          <div><strong>Shared mode:</strong> {diagnostics.sharedMode}</div>
          <div><strong>Active storage mode:</strong> {diagnostics.activeStorageMode}</div>
          <div><strong>Storage providers:</strong> orders={diagnostics.storageProviders.orders}, catalog={diagnostics.storageProviders.catalog}, pricing={diagnostics.storageProviders.pricing}, statuses={diagnostics.storageProviders.statuses}, uiPreferences={diagnostics.storageProviders.uiPreferences}</div>
          {Array.isArray(diagnostics.warnings) && diagnostics.warnings.length ? (
            <div><strong>Warnings:</strong> {diagnostics.warnings.join(" | ")}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
