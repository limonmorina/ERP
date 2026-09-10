/**
 * Ambient TypeScript declarations for the Vite renderer.
 * Exposes the Electron preload bridge (`window.erp`) so React code can call IPC safely.
 */
import type { ErpApi } from '../electron/preload';

declare global {
  interface Window {
    /** Preload-injected ERP API (inventory, orders, invoices, backup, analytics). */
    erp: ErpApi;
  }
}

declare module '*.png' {
  const src: string;
  export default src;
}

export {};
