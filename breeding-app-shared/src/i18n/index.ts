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

type I18nInstance = {
  isInitialized: boolean;
  use: (plugin: any) => I18nInstance;
  init: (options: Record<string, unknown>) => unknown;
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
  return i18n;
};
