import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageMenu from "./LanguageMenu";
import SharedBackendBanner from "../../components/SharedBackendBanner";
import { useSharedBackend } from "../../contexts/SharedBackendContext.jsx";
import { conversations as fetchConversations } from "../api";
import { useSession } from "../session";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

/** The wordmark. Drawn rather than borrowed, so it belongs only to this app. */
function Mark() {
  return (
    <span className="mk-mark__glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19c3.6 0 3.6-4.2 7.2-4.2S16 19 20 17.8" />
        <path d="M19.6 7.6a3.2 3.2 0 1 0-6.3.8c.7 2.8-3.6 2.2-4.7 4.2" />
      </svg>
    </span>
  );
}

export default function Shell() {
  const { t } = useTranslation("marketplace");
  const session = useSession();
  const location = useLocation();
  const { snapshot } = useSharedBackend();
  const [unread, setUnread] = useState(0);

  /**
   * The shared banner is an operator diagnostic: it renders a permanent green
   * "Connected to shared backend" bar with a Diagnostics dump beside it. That
   * is fine inside a breeder's own workspace and wrong at the top of a public
   * marketplace, so it only appears here when something is actually broken.
   */
  const backendTrouble = ["disconnected", "config-error", "unauthorized"].includes(snapshot.state);

  useEffect(() => {
    if (!session.isAuthenticated) {
      setUnread(0);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const threads = await fetchConversations();
        if (!cancelled) {
          setUnread(threads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0));
        }
      } catch {
        // The badge is a nicety; a failure here must not break the page.
      }
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session.isAuthenticated, location.pathname]);

  return (
    <div className="mk-app">
      {backendTrouble ? <SharedBackendBanner /> : null}

      <a className="mk-skip" href="#mk-main">
        {t("nav.skip", { defaultValue: "Skip to content" })}
      </a>

      <header className="mk-nav">
        <div className="mk-nav__inner">
          <Link to="/" className="mk-mark">
            <Mark />
            <span>
              Serpentora <span className="mk-mark__sub">{t("nav.market", { defaultValue: "Market" })}</span>
            </span>
          </Link>

          <nav className="mk-nav__links" aria-label={t("nav.primary", { defaultValue: "Marketplace" })}>
            <NavLink to="/" end className={({ isActive }) => (isActive ? "is-active" : "")}>
              {t("nav.browse", { defaultValue: "Browse" })}
            </NavLink>
            <NavLink to="/saved" className={({ isActive }) => (isActive ? "is-active" : "")}>
              {t("nav.saved", { defaultValue: "Saved" })}
            </NavLink>
            {session.isAuthenticated ? (
              <NavLink to="/inbox" className={({ isActive }) => (isActive ? "is-active" : "")}>
                {t("nav.inbox", { defaultValue: "Inbox" })}
                {unread > 0 ? <span className="mk-badge mk-tnum">{unread}</span> : null}
              </NavLink>
            ) : null}
            {session.isSeller ? (
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "is-active" : "")}>
                {t("nav.dashboard", { defaultValue: "Selling" })}
              </NavLink>
            ) : null}
          </nav>

          <span className="mk-nav__spacer" />

          <div className="mk-nav__actions">
            <LanguageMenu />
            {session.isAuthenticated ? (
              <>
                <span className="mk-nav__who" title={session.displayName}>
                  <Icon name="user" size={15} />
                  <span>{session.displayName}</span>
                </span>
                <Button variant="ink" size="sm" icon="plus" to="/sell">
                  {t("nav.sell", { defaultValue: "List an animal" })}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" to="/inbox">
                  {t("nav.signIn", { defaultValue: "Sign in" })}
                </Button>
                <Button variant="ink" size="sm" icon="plus" to="/sell">
                  {t("nav.sell", { defaultValue: "List an animal" })}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="mk-main" className="mk-main">
        <Outlet />
      </main>

      <footer className="mk-foot">
        <div className="mk-foot__inner">
          <span className="mk-muted mk-xs">
            {t("footer.tagline", {
              defaultValue: "Animals listed with their record — weights, feeding, lineage and lab-verified genetics.",
            })}
          </span>
          <span className="mk-foot__links">
            <Link to="/">{t("nav.browse", { defaultValue: "Browse" })}</Link>
            <Link to="/sell">{t("nav.sell", { defaultValue: "List an animal" })}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
