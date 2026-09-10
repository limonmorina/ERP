// IPC handlers for inventory and categories in HSM Furniture ERP.
// CRUD for stock items, soft-delete, product photos, and set-breakdown preview/apply.

import { ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import { calculateSetBreakdown, serializeLeftovers } from '../lib/setBreakdown';
import {
  deleteProductImage,
  productImageToDataUrl,
  saveProductImageFromBase64,
} from '../lib/productImages';
import type { InventoryItem, Category, SetBreakdownPreview } from '../types';

function fetchItem(id: number | bigint): InventoryItem {
  return getDatabase()
    .prepare(
      `SELECT i.*, c.name AS category_name
       FROM inventory_items i
       JOIN categories c ON c.id = i.category_id
       WHERE i.id = ?`
    )
    .get(id) as InventoryItem;
}

/** Register category and inventory IPC channels on the main process. */
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
        leftover_pieces?: string;
        cost_price: number;
        selling_price: number;
        notes?: string;
        image_path?: string;
        image_base64?: string;
        image_mime?: string;
      }
    ): InventoryItem => {
      let imagePath = payload.image_path?.trim() || '';
      if (payload.image_base64) {
        imagePath = saveProductImageFromBase64(payload.image_base64, payload.image_mime);
      }

      const result = getDatabase()
        .prepare(
          `INSERT INTO inventory_items
           (sku, name, category_id, set_format, stock_sets, leftover_pieces, cost_price, selling_price, notes, image_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          payload.sku.trim(),
          payload.name.trim(),
          payload.category_id,
          payload.set_format.trim(),
          payload.stock_sets,
          payload.leftover_pieces?.trim() || '',
          payload.cost_price,
          payload.selling_price,
          payload.notes?.trim() ?? '',
          imagePath
        );
      return fetchItem(result.lastInsertRowid);
    }
  );

  ipcMain.handle(
    'inventory:update',
    (
      _e,
      payload: {
        id: number;
        sku?: string;
        name?: string;
        category_id?: number;
        set_format?: string;
        stock_sets?: number;
        leftover_pieces?: string;
        cost_price?: number;
        selling_price?: number;
        notes?: string;
        is_active?: number;
        image_path?: string;
        image_base64?: string;
        image_mime?: string;
        clear_image?: boolean;
      }
    ): InventoryItem => {
      const current = getDatabase()
        .prepare('SELECT * FROM inventory_items WHERE id = ?')
        .get(payload.id) as InventoryItem | undefined;
      if (!current) throw new Error('Inventory item not found');

      const nextSku = payload.sku?.trim() || current.sku;
      if (nextSku !== current.sku) {
        const clash = getDatabase()
          .prepare('SELECT id FROM inventory_items WHERE sku = ? AND id != ?')
          .get(nextSku, payload.id) as { id: number } | undefined;
        if (clash) throw new Error(`SKU "${nextSku}" është në përdorim`);
      }

      let nextImage = current.image_path || '';
      if (payload.clear_image) {
        deleteProductImage(current.image_path);
        nextImage = '';
      } else if (payload.image_base64) {
        nextImage = saveProductImageFromBase64(
          payload.image_base64,
          payload.image_mime,
          current.image_path
        );
      } else if (payload.image_path !== undefined) {
        nextImage = payload.image_path;
      }

      getDatabase()
        .prepare(
          `UPDATE inventory_items SET
             sku = ?,
             name = ?,
             category_id = ?,
             set_format = ?,
             stock_sets = ?,
             leftover_pieces = ?,
             cost_price = ?,
             selling_price = ?,
             notes = ?,
             image_path = ?,
             is_active = ?,
             updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          nextSku,
          payload.name ?? current.name,
          payload.category_id ?? current.category_id,
          payload.set_format ?? current.set_format,
          payload.stock_sets ?? current.stock_sets,
          payload.leftover_pieces ?? current.leftover_pieces,
          payload.cost_price ?? current.cost_price,
          payload.selling_price ?? current.selling_price,
          payload.notes ?? current.notes,
          nextImage,
          payload.is_active ?? current.is_active,
          payload.id
        );

      return fetchItem(payload.id);
    }
  );

  // Return a data URL for a stored product photo (or null)
  ipcMain.handle(
    'inventory:getImage',
    (_e, payload: { image_path?: string; id?: number }): string | null => {
      let relative = payload.image_path || '';
      if (!relative && payload.id) {
        const row = getDatabase()
          .prepare('SELECT image_path FROM inventory_items WHERE id = ?')
          .get(payload.id) as { image_path: string } | undefined;
        relative = row?.image_path || '';
      }
      return productImageToDataUrl(relative);
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
