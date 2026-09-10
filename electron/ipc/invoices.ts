// IPC handlers for invoices, business settings, and manual backup in HSM Furniture ERP.
// Builds invoice payloads, triggers OS print dialogs, and persists shop settings.

import { BrowserWindow, ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import { backupDatabase } from '../database/backup';
import type {
  BusinessSettings,
  Customer,
  InvoicePayload,
  Order,
  OrderItem,
} from '../types';

/** Next invoice number in INV-YYYY-#### form, based on the latest existing row. */
function nextInvoiceNumber(db: ReturnType<typeof getDatabase>): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1`)
    .get() as { invoice_number: string } | undefined;
  if (!row) return `INV-${year}-0001`;
  const match = row.invoice_number.match(/INV-(\d+)-(\d+)/);
  const seq = match ? Number(match[2]) + 1 : 1;
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

/** Register settings, invoice, and backup IPC channels on the main process. */
export function registerInvoiceHandlers(): void {
  ipcMain.handle('settings:get', (): BusinessSettings => {
    return getDatabase()
      .prepare('SELECT * FROM business_settings WHERE id = 1')
      .get() as BusinessSettings;
  });

  ipcMain.handle(
    'settings:update',
    (_e, payload: Partial<BusinessSettings>): BusinessSettings => {
      const db = getDatabase();
      const current = db
        .prepare('SELECT * FROM business_settings WHERE id = 1')
        .get() as BusinessSettings;

      db.prepare(
        `UPDATE business_settings SET
           business_name = ?,
           address = ?,
           phone = ?,
           email = ?,
           iban = ?,
           bank_name = ?,
           logo_path = ?,
           tvsh_rate = ?,
           backup_directory = ?,
           warranty_text = ?,
           terms_text = ?
         WHERE id = 1`
      ).run(
        payload.business_name ?? current.business_name,
        payload.address ?? current.address,
        payload.phone ?? current.phone,
        payload.email ?? current.email,
        payload.iban ?? current.iban,
        payload.bank_name ?? current.bank_name,
        payload.logo_path ?? current.logo_path,
        payload.tvsh_rate ?? current.tvsh_rate,
        payload.backup_directory ?? current.backup_directory,
        payload.warranty_text ?? current.warranty_text,
        payload.terms_text ?? current.terms_text
      );

      return db
        .prepare('SELECT * FROM business_settings WHERE id = 1')
        .get() as BusinessSettings;
    }
  );

  // Lazy-create an invoice row the first time an order is opened for printing/view
  ipcMain.handle('invoices:getForOrder', (_e, orderId: number): InvoicePayload => {
    const db = getDatabase();
    const order = db
      .prepare(
        `SELECT o.*, c.name AS customer_name
         FROM orders o JOIN customers c ON c.id = o.customer_id
         WHERE o.id = ?`
      )
      .get(orderId) as Order | undefined;
    if (!order) throw new Error('Order not found');

    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(orderId) as OrderItem[];
    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(order.customer_id) as Customer;
    const settings = db
      .prepare('SELECT * FROM business_settings WHERE id = 1')
      .get() as BusinessSettings;

    let invoice = db
      .prepare('SELECT * FROM invoices WHERE order_id = ?')
      .get(orderId) as { invoice_number: string; issued_at: string } | undefined;

    if (!invoice) {
      const invoiceNumber = nextInvoiceNumber(db);
      db.prepare(
        `INSERT INTO invoices (invoice_number, order_id) VALUES (?, ?)`
      ).run(invoiceNumber, orderId);
      invoice = db
        .prepare('SELECT * FROM invoices WHERE order_id = ?')
        .get(orderId) as { invoice_number: string; issued_at: string };
    }

    return {
      invoice_number: invoice.invoice_number,
      issued_at: invoice.issued_at,
      order,
      items,
      customer,
      settings,
    };
  });

  // Print the currently focused (or first) BrowserWindow contents as A4
  ipcMain.handle('invoices:print', async (_e, orderId: number) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window available for printing');

    await win.webContents.print({
      silent: false,
      printBackground: true,
      deviceName: '',
      margins: { marginType: 'default' },
      pageSize: 'A4',
    });

    return { success: true, orderId };
  });

  ipcMain.handle('backup:run', () => {
    return backupDatabase();
  });
}
