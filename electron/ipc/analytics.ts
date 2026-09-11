// IPC handlers for dashboard analytics in HSM Furniture ERP.
// Revenue and order profit count only Delivered orders; expenses reduce net profit.

import { ipcMain } from 'electron';
import { getDatabase } from '../database/db';
import { inventoryLineValue } from '../lib/setBreakdown';
import type { DashboardMetrics, Expense, InventoryItem, OrderStatus } from '../types';

function monthLocalStart(): string {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const y = monthStart.getFullYear();
  const m = String(monthStart.getMonth() + 1).padStart(2, '0');
  const d = String(monthStart.getDate()).padStart(2, '0');
  return `${y}-${m}-${d} 00:00:00`;
}

/** Register analytics IPC channels on the main process. */
export function registerAnalyticsHandlers(): void {
  ipcMain.handle('analytics:dashboard', (): DashboardMetrics => {
    const db = getDatabase();
    const monthLocal = monthLocalStart();

    // Only Delivered orders count. Use delivery date for the month (fallback: order_date).
    const deliveredMonthFilter = `status = 'Delivered' AND COALESCE(delivered_at, order_date) >= ?`;

    const revenueRow = db
      .prepare(
        `SELECT COALESCE(SUM(subtotal), 0) AS revenue,
                COALESCE(SUM(net_profit), 0) AS profit,
                COALESCE(SUM(CASE WHEN discount_total > 0 THEN discount_total ELSE 0 END), 0) AS discount
         FROM orders
         WHERE ${deliveredMonthFilter}`
      )
      .get(monthLocal) as { revenue: number; profit: number; discount: number };

    const expenseRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE expense_date >= ?`
      )
      .get(monthLocal) as { total: number };

    const monthlyExpenses = expenseRow.total || 0;
    const orderProfit = revenueRow.profit || 0;

    const inventoryRows = db
      .prepare(
        `SELECT cost_price, stock_sets, set_format, leftover_pieces, name
         FROM inventory_items WHERE is_active = 1`
      )
      .all() as Array<
      Pick<InventoryItem, 'cost_price' | 'stock_sets' | 'set_format' | 'leftover_pieces' | 'name'>
    >;

    const inventoryWorth = inventoryRows.reduce((sum, row) => {
      try {
        return (
          sum +
          inventoryLineValue(
            row.cost_price,
            row.stock_sets,
            row.set_format,
            row.leftover_pieces
          )
        );
      } catch (err) {
        console.error('[analytics] inventory worth skip:', row.name, err);
        return sum + (Number(row.cost_price) || 0) * (Number(row.stock_sets) || 0);
      }
    }, 0);

    const topSellingSets = db
      .prepare(
        `SELECT oi.item_name AS name,
                SUM(oi.quantity) AS qty,
                SUM(oi.line_total) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status = 'Delivered'
           AND COALESCE(o.delivered_at, o.order_date) >= ?
         GROUP BY oi.item_name
         ORDER BY qty DESC
         LIMIT 5`
      )
      .all(monthLocal) as Array<{ name: string; qty: number; revenue: number }>;

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
         WHERE oi.discount_amount > 0
           AND o.status = 'Delivered'
           AND COALESCE(o.delivered_at, o.order_date) >= ?
         ORDER BY COALESCE(o.delivered_at, o.order_date) DESC
         LIMIT 30`
      )
      .all(monthLocal) as DashboardMetrics['discountLog'];

    const recentExpensesList = db
      .prepare(
        `SELECT * FROM expenses
         WHERE expense_date >= ?
         ORDER BY expense_date DESC, id DESC
         LIMIT 20`
      )
      .all(monthLocal) as Expense[];

    return {
      monthlyRevenue: revenueRow.revenue,
      orderProfit,
      monthlyExpenses,
      netProfit: orderProfit - monthlyExpenses,
      monthlyDiscount: revenueRow.discount,
      inventoryWorth,
      topSellingSets,
      deliveries,
      returnedItems,
      discountLog,
      recentExpenses: recentExpensesList,
    };
  });
}
