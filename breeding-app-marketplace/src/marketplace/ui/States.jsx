import React from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import Icon from "./Icon";

/**
 * Loading, empty, and error -- the three states the marketplace had none of.
 *
 * The grid used to render empty while the first request was in flight, so the
 * first thing a visitor read was "No listings found"; failures became a toast
 * that erased itself after four seconds and left the page looking merely empty.
 */

/** Matches the card's geometry so the grid does not jump when data lands. */
export function ListingSkeletonGrid({ count = 8 }) {
  const { t } = useTranslation("marketplace");
  return (
    <div className="mk-grid" aria-busy="true" aria-live="polite">
      <span className="mk-sr-only">{t("browse.loading", { defaultValue: "Loading animals" })}</span>
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="mk-card mk-listing mk-listing--skeleton" aria-hidden="true">
          <div className="mk-listing__photo mk-skel" />
          <div className="mk-listing__body">
            <span className="mk-skel mk-skel--line" style={{ width: "82%" }} />
            <span className="mk-skel mk-skel--chip" style={{ width: "46%" }} />
            <span className="mk-skel mk-skel--line" style={{ width: "60%" }} />
            <div className="mk-listing__foot">
              <span className="mk-skel mk-skel--line" style={{ width: "34%", height: 18 }} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Spinner({ label }) {
  const { t } = useTranslation("marketplace");
  return (
    <div className="mk-spinner" role="status">
      <Icon name="spinner" size={20} className="mk-spin" />
      <span>{label || t("common.loading", { defaultValue: "Loading…" })}</span>
    </div>
  );
}

/**
 * An error names what failed and what to do about it, and it stays on screen
 * until the reader deals with it.
 */
export function ErrorPanel({ error, onRetry, title }) {
  const { t } = useTranslation("marketplace");
  const message =
    (error && (error.message || String(error))) ||
    t("errors.generic", { defaultValue: "Something went wrong." });
  return (
    <div className="mk-panel mk-panel--error" role="alert">
      <Icon name="alert" size={20} />
      <div className="mk-panel__body">
        <b>{title || t("errors.title", { defaultValue: "That didn’t load" })}</b>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" icon="refresh" onClick={onRetry}>
          {t("common.retry", { defaultValue: "Try again" })}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon = "search", title, body, action }) {
  return (
    <div className="mk-empty">
      <span className="mk-empty__icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export default ErrorPanel;
