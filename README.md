# HSM Furniture ERP

Standalone Windows desktop ERP for **HSM Furniture** (furniture retail in Kosovo).

The shop runs everything on one PC: inventory, orders, analytics, and printable A4 invoices. There is no separate web server. Data is stored locally in SQLite. The UI is in Albanian for day-to-day use.

For architecture details, database paths, and business rules, see **[PROJECT.md](./PROJECT.md)**.

## What it does

| Area | Capabilities |
|------|----------------|
| **Inventory** | Add, edit, and soft-delete products; categories (including **Karrike** / chairs); set formats like `3-3-1`; leftover piece tracking; set-break preview; **product photos** to tell apart items with the same name |
| **Orders** | Customers, kapare, remaining balance, transport (optional on invoice), custom notes, status workflow (pending / delivered / returned), fair-price math for staff, client discount when sell price is below fair price, editable profit |
| **Dashboard** | Monthly revenue, net profit, inventory worth at cost, top sets, deliveries, returns |
| **Invoices** | Kosovo A4 layout, IBAN, TVSH (inclusive pricing), warranty and signature lines, HSM logo; clients see sell price only (fair price is hidden) |
| **Brand** | Logo in the app sidebar/header, on invoices, and as the Windows desktop icon |
| **Backup** | Automatic SQLite backup on quit, plus manual backup from the sidebar |

## Stack

- **Electron** - desktop shell
- **React + TypeScript + Tailwind CSS** - UI
- **SQLite** (`better-sqlite3`) - local database
- **Vite** + electron-builder - dev server and Windows installer

## Quick start (development)

```bash
npm install
npm run rebuild
npm run electron:dev
```

| Command | Purpose |
|---------|---------|
| `npm run electron:dev` | Vite + Electron with hot reload |
| `npm run electron:build` | Production build + Windows installer in `release/` |
| `npm run rebuild` | Rebuild native module `better-sqlite3` for Electron |

## Install the desktop app (Windows)

Code changes do **not** update the Desktop shortcut by themselves.

1. Close the running app (and stop `electron:dev` if it is open).
2. Run `npm run electron:build`.
3. Install `release/HSM Furniture ERP Setup 1.0.0.exe`.
4. Open **HSM Furniture ERP** from the Desktop or Start Menu.

Do not run the installed app and `electron:dev` at the same time; they share the same database and can lock each other.

## Project layout

```
electron/                 Main process (SQLite, IPC, backup, print)
  database/               schema.sql, db init, migrations, backup
  ipc/                    inventory, orders, invoices, analytics
  lib/                    set breakdown, pricing, product images
  preload.ts              Secure bridge -> window.erp
src/                      React UI
  pages/                  Dashboard, Inventory, Orders, Invoice
  components/             Layout, warnings, product thumbnails
  assets/logo.png         Brand logo used in UI and invoices
build/icon.ico            Windows application icon
public/                   Static assets copied into the build
PROJECT.md                Full technical guide
```

## Data location

| What | Where |
|------|--------|
| Live database | `%APPDATA%\hsm-furniture-erp\data\furniture-erp.db` |
| Product photos | `%APPDATA%\hsm-furniture-erp\product-images\` |
| Backups | `Documents\HSMFurniture\backups\` (keeps the newest 30) |

## Business notes

- Retail / list prices are **TVSH-inclusive** (default 18%).
- Stock is held as complete sets plus leftover pieces after custom combinations are sold.
- Fair / entitled price is used internally for staff pricing and profit; it is **not** shown on the customer invoice.
- Net profit per order is roughly: sell - proportional supplier cost - transport (manual override allowed).
- Returned and deleted orders restore stock when applicable.

## License

Private / unlicensed software for HSM Furniture. Do not publish live customer databases or secrets to public remotes.
