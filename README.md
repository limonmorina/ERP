# HSM Furniture ERP

Standalone Windows desktop ERP for **HSM Furniture** (furniture retail in Kosovo).

The shop runs everything on one PC: inventory, orders, analytics, and printable A4 invoices. There is no separate web server. Data is stored locally in SQLite. The UI is in Albanian for day-to-day use.

For architecture details, database paths, and business rules, see **[PROJECT.md](./PROJECT.md)**.

## What it does

| Area | Capabilities |
|------|----------------|
| **Inventory** | Add, edit, and soft-delete products; categories (including **Karrike** / chairs); set formats like `3-3-1` or meters `3.2-3.2`; leftover piece tracking; set-break preview; **product photos** |
| **Orders** | Multi-item lines, edit pending orders, kapare, transport (client-paid), discounts, status workflow, custom jobs outside warehouse stock |
| **Expenses** | Naftë and free-text expenses; subtracted from dashboard net profit |
| **Dashboard** | Monthly revenue and order profit only for **Delivered** orders; expenses reduce net profit; inventory worth; top sets; deliveries; returns |
| **Invoices** | Kosovo A4 layout, IBAN, TVSH, warranty, HSM logo; clients see sell price only (fair price hidden) |
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
- Profit = sell after discount - cost. Kapare is only a prepayment. Transport is client-paid and does not reduce profit.
- Monthly dashboard revenue and order profit count only **Delivered** orders. Expenses (Naftë, etc.) reduce net profit.
- Custom jobs never deduct warehouse stock.
- Returned and deleted warehouse orders restore stock when applicable.

## License

Private / unlicensed software for HSM Furniture. Do not publish live customer databases or secrets to public remotes.
