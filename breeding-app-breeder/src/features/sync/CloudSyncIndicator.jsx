import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { help } from "../help/help";

/**
 * The visible half of a failed cloud save: a pill that stays until a save
 * succeeds, and one toast the first time it happens. A failure that repeats on
 * every change does not toast again; the pill already says it.
 */
export function NotSyncedPill({ failure, onOpen, className = "" }) {
  const { t } = useTranslation();
  if (!failure) return null;
  return (
    <button
      {...help('sync-not-synced')}
      type="button"
      onClick={onOpen}
      title={failure.reason}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900 ${className}`}
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      <span>{t("sync.notSynced", { defaultValue: "Not synced" })}</span>
    </button>
  );
}

export function NotSyncedToast({ failure }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const shownFor = useRef(null);

  useEffect(() => {
    if (!failure) {
      shownFor.current = null;
      setVisible(false);
      return;
    }
    if (shownFor.current) return;
    shownFor.current = failure;
    setVisible(true);
  }, [failure]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible || !failure || typeof document === "undefined") return null;
  // Portalled to the body: the app header sits inside a transformed ancestor, which would
  // otherwise make "fixed" relative to the header instead of the screen.
  return createPortal((
    <div
      {...help('sync-not-synced-toast')}
      className="fixed rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm shadow-xl"
      // Inline so it sits clear of the phone's bottom navigation whatever the utility build holds.
      style={{
        bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
        // Bottom-right on a wide screen, so it never covers a dialog's own notice;
        // on a phone the same rule leaves it centred.
        right: "max(4vw, 1.5rem)",
        width: "min(92vw, 26rem)",
        // Under dialogs (10010+): it reports background sync and must not cover a confirm screen.
        zIndex: 10005,
      }}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-amber-900">{t("sync.notSyncedTitle", { defaultValue: "Not synced to the cloud" })}</div>
          <div className="mt-0.5 text-neutral-700">{failure.reason}</div>
        </div>
        <button
          {...help('sync-toast-close')}
          type="button"
          className="shrink-0 rounded-md px-1.5 text-neutral-500"
          aria-label={t("common.close", { defaultValue: "Close" })}
          onClick={() => setVisible(false)}
        >
          ×
        </button>
      </div>
    </div>
  ), document.body);
}
