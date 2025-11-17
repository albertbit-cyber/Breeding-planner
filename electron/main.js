const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, ipcMain } = require('electron');

const isDev = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const APP_URL = process.env.ELECTRON_START_URL || (isDev
  ? DEV_SERVER_URL
  : `file://${path.join(__dirname, '../build/index.html')}`);

let mainWindow = null;
const DATA_FILE_NAME = 'breeding-planner-data.json';

const resolveDataFilePath = () => path.join(app.getPath('userData'), DATA_FILE_NAME);

async function loadData() {
  const filePath = resolveDataFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error('Failed to read persisted data', error);
    return null;
  }
}

async function saveData(payload) {
  const filePath = resolveDataFilePath();
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const json = JSON.stringify(payload ?? {}, null, 2);
    await fs.writeFile(filePath, json, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save persisted data', error);
    return { success: false, error: error.message };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#f4f4f5',
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

app.on('ready', createWindow);

ipcMain.handle('app:load-data', () => loadData());
ipcMain.handle('app:save-data', (_event, payload) => saveData(payload));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
