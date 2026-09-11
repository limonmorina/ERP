// IPC handlers for customers and orders in HSM Furniture ERP.
// Creates/updates orders with set-breakdown stock deduction, status updates, returns, and deletes.

import { ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import {
  calculateSetBreakdown,
  serializeLeftovers,
  extractTvshFromInclusive,
  calculateNetProfit,
  restorePiecesToInventory,
  suggestUnitPrice,
  customerDiscountAmount,
  DEFAULT_TVSH_RATE,
} from '../lib/setBreakdown';
import type {
  Order,
  OrderItem,
  OrderItemInput,
  Customer,
  InventoryItem,
  BusinessSettings,
  OrderStatus,
} from '../types';

type Db = ReturnType<typeof getDatabase>;

type LineRow = {
  inventory_item_id: number | null;
  item_name: string;
  set_format_requested: string;
  quantity: number;
  unit_cost: number;
  list_price: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  broke_set: number;
  stock_sets: number;
  leftover_pieces: string;
};

type BuiltLines = {
  lineRows: LineRow[];
  subtotal: number;
  totalCost: number;
  discountTotal: number;
  anyBreak: boolean;
  warnings: string[];
};

type OrderWritePayload = {
  customer_id: number;
  kapare: number;
  transport_fee: number;
  show_transport_on_invoice: boolean;
  /** Made-to-order / custom job: bill the client but do not consume warehouse stock. */
  is_custom_job?: boolean;
  custom_notes?: string;
  /** Optional manual override of calculated net profit. */
  net_profit?: number;
  items: OrderItemInput[];
};

/** Next order number in ORD-YYYY-#### form, based on the latest existing row. */
function nextOrderNumber(db: Db): string {
  const row = db
    .prepare(`SELECT order_number FROM orders ORDER BY id DESC LIMIT 1`)
    .get() as { order_number: string } | undefined;
  const year = new Date().getFullYear();
  if (!row) return `ORD-${year}-0001`;
  const match = row.order_number.match(/ORD-(\d+)-(\d+)/);
  const seq = match ? Number(match[2]) + 1 : 1;
  return `ORD-${year}-${String(seq).padStart(4, '0')}`;
}

/**
 * Build persisted order line rows from UI inputs.
 * Custom jobs are free-form (no stock). Stock orders validate set breakdown and prices.
 */
function buildLineRowsFromItems(
  db: Db,
  items: OrderItemInput[],
  isCustomJob: boolean
): BuiltLines {
  let subtotal = 0;
  let totalCost = 0;
  let discountTotal = 0;
  let anyBreak = false;
  const warnings: string[] = [];
  const lineRows: LineRow[] = [];
  // Track stock after earlier lines so multi-line same-item orders stay feasible
  const stockAfterByItem = new Map<number, { stockSets: number; leftovers: string }>();

  for (const line of items) {
    // Free-form custom job: any work outside standard warehouse sets
    if (isCustomJob) {
      const itemName = (line.item_name || '').trim();
      if (!itemName) throw new Error('Përshkruani punën e personalizuar (emri / titulli)');
      const qty = Math.max(1, Number(line.quantity) || 1);
      const unitPrice = Number(line.unit_price ?? 0);
      const unitCost = Number(line.unit_cost ?? 0);
      if (unitPrice < 0 || unitCost < 0) {
        throw new Error('Çmimet e punës së personalizuar nuk mund të jenë negative');
      }
      const entitledPrice =
        line.entitled_price !== undefined && line.entitled_price !== null
          ? Number(line.entitled_price)
          : unitPrice;
      const lineDiscount = customerDiscountAmount(entitledPrice, unitPrice, qty);
      const lineTotal = unitPrice * qty;
      const specs = (line.set_format_requested || '').trim() || 'punë e personalizuar';

      subtotal += lineTotal;
      totalCost += unitCost * qty;
      discountTotal += lineDiscount;
      warnings.push(`${itemName}: Punë e personalizuar - jashtë seteve standarde, stoku nuk ndryshon.`);

      lineRows.push({
        inventory_item_id: null,
        item_name: itemName,
        set_format_requested: specs,
        quantity: qty,
        unit_cost: unitCost,
        list_price: entitledPrice,
        unit_price: unitPrice,
        discount_amount: lineDiscount,
        line_total: lineTotal,
        broke_set: 0,
        stock_sets: 0,
        leftover_pieces: '',
      });
      continue;
    }

    if (!line.inventory_item_id) {
      throw new Error('Zgjidhni një artikull nga inventari për porosinë nga stoku');
    }

    const item = db
      .prepare('SELECT * FROM inventory_items WHERE id = ?')
      .get(line.inventory_item_id) as InventoryItem | undefined;
    if (!item) throw new Error(`Artikulli ${line.inventory_item_id} nuk u gjet`);

    const prior = stockAfterByItem.get(item.id);
    const stockSets = prior?.stockSets ?? item.stock_sets;
    const leftovers = prior?.leftovers ?? item.leftover_pieces;

    const breakdown = calculateSetBreakdown(
      item.set_format,
      stockSets,
      leftovers,
      line.set_format_requested,
      line.quantity
    );
    if (!breakdown.feasible) throw new Error(`${item.name}: ${breakdown.message}`);

    let brokeSet = false;
    if (breakdown.brokeSet) {
      anyBreak = true;
      brokeSet = true;
      if (breakdown.warning) {
        warnings.push(
          `${item.name}: ${breakdown.warning} Sete të plota të mbetura: ${breakdown.stockSetsAfter}.`
        );
      } else {
        warnings.push(
          `${item.name}: U nda seti. Sete të plota të mbetura: ${breakdown.stockSetsAfter}.`
        );
      }
    }

    const catalogPrice = item.selling_price;
    const autoEntitledSellPrice = suggestUnitPrice(
      catalogPrice,
      item.set_format,
      line.set_format_requested
    ).entitled;
    const entitledPrice =
      line.entitled_price !== undefined && line.entitled_price !== null
        ? Number(line.entitled_price)
        : autoEntitledSellPrice;
    const unitPrice =
      line.unit_price !== undefined && line.unit_price !== null
        ? Number(line.unit_price)
        : entitledPrice;
    if (unitPrice < 0) throw new Error('Çmimi i shitjes nuk mund të jetë negativ');

    const lineDiscount = customerDiscountAmount(entitledPrice, unitPrice, line.quantity);
    const lineTotal = unitPrice * line.quantity;
    const entitledCostPerCombo = suggestUnitPrice(
      item.cost_price,
      item.set_format,
      line.set_format_requested
    ).entitled;
    const lineCost = entitledCostPerCombo * line.quantity;

    subtotal += lineTotal;
    totalCost += lineCost;
    discountTotal += lineDiscount;

    const leftoverSerialized = serializeLeftovers(breakdown.leftoverAfter);
    stockAfterByItem.set(item.id, {
      stockSets: breakdown.stockSetsAfter,
      leftovers: leftoverSerialized,
    });

    lineRows.push({
      inventory_item_id: item.id,
      item_name: item.name,
      set_format_requested: line.set_format_requested,
      quantity: line.quantity,
      unit_cost: entitledCostPerCombo,
      list_price: entitledPrice,
      unit_price: unitPrice,
      discount_amount: lineDiscount,
      line_total: lineTotal,
      broke_set: brokeSet ? 1 : 0,
      stock_sets: breakdown.stockSetsAfter,
      leftover_pieces: leftoverSerialized,
    });
  }

  return { lineRows, subtotal, totalCost, discountTotal, anyBreak, warnings };
}

/** Restore warehouse pieces for previous inventory lines (skip null ids). */
function restoreOrderStock(db: Db, orderItems: OrderItem[]): void {
  const updateStock = db.prepare(
    `UPDATE inventory_items
     SET stock_sets = ?, leftover_pieces = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  for (const line of orderItems) {
    if (!line.inventory_item_id) continue;
    const item = db
      .prepare('SELECT * FROM inventory_items WHERE id = ?')
      .get(line.inventory_item_id) as InventoryItem | undefined;
    if (!item) continue;
    const restored = restorePiecesToInventory(
      item.set_format,
      item.stock_sets,
      item.leftover_pieces,
      line.set_format_requested,
      line.quantity
    );
    updateStock.run(
      restored.stockSetsAfter,
      serializeLeftovers(restored.leftoverAfter),
      item.id
    );
  }
}

/**
 * Re-deduct warehouse stock from existing order lines (e.g. Returned -> Pending/Delivered).
 * Applies sequentially so multi-line orders against the same SKU stay consistent.
 */
function deductExistingOrderStock(db: Db, orderItems: OrderItem[], isCustomJob: boolean): void {
  if (isCustomJob) return;
  const updateStock = db.prepare(
    `UPDATE inventory_items
     SET stock_sets = ?, leftover_pieces = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  for (const line of orderItems) {
    if (!line.inventory_item_id) continue;
    const item = db
      .prepare('SELECT * FROM inventory_items WHERE id = ?')
      .get(line.inventory_item_id) as InventoryItem | undefined;
    if (!item) continue;
    const breakdown = calculateSetBreakdown(
      item.set_format,
      item.stock_sets,
      item.leftover_pieces,
      line.set_format_requested,
      line.quantity
    );
    if (!breakdown.feasible) {
      throw new Error(
        `Nuk ka stok për të rivendosur porosinë: ${line.item_name} (${breakdown.message})`
      );
    }
    updateStock.run(
      breakdown.stockSetsAfter,
      serializeLeftovers(breakdown.leftoverAfter),
      item.id
    );
  }
}

/** Insert line rows and optionally deduct stock for warehouse sales. */
function insertLinesAndApplyStock(
  db: Db,
  orderId: number,
  lineRows: LineRow[],
  isCustomJob: boolean
): void {
  const insertItem = db.prepare(
    `INSERT INTO order_items (
       order_id, inventory_item_id, item_name, set_format_requested,
       quantity, unit_cost, list_price, unit_price, discount_amount,
       line_total, broke_set
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateStock = db.prepare(
    `UPDATE inventory_items
     SET stock_sets = ?, leftover_pieces = ?, updated_at = datetime('now')
     WHERE id = ?`
  );

  for (const row of lineRows) {
    insertItem.run(
      orderId,
      row.inventory_item_id,
      row.item_name,
      row.set_format_requested,
      row.quantity,
      row.unit_cost,
      row.list_price,
      row.unit_price,
      row.discount_amount,
      row.line_total,
      row.broke_set
    );
    // Custom jobs are outside warehouse stock; stock sales update inventory
    if (!isCustomJob && row.inventory_item_id != null) {
      updateStock.run(row.stock_sets, row.leftover_pieces, row.inventory_item_id);
    }
  }
}

function orderWithCustomer(db: Db, orderId: number): Order {
  return db
    .prepare(
      `SELECT o.*, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`
    )
    .get(orderId) as Order;
}

/** Register customer and order IPC channels on the main process. */
export function registerOrderHandlers(): void {
  ipcMain.handle('customers:list', (): Customer[] => {
    return getDatabase()
      .prepare('SELECT * FROM customers ORDER BY name')
      .all() as Customer[];
  });

  ipcMain.handle(
    'customers:create',
    (
      _e,
      payload: {
        name: string;
        phone1: string;
        phone2?: string;
        delivery_address?: string;
        city?: string;
        country?: string;
      }
    ): Customer => {
      const result = getDatabase()
        .prepare(
          `INSERT INTO customers (name, phone1, phone2, delivery_address, city, country)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          payload.name.trim(),
          payload.phone1.trim(),
          payload.phone2?.trim() ?? '',
          payload.delivery_address?.trim() ?? '',
          payload.city?.trim() ?? 'Prishtinë',
          payload.country?.trim() ?? 'Kosovë'
        );
      return getDatabase()
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(result.lastInsertRowid) as Customer;
    }
  );

  ipcMain.handle('orders:list', (): Order[] => {
    return getDatabase()
      .prepare(
        `SELECT o.*, c.name AS customer_name,
                (SELECT GROUP_CONCAT(oi.item_name, ', ')
                 FROM order_items oi WHERE oi.order_id = o.id) AS item_names
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         ORDER BY o.order_date DESC`
      )
      .all() as Order[];
  });

  ipcMain.handle('orders:get', (_e, orderId: number) => {
    const order = getDatabase()
      .prepare(
        `SELECT o.*, c.name AS customer_name
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.id = ?`
      )
      .get(orderId) as Order | undefined;
    if (!order) throw new Error('Porosia nuk u gjet');
    const items = getDatabase()
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(orderId) as OrderItem[];
    const customer = getDatabase()
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(order.customer_id) as Customer;
    return { order, items, customer };
  });

  ipcMain.handle('orders:create', (_e, payload: OrderWritePayload) => {
    const db = getDatabase();
    const settings = db
      .prepare('SELECT * FROM business_settings WHERE id = 1')
      .get() as BusinessSettings;
    const tvshRate = settings?.tvsh_rate ?? DEFAULT_TVSH_RATE;
    const isCustomJob = Boolean(payload.is_custom_job);

    if (!payload.items?.length) throw new Error('Porosia duhet të ketë të paktën një artikull');

    // Single transaction: validate stock (unless custom job), insert order/lines, update inventory
    const create = db.transaction(() => {
      const built = buildLineRowsFromItems(db, payload.items, isCustomJob);
      const transport = payload.transport_fee || 0;
      const total = built.subtotal + transport;
      const tvshAmount = extractTvshFromInclusive(built.subtotal, tvshRate);
      const remaining = Math.max(0, total - (payload.kapare || 0));
      // Transport is charged to the client; it does not reduce shop profit
      const calculatedProfit = calculateNetProfit(built.subtotal, built.totalCost, transport);
      const netProfit =
        payload.net_profit !== undefined && payload.net_profit !== null
          ? Number(payload.net_profit)
          : calculatedProfit;

      const orderNumber = nextOrderNumber(db);
      const orderResult = db
        .prepare(
          `INSERT INTO orders (
             order_number, customer_id, status, kapare, transport_fee,
             show_transport_on_invoice, is_custom_job, custom_notes, subtotal, tvsh_amount,
             total, remaining_balance, net_profit, discount_total,
             set_break_warning, set_break_message
           ) VALUES (?, ?, 'Pending Delivery', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderNumber,
          payload.customer_id,
          payload.kapare || 0,
          transport,
          payload.show_transport_on_invoice ? 1 : 0,
          isCustomJob ? 1 : 0,
          payload.custom_notes?.trim() ?? '',
          built.subtotal,
          tvshAmount,
          total,
          remaining,
          netProfit,
          built.discountTotal,
          built.anyBreak || isCustomJob ? 1 : 0,
          built.warnings.join(' ')
        );

      const orderId = Number(orderResult.lastInsertRowid);
      insertLinesAndApplyStock(db, orderId, built.lineRows, isCustomJob);
      return orderId;
    });

    return orderWithCustomer(db, create());
  });

  ipcMain.handle(
    'orders:update',
    (_e, payload: OrderWritePayload & { order_id: number }) => {
      const db = getDatabase();
      const settings = db
        .prepare('SELECT * FROM business_settings WHERE id = 1')
        .get() as BusinessSettings;
      const tvshRate = settings?.tvsh_rate ?? DEFAULT_TVSH_RATE;
      const isCustomJob = Boolean(payload.is_custom_job);

      if (!payload.items?.length) throw new Error('Porosia duhet të ketë të paktën një artikull');

      const existing = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(payload.order_id) as Order | undefined;
      if (!existing) throw new Error('Porosia nuk u gjet');
      if (existing.status !== 'Pending Delivery') {
        throw new Error('Porosia mund të ndryshohet vetëm kur statusi është Në pritje');
      }

      const update = db.transaction(() => {
        const oldItems = db
          .prepare('SELECT * FROM order_items WHERE order_id = ?')
          .all(payload.order_id) as OrderItem[];

        // Restore stock from previous warehouse lines (skip if already Returned / custom)
        if (existing.status !== 'Returned' && !existing.is_custom_job) {
          restoreOrderStock(db, oldItems);
        }

        // Keep invoice linked; replace line items only
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(payload.order_id);

        // Rebuild against restored stock so feasibility matches current warehouse state
        const built = buildLineRowsFromItems(db, payload.items, isCustomJob);
        const transport = payload.transport_fee || 0;
        const total = built.subtotal + transport;
        const tvshAmount = extractTvshFromInclusive(built.subtotal, tvshRate);
        const remaining = Math.max(0, total - (payload.kapare || 0));
        const calculatedProfit = calculateNetProfit(built.subtotal, built.totalCost, transport);
        const netProfit =
          payload.net_profit !== undefined && payload.net_profit !== null
            ? Number(payload.net_profit)
            : calculatedProfit;

        db.prepare(
          `UPDATE orders SET
             customer_id = ?,
             kapare = ?,
             transport_fee = ?,
             show_transport_on_invoice = ?,
             is_custom_job = ?,
             custom_notes = ?,
             subtotal = ?,
             tvsh_amount = ?,
             total = ?,
             remaining_balance = ?,
             net_profit = ?,
             discount_total = ?,
             set_break_warning = ?,
             set_break_message = ?,
             updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          payload.customer_id,
          payload.kapare || 0,
          transport,
          payload.show_transport_on_invoice ? 1 : 0,
          isCustomJob ? 1 : 0,
          payload.custom_notes?.trim() ?? '',
          built.subtotal,
          tvshAmount,
          total,
          remaining,
          netProfit,
          built.discountTotal,
          built.anyBreak || isCustomJob ? 1 : 0,
          built.warnings.join(' '),
          payload.order_id
        );

        insertLinesAndApplyStock(db, payload.order_id, built.lineRows, isCustomJob);
      });

      update();
      return orderWithCustomer(db, payload.order_id);
    }
  );

  ipcMain.handle(
    'orders:updateProfit',
    (_e, payload: { order_id: number; net_profit: number }): Order => {
      const db = getDatabase();
      const order = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(payload.order_id) as Order | undefined;
      if (!order) throw new Error('Porosia nuk u gjet');

      db.prepare(
        `UPDATE orders SET net_profit = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(Number(payload.net_profit), payload.order_id);

      return orderWithCustomer(db, payload.order_id);
    }
  );

  ipcMain.handle(
    'orders:updateStatus',
    (_e, payload: { order_id: number; status: OrderStatus }): Order => {
      const db = getDatabase();
      const order = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(payload.order_id) as Order | undefined;
      if (!order) throw new Error('Porosia nuk u gjet');
      if (payload.status === order.status) {
        return orderWithCustomer(db, payload.order_id);
      }

      /**
       * Lifecycle (matches shop workflow):
       * - Pending: stock already deducted on create; NOT in dashboard revenue/profit
       * - Delivered: still no stock change; NOW counts in dashboard
       * - Returned: restore stock; removed from dashboard totals
       * - Delivered -> Pending: leave stock deducted; remove from dashboard
       * - Returned -> Pending/Delivered: re-deduct stock (return had restored it)
       */
      const from = order.status;
      const to = payload.status;

      let remaining = order.remaining_balance;
      let deliveredAt = order.delivered_at;
      let returnedAt = order.returned_at;

      if (to === 'Delivered') {
        remaining = 0;
        deliveredAt = new Date().toISOString();
        returnedAt = null;
      } else if (to === 'Pending Delivery') {
        remaining = Math.max(0, (order.total || 0) - (order.kapare || 0));
        deliveredAt = null;
        returnedAt = null;
      } else if (to === 'Returned') {
        returnedAt = new Date().toISOString();
      }

      const apply = db.transaction(() => {
        const items = db
          .prepare('SELECT * FROM order_items WHERE order_id = ?')
          .all(payload.order_id) as OrderItem[];

        // Leaving warehouse for a return: put sets back
        if (to === 'Returned' && from !== 'Returned' && !order.is_custom_job) {
          restoreOrderStock(db, items);
        }

        // Coming back from a return: take sets from stock again
        if (from === 'Returned' && to !== 'Returned' && !order.is_custom_job) {
          deductExistingOrderStock(db, items, Boolean(order.is_custom_job));
        }

        db.prepare(
          `UPDATE orders SET
             status = ?,
             remaining_balance = ?,
             delivered_at = ?,
             returned_at = ?,
             updated_at = datetime('now')
           WHERE id = ?`
        ).run(to, remaining, deliveredAt, returnedAt, payload.order_id);
      });

      apply();
      return orderWithCustomer(db, payload.order_id);
    }
  );

  ipcMain.handle('orders:delete', (_e, orderId: number) => {
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      | Order
      | undefined;
    if (!order) throw new Error('Porosia nuk u gjet');

    const del = db.transaction(() => {
      const items = db
        .prepare('SELECT * FROM order_items WHERE order_id = ?')
        .all(orderId) as OrderItem[];

      // Restore stock only for warehouse sales that were not already returned
      if (order.status !== 'Returned' && !order.is_custom_job) {
        restoreOrderStock(db, items);
      }

      db.prepare('DELETE FROM invoices WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
    });

    del();
    return { success: true };
  });
}
