# HSM Furniture ERP - Project Guide

This document explains how the whole project works: architecture, folders, data flow, business rules, how to run it in development, and how to install the Windows desktop app.

## What this app is

HSM Furniture ERP is a standalone desktop application for a furniture store in Kosovo. It is not a website with a separate server. Everything runs on one PC:

- Electron hosts the desktop window
- React draws the screens
- SQLite stores all business data on disk
- IPC (inter-process communication) is how the UI talks to the database

Typical work the shop does with this app:

- Track inventory (full sets and leftover pieces), including product photos
- Create orders with kapare, transport, and custom set combinations
- See dashboard metrics for the current month
- Print A4 invoices with TVSH and the HSM logo
- Back up the database automatically on quit

Brand assets:

- App / invoice logo: `src/assets/logo.png` (also `public/logo.png`)
- Windows desktop icon: `build/icon.ico` (from `build/icon.png`)

## High-level architecture

```
+---------------------------+          IPC (secure bridge)          +---------------------------+
| Renderer (React UI)       |  <----------------------------------> | Main process (Electron)   |
| src/                      |   window.erp.* from preload.ts        | electron/                 |
| Pages, forms, tables      |                                       | SQLite, business logic    |
+---------------------------+                                       +---------------------------+
                                                                              |
                                                                              v
                                                                    furniture-erp.db (SQLite)
```

Important security choices:

- `contextIsolation: true`
- `nodeIntegration: false`
- The UI never opens SQLite directly
- Only `electron/preload.ts` exposes a typed API as `window.erp`

## Folder map

```
ERP/
  electron/                 Electron main process (Node side)
    main.ts                 App window, startup, quit backup
    preload.ts              Safe bridge exposed as window.erp
    types.ts                Shared TypeScript types
    database/
      schema.sql            Table definitions
      db.ts                 Open DB, migrate, seed defaults
      backup.ts             Copy DB to Documents backups folder
    ipc/
      inventory.ts          Categories + inventory CRUD + set preview
      orders.ts             Customers, orders, stock apply/restore
      invoices.ts           Invoice payload + print
      analytics.ts          Dashboard metrics
    lib/
      setBreakdown.ts       Set math, fair price, profit helpers
  src/                      React renderer (UI)
    main.tsx                React root + HashRouter
    App.tsx                 Routes
    pages/                  Dashboard, Inventory, Orders, Invoice
    components/             Layout, warnings
    lib/                    Formatting, labels, pricing helpers
  release/                  Built Windows installer output
  dist/                     Built React UI
  dist-electron/            Built Electron main + preload
  package.json              Scripts + electron-builder config
  vite.config.ts            Vite + Electron plugin + schema copy
  PROJECT.md                This guide
  README.md                 Short quick-start summary
```

## How data is stored

### Database location

Live database path (Windows):

`%APPDATA%\hsm-furniture-erp\data\furniture-erp.db`

That is usually:

`C:\Users\<you>\AppData\Roaming\hsm-furniture-erp\data\furniture-erp.db`

Notes:

- Development (`npm run electron:dev`) and the installed desktop app use the same `userData` folder name from `package.json` (`hsm-furniture-erp`), so they share the same DB if only one copy is open.
- Do not run the installed app and `electron:dev` at the same time. SQLite can lock and the second app may fail to open.

### Backups

On quit (and from the sidebar Backup button), the app copies the DB to:

`Documents\HSMFurniture\backups\furniture-erp-backup-<timestamp>.db`

It keeps the newest 30 backup files.

### Main tables

| Table | Purpose |
|-------|---------|
| `business_settings` | Shop name, IBAN, TVSH rate, warranty text, backup folder |
| `categories` | Inventory categories (Albanian defaults) |
| `inventory_items` | SKU, set format, stock sets, leftovers JSON, cost, list price, optional product photo |
| `customers` | Buyer contact and delivery address |
| `orders` | Kapare, transport, totals, profit, status, set-break flags |
| `order_items` | Lines sold, requested format, list vs sell price, discount |
| `invoices` | Invoice number linked 1:1 to an order |

`inventory_items.leftover_pieces` is JSON like `{"3":1,"1":2}` meaning one 3-seat piece and two 1-seat pieces left over after breaking sets.

`inventory_items.image_path` stores a relative filename under `%APPDATA%\hsm-furniture-erp\product-images\`. The UI loads photos as data URLs through `inventory:getImage`.

Soft delete: setting `is_active = 0` hides an inventory item from the list without removing order history.

Default categories include Dhoma e ndenjes, Sete gjumi, Dyshekë, Komodë, Tavolina kafeje, and Karrike (chairs).

## Business rules (short)

### Set formats

Formats are hyphen-separated piece sizes, for example `3-3-1`.

- Stock is counted as complete sets plus leftover pieces
- Selling a different combination (example `3-3-3-1`) may consume more than one set and leave leftovers
- The UI can preview that breakdown before creating an order

### Pricing

- Catalog / list price is TVSH-inclusive (default 18%)
- Fair / entitled price for a custom combo scales by seat-unit ratio versus the full set
- "Zbritja" (discount) only applies when final sell price is below fair price
- Profit is roughly: sell - proportional cost - transport (can be overridden manually on the order)
- Invoices never show profit

### Order statuses

- `Pending Delivery` (pending)
- `Delivered`
- `Returned` (stock is restored)

Deleting an order also restores stock when applicable.

## UI pages

| Route (HashRouter) | Page | What it does |
|--------------------|------|--------------|
| `#/` | Dashboard | Month revenue, profit, inventory worth, top sets, deliveries, returns |
| `#/inventory` | Inventory | Add, edit, soft-delete items; set-break preview |
| `#/orders` | Orders | Create orders, status tabs, edit profit, open invoice |
| `#/invoices/:orderId` | Invoice | A4 preview and print |

HashRouter is required for the packaged desktop app because it loads files with the `file://` protocol. BrowserRouter would show a blank window after install.

## IPC API (window.erp)

Examples the UI calls:

- `window.erp.inventory.list()`
- `window.erp.inventory.create(...)`
- `window.erp.inventory.update({ id, ... })`
- `window.erp.inventory.remove(id)` (sets `is_active = 0`)
- `window.erp.orders.create(...)`
- `window.erp.orders.updateStatus(...)`
- `window.erp.invoices.getForOrder(id)`
- `window.erp.invoices.print(id)`
- `window.erp.analytics.dashboard()`
- `window.erp.backup.run()`

Handlers live under `electron/ipc/`. Types live in `electron/types.ts`. Preload wires them in `electron/preload.ts`.

## Development workflow

Install once:

```bash
npm install
npm run rebuild
```

Run the app with hot reload:

```bash
npm run electron:dev
```

Useful scripts from `package.json`:

| Script | Meaning |
|--------|---------|
| `npm run electron:dev` | Start Vite + Electron for daily development |
| `npm run electron:build` | Build React + Electron and create Windows installer |
| `npm run rebuild` | Rebuild native module `better-sqlite3` for Electron |
| `npm run build` | Production compile without packaging installer |

## Desktop install (Windows)

Why edits sometimes "do not show" on the Desktop shortcut:

The Desktop app is a packaged copy. Changing source code (or even running `electron:dev`) does not update the installed `.exe` until you rebuild and reinstall.

Steps:

1. Close the Desktop app and stop `npm run electron:dev`
2. Run `npm run electron:build`
3. Install `release\HSM Furniture ERP Setup 1.0.0.exe`
4. Open HSM Furniture ERP from Desktop or Start Menu

Installer output folder: `release/`

Native module note: `better-sqlite3` is unpacked from asar (`asarUnpack` in `package.json`) so the `.node` binary can load correctly.

## Source comments

Key TypeScript, SQL, CSS, and config files include file headers and section comments that explain:

- What the file is responsible for
- How major functions fit into the flow
- Non-obvious business logic (set math, pricing, migrations)

Read those comments when changing a module. Prefer updating the comment if you change the behavior.

## Common troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Desktop app is blank | Old build using BrowserRouter, or failed UI load | Rebuild/reinstall with current code (HashRouter) |
| Desktop app does not show latest features | Installed app is outdated | Rebuild and reinstall Setup exe |
| Database error on open | Another copy of the app holds the DB lock | Close Desktop app and `electron:dev`, open only one |
| Empty inventory on Desktop | Fresh DB or different expectation | Same AppData DB is used; add/edit items, or restore a backup |
| `better-sqlite3` ABI errors in Node scripts | Module built for Electron, not system Node | Use the app itself, or rebuild for the target runtime |

## Suggested reading order for developers

1. `PROJECT.md` (this file)
2. `electron/main.ts` then `electron/preload.ts`
3. `electron/database/schema.sql` then `electron/database/db.ts`
4. `electron/lib/setBreakdown.ts`
5. `electron/ipc/orders.ts` and `electron/ipc/inventory.ts`
6. `src/App.tsx` and the page you need to change

## License / ownership

Private / unlicensed shop software for HSM Furniture. Do not publish secrets, live databases, or customer data to public remotes.
