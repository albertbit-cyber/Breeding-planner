import React, { useCallback, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A real dialog.
 *
 * The listing, store and contact overlays were plain divs: no `role`, no focus
 * trap, no Escape, no focus restore, no scroll lock. Backdrop click was the
 * only way out, and a keyboard user landed behind the overlay in the page they
 * could no longer see.
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "center",
  initialFocusRef,
}) {
  const { t } = useTranslation("marketplace");
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const focusTarget =
      initialFocusRef?.current ||
      panelRef.current?.querySelector(FOCUSABLE) ||
      panelRef.current;
    focusTarget?.focus?.();

    return () => {
      body.style.overflow = previousOverflow;
      // Put the reader back where they were, not at the top of the document.
      const restore = restoreRef.current;
      if (restore && typeof restore.focus === "function" && document.contains(restore)) {
        restore.focus();
      }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className={`mk-scrim mk-scrim--${variant}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={`mk-dialog mk-dialog--${size}`}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {variant === "sheet" ? <span className="mk-dialog__grabber" aria-hidden="true" /> : null}
        <header className="mk-dialog__head">
          <div>
            {title ? (
              <h2 id={titleId} className="mk-dialog__title">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descId} className="mk-dialog__desc">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="mk-btn mk-btn--quiet mk-btn--icon"
            onClick={onClose}
            aria-label={t("common.close", { defaultValue: "Close" })}
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="mk-dialog__body">{children}</div>
        {footer ? <footer className="mk-dialog__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
