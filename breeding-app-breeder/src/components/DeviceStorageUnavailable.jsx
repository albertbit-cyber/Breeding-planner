import React from "react";
import i18n from "../i18n/index.js";

// Shown instead of the app when the collection has moved to IndexedDB but IndexedDB will not
// open. Starting anyway would show the demo collection, and a sync from that state could
// overwrite the keeper's real data on the server, so the only safe action is to try again.
export default function DeviceStorageUnavailable({ detail }) {
  const t = (key, defaultValue) => i18n.t(key, { defaultValue });
  return (
    <main
      role="alert"
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--sk-bg, #f6f5f1)", color: "var(--sk-text, #1d211c)" }}
    >
      <div className="max-w-md w-full rounded-2xl border p-6 space-y-3" style={{ borderColor: "var(--sk-border, #d8d6cf)" }}>
        <h1 className="text-lg font-semibold">
          {t("storage.unavailable.title", "Your collection could not be opened")}
        </h1>
        <p className="text-sm">
          {t(
            "storage.unavailable.body",
            "Serpentora could not open its storage on this device. Your data has not been changed. Close the app completely and open it again. If this keeps happening, restart the device.",
          )}
        </p>
        {detail ? <p className="text-xs opacity-70 break-words">{detail}</p> : null}
        <button
          type="button"
          className="px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: "var(--sk-accent, #3f6b2a)" }}
          onClick={() => window.location.reload()}
        >
          {t("storage.unavailable.retry", "Try again")}
        </button>
      </div>
    </main>
  );
}
