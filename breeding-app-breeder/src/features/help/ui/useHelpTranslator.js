import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// The app's i18next instance, shaped as the registry's Translator. Re-renders on a
// language change because useTranslation does.
export function useHelpTranslator() {
  const { t, i18n } = useTranslation('help');
  const translator = useMemo(
    () => ({ t: (key, options) => i18n.t(key, options), exists: key => i18n.exists(key) }),
    [i18n, i18n.language],
  );
  return { t, translator };
}
