import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSharedBackend } from "../contexts/SharedBackendContext.jsx";
import { backendMessageText } from "./backendMessageText.js";

const bannerTone = {
  checking: "border-sky-200 bg-sky-50 text-sky-800",
  connected: "border-emerald-200 bg-emerald-50 text-emerald-800",
  disconnected: "border-rose-200 bg-rose-50 text-rose-800",
  "config-error": "border-amber-200 bg-amber-50 text-amber-900",
  unauthorized: "border-amber-200 bg-amber-50 text-amber-900",
};

const bannerTitle = (t) => ({
  checking: t("auth:sharedBackend.banner.checking", { defaultValue: "Checking shared backend" }),
  connected: t("auth:sharedBackend.banner.connected", { defaultValue: "Connected to shared backend" }),
  disconnected: t("auth:sharedBackend.banner.disconnected", { defaultValue: "Backend unreachable - shared features disabled" }),
  "config-error": t("auth:sharedBackend.banner.configError", { defaultValue: "Backend configuration error" }),
  unauthorized: t("auth:sharedBackend.banner.unauthorized", { defaultValue: "Unauthorized session" }),
});

export default function SharedBackendBanner() {
  const { t } = useTranslation();
  const { snapshot, retry } = useSharedBackend();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const toneClass = bannerTone[snapshot.state] || bannerTone.checking;
  const titles = bannerTitle(t);
  const title = titles[snapshot.state] || titles.checking;
  const yes = t("auth:sharedBackend.banner.yes", { defaultValue: "yes" });
  const no = t("auth:sharedBackend.banner.no", { defaultValue: "no" });
  const diagnostics = useMemo(() => ({
    viteApiUrl: snapshot.config.rawUrl || t("auth:sharedBackend.banner.missing", { defaultValue: "(missing)" }),
    normalizedApiUrl: snapshot.baseUrl || t("auth:sharedBackend.banner.missing", { defaultValue: "(missing)" }),
    envLoaded: snapshot.envLoaded ? yes : no,
    configured: snapshot.configured ? yes : no,
    reachable: snapshot.reachable ? yes : no,
    backendModeEnabled: snapshot.backendModeEnabled ? yes : no,
    reason: snapshot.reason || t("auth:sharedBackend.banner.none", { defaultValue: "(none)" }),
    state: snapshot.state,
    authStatus: snapshot.authStatus,
    checkedAt: snapshot.checkedAt || t("auth:sharedBackend.banner.notCheckedYet", { defaultValue: "(not checked yet)" }),
    sharedMode: snapshot.backendModeEnabled
      ? t("auth:sharedBackend.banner.enabled", { defaultValue: "enabled" })
      : t("auth:sharedBackend.banner.blocked", { defaultValue: "blocked" }),
    activeStorageMode: snapshot.activeStorageMode,
    storageProviders: snapshot.storageProviders,
    warnings: snapshot.config.warnings,
  }), [snapshot, t, yes, no]);

  return (
    <div className={`border-b px-4 py-3 text-sm ${toneClass}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-xs opacity-90">{backendMessageText(t, snapshot.message) || t("auth:sharedBackend.banner.statusUpdated", { defaultValue: "Shared backend status updated." })}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg border border-current/25 bg-white/70 px-2.5 py-1 text-xs" onClick={retry}>
            {t("auth:sharedBackend.banner.retry", { defaultValue: "Retry" })}
          </button>
          <button type="button" className="rounded-lg border border-current/25 bg-white/70 px-2.5 py-1 text-xs" onClick={() => setShowDiagnostics((prev) => !prev)}>
            {showDiagnostics ? t("auth:sharedBackend.banner.hideDiagnostics", { defaultValue: "Hide Diagnostics" }) : t("auth:sharedBackend.banner.diagnostics", { defaultValue: "Diagnostics" })}
          </button>
        </div>
      </div>
      {showDiagnostics ? (
        <div className="mx-auto mt-3 max-w-7xl rounded-xl border border-current/20 bg-white/70 p-3 text-xs">
          <div><strong>{t("auth:sharedBackend.banner.viteApiUrl", { defaultValue: "VITE_API_URL:" })}</strong> {diagnostics.viteApiUrl}</div>
          <div><strong>{t("auth:sharedBackend.banner.normalizedApiBase", { defaultValue: "Normalized API base:" })}</strong> {diagnostics.normalizedApiUrl}</div>
          <div><strong>{t("auth:sharedBackend.banner.envLoaded", { defaultValue: "Env loaded:" })}</strong> {diagnostics.envLoaded}</div>
          <div><strong>{t("auth:sharedBackend.banner.configured", { defaultValue: "Configured:" })}</strong> {diagnostics.configured}</div>
          <div><strong>{t("auth:sharedBackend.banner.reachable", { defaultValue: "Reachable:" })}</strong> {diagnostics.reachable}</div>
          <div><strong>{t("auth:sharedBackend.banner.backendState", { defaultValue: "Backend state:" })}</strong> {diagnostics.state}</div>
          <div><strong>{t("auth:sharedBackend.banner.authStatus", { defaultValue: "Auth status:" })}</strong> {diagnostics.authStatus}</div>
          <div><strong>{t("auth:sharedBackend.banner.backendModeEnabled", { defaultValue: "Backend mode enabled:" })}</strong> {diagnostics.backendModeEnabled}</div>
          <div><strong>{t("auth:sharedBackend.banner.reason", { defaultValue: "Reason:" })}</strong> {diagnostics.reason}</div>
          <div><strong>{t("auth:sharedBackend.banner.lastCheck", { defaultValue: "Last check:" })}</strong> {diagnostics.checkedAt}</div>
          <div><strong>{t("auth:sharedBackend.banner.sharedMode", { defaultValue: "Shared mode:" })}</strong> {diagnostics.sharedMode}</div>
          <div><strong>{t("auth:sharedBackend.banner.activeStorageMode", { defaultValue: "Active storage mode:" })}</strong> {diagnostics.activeStorageMode}</div>
          <div><strong>{t("auth:sharedBackend.banner.storageProviders", { defaultValue: "Storage providers:" })}</strong> {`orders=${diagnostics.storageProviders.orders}, catalog=${diagnostics.storageProviders.catalog}, pricing=${diagnostics.storageProviders.pricing}, statuses=${diagnostics.storageProviders.statuses}, uiPreferences=${diagnostics.storageProviders.uiPreferences}`}</div>
          {Array.isArray(diagnostics.warnings) && diagnostics.warnings.length ? (
            <div><strong>{t("auth:sharedBackend.banner.warnings", { defaultValue: "Warnings:" })}</strong> {diagnostics.warnings.join(" | ")}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
