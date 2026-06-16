const { contextBridge, ipcRenderer } = require('electron');

const { createElectronI18n } = require('./i18n');

const preloadLocale = createElectronI18n(typeof navigator !== 'undefined' ? navigator.language : undefined);
const localeReady = preloadLocale.initPromise.catch((error) => {
  console.error('Failed to initialize preload translations', error);
});

const syncLanguageFromMain = async () => {
  try {
    const lang = await ipcRenderer.invoke('i18n:get-language');
    await preloadLocale.setLanguage(lang);
  } catch (error) {
    console.warn('Unable to sync language from main process', error);
  }
};

syncLanguageFromMain();

ipcRenderer.on('i18n:language-changed', (_event, language) => {
  preloadLocale.setLanguage(language).catch((error) => {
    console.warn('Failed to apply language update in preload', error);
  });
});

const translateNative = async (key, options) => {
  await localeReady;
  return preloadLocale.t(key, options);
};

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('app:load-data'),
  saveData: (payload) => ipcRenderer.invoke('app:save-data', payload),
  clearData: () => ipcRenderer.invoke('app:clear-data'),
  printCurrentWindow: () => ipcRenderer.invoke('label-print:print-current-window'),
  locale: {
    getLanguage: () => ipcRenderer.invoke('i18n:get-language'),
    setLanguage: (language) => ipcRenderer.invoke('i18n:set-language', language),
    translate: (key, options) => translateNative(key, options),
  },
});

// Simple preload script
// Basic event listener setup
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});
