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
  set_format: string;
  stock_sets: number;
  leftover_pieces: string;
  cost_price: number;
  selling_price: number;
  notes: string;
  is_active: number;
  created_at: string;
  updated_at: string;
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
  inventory_item_id: number;
  set_format_requested: string;
  quantity: number;
  /** Optional manual fair/entitled price baseline for this combination. */
  entitled_price?: number;
  /** Actual selling price for this order (allows per-customer discount). */
  unit_price?: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  item_names?: string;
  status: OrderStatus;
  kapare: number;
  transport_fee: number;
  show_transport_on_invoice: number;
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
  inventory_item_id: number;
  item_name: string;
  set_format_requested: string;
  quantity: number;
  unit_cost: number;
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

export interface DashboardMetrics {
  monthlyRevenue: number;
  netProfit: number;
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
}

export interface SetBreakdownPreview {
  brokeSet: boolean;
  warning: string | null;
  feasible: boolean;
  message: string;
  setsConsumed: number;
  stockSetsAfter: number;
  leftoverAfter: Record<string, number>;
}
