import { ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import { calculateSetBreakdown, serializeLeftovers } from '../lib/setBreakdown';
import type { InventoryItem, Category, SetBreakdownPreview } from '../types';

export function registerInventoryHandlers(): void {
  ipcMain.handle('categories:list', (): Category[] => {
    return getDatabase().prepare('SELECT * FROM categories ORDER BY name').all() as Category[];
  });

  ipcMain.handle(
    'categories:create',
    (_e, payload: { name: string; description?: string }): Category => {
      const result = getDatabase()
        .prepare('INSERT INTO categories (name, description) VALUES (?, ?)')
        .run(payload.name.trim(), payload.description?.trim() ?? '');
      return getDatabase()
        .prepare('SELECT * FROM categories WHERE id = ?')
        .get(result.lastInsertRowid) as Category;
    }
  );

  ipcMain.handle('inventory:list', (): InventoryItem[] => {
    return getDatabase()
      .prepare(
        `SELECT i.*, c.name AS category_name
         FROM inventory_items i
         JOIN categories c ON c.id = i.category_id
         WHERE i.is_active = 1
         ORDER BY i.name`
      )
      .all() as InventoryItem[];
  });

  ipcMain.handle(
    'inventory:create',
    (
      _e,
      payload: {
        sku: string;
        name: string;
        category_id: number;
        set_format: string;
        stock_sets: number;
        cost_price: number;
        selling_price: number;
        notes?: string;
      }
    ): InventoryItem => {
      const result = getDatabase()
        .prepare(
          `INSERT INTO inventory_items
           (sku, name, category_id, set_format, stock_sets, cost_price, selling_price, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          payload.sku.trim(),
          payload.name.trim(),
          payload.category_id,
          payload.set_format.trim(),
          payload.stock_sets,
          payload.cost_price,
          payload.selling_price,
          payload.notes?.trim() ?? ''
        );
      return getDatabase()
        .prepare(
          `SELECT i.*, c.name AS category_name
           FROM inventory_items i
           JOIN categories c ON c.id = i.category_id
           WHERE i.id = ?`
        )
        .get(result.lastInsertRowid) as InventoryItem;
    }
  );

  ipcMain.handle(
    'inventory:update',
    (
      _e,
      payload: {
        id: number;
        name?: string;
        category_id?: number;
        set_format?: string;
        stock_sets?: number;
        leftover_pieces?: string;
        cost_price?: number;
        selling_price?: number;
        notes?: string;
        is_active?: number;
      }
    ): InventoryItem => {
      const current = getDatabase()
        .prepare('SELECT * FROM inventory_items WHERE id = ?')
        .get(payload.id) as InventoryItem | undefined;
      if (!current) throw new Error('Inventory item not found');

      getDatabase()
        .prepare(
          `UPDATE inventory_items SET
             name = ?,
             category_id = ?,
             set_format = ?,
             stock_sets = ?,
             leftover_pieces = ?,
             cost_price = ?,
             selling_price = ?,
             notes = ?,
             is_active = ?,
             updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          payload.name ?? current.name,
          payload.category_id ?? current.category_id,
          payload.set_format ?? current.set_format,
          payload.stock_sets ?? current.stock_sets,
          payload.leftover_pieces ?? current.leftover_pieces,
          payload.cost_price ?? current.cost_price,
          payload.selling_price ?? current.selling_price,
          payload.notes ?? current.notes,
          payload.is_active ?? current.is_active,
          payload.id
        );

      return getDatabase()
        .prepare(
          `SELECT i.*, c.name AS category_name
           FROM inventory_items i
           JOIN categories c ON c.id = i.category_id
           WHERE i.id = ?`
        )
        .get(payload.id) as InventoryItem;
    }
  );

  ipcMain.handle(
    'inventory:previewBreakdown',
    (
      _e,
      payload: {
        inventory_item_id: number;
        set_format_requested: string;
        quantity?: number;
      }
    ): SetBreakdownPreview => {
      const item = getDatabase()
        .prepare('SELECT * FROM inventory_items WHERE id = ?')
        .get(payload.inventory_item_id) as InventoryItem | undefined;
      if (!item) throw new Error('Inventory item not found');

      const result = calculateSetBreakdown(
        item.set_format,
        item.stock_sets,
        item.leftover_pieces,
        payload.set_format_requested,
        payload.quantity ?? 1
      );

      return {
        brokeSet: result.brokeSet,
        warning: result.warning,
        feasible: result.feasible,
        message: result.message,
        setsConsumed: result.setsConsumed,
        stockSetsAfter: result.stockSetsAfter,
        leftoverAfter: result.leftoverAfter,
      };
    }
  );

  /** Apply breakdown to stock (used internally by orders, exposed for testing). */
  ipcMain.handle(
    'inventory:applyBreakdown',
    (
      _e,
      payload: {
        inventory_item_id: number;
        set_format_requested: string;
        quantity?: number;
      }
    ) => {
      const db = getDatabase();
      const item = db
        .prepare('SELECT * FROM inventory_items WHERE id = ?')
        .get(payload.inventory_item_id) as InventoryItem | undefined;
      if (!item) throw new Error('Inventory item not found');

      const result = calculateSetBreakdown(
        item.set_format,
        item.stock_sets,
        item.leftover_pieces,
        payload.set_format_requested,
        payload.quantity ?? 1
      );
      if (!result.feasible) throw new Error(result.message);

      db.prepare(
        `UPDATE inventory_items
         SET stock_sets = ?, leftover_pieces = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        result.stockSetsAfter,
        serializeLeftovers(result.leftoverAfter),
        payload.inventory_item_id
      );

      return result;
    }
  );
}
