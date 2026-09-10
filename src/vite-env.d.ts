import type { ErpApi } from '../electron/preload';

declare global {
  interface Window {
    erp: ErpApi;
  }
}

export {};
