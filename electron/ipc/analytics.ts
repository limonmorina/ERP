import { ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import { inventoryLineValue } from '../lib/setBreakdown';
import type { DashboardMetrics, InventoryItem, OrderStatus } from '../types';

export function registerAnalyticsHandlers(): void {
  ipcMain.handle('analytics:dashboard', (): DashboardMetrics => {
    const db = getDatabase();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    // Local calendar month (avoid UTC shifting Kosovo dates into previous month)
    const y = monthStart.getFullYear();
    const m = String(monthStart.getMonth() + 1).padStart(2, '0');
    const d = String(monthStart.getDate()).padStart(2, '0');
    const monthLocal = `${y}-${m}-${d} 00:00:00`;

    const revenueRow = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS revenue,
                COALESCE(SUM(net_profit), 0) AS profit,
                COALESCE(SUM(CASE WHEN discount_total > 0 THEN discount_total ELSE 0 END), 0) AS discount
         FROM orders
         WHERE status != 'Returned' AND order_date >= ?`
      )
      .get(monthLocal) as { revenue: number; profit: number; discount: number };

    const inventoryRows = db
      .prepare(
        `SELECT cost_price, stock_sets, set_format, leftover_pieces
         FROM inventory_items WHERE is_active = 1`
      )
      .all() as Array<
      Pick<InventoryItem, 'cost_price' | 'stock_sets' | 'set_format' | 'leftover_pieces'>
    >;

    const inventoryWorth = inventoryRows.reduce(
      (sum, row) =>
        sum +
        inventoryLineValue(
          row.cost_price,
          row.stock_sets,
          row.set_format,
          row.leftover_pieces
        ),
      0
    );

    const topSellingSets = db
      .prepare(
        `SELECT oi.item_name AS name,
                SUM(oi.quantity) AS qty,
                SUM(oi.line_total) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status != 'Returned'
         GROUP BY oi.item_name
         ORDER BY qty DESC
         LIMIT 5`
      )
      .all() as Array<{ name: string; qty: number; revenue: number }>;

    const deliveries = db
      .prepare(
        `SELECT o.order_number, c.name AS customer_name, o.status,
                o.order_date, o.total
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         ORDER BY
           CASE o.status
             WHEN 'Pending Delivery' THEN 0
             WHEN 'Delivered' THEN 1
             ELSE 2
           END,
           o.order_date DESC
         LIMIT 25`
      )
      .all() as Array<{
      order_number: string;
      customer_name: string;
      status: OrderStatus;
      order_date: string;
      total: number;
    }>;

    const returnedItems = db
      .prepare(
        `SELECT o.order_number, oi.item_name, o.returned_at
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status = 'Returned'
         ORDER BY o.returned_at DESC
         LIMIT 25`
      )
      .all() as Array<{
      order_number: string;
      item_name: string;
      returned_at: string;
    }>;

    const discountLog = db
      .prepare(
        `SELECT o.order_number, c.name AS customer_name, oi.item_name,
                oi.list_price, oi.unit_price, oi.discount_amount, o.order_date
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN customers c ON c.id = o.customer_id
         WHERE oi.discount_amount > 0 AND o.status != 'Returned'
         ORDER BY o.order_date DESC
         LIMIT 30`
      )
      .all() as DashboardMetrics['discountLog'];

    return {
      monthlyRevenue: revenueRow.revenue,
      netProfit: revenueRow.profit,
      monthlyDiscount: revenueRow.discount,
      inventoryWorth,
      topSellingSets,
      deliveries,
      returnedItems,
      discountLog,
    };
  });
}
