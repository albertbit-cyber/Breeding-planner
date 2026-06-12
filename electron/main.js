const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

const { createElectronI18n } = require('./i18n');

const isDev = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const APP_URL = process.env.ELECTRON_START_URL || (isDev
  ? DEV_SERVER_URL
  : `file://${path.join(__dirname, '../build/index.html')}`);

const getSystemLocale = () => {
  if (typeof app.getPreferredSystemLanguages === 'function') {
    const [preferred] = app.getPreferredSystemLanguages();
    if (preferred) {
      return preferred;
    }
  }
  if (typeof app.getLocale === 'function') {
    return app.getLocale();
  }
  return process.env.LANG || 'en';
};

const electronLocale = createElectronI18n(getSystemLocale());
const localeReady = electronLocale.initPromise.catch((error) => {
  console.error('Failed to initialize electron translations', error);
});

const getWindowTitle = () => electronLocale.t('window.title', { defaultValue: 'Breeding Planner' });

const DIALOG_DEFAULTS = {
  storageReadFailed: {
    title: 'Unable to open data',
    message: 'Breeding Planner could not read your local data file. A new workspace will be created.',
  },
  storageWriteFailed: {
    title: 'Unable to save data',
    message: 'Breeding Planner could not save your latest changes. Try again or export a manual backup.',
  },
};

const showNativeError = (dialogKey, error) => {
  const fallback = DIALOG_DEFAULTS[dialogKey] || {};
  const title = electronLocale.t(`dialogs.${dialogKey}.title`, {
    defaultValue: fallback.title || getWindowTitle(),
  });
  const message = electronLocale.t(`dialogs.${dialogKey}.message`, {
    defaultValue: fallback.message || '',
    error: error?.message,
  });
  const detail = error?.message ? `\n\n${error.message}` : '';
  dialog.showErrorBox(title, `${message}${detail}`.trim());
};

let mainWindow = null;
const DATA_FILE_NAME = 'breeding-planner-data.json';

// Keep a single app instance so upgrades/installer relaunches don't spawn duplicates.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const resolveDataFilePath = () => path.join(app.getPath('userData'), DATA_FILE_NAME);

async function loadData() {
  await localeReady;
  const filePath = resolveDataFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error('Failed to read persisted data', error);
    showNativeError('storageReadFailed', error);
    return null;
  }
}

async function saveData(payload) {
  await localeReady;
  const filePath = resolveDataFilePath();
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const json = JSON.stringify(payload ?? {}, null, 2);
    await fs.writeFile(filePath, json, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save persisted data', error);
    showNativeError('storageWriteFailed', error);
    return { success: false, error: error.message };
  }
}

async function clearData() {
  await localeReady;
  const filePath = resolveDataFilePath();
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true };
    }
    console.error('Failed to clear persisted data', error);
    showNativeError('storageWriteFailed', error);
    return { success: false, error: error.message };
  }
}

async function createWindow() {
  await localeReady;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#f4f4f5',
    title: getWindowTitle(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(APP_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  // Bring the existing window to front when a second launch is attempted.
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

if (gotSingleInstanceLock) {
  app.whenReady().then(() => createWindow()).catch((error) => {
    console.error('Failed to create window', error);
  });
}

ipcMain.handle('app:load-data', () => loadData());
ipcMain.handle('app:save-data', (_event, payload) => saveData(payload));
ipcMain.handle('app:clear-data', () => clearData());
ipcMain.handle('label-print:print-current-window', async (event) => {
  const webContents = event.sender;
  if (!webContents || webContents.isDestroyed()) {
    return { success: false, error: 'Print window is no longer available.' };
  }

  return new Promise((resolve) => {
    // The OS print dialog controls final printer selection and printer settings.
    // Keep silent false so Electron never bypasses the user-facing system dialog.
    webContents.print({
      silent: false,
      printBackground: true,
    }, (success, failureReason) => {
      resolve({ success, error: success ? null : failureReason || 'Print was cancelled or failed.' });
    });
  });
});
ipcMain.handle('i18n:get-language', async () => {
  await localeReady;
  return electronLocale.getLanguage();
});
ipcMain.handle('i18n:set-language', async (_event, requestedLanguage) => {
  await localeReady;
  const resolved = await electronLocale.setLanguage(requestedLanguage);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(getWindowTitle());
    mainWindow.webContents.send('i18n:language-changed', resolved);
  }
  return resolved;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow().catch((error) => console.error('Failed to recreate window', error));
  }
});
