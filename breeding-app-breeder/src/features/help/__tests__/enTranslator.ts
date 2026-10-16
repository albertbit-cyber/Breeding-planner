import i18next from 'i18next';
import enCommon from '../../../locales/en/common.json';
import enAnimals from '../../../locales/en/animals.json';
import enAdvisor from '../../../locales/en/advisor.json';
import enAuth from '../../../locales/en/auth.json';
import enElectron from '../../../locales/en/electron.json';
import enHelp from '../../../locales/en/help.json';
import type { Translator } from '../helpTypes';

// The English the app ships, resolved the way the app resolves it (same default and
// fallback namespace), so a topic whose title borrows a control's key is tested
// against the label the control really shows.
export const makeEnTranslator = (): Translator => {
  const instance = i18next.createInstance();
  instance.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'animals', 'advisor', 'auth', 'electron', 'help'],
    defaultNS: 'common',
    fallbackNS: 'common',
    initAsync: false,
    showSupportNotice: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { common: enCommon, animals: enAnimals, advisor: enAdvisor, auth: enAuth, electron: enElectron, help: enHelp },
    },
  });
  return {
    t: (key, options) => instance.t(key, options as never),
    exists: key => instance.exists(key),
  };
};
