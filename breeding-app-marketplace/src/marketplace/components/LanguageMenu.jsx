import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Language, in the nav.
 *
 * The shared `LanguageSwitcher` renders ten full-width buttons in a vertical
 * stack — it was built for a settings panel, and dropped into a 60px header it
 * covered the page. It also labels each language with a flag, which names a
 * country rather than a language (and gives English two).
 *
 * Languages are listed in their own language, which is the one label a reader
 * looking for their language can always recognise.
 */
const LANGUAGES = [
  ["en", "English"],
  ["de", "Deutsch"],
  ["nl", "Nederlands"],
  ["fr", "Français"],
  ["es", "Español"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["pl", "Polski"],
  ["cs", "Čeština"],
  ["he", "עברית"],
];

const RTL = new Set(["he", "ar", "fa", "ur"]);

export default function LanguageMenu() {
  const { t, i18n } = useTranslation("marketplace");
  const current = (i18n.language || "en").split("-")[0];

  // Hebrew has to flip the whole document, not just the copy.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = current;
    root.dir = RTL.has(current) ? "rtl" : "ltr";
  }, [current]);

  return (
    <label className="mk-langmenu">
      <span className="mk-sr-only">{t("nav.language", { defaultValue: "Language" })}</span>
      <select
        className="mk-select"
        value={current}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
      >
        {LANGUAGES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
