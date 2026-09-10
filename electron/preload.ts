// Preload bridge for HSM Furniture ERP.
// Exposes a typed `window.erp` API to the renderer via contextBridge (no Node access in the UI).

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

/** Renderer-facing IPC facade. Each method maps 1:1 to a main-process handler. */
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
      leftover_pieces?: string;
      cost_price: number;
      selling_price: number;
      notes?: string;
      image_path?: string;
      image_base64?: string;
      image_mime?: string;
    }): Promise<InventoryItem> => ipcRenderer.invoke('inventory:create', payload),
    update: (
      payload: Partial<InventoryItem> & {
        id: number;
        image_base64?: string;
        image_mime?: string;
        clear_image?: boolean;
      }
    ): Promise<InventoryItem> => ipcRenderer.invoke('inventory:update', payload),
    // Soft-delete: deactivate the item rather than removing the row
    remove: (id: number): Promise<InventoryItem> =>
      ipcRenderer.invoke('inventory:update', { id, is_active: 0 }),
    getImage: (payload: { image_path?: string; id?: number }): Promise<string | null> =>
      ipcRenderer.invoke('inventory:getImage', payload),
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
      is_custom_job?: boolean;
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
