// IPC handlers for shop expenses in HSM Furniture ERP.
// Expenses (e.g. Nafte / gas, or free-text) reduce dashboard net profit.

import { ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import type { Expense } from '../types';

export function registerExpenseHandlers(): void {
  ipcMain.handle('expenses:list', (): Expense[] => {
    return getDatabase()
      .prepare(`SELECT * FROM expenses ORDER BY expense_date DESC, id DESC`)
      .all() as Expense[];
  });

  ipcMain.handle(
    'expenses:create',
    (
      _e,
      payload: { category: string; description?: string; amount: number; expense_date?: string }
    ): Expense => {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Shuma e shpenzimit nuk është e vlefshme');
      }
      const category = (payload.category || 'Tjetër').trim() || 'Tjetër';
      const description = (payload.description || '').trim();
      const expenseDate = payload.expense_date?.trim() || new Date().toISOString();

      const result = getDatabase()
        .prepare(
          `INSERT INTO expenses (category, description, amount, expense_date)
           VALUES (?, ?, ?, ?)`
        )
        .run(category, description, amount, expenseDate);

      return getDatabase()
        .prepare('SELECT * FROM expenses WHERE id = ?')
        .get(result.lastInsertRowid) as Expense;
    }
  );

  ipcMain.handle(
    'expenses:update',
    (
      _e,
      payload: {
        id: number;
        category?: string;
        description?: string;
        amount?: number;
        expense_date?: string;
      }
    ): Expense => {
      const current = getDatabase()
        .prepare('SELECT * FROM expenses WHERE id = ?')
        .get(payload.id) as Expense | undefined;
      if (!current) throw new Error('Shpenzimi nuk u gjet');

      const amount =
        payload.amount !== undefined ? Number(payload.amount) : current.amount;
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Shuma e shpenzimit nuk është e vlefshme');
      }

      getDatabase()
        .prepare(
          `UPDATE expenses SET
             category = ?,
             description = ?,
             amount = ?,
             expense_date = ?,
             updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          payload.category?.trim() || current.category,
          payload.description !== undefined
            ? payload.description.trim()
            : current.description,
          amount,
          payload.expense_date?.trim() || current.expense_date,
          payload.id
        );

      return getDatabase()
        .prepare('SELECT * FROM expenses WHERE id = ?')
        .get(payload.id) as Expense;
    }
  );

  ipcMain.handle('expenses:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return { success: true };
  });
}
