-- HSM Furniture ERP - SQLite schema
-- Defines persistent tables for settings, inventory, customers, orders, and invoices.
-- Applied on startup via CREATE TABLE IF NOT EXISTS (idempotent for existing installs).

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Singleton shop profile and invoice/legal defaults (always id = 1)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'HSM Furniture',
  address TEXT NOT NULL DEFAULT 'Prishtinë, Kosovë',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  iban TEXT DEFAULT 'XK05 0000 0000 0000 0000',
  bank_name TEXT DEFAULT 'Banka Ekonomike',
  logo_path TEXT DEFAULT '',
  tvsh_rate REAL NOT NULL DEFAULT 0.18,
  backup_directory TEXT DEFAULT '',
  warranty_text TEXT NOT NULL DEFAULT 'GARANCIONI PROFESIONAL - HSM Furniture

1. Produktet garantohet për defekte të fabrikimit dhe materialeve, sipas kushteve të mëposhtme.
2. Garancioni vlen vetëm me faturën origjinale dhe për blerësin e parë.
3. Garancioni nuk mbulon dëmtimet e qëllimshme, përdorimin e gabuar, transportin e palejuar, lagështinë, zjarrin, ose ndryshimet e bëra nga persona të paautorizuar.
4. Ngjyrat dhe materialet mund të kenë ndryshime të vogla natyrore; këto nuk konsiderohen defekt.
5. Montimi dhe mirëmbajtja duhet të bëhen sipas udhëzimeve të prodhuesit.
6. Për pretendime, klienti duhet të njoftojë HSM Furniture me shkrim brenda afatit ligjor, duke bashkangjitur faturën.
7. Nënshkrimi i klientit në këtë faturë konfirmon se ka lexuar, kuptuar dhe pranuar kushtet e garancisë dhe kushtet e përgjithshme të shitjes.',
  terms_text TEXT NOT NULL DEFAULT 'Pagesa e plotë kërkohet para dorëzimit. Mallrat mbeten pronë e dyqanit deri në shlyerjen e plotë. Ankesat pranohen brenda 7 ditëve nga dorëzimi. Me nënshkrimin e kësaj fature, klienti pranon të gjitha kushtet e mësipërme.'
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  set_format TEXT NOT NULL DEFAULT '1', -- e.g. "3-3-1"
  stock_sets INTEGER NOT NULL DEFAULT 0,
  leftover_pieces TEXT NOT NULL DEFAULT '', -- JSON map of piece size -> count
  cost_price REAL NOT NULL DEFAULT 0, -- supplier cost (ex-VAT or as entered)
  selling_price REAL NOT NULL DEFAULT 0, -- retail inclusive of TVSH
  notes TEXT DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '', -- relative filename under userData/product-images
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone1 TEXT NOT NULL DEFAULT '',
  phone2 TEXT DEFAULT '',
  delivery_address TEXT DEFAULT '',
  city TEXT DEFAULT 'Prishtinë',
  country TEXT DEFAULT 'Kosovë',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'Pending Delivery'
    CHECK (status IN ('Pending Delivery', 'Delivered', 'Returned')),
  kapare REAL NOT NULL DEFAULT 0, -- deposit / down payment
  transport_fee REAL NOT NULL DEFAULT 0,
  show_transport_on_invoice INTEGER NOT NULL DEFAULT 1,
  custom_notes TEXT DEFAULT '', -- e.g. corner dimensions
  subtotal REAL NOT NULL DEFAULT 0,
  tvsh_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  remaining_balance REAL NOT NULL DEFAULT 0,
  net_profit REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  set_break_warning INTEGER NOT NULL DEFAULT 0,
  set_break_message TEXT DEFAULT '',
  order_date TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT,
  returned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  item_name TEXT NOT NULL,
  set_format_requested TEXT NOT NULL, -- e.g. "3-3-3-1"
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  list_price REAL NOT NULL DEFAULT 0, -- entitled/fair price baseline
  unit_price REAL NOT NULL DEFAULT 0, -- actual sell price
  discount_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  broke_set INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  pdf_path TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
