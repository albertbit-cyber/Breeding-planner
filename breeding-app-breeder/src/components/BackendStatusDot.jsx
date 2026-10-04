import React from "react";
import { useTranslation } from "react-i18next";
import { useSharedBackend } from "../contexts/SharedBackendContext.jsx";

// The quiet production stand-in for SharedBackendBanner, which only renders in
// dev builds: a dot and a plain sentence, no diagnostics.
const DOT_CLASS = {
  connected: "bg-emerald-500",
  checking: "bg-neutral-300",
  disconnected: "bg-amber-500",
  unauthorized: "bg-amber-500",
  "config-error": "bg-neutral-400",
};

const LABELS = {
  connected: ["setup.connection.online", "Connected to your account."],
  checking: ["setup.connection.checking", "Checking the connection…"],
  disconnected: ["setup.connection.offline", "Can't reach your account right now."],
  unauthorized: ["setup.connection.signedOut", "Sign in again to reconnect your account."],
  "config-error": ["setup.connection.localOnly", "Working on this device only."],
};

export default function BackendStatusDot() {
  const { t } = useTranslation();
  const { snapshot } = useSharedBackend();
  const state = LABELS[snapshot?.state] ? snapshot.state : "checking";
  const [key, fallback] = LABELS[state];

  return (
    <div className="mb-4 flex items-center gap-2 text-xs text-neutral-500" role="status">
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[state]}`} aria-hidden="true" />
      <span>{t(key, { defaultValue: fallback })}</span>
    </div>
  );
}
