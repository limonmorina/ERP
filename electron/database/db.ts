// SQLite access layer for HSM Furniture ERP.
// Opens the user-data database, applies schema/migrations, and seeds default categories/settings.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { PROFESSIONAL_WARRANTY } from '../lib/setBreakdown';

let db: Database.Database | null = null;

const DEFAULT_CATEGORIES = [
  { name: 'Dhoma e ndenjes', description: 'Divane, sete seksionale, mobilje për ndenje' },
  { name: 'Sete gjumi', description: 'Koleksione mobiljesh për dhomë gjumi' },
  { name: 'Dyshekë', description: 'Dyshekë dhe produkte gjumi' },
  { name: 'Komodë', description: 'Komodë dhe depozitim' },
  { name: 'Tavolina kafeje', description: 'Tavolina kafeje dhe anësore' },
  { name: 'Karrike', description: 'Karrige ngrënie, zyre dhe ndenjeje' },
];

/** Legacy English category names renamed to Albanian on existing installs. */
const CATEGORY_RENAMES: Record<string, string> = {
  'Living Room': 'Dhoma e ndenjes',
  'Bedroom Sets': 'Sete gjumi',
  Mattresses: 'Dyshekë',
  'Coffee Tables': 'Tavolina kafeje',
};

/** Absolute path to furniture-erp.db under Electron userData/data. */
export function getDbPath(): string {
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'furniture-erp.db');
}

/** Return the open connection, or throw if initDatabase has not run. */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Open SQLite, enable FK/WAL, apply schema.sql (or inline fallback), then seed and migrate.
 */
export function initDatabase(): Database.Database {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  // In vite-plugin-electron, assets may be next to compiled output or in source
  const altSchemaPath = path.join(app.getAppPath(), 'electron', 'database', 'schema.sql');
  const resolvedSchema = fs.existsSync(schemaPath)
    ? schemaPath
    : altSchemaPath;

  if (!fs.existsSync(resolvedSchema)) {
    // Fallback: inline minimal schema if file missing during early boot
    applyInlineSchema(db);
  } else {
    const schema = fs.readFileSync(resolvedSchema, 'utf-8');
    db.exec(schema);
  }

  seedDefaults(db);
  migrateSchema(db);
  return db;
}

/**
 * Additive migrations for columns introduced after the initial schema.
 * Safe to re-run: only ALTER when the column is missing.
 */
function migrateSchema(database: Database.Database): void {
  const orderCols = database.prepare(`PRAGMA table_info(orders)`).all() as Array<{ name: string }>;
  const orderNames = new Set(orderCols.map((c) => c.name));
  if (!orderNames.has('discount_total')) {
    database.exec(`ALTER TABLE orders ADD COLUMN discount_total REAL NOT NULL DEFAULT 0`);
  }

  const itemCols = database.prepare(`PRAGMA table_info(order_items)`).all() as Array<{ name: string }>;
  const itemNames = new Set(itemCols.map((c) => c.name));
  if (!itemNames.has('list_price')) {
    database.exec(`ALTER TABLE order_items ADD COLUMN list_price REAL NOT NULL DEFAULT 0`);
    database.exec(`UPDATE order_items SET list_price = unit_price WHERE list_price = 0`);
  }
  if (!itemNames.has('discount_amount')) {
    database.exec(`ALTER TABLE order_items ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
  }

  const inventoryCols = database
    .prepare(`PRAGMA table_info(inventory_items)`)
    .all() as Array<{ name: string }>;
  const inventoryNames = new Set(inventoryCols.map((c) => c.name));
  if (!inventoryNames.has('image_path')) {
    database.exec(`ALTER TABLE inventory_items ADD COLUMN image_path TEXT NOT NULL DEFAULT ''`);
  }

  // Upgrade short warranty to professional text if still the old one-liner
  const settings = database
    .prepare('SELECT warranty_text FROM business_settings WHERE id = 1')
    .get() as { warranty_text: string } | undefined;
  if (
    settings &&
    settings.warranty_text ===
      'Garancioni nuk mbulon dëmtimet e qëllimshme ose përdorimin e gabuar të produktit'
  ) {
    database
      .prepare('UPDATE business_settings SET warranty_text = ? WHERE id = 1')
      .run(PROFESSIONAL_WARRANTY);
  }
}

/** Embedded schema used when schema.sql cannot be resolved at runtime. */
function applyInlineSchema(database: Database.Database): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
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
      warranty_text TEXT NOT NULL DEFAULT 'Garancioni nuk mbulon dëmtimet e qëllimshme ose përdorimin e gabuar të produktit',
      terms_text TEXT NOT NULL DEFAULT 'Pagesa e plotë kërkohet para dorëzimit. Mallrat mbeten pronë e dyqanit deri në shlyerjen e plotë.'
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
      set_format TEXT NOT NULL DEFAULT '1',
      stock_sets INTEGER NOT NULL DEFAULT 0,
      leftover_pieces TEXT NOT NULL DEFAULT '',
      cost_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      image_path TEXT NOT NULL DEFAULT '',
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
      status TEXT NOT NULL DEFAULT 'Pending Delivery',
      kapare REAL NOT NULL DEFAULT 0,
      transport_fee REAL NOT NULL DEFAULT 0,
      show_transport_on_invoice INTEGER NOT NULL DEFAULT 1,
      custom_notes TEXT DEFAULT '',
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
      set_format_requested TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      list_price REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
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
  `);
}

/**
 * First-run defaults: singleton business_settings row and Albanian categories.
 * Also renames legacy English category labels on existing databases.
 */
function seedDefaults(database: Database.Database): void {
  const settings = database.prepare('SELECT id, business_name FROM business_settings WHERE id = 1').get() as
    | { id: number; business_name: string }
    | undefined;
  if (!settings) {
    const backupDir = path.join(app.getPath('documents'), 'HSMFurniture', 'backups');
    database
      .prepare(
        `INSERT INTO business_settings (id, business_name, backup_directory) VALUES (1, ?, ?)`
      )
      .run('HSM Furniture', backupDir);
  } else if (
    settings.business_name === 'Dyqani i Mobiljeve' ||
    settings.business_name === 'Kosovo Furniture'
  ) {
    database
      .prepare(`UPDATE business_settings SET business_name = ? WHERE id = 1`)
      .run('HSM Furniture');
  }

  const count = database.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number };
  if (count.c === 0) {
    const insert = database.prepare(
      'INSERT INTO categories (name, description) VALUES (?, ?)'
    );
    const tx = database.transaction(() => {
      for (const cat of DEFAULT_CATEGORIES) {
        insert.run(cat.name, cat.description);
      }
    });
    tx();
  } else {
    const rename = database.prepare('UPDATE categories SET name = ? WHERE name = ?');
    const insertMissing = database.prepare(
      'INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)'
    );
    const tx = database.transaction(() => {
      for (const [from, to] of Object.entries(CATEGORY_RENAMES)) {
        rename.run(to, from);
      }
      // Ensure newer categories (e.g. Karrike) exist on older databases
      for (const cat of DEFAULT_CATEGORIES) {
        insertMissing.run(cat.name, cat.description);
      }
    });
    tx();
  }
}

/** Close the SQLite connection and clear the module singleton. */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
