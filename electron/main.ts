import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase } from './database/db';
import { backupDatabase } from './database/backup';
import { registerInventoryHandlers } from './ipc/inventory';
import { registerOrderHandlers } from './ipc/orders';
import { registerInvoiceHandlers } from './ipc/invoices';
import { registerAnalyticsHandlers } from './ipc/analytics';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'HSM Furniture ERP',
    backgroundColor: '#f6f5f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for better-sqlite3 path resolution via IPC only
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

app.whenReady().then(() => {
  initDatabase();
  registerInventoryHandlers();
  registerOrderHandlers();
  registerInvoiceHandlers();
  registerAnalyticsHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try {
    backupDatabase();
  } catch (err) {
    console.error('Backup on quit failed:', err);
  }
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
