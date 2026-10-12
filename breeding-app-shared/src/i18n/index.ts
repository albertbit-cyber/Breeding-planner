import settings from "./settings.json";

// The ten languages the apps offer, and the namespaces breeder and lab load.
// i18next itself stays an app dependency: the app passes its instance and
// plugins in, so this package keeps to zod alone.
export const I18N_SETTINGS = settings;
export const SUPPORTED_LANGS: readonly string[] = settings.supportedLangs ?? ["en"];
export const NAMESPACES: readonly string[] = settings.namespaces ?? ["common"];
export const FALLBACK_LANGUAGE: string = settings.fallbackLng ?? "en";
export const DEFAULT_NAMESPACE: string = settings.defaultNamespace ?? "common";

export type I18nResources = Record<string, Record<string, unknown>>;

// Each language named in its own language and script: the one label a reader
// looking for their language can always recognise.
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  de: "Deutsch",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
  cs: "Čeština",
  he: "עברית",
};

export const RTL_LANGS: ReadonlySet<string> = new Set(["he", "ar", "fa", "ur"]);

export const isRtl = (lng?: string | null): boolean => RTL_LANGS.has(String(lng || "").split("-")[0]);

// Hebrew has to flip the whole document, not just the copy: <html lang dir>
// drives text alignment, flex order and every logical (start/end) CSS property.
export const applyDocumentLanguage = (lng?: string | null): void => {
  if (typeof document === "undefined" || !document.documentElement) return;
  const base = String(lng || FALLBACK_LANGUAGE).split("-")[0];
  document.documentElement.lang = base;
  document.documentElement.dir = isRtl(base) ? "rtl" : "ltr";
};

type I18nInstance = {
  isInitialized: boolean;
  language?: string;
  use: (plugin: any) => I18nInstance;
  init: (options: Record<string, unknown>) => unknown;
  on?: (event: string, handler: (lng: string) => void) => unknown;
};

// Resolve the language to initialise with.
// - Returning users: restore whatever they stored in localStorage.
// - First-time users (nothing stored): always start in English.
export const getInitialLanguage = (): string => {
  try {
    const stored = localStorage.getItem("i18nextLng");
    const base = stored ? stored.split("-")[0] : "";
    if (base && SUPPORTED_LANGS.includes(base)) return base;
  } catch {
    // ignore - localStorage may be unavailable
  }
  return FALLBACK_LANGUAGE;
};

export const bootstrapI18n = <T extends I18nInstance>(
  i18n: T,
  { resources, plugins = [] }: { resources: I18nResources; plugins?: readonly unknown[] }
): T => {
  if (i18n.isInitialized) return i18n;

  const withPlugins = plugins.reduce<I18nInstance>((instance, plugin) => instance.use(plugin), i18n);
  withPlugins.init({
    resources,
    lng: getInitialLanguage(), // explicit > detector; ensures English on first load
    fallbackLng: FALLBACK_LANGUAGE,
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: DEFAULT_NAMESPACE,
    supportedLngs: [...SUPPORTED_LANGS],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Only cache language changes the user explicitly makes via the selector.
      order: ["localStorage"],
      caches: ["localStorage"],
    },
  });
  withPlugins.on?.("languageChanged", applyDocumentLanguage);
  applyDocumentLanguage(withPlugins.language || getInitialLanguage());
  return i18n;
};
