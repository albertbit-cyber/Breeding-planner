import React from "react";
import { useTranslation } from "react-i18next";
import "../i18n/index.js";

const languages = [
  { code: "en", label: "EN", name: "English", flag: "🇺🇸🇬🇧" },
  { code: "es", label: "ES", name: "Español", flag: "🇪🇸" },
  { code: "fr", label: "FR", name: "Français", flag: "🇫🇷" },
  { code: "it", label: "IT", name: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "DE", name: "Deutsch", flag: "🇩🇪" },
  { code: "nl", label: "NL", name: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "PL", name: "Polski", flag: "🇵🇱" },
  { code: "pt", label: "PT", name: "Português", flag: "🇵🇹" },
  { code: "cs", label: "CS", name: "Čeština", flag: "🇨🇿" },
  { code: "he", label: "HE", name: "Hebrew", flag: "🇮🇱" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.split("-")[0] || "en";

  return (
    <div
      className="flex flex-col items-start gap-1 w-full max-w-xs self-start text-left"
      style={{ alignSelf: "flex-start", marginLeft: 0 }}
    >
      {languages.map((lng) => {
        const active = current === lng.code;
        return (
          <button
            key={lng.code}
            type="button"
            onClick={() => i18n.changeLanguage(lng.code)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full justify-start border ${
              active
                ? "border-sky-500 text-sky-700 font-semibold bg-transparent"
                : "border-neutral-200 text-neutral-700 hover:border-sky-400 bg-transparent"
            }`}
          >
            <span className="text-base">{lng.flag}</span>
            <span className="flex items-center gap-1">
              <span className="font-semibold">{lng.label}</span>
              <span className="text-xs text-neutral-500">· {lng.name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
