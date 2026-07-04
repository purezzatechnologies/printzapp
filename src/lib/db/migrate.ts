import { rawDb } from "./client";

// Create tables idempotently. We use raw SQL so the migration doesn't depend
// on drizzle-kit being run by the user; the schema is defined in schema.ts
// for type-safety but the table-creation DDL lives here.
const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    gstin TEXT,
    phone TEXT,
    vendor_status TEXT,
    city TEXT,
    services TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    landmark TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS wishlist (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_slug TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (current_timestamp),
    PRIMARY KEY (user_id, product_slug)
  )`,
  `CREATE TABLE IF NOT EXISTS newsletter (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    image TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES categories(slug),
    base_price REAL NOT NULL,
    sku TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 4.5,
    reviews INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL,
    images TEXT NOT NULL DEFAULT '[]',
    video_urls TEXT NOT NULL DEFAULT '[]',
    badge TEXT,
    description TEXT NOT NULL,
    quantity_options TEXT NOT NULL DEFAULT '[]',
    sizes TEXT NOT NULL DEFAULT '[]',
    finishes TEXT NOT NULL DEFAULT '[]',
    turnarounds TEXT NOT NULL DEFAULT '[]',
    artwork_required INTEGER NOT NULL DEFAULT 1,
    artwork_hint TEXT NOT NULL DEFAULT '',
    swatches TEXT NOT NULL DEFAULT '[]',
    variations TEXT NOT NULL DEFAULT '[]',
    accepts_document_upload INTEGER NOT NULL DEFAULT 0,
    print_page_rates TEXT NOT NULL DEFAULT '[]',
    print_addons TEXT NOT NULL DEFAULT '[]',
    accepts_photo_upload INTEGER NOT NULL DEFAULT 0,
    photo_pricing_tiers TEXT NOT NULL DEFAULT '[]',
    photo_background_colors TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS customer_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    shipping TEXT,
    subtotal REAL NOT NULL,
    gst REAL NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS customer_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
    product_json TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    size TEXT NOT NULL,
    finish TEXT NOT NULL DEFAULT '',
    turnaround TEXT NOT NULL,
    artwork TEXT,
    customization TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_orders (
    id TEXT PRIMARY KEY,
    customer_order_id TEXT,
    customer TEXT NOT NULL,
    vendor_id TEXT,
    product TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    deadline TEXT NOT NULL,
    date TEXT NOT NULL,
    tracking_number TEXT,
    status_history TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_products (
    slug TEXT PRIMARY KEY,
    active INTEGER NOT NULL DEFAULT 0,
    daily_cap INTEGER NOT NULL DEFAULT 500,
    turnaround_days INTEGER NOT NULL DEFAULT 3
  )`,
  `CREATE TABLE IF NOT EXISTS pending_vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    services TEXT NOT NULL,
    applied_on TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    commission_percent REAL NOT NULL DEFAULT 18,
    minimum_payout REAL NOT NULL DEFAULT 500,
    free_shipping_threshold REAL NOT NULL DEFAULT 499,
    same_day_delivery INTEGER NOT NULL DEFAULT 1,
    ai_design_assistant INTEGER NOT NULL DEFAULT 1,
    vendor_self_onboarding INTEGER NOT NULL DEFAULT 0,
    international_shipping INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    min_order REAL NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    amount REAL NOT NULL,
    requested_at TEXT NOT NULL DEFAULT (current_timestamp),
    status TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    issue TEXT NOT NULL,
    detail TEXT,
    penalty REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS complaint_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    message TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS complaint_evidence (
    id TEXT PRIMARY KEY,
    complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    type TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    reach INTEGER NOT NULL DEFAULT 0,
    ctr TEXT NOT NULL DEFAULT '—',
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_settings (
    vendor_id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    gstin TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    pan_india INTEGER NOT NULL DEFAULT 0,
    pincodes TEXT NOT NULL DEFAULT '',
    hours TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS admin_team (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    last_seen TEXT NOT NULL DEFAULT 'Just now',
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    vendor_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    order_id TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
];

// Idempotent ALTER TABLE statements for columns added after the initial
// release. Each statement is wrapped in try/catch so it silently no-ops if
// the column already exists.
const POST_INIT_ALTERS = [
  `ALTER TABLE products ADD COLUMN accepts_document_upload INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN print_page_rates TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE products ADD COLUMN print_addons TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE products ADD COLUMN accepts_photo_upload INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN photo_pricing_tiers TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE products ADD COLUMN photo_background_colors TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE customer_orders ADD COLUMN discount REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE customer_orders ADD COLUMN coupon_code TEXT`,
  `ALTER TABLE platform_settings ADD COLUMN logo_url TEXT`,
  `ALTER TABLE platform_settings ADD COLUMN razorpay TEXT`,
  `ALTER TABLE platform_settings ADD COLUMN phonepe TEXT`,
  `ALTER TABLE platform_settings ADD COLUMN hero_slides TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE platform_settings ADD COLUMN admin_slug TEXT NOT NULL DEFAULT 'control'`,
  `ALTER TABLE platform_settings ADD COLUMN testimonials TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE vendor_settings ADD COLUMN documents TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE vendor_settings ADD COLUMN compliance TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE customer_orders ADD COLUMN payment TEXT`,
  `ALTER TABLE customer_orders ADD COLUMN refund TEXT`,
];

let migrated = false;

export function ensureMigrated() {
  if (migrated) return;
  for (const stmt of DDL) {
    rawDb.exec(stmt);
  }
  for (const stmt of POST_INIT_ALTERS) {
    try {
      rawDb.exec(stmt);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      // "duplicate column name" → column already exists; safe to ignore.
      if (!/duplicate column/i.test(msg)) {
        throw err;
      }
    }
  }
  migrated = true;
}
