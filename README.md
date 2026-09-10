# HSM Furniture ERP

Standalone desktop ERP for **HSM Furniture** (Kosovo furniture retail). Manages dynamic inventory (including set breakdown), orders with kaparë/transport, analytics, and A4 invoices with TVSH.

## Stack

- **Electron** desktop shell
- **React + TypeScript + Tailwind CSS** UI
- **SQLite** via `better-sqlite3`
- **A4 printing** via HTML layout + `webContents.print()`

## Quick start

```bash
npm install
npm run rebuild
npm run electron:dev
```

- `npm run electron:dev` — Vite + Electron with hot reload  
- `npm run build` — production renderer + electron compile  
- Manual backup: sidebar **Backup DB** (also runs automatically on app quit)

## Features (foundation)

| Module | Capabilities |
|--------|----------------|
| Inventory | Categories (Living Room, Bedroom Sets, Mattresses, Komodë, Coffee Tables), cost vs retail, set formats (`3-3-1`), leftover piece tracking, set-break preview warning |
| Orders | Customer details, kaparë, remaining balance, transport + invoice visibility toggle, custom notes (*Këndë me dimensione*), status workflow |
| Dashboard | Monthly revenue, net profit, top sets, delivery list, returns log |
| Invoices | Kosovo A4 layout, IBAN, TVSH, warranty footer, native print |
| Data protection | SQLite copy to Documents/`HSMFurniture/backups` on quit |

## Project layout

```
electron/          Main process, SQLite, IPC handlers
  database/        schema.sql, db init, backup
  ipc/             inventory, orders, invoices, analytics
  lib/             set breakdown + TVSH helpers
src/               React UI
  pages/           Dashboard, Inventory, Orders, Invoice
```

## Set breakdown

Stock is held as complete sets (e.g. `3-3-1`). Selling a custom combination (e.g. `3-3-3-1`) may break sets; the UI shows:

> Warning: Breaking complete set. Unmatched pieces remaining.

## Notes

- Retail prices are treated as **TVSH-inclusive** (default 18%).
- Net profit per order: `selling − supplier cost − transport`.
- Database file lives under Electron `userData/data/furniture-erp.db`.
