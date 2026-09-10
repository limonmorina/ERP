import { contextBridge, ipcRenderer } from 'electron';
import type {
  BusinessSettings,
  Category,
  Customer,
  DashboardMetrics,
  InventoryItem,
  InvoicePayload,
  Order,
  OrderItemInput,
  OrderStatus,
  SetBreakdownPreview,
} from './types';

const api = {
  categories: {
    list: (): Promise<Category[]> => ipcRenderer.invoke('categories:list'),
    create: (payload: { name: string; description?: string }): Promise<Category> =>
      ipcRenderer.invoke('categories:create', payload),
  },
  inventory: {
    list: (): Promise<InventoryItem[]> => ipcRenderer.invoke('inventory:list'),
    create: (payload: {
      sku: string;
      name: string;
      category_id: number;
      set_format: string;
      stock_sets: number;
      cost_price: number;
      selling_price: number;
      notes?: string;
    }): Promise<InventoryItem> => ipcRenderer.invoke('inventory:create', payload),
    update: (payload: Partial<InventoryItem> & { id: number }): Promise<InventoryItem> =>
      ipcRenderer.invoke('inventory:update', payload),
    previewBreakdown: (payload: {
      inventory_item_id: number;
      set_format_requested: string;
      quantity?: number;
    }): Promise<SetBreakdownPreview> =>
      ipcRenderer.invoke('inventory:previewBreakdown', payload),
  },
  customers: {
    list: (): Promise<Customer[]> => ipcRenderer.invoke('customers:list'),
    create: (payload: {
      name: string;
      phone1: string;
      phone2?: string;
      delivery_address?: string;
      city?: string;
      country?: string;
    }): Promise<Customer> => ipcRenderer.invoke('customers:create', payload),
  },
  orders: {
    list: (): Promise<Order[]> => ipcRenderer.invoke('orders:list'),
    get: (
      orderId: number
    ): Promise<{ order: Order; items: unknown[]; customer: Customer }> =>
      ipcRenderer.invoke('orders:get', orderId),
    create: (payload: {
      customer_id: number;
      kapare: number;
      transport_fee: number;
      show_transport_on_invoice: boolean;
      custom_notes?: string;
      net_profit?: number;
      items: OrderItemInput[];
    }): Promise<Order> => ipcRenderer.invoke('orders:create', payload),
    updateStatus: (payload: {
      order_id: number;
      status: OrderStatus;
    }): Promise<Order> => ipcRenderer.invoke('orders:updateStatus', payload),
    updateProfit: (payload: {
      order_id: number;
      net_profit: number;
    }): Promise<Order> => ipcRenderer.invoke('orders:updateProfit', payload),
    delete: (orderId: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('orders:delete', orderId),
  },
  invoices: {
    getForOrder: (orderId: number): Promise<InvoicePayload> =>
      ipcRenderer.invoke('invoices:getForOrder', orderId),
    print: (orderId: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('invoices:print', orderId),
  },
  settings: {
    get: (): Promise<BusinessSettings> => ipcRenderer.invoke('settings:get'),
    update: (payload: Partial<BusinessSettings>): Promise<BusinessSettings> =>
      ipcRenderer.invoke('settings:update', payload),
  },
  analytics: {
    dashboard: (): Promise<DashboardMetrics> =>
      ipcRenderer.invoke('analytics:dashboard'),
  },
  backup: {
    run: (): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('backup:run'),
  },
};

contextBridge.exposeInMainWorld('erp', api);

export type ErpApi = typeof api;
