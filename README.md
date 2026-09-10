# HSM Furniture ERP

Standalone desktop ERP for **HSM Furniture** (Kosovo furniture retail). Manages dynamic inventory (including set breakdown), orders with kapare/transport, analytics, and A4 invoices with TVSH.

For a full walkthrough of architecture, database paths, business rules, and desktop install, see **[PROJECT.md](./PROJECT.md)**.

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

- `npm run electron:dev` - Vite + Electron with hot reload
- `npm run electron:build` - production build + Windows installer in `release/`
- Manual backup: sidebar **Backup DB** (also runs automatically on app quit)

## Features

| Module | Capabilities |
|--------|----------------|
| Inventory | Add / edit / soft-delete, categories, set formats (`3-3-1`), leftovers, set-break preview |
| Orders | Customer details, kapare, remaining balance, transport toggle, custom notes, status workflow |
| Dashboard | Monthly revenue, net profit, top sets, delivery list, returns log |
| Invoices | Kosovo A4 layout, IBAN, TVSH, warranty footer, native print |
| Data protection | SQLite copy to Documents/`HSMFurniture/backups` on quit |

## Project layout

```
electron/          Main process, SQLite, IPC handlers
  database/        schema.sql, db init, backup
  ipc/             inventory, orders, invoices, analytics
  lib/             set breakdown + pricing helpers
src/               React UI
  pages/           Dashboard, Inventory, Orders, Invoice
```

## Notes

- Retail prices are treated as **TVSH-inclusive** (default 18%).
- Net profit per order: sell - supplier cost - transport (manual override allowed).
- Database file: `%APPDATA%\hsm-furniture-erp\data\furniture-erp.db`
- After code changes, rebuild and reinstall the Desktop app or it will stay on the old version.
