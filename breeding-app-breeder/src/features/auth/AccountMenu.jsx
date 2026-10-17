import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { languages } from "../../components/LanguageSwitcher.jsx";
import { help } from "../help/help";
import { accountInitials, useAccount } from "./accountContext";
import "./accountMenu.css";

// The account button in the top bar, beside the ?. It shows initials only, so it is the
// same size in every language and can never grow over its neighbours (the old "Signed in
// as … / Sign out" pill did, once translated). The menu holds the name and email, a quick
// language switch, the way to account settings, and Sign out.
export default function AccountMenu({ onOpenSettings }) {
  const account = useAccount();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role^="menuitem"]')?.focus();
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  if (!account) return null;

  const name = account.profile?.displayName || account.profile?.fullName || "";
  const email = account.profile?.email || "";
  const shownName = name || t("auth:status.defaultName", { defaultValue: "Keeper" });
  const initials = accountInitials(name, email);
  const current = i18n.language?.split("-")[0] || "en";

  const onMenuKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll('[role^="menuitem"]') || []);
    const index = items.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step && items.length) {
      event.preventDefault();
      // Left and right follow reading direction, so they swap in right-to-left languages.
      const rtl = getComputedStyle(menuRef.current).direction === "rtl";
      const signed = rtl && (event.key === "ArrowLeft" || event.key === "ArrowRight") ? -step : step;
      items[(index + signed + items.length) % items.length].focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        // rounded-full keeps it round: the app's ".app-root button" rule squares every
        // button whose class does not mention it.
        className="account-menu__button rounded-full"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("accountMenu.button", { name: shownName, defaultValue: "Account: {{name}}" })}
        title={shownName}
        onClick={() => setOpen((value) => !value)}
        {...help("account-menu")}
      >
        {initials || <AccountGlyph />}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="account-menu__panel"
          role="menu"
          aria-label={shownName}
          onKeyDown={onMenuKeyDown}
        >
          <div className="account-menu__who">
            <div className="account-menu__name">{shownName}</div>
            {email ? <div className="account-menu__email"><bdi>{email}</bdi></div> : null}
          </div>
          <div className="account-menu__section" role="group" aria-labelledby={`${menuId}-lang`}>
            <div className="account-menu__label" id={`${menuId}-lang`}>
              {t("accountMenu.language", { defaultValue: "Language" })}
            </div>
            <div className="account-menu__langs">
              {languages.map((lng) => (
                <button
                  key={lng.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === lng.code}
                  lang={lng.code}
                  className="account-menu__lang"
                  onClick={() => i18n.changeLanguage(lng.code)}
                  {...help("settings-language-option")}
                >
                  {lng.name}
                </button>
              ))}
            </div>
          </div>
          <div className="account-menu__section">
            <button
              type="button"
              role="menuitem"
              className="account-menu__item"
              onClick={() => {
                close();
                onOpenSettings?.();
              }}
              {...help("account-screen")}
            >
              {t("accountMenu.settings", { defaultValue: "Account settings" })}
            </button>
            <button
              type="button"
              role="menuitem"
              className="account-menu__item account-menu__item--signout"
              onClick={() => {
                close(false);
                account.signOut();
              }}
              {...help("account-sign-out")}
            >
              {t("auth:actions.signOut", { defaultValue: "Sign out" })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Shown only when there is neither a name nor an email to take letters from.
function AccountGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
