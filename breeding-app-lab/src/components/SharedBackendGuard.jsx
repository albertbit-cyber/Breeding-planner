import React from "react";
import { useTranslation } from "react-i18next";
import { useSharedBackend } from "../contexts/SharedBackendContext.jsx";
import { backendMessageText } from "./backendMessageText.js";

const guardTone = {
  checking: "border-sky-200 bg-sky-50 text-sky-800",
  connected: "border-emerald-200 bg-emerald-50 text-emerald-800",
  disconnected: "border-rose-200 bg-rose-50 text-rose-800",
  "config-error": "border-amber-200 bg-amber-50 text-amber-900",
  unauthorized: "border-amber-200 bg-amber-50 text-amber-900",
};

export default function SharedBackendGuard({
  featureName,
  children,
  fallback = null,
}) {
  const { t } = useTranslation();
  const { snapshot, retry, sharedFeaturesEnabled } = useSharedBackend();

  if (sharedFeaturesEnabled) {
    return children;
  }

  if (fallback) {
    return fallback;
  }

  return (
    <div className={`rounded-2xl border p-4 text-sm ${guardTone[snapshot.state] || guardTone.checking}`}>
      <div className="font-semibold">
        {t("auth:sharedBackend.featureBlocked", {
          defaultValue: "{{feature}} is blocked",
          feature: featureName || t("auth:sharedBackend.thisFeature", { defaultValue: "This feature" }),
        })}
      </div>
      <div className="mt-1">
        {backendMessageText(t, snapshot.message) ||
          t("auth:sharedBackend.accessRequired", { defaultValue: "Shared backend access is required for this feature." })}
      </div>
      <button type="button" className="mt-3 rounded-lg border border-current/25 bg-white/70 px-3 py-1.5 text-xs" onClick={retry}>
        {t("auth:sharedBackend.retryCheck", { defaultValue: "Retry backend check" })}
      </button>
    </div>
  );
}

