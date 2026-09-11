// Electron main process entry for HSM Furniture ERP.
// Owns the BrowserWindow lifecycle, SQLite boot, IPC registration, and quit-time backup.

import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase } from './database/db';
import { backupDatabase } from './database/backup';
import { registerInventoryHandlers } from './ipc/inventory';
import { registerOrderHandlers } from './ipc/orders';
import { registerInvoiceHandlers } from './ipc/invoices';
import { registerAnalyticsHandlers } from './ipc/analytics';
import { registerExpenseHandlers } from './ipc/expenses';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/** Create the primary application window with a secure preload bridge. */
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
      // Needed for better-sqlite3 path resolution via IPC only
      sandbox: false,
    },
  });

  // Open external links in the OS browser instead of a new Electron window
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
  try {
    initDatabase();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox(
      'HSM Furniture ERP - database error',
      `Could not open the database.\n\nClose any other running copy of the app (including npm run electron:dev), then try again.\n\n${message}`
    );
    app.quit();
    return;
  }

  registerInventoryHandlers();
  registerOrderHandlers();
  registerInvoiceHandlers();
  registerAnalyticsHandlers();
  registerExpenseHandlers();
  createWindow();

  // macOS: recreate a window when the dock icon is clicked and none remain
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

// Keep the app alive on macOS when all windows are closed (standard Electron pattern)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
