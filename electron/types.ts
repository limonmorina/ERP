// Shared TypeScript contracts for HSM Furniture ERP.
// Used by the Electron main process, preload bridge, and renderer for IPC payloads.

/** Lifecycle status of a sales order. */
export type OrderStatus = 'Pending Delivery' | 'Delivered' | 'Returned';

export interface Category {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  category_name?: string;
  /** Hyphen-separated piece sizes for a complete set, e.g. "3-3-1". */
  set_format: string;
  stock_sets: number;
  /** JSON map of leftover piece size -> count after set breaks. */
  leftover_pieces: string;
  cost_price: number;
  selling_price: number;
  notes: string;
  /** Relative filename under userData/product-images (empty if none). */
  image_path: string;
  /** Soft-delete flag: 1 = active, 0 = hidden from lists. */
  is_active: number;
  created_at: string;
  updated_at: string;
  /** Optional data URL filled by inventory:getImage for UI thumbnails. */
  image_data_url?: string | null;
}

export interface Customer {
  id: number;
  name: string;
  phone1: string;
  phone2: string;
  delivery_address: string;
  city: string;
  country: string;
  created_at: string;
}

export interface OrderItemInput {
  /** Null/omitted for free-form custom jobs (outside warehouse stock). */
  inventory_item_id?: number | null;
  /** Display name; required for custom jobs, otherwise taken from inventory. */
  item_name?: string;
  set_format_requested: string;
  quantity: number;
  /** Optional manual fair/entitled price baseline for this combination. */
  entitled_price?: number;
  /** Actual selling price for this order (allows per-customer discount). */
  unit_price?: number;
  /** Supplier / job cost for profit (especially custom jobs). */
  unit_cost?: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  item_names?: string;
  status: OrderStatus;
  /** Deposit / down payment collected up front. */
  kapare: number;
  transport_fee: number;
  show_transport_on_invoice: number;
  /** 1 = custom / made-to-order job: does not consume warehouse stock. */
  is_custom_job: number;
  custom_notes: string;
  subtotal: number;
  tvsh_amount: number;
  total: number;
  remaining_balance: number;
  net_profit: number;
  discount_total: number;
  set_break_warning: number;
  set_break_message: string;
  order_date: string;
  delivered_at: string | null;
  returned_at: string | null;
}

export interface OrderItem {
  id: number;
  order_id: number;
  inventory_item_id: number | null;
  item_name: string;
  set_format_requested: string;
  quantity: number;
  unit_cost: number;
  /** Fair/entitled list price used as the discount baseline. */
  list_price: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  broke_set: number;
}

export interface BusinessSettings {
  id: number;
  business_name: string;
  address: string;
  phone: string;
  email: string;
  iban: string;
  bank_name: string;
  logo_path: string;
  tvsh_rate: number;
  backup_directory: string;
  warranty_text: string;
  terms_text: string;
}

export interface InvoicePayload {
  invoice_number: string;
  issued_at: string;
  order: Order;
  items: OrderItem[];
  customer: Customer;
  settings: BusinessSettings;
}

export interface DiscountLogRow {
  order_number: string;
  customer_name: string;
  item_name: string;
  list_price: number;
  unit_price: number;
  discount_amount: number;
  order_date: string;
}

/** Aggregated metrics returned by the analytics dashboard IPC. */
export interface DashboardMetrics {
  monthlyRevenue: number;
  /** Delivered order profits minus monthly expenses. */
  netProfit: number;
  /** Sum of delivered order net_profit before expenses. */
  orderProfit: number;
  monthlyExpenses: number;
  monthlyDiscount: number;
  inventoryWorth: number;
  topSellingSets: Array<{ name: string; qty: number; revenue: number }>;
  deliveries: Array<{
    order_number: string;
    customer_name: string;
    status: OrderStatus;
    order_date: string;
    total: number;
  }>;
  returnedItems: Array<{
    order_number: string;
    item_name: string;
    returned_at: string;
  }>;
  discountLog: DiscountLogRow[];
  recentExpenses: Expense[];
}

export interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

/** Result of a dry-run set-breakdown preview (no stock mutation). */
export interface SetBreakdownPreview {
  brokeSet: boolean;
  warning: string | null;
  feasible: boolean;
  message: string;
  setsConsumed: number;
  stockSetsAfter: number;
  leftoverAfter: Record<string, number>;
}
