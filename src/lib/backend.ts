import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { loadStoreFromDb, saveStoreToDb } from "@/lib/db/storeAdapter";

// `useSession` is server-only. It only runs inside `createServerFn().handler`
// callbacks, which TanStack extracts as server-only chunks. On the client,
// the import-protection plugin replaces the specifier with a virtual mock
// (configured via `behavior.dev: "mock"` in vite.config.ts). For production
// builds the behavior reverts to "error" so any real client leak fails CI.
type SessionData = { userId?: string };

const isProduction =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

const sessionSecret =
  (typeof process !== "undefined"
    ? process.env?.SESSION_SECRET
    : undefined) ?? "printzapp-development-session-secret-32chars";

// In production the session secret MUST be overridden — the dev fallback would
// let anyone forge session cookies. Fail loudly rather than ship insecure.
if (isProduction && !process.env?.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is required in production. Set a long random value (32+ chars).",
  );
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt + per-user salt). Stored as `scrypt$salt$hash`.
// Legacy plaintext values are still accepted on login and transparently
// upgraded to a hash, so existing accounts keep working.
// ---------------------------------------------------------------------------
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function isHashed(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

function verifyPassword(plain: string, stored: string): boolean {
  if (isHashed(stored)) {
    const [, salt, hashHex] = stored.split("$");
    if (!salt || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(plain, salt, 64);
    return (
      expected.length === actual.length && timingSafeEqual(actual, expected)
    );
  }
  // Legacy plaintext comparison (timing-safe).
  const a = Buffer.from(plain);
  const b = Buffer.from(stored ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Login rate limiting — per-identifier sliding window to blunt brute force.
// In-memory (per server process); good enough for a single-node deploy.
// ---------------------------------------------------------------------------
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

function loginRateState(key: string): { blocked: boolean; retryMin: number } {
  const rec = loginAttempts.get(key);
  if (!rec) return { blocked: false, retryMin: 0 };
  if (Date.now() - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { blocked: false, retryMin: 0 };
  }
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    return {
      blocked: true,
      retryMin: Math.ceil(
        (LOGIN_WINDOW_MS - (Date.now() - rec.firstAt)) / 60000,
      ),
    };
  }
  return { blocked: false, retryMin: 0 };
}

function recordLoginFailure(key: string) {
  const rec = loginAttempts.get(key);
  if (!rec || Date.now() - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    rec.count += 1;
  }
}

function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}

function useAppSession() {
  return useSession<SessionData>({
    name: "printzapp-session",
    password: sessionSecret,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure:
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "production",
    },
  });
}
import {
  weeklyRevenue as seedWeeklyRevenue,
  orderStatusBreakdown as seedOrderStatusBreakdown,
  type Category,
  type Product,
} from "@/lib/data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = "customer" | "vendor" | "superadmin";

type SavedAddress = {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault: boolean;
};

type AppUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  gstin?: string;
  phone?: string;
  createdAt: string;
  // Vendor-only enrichment
  vendorStatus?: "pending" | "active" | "warning" | "suspended";
  city?: string;
  services?: string;
  // Customer-only
  addresses?: SavedAddress[];
  wishlist?: string[]; // product slugs
};

type OrderItem = {
  id: string;
  product: {
    id: string;
    slug: string;
    name: string;
    image: string;
    category: string;
    basePrice: number;
  };
  quantity: number;
  size: string;
  finish: string;
  turnaround: { label: string; days: number; multiplier: number };
  artwork: { id?: string; name: string; size: number; type: string } | null;
  customization?: {
    printSides?: string;
    dimensions?: { width: string; height: string; unit: string } | null;
    notes?: string;
    contactName?: string;
    contactPhone?: string;
  };
};

type CustomerOrder = {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  shipping?: {
    fullName: string;
    phone: string;
    email: string;
    pincode: string;
    address: string;
    city: string;
    state: string;
    company?: string;
    landmark?: string;
    gstin?: string;
  };
  items: OrderItem[];
  subtotal: number;
  discount?: number;
  couponCode?: string;
  gst: number;
  total: number;
  status: "confirmed" | "processing" | "dispatched" | "delivered" | "cancelled";
  /** How the order was paid. `manual` = no online gateway configured. */
  payment?: {
    method: "razorpay" | "phonepe" | "manual";
    reference?: string;
    status: "paid" | "pending";
  };
  /** Refund lifecycle for dispute resolution. Absent → no refund activity. */
  refund?: {
    status: "requested" | "approved" | "processing" | "completed" | "rejected";
    amount: number;
    reason?: string;
    reference?: string;
    note?: string;
    requestedAt?: string;
    updatedAt?: string;
  };
  createdAt: string;
};

type VendorOrderStatus =
  | "new"
  | "accepted"
  | "in_production"
  | "quality_check"
  | "dispatched"
  | "completed"
  | "cancelled";

type StatusEvent = { status: VendorOrderStatus; at: string };

type VendorOrder = {
  id: string;
  customerOrderId?: string;
  customer: string;
  vendorId?: string;
  product: string;
  amount: number;
  status: VendorOrderStatus;
  deadline: string;
  date: string;
  trackingNumber?: string;
  statusHistory?: StatusEvent[];
};

type VendorProduct = {
  slug: string;
  active: boolean;
  dailyCap: number;
  turnaroundDays: number;
};

type RazorpayConfig = {
  enabled: boolean;
  keyId: string;
  /** Server-only — never sent to the client. */
  keySecret: string;
  mode: "test" | "live";
};

type PhonePeConfig = {
  enabled: boolean;
  merchantId: string;
  /** Server-only — never sent to the client. */
  saltKey: string;
  saltIndex: string;
  mode: "test" | "live";
};

type Testimonial = {
  name: string;
  role: string;
  quote: string;
  /** Avatar / logo icon: an uploaded image data URL or an image URL. */
  avatar: string;
};

type PlatformSettings = {
  commissionPercent: number;
  minimumPayout: number;
  freeShippingThreshold: number;
  /** Custom brand logo as a data URL. Null → use the bundled default logo. */
  logoUrl?: string | null;
  /** Homepage hero slider images (data URLs or absolute/relative URLs). */
  heroSlides?: string[];
  /** "Loved by businesses" testimonials shown on the homepage. */
  testimonials?: Testimonial[];
  /** Secret URL slug for the staff/admin sign-in page (default "control"). */
  adminSlug?: string;
  /** Razorpay payment gateway config (secret is never returned to clients). */
  razorpay?: RazorpayConfig;
  /** PhonePe payment gateway config (salt key is never returned to clients). */
  phonepe?: PhonePeConfig;
  flags: {
    sameDayDelivery: boolean;
    aiDesignAssistant: boolean;
    vendorSelfOnboarding: boolean;
    internationalShipping: boolean;
  };
};

type Coupon = {
  code: string;
  type: string;
  description: string;
  minOrder: number;
  used: number;
  limit: number;
  status: "active" | "paused" | "expired";
  createdAt: string;
};

type Payout = {
  id: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "paid";
};

type ComplaintEvidence = {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedBy: string;
  uploadedAt: string;
};

type Complaint = {
  id: string;
  orderId: string;
  customerName: string;
  vendorId: string;
  vendorName: string;
  issue: string;
  detail?: string;
  penalty: number;
  status: "open" | "responded" | "escalated" | "resolved";
  createdAt: string;
  responses: { author: string; message: string; at: string }[];
  evidence: ComplaintEvidence[];
};

type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: "Draft" | "Scheduled" | "Live" | "Paused" | "Ended";
  reach: number;
  ctr: string;
  createdAt: string;
};

type WeekDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

type WorkingHour = { day: WeekDay; from: string; to: string; on: boolean };

type VendorSettings = {
  vendorId: string;
  businessName: string;
  gstin: string;
  email: string;
  phone: string;
  panIndia: boolean;
  pincodes: string;
  hours: WorkingHour[];
};

type PendingVendor = {
  id: string;
  name: string;
  city: string;
  services: string;
  appliedOn: string;
};

type AdminMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  lastSeen: string;
  createdAt: string;
};

type AppNotification = {
  id: string;
  // Who should see it: all super admins, or a specific vendor.
  scope: "superadmin" | "vendor";
  vendorId?: string;
  type:
    | "order_new"
    | "order_status"
    | "complaint"
    | "complaint_reply"
    | "refund"
    | "vendor_status"
    | "payout";
  title: string;
  message: string;
  orderId?: string;
  read: boolean;
  createdAt: string;
};

type Store = {
  users: AppUser[];
  newsletter: string[];
  notifications: AppNotification[];
  catalogCategories: Category[];
  customerOrders: CustomerOrder[];
  vendorOrders: VendorOrder[];
  pendingVendors: PendingVendor[];
  vendorProducts: VendorProduct[];
  settings: PlatformSettings;
  coupons: Coupon[];
  payouts: Payout[];
  complaints: Complaint[];
  campaigns: Campaign[];
  vendorSettings: VendorSettings[];
  adminTeam: AdminMember[];
  // In-memory only (not persisted): order payloads awaiting a redirect-based
  // gateway (PhonePe) to confirm payment, keyed by merchant transaction id.
  pendingPayments?: Record<
    string,
    { userId: string; order: OrderInput; amountPaise: number; createdAt: number }
  >;
};

// ---------------------------------------------------------------------------
// File system access for artwork + evidence (kept on disk; not in the DB)
// ---------------------------------------------------------------------------

type NodeFs = {
  fs: typeof import("node:fs");
  path: typeof import("node:path");
};

let nodeFsCache: NodeFs | null | undefined;

async function getNodeFs(): Promise<NodeFs | null> {
  if (nodeFsCache !== undefined) return nodeFsCache;
  try {
    if (typeof process === "undefined" || !process.cwd) {
      nodeFsCache = null;
      return null;
    }
    const [fs, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    nodeFsCache = { fs: fs.default ?? fs, path: path.default ?? path };
    return nodeFsCache;
  } catch (err) {
    console.warn("[printzapp] node:fs unavailable, file storage disabled:", err);
    nodeFsCache = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Binary file storage (artwork + complaint evidence)
// ---------------------------------------------------------------------------

const ARTWORK_DIR = ".printzapp-artwork";
const EVIDENCE_DIR = ".printzapp-evidence";

async function ensureDir(rel: string): Promise<string | null> {
  const nf = await getNodeFs();
  if (!nf) return null;
  const abs = nf.path.join(process.cwd(), rel);
  if (!nf.fs.existsSync(abs)) {
    try {
      nf.fs.mkdirSync(abs, { recursive: true });
    } catch (err) {
      console.warn(`[printzapp] failed to mkdir ${rel}:`, err);
      return null;
    }
  }
  return abs;
}

function dataUrlToBuffer(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function saveFile(
  dir: string,
  id: string,
  dataUrl: string,
): Promise<{ success: boolean; bytes?: number; error?: string }> {
  const nf = await getNodeFs();
  if (!nf) return { success: false, error: "filesystem unavailable" };
  const root = await ensureDir(dir);
  if (!root) return { success: false, error: "could not create directory" };
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed) return { success: false, error: "invalid data URL" };
  try {
    nf.fs.writeFileSync(nf.path.join(root, `${id}.bin`), parsed.buffer);
    nf.fs.writeFileSync(
      nf.path.join(root, `${id}.meta.json`),
      JSON.stringify({ mime: parsed.mime, bytes: parsed.buffer.length }),
    );
    return { success: true, bytes: parsed.buffer.length };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function readFile(
  dir: string,
  id: string,
): Promise<{ dataUrl: string; mime: string; bytes: number } | null> {
  const nf = await getNodeFs();
  if (!nf) return null;
  const root = await ensureDir(dir);
  if (!root) return null;
  try {
    const binPath = nf.path.join(root, `${id}.bin`);
    const metaPath = nf.path.join(root, `${id}.meta.json`);
    if (!nf.fs.existsSync(binPath) || !nf.fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(nf.fs.readFileSync(metaPath, "utf-8")) as {
      mime: string;
      bytes: number;
    };
    const buf = nf.fs.readFileSync(binPath);
    return {
      dataUrl: `data:${meta.mime};base64,${buf.toString("base64")}`,
      mime: meta.mime,
      bytes: meta.bytes,
    };
  } catch (err) {
    console.warn(`[printzapp] failed to read ${dir}/${id}:`, err);
    return null;
  }
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string) {
  const uuid =
    (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
    Math.random().toString(36).slice(2);
  return `${prefix}-${uuid.slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Empty initial-state factories
// ---------------------------------------------------------------------------

// Default platform settings used when the DB hasn't been seeded yet.
function defaultSettings(): PlatformSettings {
  return {
    commissionPercent: 18,
    minimumPayout: 500,
    freeShippingThreshold: 499,
    logoUrl: null,
    heroSlides: [],
    testimonials: [],
    adminSlug: "control",
    razorpay: { enabled: false, keyId: "", keySecret: "", mode: "test" },
    phonepe: {
      enabled: false,
      merchantId: "",
      saltKey: "",
      saltIndex: "1",
      mode: "test",
    },
    flags: {
      sameDayDelivery: true,
      aiDesignAssistant: true,
      vendorSelfOnboarding: false,
      internationalShipping: false,
    },
  };
}

// Default vendor working hours used when a vendor saves settings for the
// first time (kept here, not seeded into the DB on bootstrap).
const DEFAULT_WEEK_HOURS: WorkingHour[] = [
  { day: "Monday", from: "09:00", to: "19:00", on: true },
  { day: "Tuesday", from: "09:00", to: "19:00", on: true },
  { day: "Wednesday", from: "09:00", to: "19:00", on: true },
  { day: "Thursday", from: "09:00", to: "19:00", on: true },
  { day: "Friday", from: "09:00", to: "19:00", on: true },
  { day: "Saturday", from: "10:00", to: "16:00", on: true },
  { day: "Sunday", from: "00:00", to: "00:00", on: false },
];

// Removed seed-data factories. The database is now the source of truth;
// bootstrap.ts seeds only the 8 category skeletons and a single superadmin
// account from the SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD env vars.

// Helpers shared by order assignment + checkout pincode validation
function pincodesFor(settings: VendorSettings): Set<string> {
  return new Set(
    settings.pincodes
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean),
  );
}

function vendorCoversPincode(
  settings: VendorSettings | undefined,
  pincode: string,
): boolean {
  if (!settings) return false;
  if (settings.panIndia) return true;
  return pincodesFor(settings).has(pincode.trim());
}

// A vendor can receive auto-assigned orders unless they're still pending
// approval or suspended. "warning" vendors are flagged but keep operating, so
// they remain eligible for assignment.
function vendorCanReceiveOrders(status: string | undefined): boolean {
  return status === "active" || status === "warning";
}

// A vendor's withdrawable balance: net-of-commission earnings minus everything
// already paid out or queued for payout. Shared by the finance dashboard and
// the payout-request validation so the two never disagree.
function vendorAvailableBalance(vendorId: string): number {
  const rate = store.settings.commissionPercent / 100;
  const gross = store.vendorOrders
    .filter((o) => o.vendorId === vendorId && o.status !== "cancelled")
    .reduce((sum, o) => sum + o.amount, 0);
  const netEarnings = Math.round(gross * (1 - rate));
  const committed = store.payouts
    .filter((p) => p.vendorId === vendorId && p.status !== "rejected")
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, netEarnings - committed);
}

function createStore(): Store {
  return {
    users: [],
    newsletter: [],
    notifications: [],
    catalogCategories: [],
    customerOrders: [],
    vendorOrders: [],
    pendingVendors: [],
    vendorProducts: [],
    settings: defaultSettings(),
    coupons: [],
    payouts: [],
    complaints: [],
    campaigns: [],
    vendorSettings: [],
    adminTeam: [],
    pendingPayments: {},
  };
}

// ---------------------------------------------------------------------------
// Store bootstrap (load from disk if available; merge defaults for new keys)
// ---------------------------------------------------------------------------

const globalStore = globalThis as typeof globalThis & {
  __printzappStore?: Store;
};

async function bootstrapStore(): Promise<Store> {
  if (globalStore.__printzappStore) return globalStore.__printzappStore;

  // SQLite is the source of truth. The bootstrap also seeds the 8 empty
  // categories and the env-configured superadmin on first run.
  const fresh = createStore();
  const persisted = loadStoreFromDb() as Partial<Store>;

  const merged: Store = {
    users: (persisted.users as AppUser[]) ?? fresh.users,
    newsletter: persisted.newsletter ?? fresh.newsletter,
    catalogCategories:
      (persisted.catalogCategories as Category[]) ?? fresh.catalogCategories,
    customerOrders:
      (persisted.customerOrders as CustomerOrder[]) ?? fresh.customerOrders,
    vendorOrders: (persisted.vendorOrders as VendorOrder[]) ?? fresh.vendorOrders,
    pendingVendors: persisted.pendingVendors ?? fresh.pendingVendors,
    vendorProducts:
      (persisted.vendorProducts as VendorProduct[]) ?? fresh.vendorProducts,
    settings: persisted.settings ?? fresh.settings,
    coupons: (persisted.coupons as Coupon[]) ?? fresh.coupons,
    payouts: (persisted.payouts as Payout[]) ?? fresh.payouts,
    complaints: (persisted.complaints as Complaint[]) ?? fresh.complaints,
    campaigns: (persisted.campaigns as Campaign[]) ?? fresh.campaigns,
    vendorSettings:
      (persisted.vendorSettings as VendorSettings[]) ?? fresh.vendorSettings,
    adminTeam: (persisted.adminTeam as AdminMember[]) ?? fresh.adminTeam,
    notifications:
      (persisted.notifications as AppNotification[]) ?? fresh.notifications,
  };

  globalStore.__printzappStore = merged;
  return merged;
}

// Top-level await: in ES module dev/SSR runtimes (Node + Vite) this resolves
// before any server fn handler is invoked, so writes are persistent from the
// very first request.
const store: Store = await bootstrapStore();

function persist() {
  // Fire-and-forget — DB writes are synchronous but non-blocking from the
  // caller's perspective.
  try {
    saveStoreToDb(store);
  } catch (err) {
    console.warn("[printzapp] failed to persist store to DB:", err);
  }
}

// ---------------------------------------------------------------------------
// Notifications — pushed on order/complaint/refund/vendor/payout events.
// The caller is responsible for calling persist() afterwards.
// ---------------------------------------------------------------------------
function pushNotification(n: Omit<AppNotification, "id" | "read" | "createdAt">) {
  store.notifications.unshift({
    ...n,
    id: makeId("ntf"),
    read: false,
    createdAt: new Date().toISOString(),
  });
  // Bound growth.
  if (store.notifications.length > 500) {
    store.notifications = store.notifications.slice(0, 500);
  }
}

function notifyAdmins(
  n: Omit<AppNotification, "id" | "read" | "createdAt" | "scope" | "vendorId">,
) {
  pushNotification({ ...n, scope: "superadmin" });
}

function notifyVendor(
  vendorId: string | undefined,
  n: Omit<AppNotification, "id" | "read" | "createdAt" | "scope" | "vendorId">,
) {
  if (!vendorId) return;
  pushNotification({ ...n, scope: "vendor", vendorId });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserProfile(user: AppUser | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    gstin: user.gstin,
    phone: user.phone,
    vendorStatus: user.vendorStatus,
    addressCount: user.addresses?.length ?? 0,
    wishlistCount: user.wishlist?.length ?? 0,
    memberSince: user.createdAt,
  };
}

async function currentUser() {
  const session = await useAppSession();
  const userId = session.data.userId;
  if (!userId) return null;
  return store.users.find((user) => user.id === userId) ?? null;
}

async function requireRole(...roles: Role[]) {
  const user = await currentUser();
  if (!user || !roles.includes(user.role)) {
    throw new Error(`Unauthorized: requires one of [${roles.join(", ")}]`);
  }
  return user;
}

// Whether an actor may view/act on a specific vendor order. Superadmins can
// access everything; a vendor may access orders assigned to them plus any
// still-unassigned order in the shared pool (mirrors getVendorOrdersFn's
// visibility). Prevents one vendor from reading/altering another vendor's
// orders, customer PII, or artwork by guessing an order id (IDOR).
function vendorCanAccessOrder(
  actor: { id: string; role: Role },
  order: { vendorId?: string } | null | undefined,
): boolean {
  if (!order) return false;
  if (actor.role === "superadmin") return true;
  return !order.vendorId || order.vendorId === actor.id;
}

function catalogProducts() {
  return store.catalogCategories.flatMap((category) => category.products);
}

function findCategory(slug: string) {
  return store.catalogCategories.find((entry) => entry.slug === slug) ?? null;
}

function findProduct(slug: string) {
  for (const category of store.catalogCategories) {
    const productIndex = category.products.findIndex(
      (entry) => entry.slug === slug,
    );
    if (productIndex >= 0) {
      return {
        category,
        categoryIndex: store.catalogCategories.findIndex(
          (entry) => entry.slug === category.slug,
        ),
        productIndex,
        product: category.products[productIndex],
      };
    }
  }
  return null;
}

function syncCategoryCounts() {
  for (const category of store.catalogCategories) {
    category.productCount = category.products.length;
  }
}

function normalizeProduct(product: Product) {
  return {
    ...product,
    image: product.images[0] ?? product.image,
    images: product.images.length > 0 ? product.images : [product.image],
    swatches: product.swatches ?? [],
    variations: product.variations ?? [],
  };
}

function replaceCatalogProduct(nextProduct: Product, previousSlug?: string) {
  const existing = findProduct(previousSlug ?? nextProduct.slug);
  if (existing) {
    existing.category.products.splice(existing.productIndex, 1);
  }

  const destination = findCategory(nextProduct.category);
  if (!destination) {
    return { success: false as const };
  }

  destination.products.unshift(normalizeProduct(nextProduct));
  syncCategoryCounts();
  persist();
  return { success: true as const, product: clone(nextProduct) };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const getCategoriesFn = createServerFn().handler(async () =>
  clone(store.catalogCategories),
);

export const getCategoryFn = createServerFn()
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const category = findCategory(data.slug);
    if (!category) throw notFound();
    return clone(category);
  });

export const getProductFn = createServerFn()
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const product = catalogProducts().find((entry) => entry.slug === data.slug);
    if (!product) throw notFound();
    return clone(product);
  });

// Returns up to `limit` products for storefront sections (homepage "Trending
// now" etc). Badge-d products bubble to the top so admins can curate, and the
// rest are filled in by recency (insertion order is preserved at insert time).
export const getTrendingProductsFn = createServerFn()
  .inputValidator(
    z.object({ limit: z.coerce.number().int().positive().max(50).optional() }),
  )
  .handler(async ({ data }) => {
    const all = catalogProducts();
    const sorted = [
      ...all.filter((p) => !!p.badge),
      ...all.filter((p) => !p.badge),
    ];
    return clone(sorted.slice(0, data?.limit ?? 8));
  });

export const getAllProductsFn = createServerFn().handler(async () => {
  const all = catalogProducts().map((p) => {
    const cat = store.catalogCategories.find((c) => c.slug === p.category);
    return { ...p, categoryName: cat?.name ?? p.category };
  });
  return clone(all);
});

// Deterministic vendor rating derived from real complaint history: starts at a
// clean 5.0 and drops for each unresolved complaint against the vendor. Same
// input always yields the same value (never random), and it updates the moment
// a complaint is filed or resolved.
function vendorRating(vendorId: string): number {
  const unresolved = store.complaints.filter(
    (c) => c.vendorId === vendorId && c.status !== "resolved",
  ).length;
  return Math.max(3.6, Math.round((5 - unresolved * 0.3) * 10) / 10);
}

// ---------------------------------------------------------------------------
// Server-side background removal for passport photos.
//
// Runs BRIA RMBG-1.4 via @huggingface/transformers on the server. RMBG-1.4 is
// a strong, openly-hosted background-removal model that loads reliably in this
// environment. The model is loaded lazily once per Node process and cached in
// memory; subsequent requests reuse it and complete in 1-3 s on a modest VPS.
//
// Accuracy for passport photos comes from the surrounding pipeline rather than
// the raw model: we feed the model a *contrast-enhanced* copy of the photo so
// it separates the subject crisply, but we re-attach the resulting mask to the
// *original* (un-enhanced) pixels so the person's true colours are preserved.
// The mask is then cleaned with morphological open/close passes.
//
// If `REMOVE_BG_API_KEY` is set in the environment we use the remove.bg API
// instead (most accurate but requires an external service). Otherwise we fall
// back to the in-process model so the feature works out of the box.
// ---------------------------------------------------------------------------

let rmbgServerPipeline:
  | Promise<{ model: any; processor: any; RawImage: any }>
  | null = null;

async function getRmbgPipeline() {
  if (rmbgServerPipeline) return rmbgServerPipeline;
  rmbgServerPipeline = (async () => {
    const tx = await import("@huggingface/transformers");
    // RMBG-1.4 is a custom architecture; transformers.js can't fully infer
    // the right config from the model files, so we pass the normalization
    // and resize params published on the Hugging Face model card.
    const model = await tx.AutoModel.from_pretrained("briaai/RMBG-1.4", {
      config: { model_type: "custom" },
      dtype: "fp32",
    });
    const processor = await tx.AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 1 / 255,
        return_tensors: "pt",
        size: { width: 1024, height: 1024 },
      },
    });
    return { model, processor, RawImage: tx.RawImage };
  })();
  // If model load fails (network etc.), allow the next request to retry.
  rmbgServerPipeline.catch(() => {
    rmbgServerPipeline = null;
  });
  return rmbgServerPipeline;
}

function parseDataUrl(input: string): Buffer {
  const match = /^data:[^;]+;base64,(.+)$/.exec(input);
  if (!match) throw new Error("Invalid data URL.");
  return Buffer.from(match[1], "base64");
}

async function removeBackgroundWithRemoveBg(
  apiKey: string,
  imageBuffer: Buffer,
): Promise<Buffer> {
  const form = new FormData();
  // The remove.bg API understands raw file uploads as multipart.
  form.append(
    "image_file",
    new Blob([imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength)], {
      type: "image/png",
    }),
    "upload.png",
  );
  form.append("size", "auto");
  form.append("format", "png");

  const resp = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`remove.bg error ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function removeBackgroundLocally(imageBuffer: Buffer): Promise<Buffer> {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const { model, processor, RawImage } = await getRmbgPipeline();

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error("Could not read image dimensions.");

  // Feed the ORIGINAL image to RMBG. The model's processor already applies the
  // normalization it was trained with, so pre-enhancing the pixels (histogram
  // stretch / saturation / sharpening) only pushes the input off-distribution
  // and produces a worse mask. We keep the raw pixels for both the model input
  // and the final cutout colours.
  const origRgb = await sharp(imageBuffer).removeAlpha().raw().toBuffer();

  const image = new RawImage(origRgb, width, height, 3);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });

  // Output is a 1-channel mask in [0,1]. Convert to 0..255 and resize back to
  // the original resolution.
  const maskTensor = output[0].mul(255).to("uint8");
  const maskRaw = await RawImage.fromTensor(maskTensor);
  const maskResized = await maskRaw.resize(width, height);

  // Gentle mask cleanup with fast native sharp ops:
  //   median(3)   → removes salt-and-pepper specks from the segmentation
  //   linear(2.4,…)→ mild contrast recentred on mid-grey: out = 2.4*in - 179
  //                 (≈ 2.4*(in-128)+128). Firms up the edge so the backdrop
  //                 doesn't bleed through, while leaving a soft anti-aliased
  //                 transition so hair/fabric aren't clipped into jaggies.
  // NOTE: sharp promotes a 1-channel raw input to 3 channels through the
  // median/linear pipeline, so we force it back to single-channel ("b-w")
  // before reading raw bytes. Without this the buffer is w*h*3 and the RGBA
  // assembly below reads a misaligned alpha — which leaves the background
  // visible and the subject faint.
  const maskBuffer = await sharp(Buffer.from(maskResized.data), {
    raw: { width, height, channels: 1 },
  })
    .median(3)
    .linear(2.4, -179)
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  // Build RGBA: ORIGINAL RGB + cleaned mask as alpha.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    rgba[i * 4] = origRgb[j];
    rgba[i * 4 + 1] = origRgb[j + 1];
    rgba[i * 4 + 2] = origRgb[j + 2];
    rgba[i * 4 + 3] = maskBuffer[i];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

// Warm the model in the background on server startup so the first real
// request doesn't sit through a long model-download cold start. We only
// do this in Node (not Workers), and only when no external API is configured.
if (typeof process !== "undefined" && process.env?.NODE_ENV !== "test") {
  const hasExternalApi = !!process.env?.REMOVE_BG_API_KEY;
  if (!hasExternalApi) {
    void getRmbgPipeline().then(
      () => console.log("[bg-removal] RMBG-1.4 model loaded and ready (portrait-tuned pipeline)."),
      (err) =>
        console.warn(
          "[bg-removal] RMBG-1.4 model failed to preload; will retry on first request:",
          err?.message ?? err,
        ),
    );
  }
}

export const removeBackgroundFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      dataUrl: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const buffer = parseDataUrl(data.dataUrl);
    const apiKey =
      typeof process !== "undefined" ? process.env?.REMOVE_BG_API_KEY : "";

    let cutoutPng: Buffer;
    if (apiKey) {
      try {
        cutoutPng = await removeBackgroundWithRemoveBg(apiKey, buffer);
      } catch (err) {
        console.warn(
          "[bg-removal] remove.bg failed, falling back to local model:",
          err,
        );
        cutoutPng = await removeBackgroundLocally(buffer);
      }
    } else {
      cutoutPng = await removeBackgroundLocally(buffer);
    }

    return {
      success: true as const,
      dataUrl: `data:image/png;base64,${cutoutPng.toString("base64")}`,
      bytes: cutoutPng.length,
    };
  });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const getCurrentUserFn = createServerFn().handler(async () =>
  getUserProfile((await currentUser()) ?? undefined),
);

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
      // Which sign-in surface is calling: the public (customer/vendor) page or
      // the separate staff portal. Used to keep the admin surface isolated.
      portal: z.enum(["public", "admin"]).optional().default("public"),
    }),
  )
  .handler(async ({ data }) => {
    const normalizedEmail = data.email.trim().toLowerCase();
    const password = data.password.trim();

    // Brute-force protection: too many recent failures for this email → reject
    // without even checking the password.
    const rate = loginRateState(normalizedEmail);
    if (rate.blocked) {
      return {
        error: `Too many attempts. Please try again in ${rate.retryMin} minute${rate.retryMin === 1 ? "" : "s"}.`,
      };
    }

    const user =
      store.users.find(
        (entry) => entry.email.toLowerCase() === normalizedEmail,
      ) ?? null;

    // Single generic message for "no such user" and "wrong password" so the
    // form can't be used to enumerate which emails are registered.
    const GENERIC = "Invalid credentials. Please check your email and password.";

    if (!user || !verifyPassword(password, user.password)) {
      recordLoginFailure(normalizedEmail);
      return { error: GENERIC };
    }

    // Keep the admin surface separate: superadmins sign in only via the staff
    // portal, and the staff portal only accepts superadmins.
    if (data.portal === "admin" && user.role !== "superadmin") {
      recordLoginFailure(normalizedEmail);
      return { error: GENERIC };
    }
    if (data.portal === "public" && user.role === "superadmin") {
      return {
        error: "Staff accounts sign in through the admin portal.",
      };
    }

    // Transparently upgrade legacy plaintext passwords to a hash on first
    // successful login.
    if (!isHashed(user.password)) {
      user.password = hashPassword(password);
      persist();
    }

    clearLoginAttempts(normalizedEmail);
    const session = await useAppSession();
    await session.update({ userId: user.id });
    return { user: getUserProfile(user) };
  });

export const registerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["customer", "vendor"]),
      gstin: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const existingUser = store.users.find(
      (entry) => entry.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (existingUser) {
      return { error: "An account already exists with that email address." };
    }

    const user: AppUser = {
      id: `user-${makeId("u").slice(2)}`,
      name: data.name,
      email: data.email,
      password: hashPassword(data.password),
      role: data.role,
      gstin: data.gstin?.trim() || undefined,
      vendorStatus: data.role === "vendor" ? "pending" : undefined,
      createdAt: new Date().toISOString(),
    };

    store.users.unshift(user);

    if (data.role === "vendor") {
      // Queue for super-admin approval
      store.pendingVendors.unshift({
        id: user.id,
        name: data.name,
        city: "—",
        services: "Awaiting onboarding details",
        appliedOn: "Just now",
      });
    }

    persist();

    const session = await useAppSession();
    await session.update({ userId: user.id });
    return { user: getUserProfile(user) };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useAppSession();
  await session.clear();
  return { success: true };
});

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

export const subscribeNewsletterFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    if (!store.newsletter.includes(email)) {
      store.newsletter.push(email);
      persist();
    }
    return { success: true, count: store.newsletter.length };
  });

// ---------------------------------------------------------------------------
// Orders (customer)
// ---------------------------------------------------------------------------

const orderItemSchema = z.object({
  id: z.string(),
  product: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    image: z.string(),
    category: z.string(),
    basePrice: z.number(),
  }),
  quantity: z.number().int().positive(),
  size: z.string(),
  finish: z.string(),
  turnaround: z.object({
    label: z.string(),
    days: z.number().int().positive(),
    multiplier: z.number(),
  }),
  artwork: z
    .object({
      name: z.string(),
      size: z.number().int().nonnegative(),
      type: z.string(),
      // dataUrl is sent only at order placement time. It's stripped from
      // the stored order; the file is persisted to disk and replaced with
      // an `id` that vendors use to download.
      dataUrl: z.string().optional(),
      id: z.string().optional(),
    })
    .nullable(),
  customization: z
    .object({
      printSides: z.string().optional(),
      dimensions: z
        .object({ width: z.string(), height: z.string(), unit: z.string() })
        .nullable()
        .optional(),
      notes: z.string().optional(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
      printSpec: z
        .object({
          pageCount: z.number().int().positive(),
          colorMode: z.enum(["bw", "color"]),
          paperSize: z.string().min(1),
          sides: z.enum(["single", "duplex"]),
          pricePerPage: z.number().nonnegative(),
          addons: z.array(
            z.object({ name: z.string().min(1), price: z.number().nonnegative() }),
          ),
          addonTotal: z.number().nonnegative(),
          perPageTotal: z.number().nonnegative(),
          total: z.number().nonnegative(),
        })
        .optional(),
      photoSpec: z
        .object({
          photoCount: z.number().int().positive(),
          bgColorName: z.string().min(1),
          bgColorHex: z.string().min(1),
          total: z.number().nonnegative(),
        })
        .optional(),
    })
    .optional(),
  overrideSubtotal: z.number().nonnegative().optional(),
});

// Shared order input shape — used by the mock-pay path (createOrderFn) and the
// Razorpay verify-then-place path (verifyRazorpayPaymentFn).
const orderInputSchema = z.object({
  items: z
    .array(orderItemSchema.extend({ finish: z.string().optional().default("") }))
    .min(1),
  shipping: z
    .object({
      fullName: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().email(),
      pincode: z.string().min(1),
      address: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      company: z.string().optional(),
      landmark: z.string().optional(),
      gstin: z.string().optional(),
    })
    .optional(),
  couponCode: z.string().optional(),
  saveAddress: z.boolean().optional(),
});
type OrderInput = z.infer<typeof orderInputSchema>;

// Computes the pre-discount subtotal for an order from its items, mirroring the
// client cart math.
function computeOrderSubtotal(items: OrderInput["items"]): number {
  return items.reduce((sum, item) => {
    if (typeof item.overrideSubtotal === "number") {
      return sum + Math.round(item.overrideSubtotal);
    }
    const sizeMultiplier =
      item.size === "Medium" ? 1.4 : item.size === "Large" ? 1.9 : 1;
    const finishMultiplier =
      item.finish === "Glossy" ? 1.1 : item.finish === "Premium UV" ? 1.25 : 1;
    return (
      sum +
      Math.round(
        item.product.basePrice *
          (item.quantity / 50) *
          sizeMultiplier *
          finishMultiplier *
          item.turnaround.multiplier,
      )
    );
  }, 0);
}

// Core order placement: validates vendor coverage + coupon, persists artwork,
// stores the customer + vendor orders, saves a new address, and returns the
// order. Used after payment is settled (mock or Razorpay-verified).
async function buildAndStoreOrder(
  user: AppUser,
  data: OrderInput,
  payment: CustomerOrder["payment"] = { method: "manual", status: "paid" },
): Promise<CustomerOrder> {
  const subtotal = computeOrderSubtotal(data.items);

    // Pincode-based vendor matching. Only vendors who serve the destination
    // pincode (or have Pan India delivery on) can be assigned.
    const destinationPincode = data.shipping?.pincode?.trim() ?? "";
    const activeVendors = store.users.filter(
      (u) => u.role === "vendor" && vendorCanReceiveOrders(u.vendorStatus),
    );
    const eligibleVendors = destinationPincode
      ? activeVendors.filter((v) => {
          const settings = store.vendorSettings.find((s) => s.vendorId === v.id);
          return vendorCoversPincode(settings, destinationPincode);
        })
      : activeVendors;

    if (destinationPincode && eligibleVendors.length === 0) {
      throw new Error(
        `No active vendor delivers to pincode ${destinationPincode}. Please use a different address or contact support.`,
      );
    }

    // Persist artwork files BEFORE storing the order. Each item that carries
    // a `dataUrl` gets a stable id and the file gets written to disk; the
    // stored order only carries the id + metadata so JSON stays small.
    const persistedItems: typeof data.items = [];
    for (const item of data.items) {
      let artwork = item.artwork;
      if (artwork?.dataUrl) {
        const id = makeId("aw");
        const saved = await saveFile(ARTWORK_DIR, id, artwork.dataUrl);
        if (!saved.success) {
          throw new Error(
            `Could not save artwork "${artwork.name}": ${saved.error}`,
          );
        }
        artwork = {
          id,
          name: artwork.name,
          size: saved.bytes ?? artwork.size,
          type: artwork.type,
        };
      } else if (artwork) {
        // Keep existing id if present, strip any leftover dataUrl
        artwork = {
          id: artwork.id,
          name: artwork.name,
          size: artwork.size,
          type: artwork.type,
        };
      }
      persistedItems.push({ ...item, artwork });
    }

    // Coupon: validate authoritatively on the server against the real subtotal.
    // An invalid/expired code throws so the customer isn't silently overcharged
    // or undercharged. Usage is incremented only once the order is committed.
    let discount = 0;
    let appliedCoupon: Coupon | undefined;
    if (data.couponCode?.trim()) {
      const code = data.couponCode.trim().toUpperCase();
      appliedCoupon = store.coupons.find((c) => c.code === code);
      const result = evaluateCoupon(appliedCoupon, subtotal);
      if (!result.ok) {
        throw new Error(result.reason);
      }
      discount = result.discount;
    }

    // GST is no longer charged to customers — the price they pay is the
    // discounted subtotal. `gst` is kept at 0 for schema/back-compat.
    const discountedSubtotal = Math.max(0, subtotal - discount);
    const gst = 0;
    const total = discountedSubtotal;
    const orderId = `PZ-${(10000 + store.customerOrders.length + 1).toString()}`;

    const order: CustomerOrder = {
      id: orderId,
      userId: user?.id ?? null,
      customerName: data.shipping?.fullName ?? user?.name ?? "Guest Checkout",
      customerEmail:
        data.shipping?.email ?? user?.email ?? "guest@printzapp.in",
      shipping: data.shipping,
      items: persistedItems as OrderItem[],
      subtotal,
      discount,
      couponCode: appliedCoupon?.code,
      gst,
      total,
      payment,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };

    store.customerOrders.unshift(order);

    if (appliedCoupon) appliedCoupon.used += 1;

    // Persist a brand-new shipping address to the signed-in customer's address
    // book so it shows up in /account/addresses and future checkouts. We only
    // add it when it isn't already saved (matched on address + pincode).
    if (user && data.shipping && data.saveAddress) {
      const owner = store.users.find((u) => u.id === user.id);
      if (owner) {
        owner.addresses = owner.addresses ?? [];
        const dup = owner.addresses.find(
          (a) =>
            a.address.trim() === data.shipping!.address.trim() &&
            a.pincode.trim() === data.shipping!.pincode.trim(),
        );
        if (!dup) {
          owner.addresses.push({
            id: makeId("addr"),
            label: owner.addresses.length === 0 ? "Home" : "Other",
            fullName: data.shipping.fullName,
            phone: data.shipping.phone,
            address: data.shipping.address,
            city: data.shipping.city,
            state: data.shipping.state,
            pincode: data.shipping.pincode,
            landmark: data.shipping.landmark,
            isDefault: owner.addresses.length === 0,
          });
        }
      }
    }

    // Round-robin within eligible vendors only.
    const assignedVendor =
      eligibleVendors[
        store.vendorOrders.length % Math.max(eligibleVendors.length, 1)
      ] ?? eligibleVendors[0];

    const vendorOrderId = `ORD-${orderId.slice(3)}`;
    store.vendorOrders.unshift({
      id: vendorOrderId,
      customerOrderId: orderId,
      customer: order.customerName,
      vendorId: assignedVendor?.id,
      product: persistedItems
        .map((item) => `${item.product.name} x${item.quantity}`)
        .join(", "),
      amount: total,
      status: "new",
      deadline: "2h 00m",
      date: "Today",
    });

    const productSummary = persistedItems
      .map((item) => `${item.product.name} ×${item.quantity}`)
      .join(", ");
    notifyAdmins({
      type: "order_new",
      title: `New order ${orderId}`,
      message: `${order.customerName} placed an order — ${productSummary} (₹${total.toLocaleString()}).`,
      orderId: vendorOrderId,
    });
    notifyVendor(assignedVendor?.id, {
      type: "order_new",
      title: `New order assigned · ${vendorOrderId}`,
      message: `${productSummary} for ${order.customerName}. Amount ₹${total.toLocaleString()}.`,
      orderId: vendorOrderId,
    });

    persist();
    return order;
}

export const createOrderFn = createServerFn({ method: "POST" })
  .inputValidator(orderInputSchema)
  .handler(async ({ data }) => {
    // Orders require a signed-in account — no guest checkout.
    const user = await currentUser();
    if (!user) {
      throw new Error("Please sign in to place your order.");
    }
    return buildAndStoreOrder(user, data);
  });

// Returns details for a single vendor order: full customer items + shipping.
// Used by the View Specs modal in /vendor/orders.
export const getVendorOrderDetailsFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const actor = await requireRole("vendor", "superadmin");
    const vendorOrder = store.vendorOrders.find((o) => o.id === data.id);
    // Ownership check: a vendor may only open their own / unassigned orders.
    if (!vendorOrder || !vendorCanAccessOrder(actor, vendorOrder)) throw notFound();
    const customerOrder = vendorOrder.customerOrderId
      ? store.customerOrders.find((o) => o.id === vendorOrder.customerOrderId)
      : null;
    return {
      vendorOrder: clone(vendorOrder),
      customerOrder: customerOrder ? clone(customerOrder) : null,
    };
  });

// Fetch a previously uploaded artwork as a data URL (vendor download).
// Guarded: only staff/vendors may pull arbitrary artwork by id (prevents IDOR
// access to other customers' uploaded files).
export const getArtworkFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const actor = await requireRole("vendor", "superadmin");
    // A vendor may only pull artwork attached to an order they can access —
    // otherwise any vendor could download any customer's files by id (IDOR).
    if (actor.role === "vendor") {
      const owningOrder = store.customerOrders.find((o) =>
        o.items.some((i) => i.artwork?.id === data.id),
      );
      const vendorOrder = owningOrder
        ? store.vendorOrders.find((v) => v.customerOrderId === owningOrder.id)
        : null;
      if (!vendorCanAccessOrder(actor, vendorOrder)) throw notFound();
    }
    const file = await readFile(ARTWORK_DIR, data.id);
    if (!file) throw notFound();
    return file;
  });

// Lets a vendor / superadmin check pincode coverage. Returns the list of
// active vendors that deliver to a pincode (used by checkout validation).
export const checkPincodeFn = createServerFn()
  .inputValidator(z.object({ pincode: z.string().min(1) }))
  .handler(async ({ data }) => {
    const pin = data.pincode.trim();
    const matches = store.users
      .filter((u) => u.role === "vendor" && vendorCanReceiveOrders(u.vendorStatus))
      .filter((v) => {
        const settings = store.vendorSettings.find((s) => s.vendorId === v.id);
        return vendorCoversPincode(settings, pin);
      })
      .map((v) => ({ id: v.id, name: v.name, city: v.city ?? "—" }));
    return { pincode: pin, serviceable: matches.length > 0, vendors: matches };
  });

export const getMyOrdersFn = createServerFn().handler(async () => {
  const user = await currentUser();
  if (!user) return [] as CustomerOrder[];
  return clone(
    store.customerOrders.filter((order) => order.userId === user.id),
  );
});

// ---------------------------------------------------------------------------
// Customer account: dashboard, single-order detail, profile, addresses,
// wishlist, cancel, reorder. All gated on a signed-in user.
// ---------------------------------------------------------------------------

export const getMyAccountFn = createServerFn().handler(async () => {
  const user = await currentUser();
  if (!user) return null;
  const orders = store.customerOrders.filter((o) => o.userId === user.id);
  const activeOrders = orders.filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled",
  );
  const totalSpend = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const loyaltyPoints = Math.floor(totalSpend / 100);
  const tier =
    totalSpend > 50000 ? "Gold" : totalSpend > 15000 ? "Silver" : "Bronze";
  const wishlistSlugs = user.wishlist ?? [];
  const wishlistProducts = wishlistSlugs
    .map((slug) => catalogProducts().find((p) => p.slug === slug))
    .filter(Boolean)
    .slice(0, 8);

  return {
    user: getUserProfile(user),
    metrics: {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      totalSpend,
      loyaltyPoints,
      tier,
    },
    recentOrders: clone(orders.slice(0, 4)),
    wishlist: clone(wishlistProducts),
    addresses: clone(user.addresses ?? []),
  };
});

// Map vendor stage to customer-facing tracking step.
function customerTrackingSteps(
  customerOrder: CustomerOrder,
  vendorOrder: VendorOrder | undefined,
) {
  const eventMap = new Map<string, string>();
  if (vendorOrder?.statusHistory) {
    for (const ev of vendorOrder.statusHistory) {
      eventMap.set(ev.status, ev.at);
    }
  }
  const steps = [
    {
      key: "confirmed",
      label: "Order Confirmed",
      description: "Your order has been received.",
      at: customerOrder.createdAt,
      reached: true,
    },
    {
      key: "accepted",
      label: "Accepted by Vendor",
      description: vendorOrder
        ? "Your vendor accepted the job and is preparing materials."
        : "Awaiting vendor assignment.",
      at: eventMap.get("accepted") ?? null,
      reached: !!eventMap.get("accepted") ||
        ["processing", "dispatched", "delivered"].includes(customerOrder.status),
    },
    {
      key: "in_production",
      label: "In Production",
      description: "Printing has started.",
      at: eventMap.get("in_production") ?? null,
      reached: !!eventMap.get("in_production") ||
        ["dispatched", "delivered"].includes(customerOrder.status),
    },
    {
      key: "quality_check",
      label: "Quality Check",
      description: "Final review before dispatch.",
      at: eventMap.get("quality_check") ?? null,
      reached: !!eventMap.get("quality_check") ||
        ["dispatched", "delivered"].includes(customerOrder.status),
    },
    {
      key: "dispatched",
      label: "Dispatched",
      description: vendorOrder?.trackingNumber
        ? `Shipped via courier · tracking ${vendorOrder.trackingNumber}`
        : "Your order is on its way.",
      at: eventMap.get("dispatched") ?? null,
      reached:
        !!eventMap.get("dispatched") ||
        ["dispatched", "delivered"].includes(customerOrder.status),
    },
    {
      key: "delivered",
      label: "Delivered",
      description: "Enjoy your prints!",
      at: eventMap.get("completed") ?? null,
      reached:
        !!eventMap.get("completed") || customerOrder.status === "delivered",
    },
  ];

  if (customerOrder.status === "cancelled") {
    return [
      steps[0],
      {
        key: "cancelled",
        label: "Order Cancelled",
        description: "This order was cancelled.",
        at:
          eventMap.get("cancelled") ??
          vendorOrder?.statusHistory?.slice(-1)[0]?.at ??
          null,
        reached: true,
      },
    ];
  }

  return steps;
}

export const getMyOrderFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) throw notFound();
    const order = store.customerOrders.find(
      (o) => o.id === data.id && o.userId === user.id,
    );
    if (!order) throw notFound();
    const vendorOrder = store.vendorOrders.find(
      (v) => v.customerOrderId === order.id,
    );
    const vendor = vendorOrder?.vendorId
      ? store.users.find((u) => u.id === vendorOrder.vendorId)
      : null;
    const timeline = customerTrackingSteps(order, vendorOrder);
    // Strip artwork dataUrls from response
    const sanitizedOrder = {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        artwork: item.artwork
          ? { ...item.artwork, dataUrl: undefined }
          : null,
      })),
    };

    const turnaroundDays = Math.max(
      ...order.items.map((item) => item.turnaround.days),
      3,
    );
    const eta = new Date(
      new Date(order.createdAt).getTime() +
        (turnaroundDays + 2) * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Surface any complaint raised on this order (with the full response thread)
    // so the customer can track replies from the vendor / support team.
    const complaint = store.complaints.find((c) => c.orderId === order.id);

    return {
      order: clone(sanitizedOrder),
      vendor: vendor
        ? {
            id: vendor.id,
            name: vendor.name,
            city: vendor.city ?? "",
            email: vendor.email,
            phone: vendor.phone ?? "",
          }
        : null,
      vendorOrderId: vendorOrder?.id ?? null,
      vendorOrderStatus: vendorOrder?.status ?? null,
      trackingNumber: vendorOrder?.trackingNumber ?? null,
      complaint: complaint
        ? {
            id: complaint.id,
            issue: complaint.issue,
            detail: complaint.detail,
            status: complaint.status,
            createdAt: complaint.createdAt,
            responses: clone(complaint.responses),
          }
        : null,
      timeline,
      eta,
    };
  });

// Customer adds a follow-up message to their own complaint thread.
export const replyToMyComplaintFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      complaintId: z.string().min(1),
      message: z.string().min(1).max(2000),
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false as const, error: "Please sign in." };
    const complaint = store.complaints.find((c) => c.id === data.complaintId);
    if (!complaint) return { success: false as const, error: "Complaint not found." };
    const order = store.customerOrders.find(
      (o) => o.id === complaint.orderId && o.userId === user.id,
    );
    if (!order) {
      return { success: false as const, error: "Not authorized for this complaint." };
    }
    complaint.responses.push({
      author: user.name,
      message: data.message.trim(),
      at: new Date().toISOString(),
    });
    // A customer reply re-opens a resolved complaint for another look.
    if (complaint.status === "resolved") complaint.status = "open";
    const vo = store.vendorOrders.find((v) => v.customerOrderId === complaint.orderId);
    notifyAdmins({
      type: "complaint_reply",
      title: `Complaint reply · ${complaint.orderId}`,
      message: `${user.name} replied to the complaint.`,
      orderId: vo?.id ?? complaint.orderId,
    });
    notifyVendor(complaint.vendorId, {
      type: "complaint_reply",
      title: `Complaint reply · ${complaint.orderId}`,
      message: `${user.name} replied to the complaint.`,
      orderId: vo?.id ?? complaint.orderId,
    });
    persist();
    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// Dispute resolution: unified order lookup + refund management
//
// Refunds are issued at the discretion of the vendor (for their own orders) or
// the super admin — there is no customer-initiated refund request.
// ---------------------------------------------------------------------------

function sanitizeOrderItems<T extends { items: OrderItem[] }>(order: T): T {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      artwork: item.artwork ? { ...item.artwork, dataUrl: undefined } : null,
    })),
  };
}

// Look up an order by order number (PZ-/ORD-), payment reference, or tracking
// number and return everything needed to resolve a dispute. Vendors are scoped
// to their own assigned orders; super admins see all.
export const lookupOrderFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }) => {
    const actor = await requireRole("vendor", "superadmin");
    const q = data.query.trim();
    const qLower = q.toLowerCase();

    // Resolve the customer + vendor order from any identifier.
    let customerOrder =
      store.customerOrders.find(
        (o) =>
          o.id.toLowerCase() === qLower ||
          o.payment?.reference?.toLowerCase() === qLower ||
          o.refund?.reference?.toLowerCase() === qLower,
      ) ?? null;
    let vendorOrder = customerOrder
      ? store.vendorOrders.find((v) => v.customerOrderId === customerOrder!.id) ?? null
      : null;

    if (!customerOrder) {
      vendorOrder =
        store.vendorOrders.find(
          (v) =>
            v.id.toLowerCase() === qLower ||
            v.trackingNumber?.toLowerCase() === qLower,
        ) ?? null;
      if (vendorOrder?.customerOrderId) {
        customerOrder =
          store.customerOrders.find((o) => o.id === vendorOrder!.customerOrderId) ?? null;
      }
    }

    if (!customerOrder && !vendorOrder) {
      return { found: false as const };
    }

    // Vendor scoping: only their own orders.
    if (actor.role === "vendor" && vendorOrder?.vendorId !== actor.id) {
      return { found: false as const };
    }

    let matchedBy: "order" | "payment" | "tracking" = "order";
    if (customerOrder?.payment?.reference?.toLowerCase() === qLower) matchedBy = "payment";
    else if (vendorOrder?.trackingNumber?.toLowerCase() === qLower) matchedBy = "tracking";

    const vendor = vendorOrder?.vendorId
      ? store.users.find((u) => u.id === vendorOrder!.vendorId)
      : null;
    const customer = customerOrder?.userId
      ? store.users.find((u) => u.id === customerOrder!.userId)
      : null;
    const complaint = customerOrder
      ? store.complaints.find((c) => c.orderId === customerOrder!.id) ?? null
      : null;

    return {
      found: true as const,
      matchedBy,
      customerOrder: customerOrder ? clone(sanitizeOrderItems(customerOrder)) : null,
      vendorOrder: vendorOrder ? clone(vendorOrder) : null,
      vendor: vendor
        ? { id: vendor.id, name: vendor.name, city: vendor.city ?? "", email: vendor.email, phone: vendor.phone ?? "" }
        : null,
      customer: customer
        ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone ?? "" }
        : null,
      complaint: complaint ? clone(complaint) : null,
    };
  });

// The vendor (for their own orders) or super admin decides and records a
// refund — there is no customer-initiated request.
export const updateRefundFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orderId: z.string().min(1),
      status: z.enum(["approved", "processing", "completed", "rejected"]),
      amount: z.coerce.number().min(0).optional(),
      reference: z.string().max(120).optional(),
      note: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireRole("vendor", "superadmin");
    const order = store.customerOrders.find((o) => o.id === data.orderId);
    if (!order) return { success: false as const, error: "Order not found." };
    // Vendors may only issue refunds for orders assigned to them.
    if (actor.role === "vendor") {
      const vo = store.vendorOrders.find((v) => v.customerOrderId === order.id);
      if (!vo || vo.vendorId !== actor.id) {
        return { success: false as const, error: "Not authorized for this order." };
      }
    }
    const now = new Date().toISOString();
    const prev = order.refund;
    order.refund = {
      status: data.status,
      amount: data.amount ?? prev?.amount ?? order.total,
      reason: prev?.reason,
      reference: data.reference ?? prev?.reference,
      note: data.note ?? prev?.note,
      requestedAt: prev?.requestedAt ?? now,
      updatedAt: now,
    };
    // Notify the counterpart of the refund decision.
    const vo = store.vendorOrders.find((v) => v.customerOrderId === order.id);
    const refMsg = `Refund of ₹${order.refund.amount.toLocaleString()} marked ${data.status} for ${order.id}.`;
    if (actor.role === "vendor") {
      notifyAdmins({ type: "refund", title: `Refund ${data.status} · ${order.id}`, message: refMsg, orderId: vo?.id ?? order.id });
    } else {
      notifyVendor(vo?.vendorId, { type: "refund", title: `Refund ${data.status} · ${order.id}`, message: refMsg, orderId: vo?.id ?? order.id });
    }
    persist();
    return { success: true as const, refund: clone(order.refund) };
  });

// Super admin: all orders with refund activity, for monitoring.
export const getRefundsFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return store.customerOrders
    .filter((o) => o.refund)
    .map((o) => ({
      orderId: o.id,
      customerName: o.customerName,
      amount: o.refund!.amount,
      status: o.refund!.status,
      reason: o.refund!.reason,
      reference: o.refund!.reference,
      paymentMethod: o.payment?.method ?? "manual",
      paymentReference: o.payment?.reference,
      requestedAt: o.refund!.requestedAt,
      updatedAt: o.refund!.updatedAt,
    }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
});

// ---------------------------------------------------------------------------
// Notifications (vendor + super admin)
// ---------------------------------------------------------------------------

function myNotifications(user: AppUser): AppNotification[] {
  return user.role === "vendor"
    ? store.notifications.filter((n) => n.scope === "vendor" && n.vendorId === user.id)
    : store.notifications.filter((n) => n.scope === "superadmin");
}

export const getNotificationsFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  const list = myNotifications(user);
  return {
    items: clone(list.slice(0, 50)),
    unread: list.filter((n) => !n.read).length,
  };
});

export const markNotificationsReadFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const user = await requireRole("vendor", "superadmin");
    for (const n of myNotifications(user)) n.read = true;
    persist();
    return { success: true as const };
  },
);

export const cancelMyOrderFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in." };
    const order = store.customerOrders.find(
      (o) => o.id === data.id && o.userId === user.id,
    );
    if (!order) return { success: false, error: "Order not found." };
    if (order.status === "dispatched" || order.status === "delivered") {
      return {
        success: false,
        error:
          "This order has already shipped. Please reach out to support to start a return.",
      };
    }
    if (order.status === "cancelled") {
      return { success: false, error: "Already cancelled." };
    }
    order.status = "cancelled";
    const vendorOrder = store.vendorOrders.find(
      (v) => v.customerOrderId === order.id,
    );
    if (vendorOrder) {
      vendorOrder.status = "cancelled";
      if (!vendorOrder.statusHistory) vendorOrder.statusHistory = [];
      vendorOrder.statusHistory.push({
        status: "cancelled",
        at: new Date().toISOString(),
      });
    }
    persist();
    return { success: true };
  });

export const reorderFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in." };
    const order = store.customerOrders.find(
      (o) => o.id === data.id && o.userId === user.id,
    );
    if (!order) return { success: false, error: "Order not found." };
    // Return the items array so the client can repopulate the cart.
    // dataUrl is stripped — customer can reuse the same artwork id; if the
    // file is missing they'll be prompted to re-upload at checkout.
    return {
      success: true,
      items: order.items.map((item) => ({
        ...item,
        artwork: item.artwork
          ? { ...item.artwork, dataUrl: undefined }
          : null,
      })),
    };
  });

// Customer files a complaint against one of their own orders. It lands in the
// complaints queue for the assigned vendor and the super admin to act on.
export const raiseComplaintFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orderId: z.string().min(1),
      issue: z.string().min(3).max(120),
      detail: z.string().max(2000).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false as const, error: "Please sign in." };
    const order = store.customerOrders.find(
      (o) => o.id === data.orderId && o.userId === user.id,
    );
    if (!order) return { success: false as const, error: "Order not found." };

    // Avoid duplicate open complaints for the same order.
    const existing = store.complaints.find(
      (c) => c.orderId === order.id && c.status !== "resolved",
    );
    if (existing) {
      return {
        success: false as const,
        error: "You already have an open complaint for this order.",
      };
    }

    const vendorOrder = store.vendorOrders.find(
      (v) => v.customerOrderId === order.id,
    );
    const vendor = vendorOrder?.vendorId
      ? store.users.find((u) => u.id === vendorOrder.vendorId)
      : null;

    store.complaints.unshift({
      id: makeId("CMP"),
      orderId: order.id,
      customerName: user.name,
      vendorId: vendor?.id ?? "",
      vendorName: vendor?.name ?? "Unassigned",
      issue: data.issue.trim(),
      detail: data.detail?.trim() || undefined,
      penalty: 0,
      status: "open",
      createdAt: new Date().toISOString(),
      responses: [],
      evidence: [],
    });
    notifyAdmins({
      type: "complaint",
      title: `Complaint raised · ${order.id}`,
      message: `${user.name}: "${data.issue.trim()}"`,
      orderId: vendorOrder?.id ?? order.id,
    });
    notifyVendor(vendor?.id, {
      type: "complaint",
      title: `Complaint raised · ${order.id}`,
      message: `${user.name}: "${data.issue.trim()}"`,
      orderId: vendorOrder?.id ?? order.id,
    });
    persist();
    return { success: true as const };
  });

// Returns the artwork a customer actually ordered (the composed/uploaded image)
// for previewing on their own order page. Scoped: the artwork id must belong to
// one of the signed-in customer's orders.
export const getMyOrderArtworkFn = createServerFn()
  .inputValidator(
    z.object({ orderId: z.string().min(1), artworkId: z.string().min(1) }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) throw notFound();
    const order = store.customerOrders.find(
      (o) => o.id === data.orderId && o.userId === user.id,
    );
    if (!order) throw notFound();
    const owns = order.items.some((i) => i.artwork?.id === data.artworkId);
    if (!owns) throw notFound();
    const file = await readFile(ARTWORK_DIR, data.artworkId);
    if (!file) throw notFound();
    return file;
  });

export const updateMyProfileFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional().default(""),
      gstin: z.string().optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in." };
    const conflict = store.users.find(
      (u) =>
        u.id !== user.id &&
        u.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (conflict) {
      return { success: false, error: "That email is already in use." };
    }
    user.name = data.name;
    user.email = data.email;
    user.phone = data.phone;
    if (data.gstin) user.gstin = data.gstin;
    persist();
    return { success: true, user: getUserProfile(user) };
  });

export const changeMyPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in." };
    if (!verifyPassword(data.currentPassword, user.password)) {
      return { success: false, error: "Current password is incorrect." };
    }
    user.password = hashPassword(data.newPassword);
    persist();
    return { success: true };
  });

export const getMyAddressesFn = createServerFn().handler(async () => {
  const user = await currentUser();
  if (!user) return [] as SavedAddress[];
  return clone(user.addresses ?? []);
});

const addressSchema = z.object({
  label: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be a 6-digit number."),
  landmark: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
});

export const saveAddressFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().optional(),
      ...addressSchema.shape,
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in." };
    if (!user.addresses) user.addresses = [];

    if (data.id) {
      const existing = user.addresses.find((a) => a.id === data.id);
      if (!existing) return { success: false, error: "Address not found." };
      Object.assign(existing, {
        label: data.label,
        fullName: data.fullName,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        landmark: data.landmark,
      });
      if (data.isDefault) {
        for (const a of user.addresses) {
          a.isDefault = a.id === data.id;
        }
      }
    } else {
      const newAddress: SavedAddress = {
        id: makeId("addr"),
        label: data.label,
        fullName: data.fullName,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        landmark: data.landmark,
        isDefault: !!data.isDefault || user.addresses.length === 0,
      };
      if (newAddress.isDefault) {
        for (const a of user.addresses) a.isDefault = false;
      }
      user.addresses.push(newAddress);
    }
    persist();
    return { success: true, addresses: clone(user.addresses) };
  });

export const deleteAddressFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user || !user.addresses) return { success: false };
    const removed = user.addresses.find((a) => a.id === data.id);
    user.addresses = user.addresses.filter((a) => a.id !== data.id);
    // If we removed the default, promote the first remaining address
    if (removed?.isDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }
    persist();
    return { success: true, addresses: clone(user.addresses) };
  });

export const getMyWishlistFn = createServerFn().handler(async () => {
  const user = await currentUser();
  if (!user) return [] as Product[];
  const slugs = user.wishlist ?? [];
  return clone(
    slugs
      .map((slug) => catalogProducts().find((p) => p.slug === slug))
      .filter(Boolean) as Product[],
  );
});

export const toggleWishlistFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in." };
    if (!user.wishlist) user.wishlist = [];
    const idx = user.wishlist.indexOf(data.slug);
    let saved: boolean;
    if (idx >= 0) {
      user.wishlist.splice(idx, 1);
      saved = false;
    } else {
      user.wishlist.unshift(data.slug);
      saved = true;
    }
    persist();
    return { success: true, saved, count: user.wishlist.length };
  });

export const getAllOrdersFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const vendorMap = new Map(store.users.filter((u) => u.role === "vendor").map((u) => [u.id, u.name]));
  return clone(
    store.vendorOrders.map((order) => ({
      ...order,
      vendorName: order.vendorId ? vendorMap.get(order.vendorId) ?? "Unassigned" : "Unassigned",
    })),
  );
});

// ---------------------------------------------------------------------------
// Vendor orders
// ---------------------------------------------------------------------------

// Convert deadline strings ("2h 14m", "1d 04h", "—") to total minutes.
// Returns null when there's no deadline. Negative values mean overdue.
function deadlineToMinutes(deadline: string): number | null {
  if (!deadline || deadline === "—") return null;
  const dayMatch = deadline.match(/(\d+)\s*d/);
  const hourMatch = deadline.match(/(\d+)\s*h/);
  const minMatch = deadline.match(/(\d+)\s*m/);
  if (!dayMatch && !hourMatch && !minMatch) return null;
  return (
    (dayMatch ? parseInt(dayMatch[1], 10) * 1440 : 0) +
    (hourMatch ? parseInt(hourMatch[1], 10) * 60 : 0) +
    (minMatch ? parseInt(minMatch[1], 10) : 0)
  );
}

function enrichVendorOrder(order: VendorOrder) {
  const customerOrder = order.customerOrderId
    ? store.customerOrders.find((o) => o.id === order.customerOrderId)
    : undefined;
  const firstItem = customerOrder?.items[0];
  const itemCount = customerOrder?.items.length ?? 0;
  const totalQty = customerOrder
    ? customerOrder.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;
  const hasArtwork =
    customerOrder?.items.some((item) => item.artwork?.id) ?? false;
  return {
    ...order,
    pincode: customerOrder?.shipping?.pincode ?? "",
    city: customerOrder?.shipping?.city ?? "",
    customerPhone: customerOrder?.shipping?.phone ?? "",
    customerEmail: customerOrder?.customerEmail ?? "",
    itemCount,
    totalQty,
    firstItemImage: firstItem?.product.image ?? "",
    firstItemName: firstItem?.product.name ?? order.product,
    hasArtwork,
    deadlineMinutes: deadlineToMinutes(order.deadline),
  };
}

export type VendorOrderListItem = ReturnType<typeof enrichVendorOrder>;

export const getVendorOrdersFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  // Vendors see their own queue; superadmins see all.
  const source =
    user.role === "vendor"
      ? store.vendorOrders.filter(
          (order) => !order.vendorId || order.vendorId === user.id,
        )
      : store.vendorOrders;
  return source.map((o) => enrichVendorOrder(o));
});

export const updateVendorOrderStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      status: z.enum([
        "new",
        "accepted",
        "in_production",
        "quality_check",
        "dispatched",
        "completed",
        "cancelled",
      ]),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireRole("vendor", "superadmin");
    const order = store.vendorOrders.find((entry) => entry.id === data.id);
    // Ownership check: a vendor may only update their own / unassigned orders,
    // never another vendor's assigned order.
    if (!order || !vendorCanAccessOrder(actor, order)) return { success: false };
    order.status = data.status;

    // Append to status history for the customer-facing tracking timeline
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({ status: data.status, at: new Date().toISOString() });

    // Auto-generate a fake tracking number when dispatched
    if (data.status === "dispatched" && !order.trackingNumber) {
      order.trackingNumber = `PZ${Date.now().toString().slice(-8)}IN`;
    }

    // Sync to customer-facing order status
    if (order.customerOrderId) {
      const customerOrder = store.customerOrders.find(
        (o) => o.id === order.customerOrderId,
      );
      if (customerOrder) {
        if (data.status === "dispatched") customerOrder.status = "dispatched";
        else if (data.status === "completed") customerOrder.status = "delivered";
        else if (data.status === "cancelled") customerOrder.status = "cancelled";
        else if (
          data.status === "in_production" ||
          data.status === "quality_check"
        )
          customerOrder.status = "processing";
        else if (data.status === "accepted")
          customerOrder.status = "processing";
      }
    }

    // Notify: super admins always; the vendor when an admin changed it for them.
    const statusLabel = data.status.replace("_", " ");
    notifyAdmins({
      type: "order_status",
      title: `Order ${order.id} → ${statusLabel}`,
      message: `${order.customer}'s order is now "${statusLabel}".${order.trackingNumber ? ` Tracking ${order.trackingNumber}.` : ""}`,
      orderId: order.id,
    });
    if (actor.role === "superadmin") {
      notifyVendor(order.vendorId, {
        type: "order_status",
        title: `Order ${order.id} → ${statusLabel}`,
        message: `Status was updated to "${statusLabel}" by the platform team.`,
        orderId: order.id,
      });
    }

    persist();
    return { success: true, order: clone(order) };
  });

export const reassignOrderFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), vendorId: z.string() }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const order = store.vendorOrders.find((entry) => entry.id === data.id);
    if (!order) return { success: false };
    const vendor = store.users.find(
      (u) => u.id === data.vendorId && u.role === "vendor",
    );
    if (!vendor) return { success: false };
    order.vendorId = vendor.id;
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Vendor products
// ---------------------------------------------------------------------------

export const getVendorProductsFn = createServerFn().handler(async () => {
  await requireRole("vendor", "superadmin");
  return clone(
    store.vendorProducts
      .map((entry) => {
        const product = catalogProducts().find((item) => item.slug === entry.slug);
        if (!product) return null;
        return { ...clone(product), ...entry };
      })
      .filter(Boolean),
  );
});

export const setVendorProductActiveFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    await requireRole("vendor", "superadmin");
    const entry = store.vendorProducts.find(
      (product) => product.slug === data.slug,
    );
    if (!entry) return { success: false };
    entry.active = data.active;
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Catalog admin (super admin CRUD)
// ---------------------------------------------------------------------------

export const getCatalogAdminFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return clone(store.catalogCategories);
});

export const saveCatalogCategoryFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      tagline: z.string().min(1),
      image: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const category = findCategory(data.slug);
    if (!category) return { success: false };
    category.name = data.name;
    category.tagline = data.tagline;
    category.image = data.image;
    syncCategoryCounts();
    persist();
    return { success: true, category: clone(category) };
  });

export const createCatalogCategoryFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      tagline: z.string().min(1),
      image: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    if (findCategory(data.slug))
      return { success: false, error: "Category slug already exists." };
    const category: Category = {
      slug: data.slug,
      name: data.name,
      tagline: data.tagline,
      image: data.image,
      productCount: 0,
      products: [],
    };
    store.catalogCategories.unshift(category);
    syncCategoryCounts();
    persist();
    return { success: true, category: clone(category) };
  });

const catalogProductSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  basePrice: z.coerce.number().min(0),
  sku: z.string().min(1),
  rating: z.coerce.number().min(0).max(5),
  reviews: z.coerce.number().int().min(0),
  image: z.string().min(1),
  images: z.array(z.string().min(1)),
  badge: z.string().optional().or(z.literal("")),
  description: z.string().min(1),
  quantityOptions: z.array(z.coerce.number().int().positive()),
  sizes: z.array(z.string().min(1)),
  finishes: z.array(z.string().min(1)),
  turnarounds: z.array(
    z.object({
      label: z.string().min(1),
      days: z.coerce.number().int().positive(),
      multiplier: z.coerce.number().positive(),
    }),
  ),
  artworkRequired: z.boolean(),
  artworkHint: z.string().min(1),
  swatches: z.array(z.object({ name: z.string().min(1), hex: z.string().min(1) })),
  variations: z.array(
    z.object({
      name: z.string().min(1),
      sku: z.string().min(1),
      price: z.coerce.number().min(0),
      image: z.string().optional().or(z.literal("")),
      active: z.boolean().optional().default(true),
    }),
  ),
  acceptsDocumentUpload: z.boolean().optional().default(false),
  printPageRates: z
    .array(
      z.object({
        colorMode: z.enum(["bw", "color"]),
        paperSize: z.string().min(1),
        sides: z.enum(["single", "duplex"]),
        pricePerPage: z.coerce.number().min(0),
      }),
    )
    .optional()
    .default([]),
  printAddons: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.coerce.number().min(0),
      }),
    )
    .optional()
    .default([]),
  acceptsPhotoUpload: z.boolean().optional().default(false),
  photoPricingTiers: z
    .array(
      z.object({
        count: z.coerce.number().int().positive(),
        price: z.coerce.number().min(0),
      }),
    )
    .optional()
    .default([]),
  photoBackgroundColors: z
    .array(
      z.object({
        name: z.string().min(1),
        hex: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
});

export const saveCatalogProductFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      originalSlug: z.string().min(1).optional(),
      product: catalogProductSchema,
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    return replaceCatalogProduct(data.product, data.originalSlug);
  });

export const createCatalogProductFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ product: catalogProductSchema }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    if (findProduct(data.product.slug)) {
      return { success: false, error: "Product slug already exists." };
    }

    const category = findCategory(data.product.category);
    if (!category) return { success: false, error: "Category not found." };

    category.products.unshift(normalizeProduct(data.product));
    syncCategoryCounts();
    persist();
    return { success: true, product: clone(data.product) };
  });

export const deleteCatalogProductFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const existing = findProduct(data.slug);
    if (!existing) return { success: false };
    existing.category.products.splice(existing.productIndex, 1);
    syncCategoryCounts();
    persist();
    return { success: true };
  });

export const deleteCatalogCategoryFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const category = findCategory(data.slug);
    if (!category) return { success: false, error: "Category not found." };
    if (category.products.length > 0) {
      return {
        success: false,
        error: `Cannot delete "${category.name}": move or delete the ${category.products.length} product(s) in it first.`,
      };
    }
    const idx = store.catalogCategories.findIndex((c) => c.slug === data.slug);
    if (idx >= 0) store.catalogCategories.splice(idx, 1);
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Vendor network (super admin)
// ---------------------------------------------------------------------------

export const getVendorNetworkFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const vendors = store.users.filter((u) => u.role === "vendor");
  const active = vendors
    .filter((v) => v.vendorStatus === "active" || v.vendorStatus === "warning")
    .map((v) => {
      const ordersForVendor = store.vendorOrders.filter(
        (o) => o.vendorId === v.id,
      );
      const gmvAmount = ordersForVendor.reduce(
        (sum, order) => sum + order.amount,
        0,
      );
      const settings = store.vendorSettings.find((s) => s.vendorId === v.id);
      const pinSet = settings ? pincodesFor(settings) : new Set<string>();
      return {
        id: v.id,
        name: v.name,
        city: v.city ?? "—",
        orders: ordersForVendor.length,
        // Deterministic rating derived from real complaint history, not random.
        rating: vendorRating(v.id),
        gmv: `₹${(gmvAmount / 100000).toFixed(1)}L`,
        status: v.vendorStatus ?? "active",
        panIndia: settings?.panIndia ?? false,
        pincodeCount: pinSet.size,
        pincodes: Array.from(pinSet).slice(0, 6), // preview only
      };
    });

  return {
    pending: clone(store.pendingVendors),
    active: clone(active),
  };
});

export const approveVendorFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    store.pendingVendors = store.pendingVendors.filter(
      (vendor) => vendor.id !== data.id,
    );
    const user = store.users.find((u) => u.id === data.id);
    if (user) user.vendorStatus = "active";
    notifyVendor(data.id, {
      type: "vendor_status",
      title: "Your vendor account is approved 🎉",
      message: "You can now receive and fulfil orders. Welcome aboard!",
    });
    persist();
    return { success: true };
  });

export const rejectVendorFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    store.pendingVendors = store.pendingVendors.filter(
      (vendor) => vendor.id !== data.id,
    );
    const user = store.users.find((u) => u.id === data.id);
    if (user) user.vendorStatus = "suspended";
    notifyVendor(data.id, {
      type: "vendor_status",
      title: "Vendor application update",
      message: "Your vendor application was not approved. Contact support for details.",
    });
    persist();
    return { success: true };
  });

// Super admin: create a vendor account directly (bypassing self-onboarding),
// capturing richer compliance details and uploaded documents. Provisions a
// real vendor login plus vendorSettings so the vendor can sign in immediately.
const MAX_VENDOR_DOC_BYTES = 3 * 1024 * 1024; // ~3 MB per document
export const adminCreateVendorFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      phone: z.string().optional().default(""),
      city: z.string().optional().default(""),
      services: z.string().optional().default(""),
      gstin: z.string().optional().default(""),
      pan: z.string().optional().default(""),
      businessType: z.string().optional().default(""),
      panIndia: z.boolean().optional().default(false),
      pincodes: z.string().optional().default(""),
      status: z.enum(["active", "pending"]).optional().default("active"),
      documents: z
        .array(
          z.object({
            name: z.string().min(1).max(200),
            kind: z.string().max(80).optional().default("Document"),
            dataUrl: z.string().min(1),
          }),
        )
        .max(8)
        .optional()
        .default([]),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const email = data.email.trim();
    if (store.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false as const, error: "That email is already in use." };
    }
    // Validate uploaded documents (images or PDFs, size-capped).
    for (const doc of data.documents) {
      const match = /^data:(image\/(png|jpeg|jpg|webp|gif)|application\/pdf);base64,/.exec(
        doc.dataUrl,
      );
      if (!match) {
        return {
          success: false as const,
          error: `"${doc.name}" must be an image or PDF file.`,
        };
      }
      const base64 = doc.dataUrl.split(",")[1] ?? "";
      if (Math.floor((base64.length * 3) / 4) > MAX_VENDOR_DOC_BYTES) {
        return {
          success: false as const,
          error: `"${doc.name}" is too large (max 3 MB).`,
        };
      }
    }

    const id = makeId("user");
    store.users.unshift({
      id,
      name: data.name.trim(),
      email,
      password: hashPassword(data.password),
      role: "vendor",
      gstin: data.gstin.trim() || undefined,
      phone: data.phone.trim() || undefined,
      vendorStatus: data.status,
      city: data.city.trim() || undefined,
      services: data.services.trim() || undefined,
      createdAt: new Date().toISOString(),
    });

    store.vendorSettings.push({
      vendorId: id,
      businessName: data.name.trim(),
      gstin: data.gstin.trim(),
      email,
      phone: data.phone.trim(),
      panIndia: data.panIndia,
      pincodes: data.pincodes.trim(),
      hours: [...DEFAULT_WEEK_HOURS],
      documents: data.documents.map((d) => ({
        name: d.name.trim(),
        kind: d.kind?.trim() || "Document",
        dataUrl: d.dataUrl,
      })),
      compliance: {
        pan: data.pan.trim(),
        gstin: data.gstin.trim(),
        businessType: data.businessType.trim(),
      },
    } as any);

    // If created as pending, queue it for the approvals list too.
    if (data.status === "pending") {
      store.pendingVendors.unshift({
        id,
        name: data.name.trim(),
        city: data.city.trim() || "—",
        services: data.services.trim() || "Awaiting onboarding details",
        appliedOn: "Just now",
      });
    }

    persist();
    return { success: true as const, id };
  });

// ---------------------------------------------------------------------------
// Customers (super admin)
// ---------------------------------------------------------------------------

export const getCustomersFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const customers = store.users.filter((u) => u.role === "customer");
  return customers.map((c) => {
    const orders = store.customerOrders.filter((o) => o.userId === c.id);
    const spend = orders.reduce((sum, o) => sum + o.total, 0);
    const tier =
      spend > 30000 ? "Gold" : spend > 10000 ? "Silver" : "Bronze";
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      orders: orders.length,
      spend,
      tier,
      createdAt: c.createdAt,
    };
  });
});

// Create a customer account manually. Available to super admins and vendors
// (e.g. a vendor onboarding a walk-in client) — both provision a real login.
export const adminCreateCustomerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      phone: z.string().optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin", "vendor");
    const email = data.email.trim();
    if (store.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false as const, error: "That email is already in use." };
    }
    const id = makeId("user");
    store.users.unshift({
      id,
      name: data.name.trim(),
      email,
      password: hashPassword(data.password),
      role: "customer",
      phone: data.phone.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    persist();
    return { success: true as const, id, name: data.name.trim(), email };
  });

// ---------------------------------------------------------------------------
// Platform settings
// ---------------------------------------------------------------------------

export const getPlatformSettingsFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const settings = clone(store.settings);
  // Never expose the payment secrets — managed via dedicated admin endpoints.
  if (settings.razorpay) settings.razorpay = { ...settings.razorpay, keySecret: "" };
  if (settings.phonepe) settings.phonepe = { ...settings.phonepe, saltKey: "" };
  return settings;
});

export const savePlatformSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      commissionPercent: z.coerce.number().min(0).max(100),
      minimumPayout: z.coerce.number().min(0),
      freeShippingThreshold: z.coerce.number().min(0),
      sameDayDelivery: z.boolean(),
      aiDesignAssistant: z.boolean(),
      vendorSelfOnboarding: z.boolean(),
      internationalShipping: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    store.settings = {
      commissionPercent: data.commissionPercent,
      minimumPayout: data.minimumPayout,
      freeShippingThreshold: data.freeShippingThreshold,
      // Branding and payments are managed by their own endpoints — preserve.
      logoUrl: store.settings.logoUrl ?? null,
      heroSlides: store.settings.heroSlides ?? [],
      testimonials: store.settings.testimonials ?? [],
      adminSlug: store.settings.adminSlug ?? "control",
      razorpay: store.settings.razorpay,
      phonepe: store.settings.phonepe,
      flags: {
        sameDayDelivery: data.sameDayDelivery,
        aiDesignAssistant: data.aiDesignAssistant,
        vendorSelfOnboarding: data.vendorSelfOnboarding,
        internationalShipping: data.internationalShipping,
      },
    };
    persist();
    return clone(store.settings);
  });

// ---------------------------------------------------------------------------
// Branding (logo) — public read, super-admin write
// ---------------------------------------------------------------------------

// Public: returns the active brand logo (custom data URL or null → use default).
// Loaded app-wide so the header/login/portals show the configured logo.
export const getBrandingFn = createServerFn().handler(async () => {
  return { logoUrl: store.settings.logoUrl ?? null };
});

export const uploadLogoFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ dataUrl: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    // Must be an inline image data URL, and small enough to live in settings.
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml|gif);base64,/.exec(
      data.dataUrl,
    );
    if (!match) {
      return {
        success: false,
        error: "Please upload a PNG, JPG, WEBP, GIF or SVG image.",
      };
    }
    // ~512 KB cap on the raw bytes (base64 is ~4/3 of that).
    const base64 = data.dataUrl.split(",")[1] ?? "";
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > 512 * 1024) {
      return { success: false, error: "Logo is too large (max 512 KB)." };
    }
    store.settings.logoUrl = data.dataUrl;
    persist();
    return { success: true as const, logoUrl: data.dataUrl };
  });

export const resetLogoFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireRole("superadmin");
    store.settings.logoUrl = null;
    persist();
    return { success: true as const };
  },
);

// ---------------------------------------------------------------------------
// Homepage hero slider images — public read, super-admin write
//
// Slides can be inline image data URLs (uploaded from the admin) or plain
// http(s)/site-relative URLs. Stored as a JSON array on platform settings.
// ---------------------------------------------------------------------------

const MAX_HERO_SLIDES = 12;
const MAX_HERO_SLIDE_BYTES = 3 * 1024 * 1024; // ~3 MB per uploaded image

function isValidSlide(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (v.startsWith("/")) return true; // site-relative asset, e.g. /business-card.png
  const dataMatch = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/.exec(v);
  if (!dataMatch) return false;
  const base64 = v.split(",")[1] ?? "";
  const approxBytes = Math.floor((base64.length * 3) / 4);
  return approxBytes <= MAX_HERO_SLIDE_BYTES;
}

// Public: returns the configured hero slides (may be empty → storefront falls
// back to its bundled default image).
export const getHeroSlidesFn = createServerFn().handler(async () => {
  return { slides: (store.settings.heroSlides ?? []).slice(0, MAX_HERO_SLIDES) };
});

export const saveHeroSlidesFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slides: z.array(z.string()).max(MAX_HERO_SLIDES) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const cleaned = data.slides.map((s) => s.trim()).filter(Boolean);
    const invalid = cleaned.find((s) => !isValidSlide(s));
    if (invalid) {
      return {
        success: false as const,
        error:
          "Each slide must be an image URL or an uploaded PNG/JPG/WEBP/GIF/SVG under 3 MB.",
      };
    }
    store.settings.heroSlides = cleaned;
    persist();
    return { success: true as const, slides: cleaned };
  });

// ---------------------------------------------------------------------------
// "Loved by businesses" testimonials — public read, super-admin write.
// Each entry has a name, role, quote and an avatar/logo icon (uploaded image
// data URL or a plain image URL).
// ---------------------------------------------------------------------------

const MAX_TESTIMONIALS = 24;
const MAX_AVATAR_BYTES = 1 * 1024 * 1024; // ~1 MB per uploaded avatar

function isValidAvatar(value: string): boolean {
  const v = value.trim();
  if (!v) return true; // avatar is optional → a fallback initial is shown
  if (/^https?:\/\//i.test(v) || v.startsWith("/")) return true;
  const dataMatch = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/.exec(v);
  if (!dataMatch) return false;
  const base64 = v.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4) <= MAX_AVATAR_BYTES;
}

// Public: testimonials shown on the homepage (may be empty → section hidden).
export const getTestimonialsFn = createServerFn().handler(async () => {
  return { testimonials: (store.settings.testimonials ?? []).slice(0, MAX_TESTIMONIALS) };
});

export const saveTestimonialsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      testimonials: z
        .array(
          z.object({
            name: z.string().max(120),
            role: z.string().max(160),
            quote: z.string().max(600),
            avatar: z.string().max(2_000_000),
          }),
        )
        .max(MAX_TESTIMONIALS),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const cleaned: Testimonial[] = [];
    for (const t of data.testimonials) {
      const name = t.name.trim();
      const quote = t.quote.trim();
      // A testimonial is meaningful only with at least a name and a quote.
      if (!name || !quote) continue;
      if (!isValidAvatar(t.avatar)) {
        return {
          success: false as const,
          error: `Avatar for "${name}" must be an image URL or an uploaded PNG/JPG/WEBP/GIF/SVG under 1 MB.`,
        };
      }
      cleaned.push({ name, role: t.role.trim(), quote, avatar: t.avatar.trim() });
    }
    store.settings.testimonials = cleaned;
    persist();
    return { success: true as const, testimonials: cleaned };
  });

// ---------------------------------------------------------------------------
// Secret admin URL — the staff sign-in page lives at /<adminSlug> instead of a
// guessable /control. Public read is limited to a boolean "does this slug
// match" check so the secret slug itself is never enumerable via the API.
// ---------------------------------------------------------------------------

const DEFAULT_ADMIN_SLUG = "control";
// Top-level paths already owned by real routes / assets — never allow the admin
// slug to shadow one of these.
const RESERVED_ADMIN_SLUGS = new Set([
  "control",
  "login",
  "signup",
  "cart",
  "checkout",
  "account",
  "vendor",
  "superadmin",
  "category",
  "product",
  "api",
  "assets",
  "public",
  "favicon.ico",
  "robots.txt",
]);

function normalizeAdminSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

// Returns the configured staff-portal slug (defaults to "control").
function currentAdminSlug(): string {
  return normalizeAdminSlug(store.settings.adminSlug || DEFAULT_ADMIN_SLUG) || DEFAULT_ADMIN_SLUG;
}

// Super admin: read the current staff-portal slug to display in settings.
export const getAdminSlugFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return { slug: currentAdminSlug() };
});

export const saveAdminSlugFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1).max(60) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const slug = normalizeAdminSlug(data.slug);
    if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(slug)) {
      return {
        success: false as const,
        error:
          "Use 3–41 characters: lowercase letters, numbers and dashes only (must start with a letter or number).",
      };
    }
    // "control" is allowed (it's the built-in default); any other reserved path
    // that collides with an existing route is rejected.
    if (slug !== DEFAULT_ADMIN_SLUG && RESERVED_ADMIN_SLUGS.has(slug)) {
      return {
        success: false as const,
        error: `"${slug}" is reserved by another page. Pick a different slug.`,
      };
    }
    store.settings.adminSlug = slug;
    persist();
    return { success: true as const, slug };
  });

// Public: whether a given slug is the active staff-portal path. Returns only a
// boolean so the real slug can't be read back out.
export const staffPortalMatchesFn = createServerFn()
  .inputValidator(z.object({ slug: z.string().min(1).max(60) }))
  .handler(async ({ data }) => {
    return { valid: normalizeAdminSlug(data.slug) === currentAdminSlug() };
  });

// ---------------------------------------------------------------------------
// Payments — Razorpay gateway
//
// The secret key never leaves the server. The admin configures the gateway in
// the panel; the storefront only learns whether it's enabled and the public
// Key ID. Orders are created on the server via the Razorpay Orders API, and the
// returned payment signature is HMAC-verified before the order is committed.
// ---------------------------------------------------------------------------

function rzpConfig(): RazorpayConfig {
  return (
    store.settings.razorpay ?? {
      enabled: false,
      keyId: "",
      keySecret: "",
      mode: "test",
    }
  );
}

function rzpHasCredentials(r: RazorpayConfig): boolean {
  return !!r.keyId && !!r.keySecret;
}

function ppConfig(): PhonePeConfig {
  return (
    store.settings.phonepe ?? {
      enabled: false,
      merchantId: "",
      saltKey: "",
      saltIndex: "1",
      mode: "test",
    }
  );
}

// PhonePe API host by mode.
function phonePeHost(mode: "test" | "live"): string {
  return mode === "live"
    ? "https://api.phonepe.com/apis/hermes"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox";
}

// Public: what the checkout needs to know to render the right pay flow.
export const getPaymentConfigFn = createServerFn().handler(async () => {
  const r = rzpConfig();
  const razorpayEnabled = rzpHasCredentials(r);
  const p = ppConfig();
  const phonePeEnabled = !!p.enabled && !!p.merchantId && !!p.saltKey;
  return {
    razorpayEnabled,
    razorpayKeyId: razorpayEnabled ? r.keyId : "",
    phonePeEnabled,
  };
});

// Super admin: read the current config for the settings form. The secret is
// never returned — only whether one is set.
export const getRazorpayAdminFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const r = rzpConfig();
  return {
    enabled: rzpHasCredentials(r),
    keyId: r.keyId ?? "",
    mode: r.mode ?? "test",
    hasSecret: !!r.keySecret,
  };
});

export const saveRazorpaySettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      enabled: z.boolean(),
      keyId: z.string().trim().default(""),
      // Optional: leave blank to keep the existing secret unchanged.
      keySecret: z.string().trim().optional().default(""),
      mode: z.enum(["test", "live"]).default("test"),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const existing = rzpConfig();
    const keySecret = data.keySecret ? data.keySecret : existing.keySecret;
    if (data.enabled && (!data.keyId || !keySecret)) {
      return {
        success: false as const,
        error: "Enter both a Key ID and Key Secret before enabling Razorpay.",
      };
    }
    store.settings.razorpay = {
      enabled: data.enabled || !!(data.keyId && keySecret),
      keyId: data.keyId,
      keySecret,
      mode: data.mode,
    };
    persist();
    return { success: true as const, enabled: data.enabled, hasSecret: !!keySecret };
  });

// Creates a Razorpay order for the current cart and returns the public details
// the browser checkout widget needs. Amount is computed server-side.
export const createRazorpayOrderFn = createServerFn({ method: "POST" })
  .inputValidator(orderInputSchema)
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) throw new Error("Please sign in to place your order.");
    const r = rzpConfig();
    if (!rzpHasCredentials(r)) {
      throw new Error("Online payments are not available right now.");
    }
    // Authoritative amount: subtotal − validated coupon discount (GST-free).
    const subtotal = computeOrderSubtotal(data.items);
    let discount = 0;
    if (data.couponCode?.trim()) {
      const coupon = store.coupons.find(
        (c) => c.code === data.couponCode!.trim().toUpperCase(),
      );
      const result = evaluateCoupon(coupon, subtotal);
      if (!result.ok) throw new Error(result.reason);
      discount = result.discount;
    }
    const amountInr = Math.max(1, subtotal - discount);
    const amountPaise = Math.round(amountInr * 100);

    const auth = Buffer.from(`${r.keyId}:${r.keySecret}`).toString("base64");
    const resp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: { userId: user.id },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Razorpay order failed (${resp.status}): ${text.slice(0, 160)}`);
    }
    const rzpOrder = (await resp.json()) as { id: string; amount: number; currency: string };
    return {
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: r.keyId,
      customerName: user.name,
      customerEmail: user.email,
    };
  });

// Verifies the Razorpay payment signature, then commits the order. Only a valid
// HMAC (computed with the server-only secret) results in a stored order.
export const verifyRazorpayPaymentFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1),
      order: orderInputSchema,
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) throw new Error("Please sign in to place your order.");
    const r = rzpConfig();
    if (!r.keySecret) throw new Error("Payments are not configured.");

    const expected = createHmac("sha256", r.keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(data.razorpaySignature);
    const valid = a.length === b.length && timingSafeEqual(a, b);
    if (!valid) {
      throw new Error("Payment verification failed. You were not charged.");
    }

    return buildAndStoreOrder(user, data.order, {
      method: "razorpay",
      reference: data.razorpayPaymentId,
      status: "paid",
    });
  });

// ---------------------------------------------------------------------------
// Payments — PhonePe gateway (redirect flow)
//
// PhonePe hosts the payment page: we sign a payload, POST it to /pg/v1/pay, and
// redirect the customer to the returned URL. The order payload is held
// server-side (keyed by a transaction id) so the cart can't be tampered with
// across the redirect. On return we verify the payment via the status API
// (X-VERIFY = SHA256(path + saltKey) + "###" + saltIndex) before placing it.
// ---------------------------------------------------------------------------

// Super admin: read PhonePe config for the form (salt key never returned).
export const getPhonePeAdminFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const p = ppConfig();
  return {
    enabled: !!p.enabled,
    merchantId: p.merchantId ?? "",
    saltIndex: p.saltIndex ?? "1",
    mode: p.mode ?? "test",
    hasSaltKey: !!p.saltKey,
  };
});

export const savePhonePeSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      enabled: z.boolean(),
      merchantId: z.string().trim().default(""),
      // Optional: blank keeps the existing salt key unchanged.
      saltKey: z.string().trim().optional().default(""),
      saltIndex: z.string().trim().default("1"),
      mode: z.enum(["test", "live"]).default("test"),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const existing = ppConfig();
    const saltKey = data.saltKey ? data.saltKey : existing.saltKey;
    if (data.enabled && (!data.merchantId || !saltKey)) {
      return {
        success: false as const,
        error: "Enter Merchant ID and Salt Key before enabling PhonePe.",
      };
    }
    store.settings.phonepe = {
      enabled: data.enabled,
      merchantId: data.merchantId,
      saltKey,
      saltIndex: data.saltIndex || "1",
      mode: data.mode,
    };
    persist();
    return { success: true as const, enabled: data.enabled, hasSaltKey: !!saltKey };
  });

// Starts a PhonePe payment: computes the amount, stores the pending order, and
// returns the hosted checkout URL to redirect the customer to.
export const startPhonePePaymentFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ order: orderInputSchema, origin: z.string().url() }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) throw new Error("Please sign in to place your order.");
    const p = ppConfig();
    if (!p.enabled || !p.merchantId || !p.saltKey) {
      throw new Error("PhonePe payments are not available right now.");
    }

    const subtotal = computeOrderSubtotal(data.order.items);
    let discount = 0;
    if (data.order.couponCode?.trim()) {
      const coupon = store.coupons.find(
        (c) => c.code === data.order.couponCode!.trim().toUpperCase(),
      );
      const result = evaluateCoupon(coupon, subtotal);
      if (!result.ok) throw new Error(result.reason);
      discount = result.discount;
    }
    const amountPaise = Math.round(Math.max(1, subtotal - discount) * 100);

    const txnId = `PZ${Date.now()}${Math.floor(Math.random() * 1000)}`;
    store.pendingPayments ??= {};
    store.pendingPayments[txnId] = {
      userId: user.id,
      order: data.order,
      amountPaise,
      createdAt: Date.now(),
    };

    const payload = {
      merchantId: p.merchantId,
      merchantTransactionId: txnId,
      merchantUserId: user.id,
      amount: amountPaise,
      redirectUrl: `${data.origin}/checkout?phonepe=${txnId}`,
      redirectMode: "REDIRECT",
      callbackUrl: `${data.origin}/checkout?phonepe=${txnId}`,
      mobileNumber: data.order.shipping?.phone ?? undefined,
      paymentInstrument: { type: "PAY_PAGE" },
    };
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const path = "/pg/v1/pay";
    const checksum =
      createHash("sha256").update(base64Payload + path + p.saltKey).digest("hex") +
      "###" +
      p.saltIndex;

    const resp = await fetch(`${phonePeHost(p.mode)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        accept: "application/json",
      },
      body: JSON.stringify({ request: base64Payload }),
    });
    const json = (await resp.json()) as {
      success?: boolean;
      data?: { instrumentResponse?: { redirectInfo?: { url?: string } } };
      message?: string;
    };
    const url = json?.data?.instrumentResponse?.redirectInfo?.url;
    if (!resp.ok || !url) {
      delete store.pendingPayments[txnId];
      throw new Error(
        `PhonePe could not start the payment${json?.message ? `: ${json.message}` : ""}.`,
      );
    }
    return { redirectUrl: url, merchantTransactionId: txnId };
  });

// Verifies a PhonePe payment via the status API and commits the held order.
export const verifyPhonePePaymentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ merchantTransactionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user) throw new Error("Please sign in to place your order.");
    const p = ppConfig();
    if (!p.saltKey) throw new Error("Payments are not configured.");

    const pending = store.pendingPayments?.[data.merchantTransactionId];
    if (!pending || pending.userId !== user.id) {
      return { success: false as const, error: "Unknown or expired payment." };
    }

    const path = `/pg/v1/status/${p.merchantId}/${data.merchantTransactionId}`;
    const checksum =
      createHash("sha256").update(path + p.saltKey).digest("hex") +
      "###" +
      p.saltIndex;
    const resp = await fetch(`${phonePeHost(p.mode)}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": p.merchantId,
        accept: "application/json",
      },
    });
    const json = (await resp.json()) as { code?: string; success?: boolean };
    if (json?.code !== "PAYMENT_SUCCESS") {
      return {
        success: false as const,
        error: "Payment was not completed. You were not charged.",
      };
    }

    const order = await buildAndStoreOrder(user, pending.order, {
      method: "phonepe",
      reference: data.merchantTransactionId,
      status: "paid",
    });
    delete store.pendingPayments![data.merchantTransactionId];
    return { success: true as const, order };
  });

// ---------------------------------------------------------------------------
// Coupons (super admin + checkout)
// ---------------------------------------------------------------------------

// Coupons store their discount as a free-text `type` string (e.g. "50% off
// (max ₹150)", "Flat ₹100 off", "₹250 off"). This parses that string into a
// machine-usable discount so the same coupons created in the admin UI can be
// applied at checkout. Returns null when no numeric discount can be derived.
function parseCouponDiscount(
  type: string,
): { kind: "percent"; value: number; cap?: number } | { kind: "flat"; value: number } | null {
  const text = (type ?? "").toLowerCase();
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const value = Number(percentMatch[1]);
    // Optional cap: "max ₹150", "up to 150", "upto rs 150".
    const capMatch = text.match(/(?:max|up\s?to|upto)\s*(?:₹|rs\.?)?\s*(\d+)/);
    const cap = capMatch ? Number(capMatch[1]) : undefined;
    return value > 0 ? { kind: "percent", value, cap } : null;
  }
  // Flat amount: first number following ₹ / rs, else any standalone number.
  const flatMatch =
    text.match(/(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)/);
  if (flatMatch) {
    const value = Number(flatMatch[1]);
    return value > 0 ? { kind: "flat", value } : null;
  }
  return null;
}

// Shared coupon evaluation used by validateCouponFn (preview) and createOrderFn
// (authoritative). `subtotal` is the pre-GST order subtotal in rupees.
function evaluateCoupon(
  coupon: Coupon | undefined,
  subtotal: number,
): { ok: true; discount: number } | { ok: false; reason: string } {
  if (!coupon) return { ok: false, reason: "Coupon code not found." };
  if (coupon.status !== "active")
    return { ok: false, reason: "This coupon is not active." };
  if (coupon.used >= coupon.limit)
    return { ok: false, reason: "This coupon has reached its usage limit." };
  if (subtotal < coupon.minOrder)
    return {
      ok: false,
      reason: `Add ₹${(coupon.minOrder - subtotal).toLocaleString()} more to use this coupon (min order ₹${coupon.minOrder.toLocaleString()}).`,
    };
  const parsed = parseCouponDiscount(coupon.type);
  if (!parsed)
    return { ok: false, reason: "This coupon has no usable discount." };
  let discount =
    parsed.kind === "percent"
      ? Math.round((subtotal * parsed.value) / 100)
      : Math.round(parsed.value);
  if (parsed.kind === "percent" && parsed.cap)
    discount = Math.min(discount, parsed.cap);
  discount = Math.min(discount, subtotal); // never exceed the subtotal
  if (discount <= 0)
    return { ok: false, reason: "This coupon has no usable discount." };
  return { ok: true, discount };
}

export const getCouponsFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return clone(store.coupons);
});

// Validate a coupon against a given subtotal and return the discount preview.
// Used by the cart so the customer sees the discount before placing the order.
export const validateCouponFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ code: z.string().min(1), subtotal: z.coerce.number().min(0) }),
  )
  .handler(async ({ data }) => {
    const code = data.code.trim().toUpperCase();
    const coupon = store.coupons.find((c) => c.code === code);
    const result = evaluateCoupon(coupon, data.subtotal);
    if (!result.ok) return { valid: false as const, reason: result.reason };
    return {
      valid: true as const,
      code,
      discount: result.discount,
      description: coupon!.description,
      type: coupon!.type,
    };
  });

export const saveCouponFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string().min(2),
      type: z.string().min(1),
      description: z.string().min(1),
      minOrder: z.coerce.number().min(0),
      limit: z.coerce.number().int().min(1),
      status: z.enum(["active", "paused", "expired"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const normalizedCode = data.code.toUpperCase();
    const existing = store.coupons.find((c) => c.code === normalizedCode);
    if (existing) {
      existing.type = data.type;
      existing.description = data.description;
      existing.minOrder = data.minOrder;
      existing.limit = data.limit;
      existing.status = data.status;
    } else {
      store.coupons.unshift({
        code: normalizedCode,
        type: data.type,
        description: data.description,
        minOrder: data.minOrder,
        used: 0,
        limit: data.limit,
        status: data.status,
        createdAt: new Date().toISOString(),
      });
    }
    persist();
    return { success: true };
  });

export const deleteCouponFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string() }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    store.coupons = store.coupons.filter((c) => c.code !== data.code);
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Payouts (super admin + vendor)
// ---------------------------------------------------------------------------

export const getPayoutsFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  if (user.role === "vendor") {
    return clone(store.payouts.filter((p) => p.vendorId === user.id));
  }
  return clone(store.payouts);
});

export const requestPayoutFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ amount: z.coerce.number().positive() }))
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user || user.role !== "vendor") {
      return { success: false, error: "Sign in as a vendor to request a payout." };
    }
    // Cap the request at the withdrawable balance so a vendor can't request
    // more than they've actually earned (net of commission and prior payouts).
    const available = vendorAvailableBalance(user.id);
    if (data.amount > available) {
      return {
        success: false,
        error: `You can request at most ₹${available.toLocaleString()} right now.`,
      };
    }
    store.payouts.unshift({
      id: makeId("PAY"),
      vendorId: user.id,
      vendorName: user.name,
      amount: data.amount,
      requestedAt: new Date().toISOString(),
      status: "pending",
    });
    notifyAdmins({
      type: "payout",
      title: "Payout requested",
      message: `${user.name} requested a payout of ₹${data.amount.toLocaleString()}.`,
    });
    persist();
    return { success: true };
  });

export const updatePayoutStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      status: z.enum(["pending", "approved", "rejected", "paid"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const payout = store.payouts.find((p) => p.id === data.id);
    if (!payout) return { success: false };
    payout.status = data.status;
    notifyVendor(payout.vendorId, {
      type: "payout",
      title: `Payout ${data.status}`,
      message: `Your payout of ₹${payout.amount.toLocaleString()} is now "${data.status}".`,
    });
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Complaints (vendor + super admin)
// ---------------------------------------------------------------------------

export const getComplaintsFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  if (user.role === "vendor") {
    return clone(store.complaints.filter((c) => c.vendorId === user.id));
  }
  return clone(store.complaints);
});

export const respondComplaintFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), message: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireRole("vendor", "superadmin");
    const complaint = store.complaints.find((c) => c.id === data.id);
    if (!complaint) return { success: false };
    // A vendor may only respond to complaints filed against them.
    if (user.role === "vendor" && complaint.vendorId !== user.id) {
      return { success: false, error: "Not authorized for this complaint." };
    }
    complaint.responses.push({
      author: user.name,
      message: data.message,
      at: new Date().toISOString(),
    });
    if (complaint.status === "open") complaint.status = "responded";
    // Keep the other party in the loop: a vendor reply pings admins; an admin
    // reply pings the vendor.
    const vo = store.vendorOrders.find((v) => v.customerOrderId === complaint.orderId);
    if (user.role === "vendor") {
      notifyAdmins({ type: "complaint_reply", title: `Complaint reply · ${complaint.orderId}`, message: `${user.name} responded to a complaint.`, orderId: vo?.id ?? complaint.orderId });
    } else {
      notifyVendor(complaint.vendorId, { type: "complaint_reply", title: `Complaint reply · ${complaint.orderId}`, message: `The platform team responded to a complaint.`, orderId: vo?.id ?? complaint.orderId });
    }
    persist();
    return { success: true };
  });

export const setComplaintPenaltyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      penalty: z.coerce.number().min(0),
      status: z.enum(["open", "responded", "escalated", "resolved"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const complaint = store.complaints.find((c) => c.id === data.id);
    if (!complaint) return { success: false };
    complaint.penalty = data.penalty;
    complaint.status = data.status;
    persist();
    return { success: true };
  });

export const uploadComplaintEvidenceFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      complaintId: z.string(),
      name: z.string().min(1),
      size: z.number().int().nonnegative(),
      type: z.string().min(1),
      dataUrl: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireRole("vendor", "superadmin");
    const complaint = store.complaints.find((c) => c.id === data.complaintId);
    if (!complaint) return { success: false, error: "Complaint not found." };
    if (user.role === "vendor" && complaint.vendorId !== user.id) {
      return { success: false, error: "Not authorized for this complaint." };
    }
    const id = makeId("ev");
    const saved = await saveFile(EVIDENCE_DIR, id, data.dataUrl);
    if (!saved.success) {
      return { success: false, error: saved.error ?? "save failed" };
    }
    const record: ComplaintEvidence = {
      id,
      name: data.name,
      size: saved.bytes ?? data.size,
      type: data.type,
      uploadedBy: user.name,
      uploadedAt: new Date().toISOString(),
    };
    complaint.evidence.push(record);
    persist();
    return { success: true, evidence: record };
  });

export const getComplaintEvidenceFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("vendor", "superadmin");
    const file = await readFile(EVIDENCE_DIR, data.id);
    if (!file) throw notFound();
    return file;
  });

// ---------------------------------------------------------------------------
// Marketing / campaigns
// ---------------------------------------------------------------------------

export const getCampaignsFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return clone(store.campaigns);
});

export const saveCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      channel: z.string().min(1),
      status: z.enum(["Draft", "Scheduled", "Live", "Paused", "Ended"]),
      reach: z.coerce.number().int().min(0).optional().default(0),
      ctr: z.string().optional().default("—"),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    store.campaigns.unshift({
      id: makeId("CAMP"),
      name: data.name,
      channel: data.channel,
      status: data.status,
      reach: data.reach,
      ctr: data.ctr,
      createdAt: new Date().toISOString(),
    });
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Vendor settings
// ---------------------------------------------------------------------------

export const getVendorSettingsFn = createServerFn().handler(async () => {
  const user = await currentUser();
  if (!user || user.role !== "vendor") return null;
  const settings = store.vendorSettings.find((v) => v.vendorId === user.id);
  if (settings) return clone(settings);
  // Lazily initialize
  const fresh: VendorSettings = {
    vendorId: user.id,
    businessName: user.name,
    gstin: user.gstin ?? "",
    email: user.email,
    phone: "",
    panIndia: false,
    pincodes: "",
    hours: DEFAULT_WEEK_HOURS.map((h) => ({ ...h })),
  };
  store.vendorSettings.push(fresh);
  persist();
  return clone(fresh);
});

const weekDaySchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

export const saveVendorSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      businessName: z.string().min(1),
      gstin: z.string().optional().default(""),
      email: z.string().email(),
      phone: z.string().optional().default(""),
      panIndia: z.boolean().optional().default(false),
      pincodes: z.string().optional().default(""),
      hours: z
        .array(
          z.object({
            day: weekDaySchema,
            from: z.string(),
            to: z.string(),
            on: z.boolean(),
          }),
        )
        .length(7),
    }),
  )
  .handler(async ({ data }) => {
    const user = await currentUser();
    if (!user || user.role !== "vendor")
      return { success: false, error: "Vendor only." };
    // Reject saves that have neither pan India nor at least one pincode
    if (!data.panIndia && pincodesFor({ ...data, vendorId: user.id } as VendorSettings).size === 0) {
      return {
        success: false,
        error:
          "Add at least one pincode or enable Pan India delivery so customers can order from you.",
      };
    }
    let settings = store.vendorSettings.find((v) => v.vendorId === user.id);
    if (!settings) {
      settings = { vendorId: user.id, ...data };
      store.vendorSettings.push(settings);
    } else {
      settings.businessName = data.businessName;
      settings.gstin = data.gstin;
      settings.email = data.email;
      settings.phone = data.phone;
      settings.panIndia = data.panIndia;
      settings.pincodes = data.pincodes;
      settings.hours = data.hours;
    }
    // Reflect business name on user record
    user.name = data.businessName;
    user.email = data.email;
    if (data.gstin) user.gstin = data.gstin;
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Dashboards (KPIs)
// ---------------------------------------------------------------------------

export const getSuperAdminKPIsFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const customers = store.users.filter((u) => u.role === "customer").length;
  const activeVendors = store.users.filter(
    (u) => u.role === "vendor" && u.vendorStatus === "active",
  ).length;
  const todayKey = new Date().toDateString();
  const ordersToday = store.customerOrders.filter(
    (o) => new Date(o.createdAt).toDateString() === todayKey,
  ).length;
  const gmv = store.customerOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);

  const statusCounts = store.vendorOrders.reduce<Record<string, number>>(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const orderStatusBreakdown = seedOrderStatusBreakdown.map((entry) => {
    const key = entry.name.toLowerCase().replace(/ /g, "_");
    const real = statusCounts[key];
    return { ...entry, value: real ?? entry.value };
  });

  return {
    kpis: {
      gmv,
      activeVendors,
      customers,
      ordersToday,
    },
    weeklyRevenue: seedWeeklyRevenue,
    orderStatusBreakdown,
    pendingVendors: clone(store.pendingVendors),
  };
});

export const getVendorDashboardFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  const vendorId = user.role === "vendor" ? user.id : undefined;
  const myOrders = vendorId
    ? store.vendorOrders.filter((o) => o.vendorId === vendorId || !o.vendorId)
    : store.vendorOrders;

  const today = new Date().toDateString();
  const todaysOrders = myOrders.filter(
    (o) => o.date === "Today" || o.date.includes(today),
  ).length;
  // Revenue shown to the vendor is net of the platform commission.
  const rate = store.settings.commissionPercent / 100;
  const todaysRevenue = Math.round(
    myOrders
      .filter((o) => o.date === "Today")
      .reduce((sum, o) => sum + o.amount, 0) * (1 - rate),
  );
  const pending = myOrders.filter(
    (o) => o.status === "new" || o.status === "accepted",
  ).length;
  const completed = myOrders.filter((o) => o.status === "completed").length;

  return {
    metrics: { todaysOrders, todaysRevenue, pending, completed },
    weeklyRevenue: seedWeeklyRevenue,
    recentOrders: clone(myOrders.slice(0, 5)),
    vendorName: user?.name ?? "Vendor",
  };
});

// Real vendor performance analytics computed from the vendor's own orders and
// complaint history — no random or hard-coded values. Refreshes on every load.
export const getVendorAnalyticsFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  const vendorId = user.role === "vendor" ? user.id : undefined;
  const myOrders = vendorId
    ? store.vendorOrders.filter((o) => o.vendorId === vendorId)
    : store.vendorOrders;

  const total = myOrders.length;
  const cancelled = myOrders.filter((o) => o.status === "cancelled").length;
  const completed = myOrders.filter((o) => o.status === "completed").length;
  const dispatched = myOrders.filter((o) => o.status === "dispatched").length;
  const active = Math.max(0, total - cancelled - completed);

  // Acceptance = share of assigned orders the vendor did not cancel/reject.
  const acceptanceRate = total
    ? Math.round(((total - cancelled) / total) * 1000) / 10
    : 0;
  // Fulfilment = share of accepted orders taken to dispatched/completed.
  const fulfilmentBase = total - cancelled;
  const fulfilmentRate = fulfilmentBase
    ? Math.round(((completed + dispatched) / fulfilmentBase) * 1000) / 10
    : 0;
  const satisfaction = vendorId ? vendorRating(vendorId) : 5;

  // Reliable timestamp for a vendor order via its linked customer order.
  const orderDate = (o: (typeof myOrders)[number]): Date | null => {
    const co = o.customerOrderId
      ? store.customerOrders.find((c) => c.id === o.customerOrderId)
      : null;
    const t = co ? new Date(co.createdAt) : null;
    return t && !Number.isNaN(t.getTime()) ? t : null;
  };

  // Real order volume for the last 6 calendar months.
  const now = new Date();
  const monthlyVolume: { month: string; orders: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const orders = myOrders.filter((o) => {
      const t = orderDate(o);
      return (
        t && t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth()
      );
    }).length;
    monthlyVolume.push({
      month: d.toLocaleDateString("en-US", { month: "short" }),
      orders,
    });
  }

  const lastMonth = monthlyVolume[monthlyVolume.length - 1]?.orders ?? 0;
  const prevMonth = monthlyVolume[monthlyVolume.length - 2]?.orders ?? 0;
  const momGrowth =
    prevMonth === 0
      ? lastMonth > 0
        ? 100
        : 0
      : Math.round(((lastMonth - prevMonth) / prevMonth) * 1000) / 10;

  return {
    metrics: {
      totalOrders: total,
      completed,
      active,
      acceptanceRate,
      fulfilmentRate,
      satisfaction,
      momGrowth,
    },
    monthlyVolume,
  };
});

export const getVendorFinanceFn = createServerFn().handler(async () => {
  const user = await requireRole("vendor", "superadmin");
  const vendorId = user.role === "vendor" ? user.id : undefined;
  const myOrders = vendorId
    ? store.vendorOrders.filter((o) => o.vendorId === vendorId)
    : store.vendorOrders;
  const myPayouts = vendorId
    ? store.payouts.filter((p) => p.vendorId === vendorId)
    : store.payouts;

  // The platform keeps `commissionPercent` of every order; the vendor's
  // earnings are the order amount net of that commission.
  const commissionPercent = store.settings.commissionPercent;
  const rate = commissionPercent / 100;
  const net = (amount: number) => Math.round(amount * (1 - rate));

  // Cancelled orders don't earn the vendor anything.
  const earningOrders = myOrders.filter((o) => o.status !== "cancelled");
  const grossTotal = earningOrders.reduce((sum, o) => sum + o.amount, 0);
  const commissionTotal = Math.round(grossTotal * rate);
  const total = grossTotal - commissionTotal; // net earnings

  const thisMonth = earningOrders
    .filter((o) => o.date === "Today" || o.date.includes("ago"))
    .reduce((sum, o) => sum + net(o.amount), 0);

  // Money already paid out or queued for payout reduces what's still available.
  const pendingSettlement = myPayouts
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);
  const available = vendorId ? vendorAvailableBalance(vendorId) : 0;

  const txns = myOrders.slice(0, 12).map((o, i) => ({
    id: `T-${10000 - i}`,
    order: o.id,
    date: o.date,
    amount: o.amount, // gross order value
    commission: o.status === "cancelled" ? 0 : Math.round(o.amount * rate),
    net: o.status === "cancelled" ? 0 : net(o.amount),
    status:
      o.status === "cancelled"
        ? "cancelled"
        : o.status === "completed" || o.status === "dispatched"
          ? "settled"
          : "pending",
  }));

  return {
    metrics: {
      total,
      thisMonth,
      pendingSettlement,
      gross: grossTotal,
      commission: commissionTotal,
      commissionPercent,
    },
    txns,
    available,
  };
});

export const getFinanceOverviewFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const gmv = store.customerOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const commissionPercent = store.settings.commissionPercent;
  const commissionRate = commissionPercent / 100;
  // Platform's commission income, and the remainder owed to vendors.
  const netRevenue = Math.round(gmv * commissionRate);
  const vendorEarnings = gmv - netRevenue;
  const pendingPayouts = store.payouts
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);
  const disputed = store.complaints
    .filter((c) => c.status !== "resolved")
    .reduce((sum, c) => sum + c.penalty, 0);

  return {
    metrics: { gmv, netRevenue, vendorEarnings, pendingPayouts, disputed, commissionPercent },
    weeklyRevenue: seedWeeklyRevenue,
    upcomingPayouts: clone(
      store.payouts
        .filter((p) => p.status === "pending" || p.status === "approved")
        .slice(0, 5),
    ),
  };
});

// ---------------------------------------------------------------------------
// Super admin: customer management (extended CRUD)
// ---------------------------------------------------------------------------

export const getCustomerDetailFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const customer = store.users.find(
      (u) => u.id === data.id && u.role === "customer",
    );
    if (!customer) throw notFound();
    const orders = store.customerOrders
      .filter((o) => o.userId === customer.id)
      .map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        itemCount: o.items.length,
      }));
    const spend = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + o.total, 0);
    return {
      profile: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? "",
        gstin: customer.gstin ?? "",
        createdAt: customer.createdAt,
        addressCount: customer.addresses?.length ?? 0,
        wishlistCount: customer.wishlist?.length ?? 0,
      },
      orders,
      spend,
    };
  });

export const adminUpdateCustomerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().default(""),
      gstin: z.string().optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const customer = store.users.find(
      (u) => u.id === data.id && u.role === "customer",
    );
    if (!customer) return { success: false, error: "Customer not found." };
    const conflict = store.users.find(
      (u) =>
        u.id !== customer.id &&
        u.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (conflict) {
      return { success: false, error: "That email is already in use." };
    }
    customer.name = data.name;
    customer.email = data.email;
    customer.phone = data.phone;
    customer.gstin = data.gstin || undefined;
    persist();
    return { success: true };
  });

export const adminResetPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      newPassword: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const actor = await requireRole("superadmin");
    const user = store.users.find((u) => u.id === data.id);
    if (!user) return { success: false, error: "User not found." };
    if (user.id === actor.id) {
      return {
        success: false,
        error: "Use your own profile page to reset your password.",
      };
    }
    user.password = hashPassword(data.newPassword);
    persist();
    return { success: true };
  });

export const adminDeleteUserFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const actor = await requireRole("superadmin");
    if (data.id === actor.id) {
      return {
        success: false,
        error: "You can't delete your own account.",
      };
    }
    const user = store.users.find((u) => u.id === data.id);
    if (!user) return { success: false, error: "User not found." };
    // Never allow removing the last superadmin — that would lock everyone out
    // of the admin panel with no way back in.
    if (user.role === "superadmin") {
      const adminCount = store.users.filter(
        (u) => u.role === "superadmin",
      ).length;
      if (adminCount <= 1) {
        return {
          success: false,
          error: "Can't delete the only super admin account.",
        };
      }
    }
    store.users = store.users.filter((u) => u.id !== data.id);
    // Also drop them from the admin team roster (matched by email).
    store.adminTeam = store.adminTeam.filter(
      (m) => m.email.toLowerCase() !== user.email.toLowerCase(),
    );
    // Cascade: drop the user's pending vendor row, settings, payouts requests.
    store.pendingVendors = store.pendingVendors.filter((v) => v.id !== data.id);
    store.vendorSettings = store.vendorSettings.filter(
      (s) => s.vendorId !== data.id,
    );
    store.payouts = store.payouts.filter((p) => p.vendorId !== data.id);
    // Unassign any vendor orders that pointed at this vendor.
    for (const vo of store.vendorOrders) {
      if (vo.vendorId === data.id) vo.vendorId = undefined;
    }
    persist();
    return { success: true };
  });

// Super admin: full directory of every user (customers, vendors, admins) with
// their key data for the user-management panel. Passwords are never returned.
export const getAllUsersAdminFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return store.users
    .map((u) => {
      const orders = store.customerOrders.filter((o) => o.userId === u.id);
      const spend = orders
        .filter((o) => o.status !== "cancelled")
        .reduce((sum, o) => sum + o.total, 0);
      const assignedOrders =
        u.role === "vendor"
          ? store.vendorOrders.filter((v) => v.vendorId === u.id).length
          : 0;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone ?? "",
        gstin: u.gstin ?? "",
        city: u.city ?? "",
        services: u.services ?? "",
        vendorStatus: u.vendorStatus ?? null,
        createdAt: u.createdAt,
        orderCount: orders.length,
        spend,
        assignedOrders,
        addressCount: u.addresses?.length ?? 0,
        wishlistCount: u.wishlist?.length ?? 0,
      };
    })
    // Newest first so freshly-created accounts surface at the top.
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
});

// ---------------------------------------------------------------------------
// Super admin: vendor management (extended)
// ---------------------------------------------------------------------------

export const getVendorDetailFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const vendor = store.users.find(
      (u) => u.id === data.id && u.role === "vendor",
    );
    if (!vendor) throw notFound();
    const orders = store.vendorOrders.filter((o) => o.vendorId === vendor.id);
    const settings = store.vendorSettings.find((s) => s.vendorId === vendor.id);
    const payouts = store.payouts.filter((p) => p.vendorId === vendor.id);
    const pending = store.pendingVendors.find((p) => p.id === vendor.id);
    return {
      profile: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone ?? "",
        gstin: vendor.gstin ?? "",
        city: vendor.city ?? "",
        services: vendor.services ?? "",
        status: vendor.vendorStatus ?? "active",
        createdAt: vendor.createdAt,
      },
      pending: pending ? clone(pending) : null,
      orderCount: orders.length,
      orderValue: orders.reduce((sum, o) => sum + o.amount, 0),
      payouts: clone(payouts),
      panIndia: settings?.panIndia ?? false,
      pincodes: settings ? Array.from(pincodesFor(settings)) : [],
      documents: clone((settings as any)?.documents ?? []) as {
        name: string;
        kind: string;
        dataUrl: string;
      }[],
      compliance: clone((settings as any)?.compliance ?? {}) as Record<string, string>,
    };
  });

export const adminUpdateVendorFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().default(""),
      gstin: z.string().optional().default(""),
      city: z.string().optional().default(""),
      services: z.string().optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const vendor = store.users.find(
      (u) => u.id === data.id && u.role === "vendor",
    );
    if (!vendor) return { success: false, error: "Vendor not found." };
    const conflict = store.users.find(
      (u) =>
        u.id !== vendor.id &&
        u.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (conflict) {
      return { success: false, error: "That email is already in use." };
    }
    vendor.name = data.name;
    vendor.email = data.email;
    vendor.phone = data.phone;
    if (data.gstin) vendor.gstin = data.gstin;
    if (data.city) vendor.city = data.city;
    if (data.services) vendor.services = data.services;
    // Keep vendorSettings business name in sync
    const settings = store.vendorSettings.find((s) => s.vendorId === vendor.id);
    if (settings) {
      settings.businessName = data.name;
      settings.email = data.email;
      if (data.phone) settings.phone = data.phone;
      if (data.gstin) settings.gstin = data.gstin;
    }
    persist();
    return { success: true };
  });

export const setVendorStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      status: z.enum(["active", "warning", "suspended"]),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const vendor = store.users.find(
      (u) => u.id === data.id && u.role === "vendor",
    );
    if (!vendor) return { success: false, error: "Vendor not found." };
    vendor.vendorStatus = data.status;
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Super admin: order management
// ---------------------------------------------------------------------------

export const getAdminOrderDetailFn = createServerFn()
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const vendorOrder = store.vendorOrders.find((o) => o.id === data.id);
    if (!vendorOrder) throw notFound();
    const customerOrder = vendorOrder.customerOrderId
      ? store.customerOrders.find((o) => o.id === vendorOrder.customerOrderId)
      : null;
    const vendor = vendorOrder.vendorId
      ? store.users.find((u) => u.id === vendorOrder.vendorId)
      : null;
    const activeVendors = store.users
      .filter((u) => u.role === "vendor" && u.vendorStatus === "active")
      .map((u) => ({ id: u.id, name: u.name, city: u.city ?? "—" }));
    return {
      vendorOrder: clone(vendorOrder),
      customerOrder: customerOrder
        ? {
            ...clone(customerOrder),
            items: customerOrder.items.map((item) => ({
              ...item,
              artwork: item.artwork
                ? { ...item.artwork, dataUrl: undefined }
                : null,
            })),
          }
        : null,
      vendor: vendor
        ? {
            id: vendor.id,
            name: vendor.name,
            email: vendor.email,
            city: vendor.city ?? "",
          }
        : null,
      vendors: activeVendors,
    };
  });

export const adminCancelOrderFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const vendorOrder = store.vendorOrders.find((o) => o.id === data.id);
    if (!vendorOrder) return { success: false, error: "Order not found." };
    vendorOrder.status = "cancelled";
    if (!vendorOrder.statusHistory) vendorOrder.statusHistory = [];
    vendorOrder.statusHistory.push({
      status: "cancelled",
      at: new Date().toISOString(),
    });
    if (vendorOrder.customerOrderId) {
      const customerOrder = store.customerOrders.find(
        (o) => o.id === vendorOrder.customerOrderId,
      );
      if (customerOrder) customerOrder.status = "cancelled";
    }
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Super admin: campaign editing & deletion
// ---------------------------------------------------------------------------

export const updateCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      channel: z.string().min(1),
      status: z.enum(["Draft", "Scheduled", "Live", "Paused", "Ended"]),
      reach: z.coerce.number().int().min(0),
      ctr: z.string().optional().default("—"),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const campaign = store.campaigns.find((c) => c.id === data.id);
    if (!campaign) return { success: false, error: "Campaign not found." };
    campaign.name = data.name;
    campaign.channel = data.channel;
    campaign.status = data.status;
    campaign.reach = data.reach;
    campaign.ctr = data.ctr;
    persist();
    return { success: true };
  });

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    store.campaigns = store.campaigns.filter((c) => c.id !== data.id);
    persist();
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Super admin: internal team / RBAC
// ---------------------------------------------------------------------------

export const getAdminTeamFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  return clone(store.adminTeam);
});

// Inviting or editing an admin team member now provisions a *real* login: an
// account with role "superadmin" that signs in through the staff portal. The
// team roster (admin_team) and the login account (users) are kept in sync by
// email. There is a single admin tier — every member gets full super-admin
// access; the "role" label is organizational only.
export const saveAdminMemberFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      email: z.string().email(),
      role: z.string().min(1),
      // Required when inviting a new member; optional on edit (blank = keep).
      password: z.string().optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("superadmin");
    const email = data.email.trim();
    const password = data.password.trim();

    if (data.id) {
      const member = store.adminTeam.find((m) => m.id === data.id);
      if (!member) return { success: false, error: "Member not found." };
      const teamConflict = store.adminTeam.find(
        (m) => m.id !== member.id && m.email.toLowerCase() === email.toLowerCase(),
      );
      if (teamConflict) {
        return { success: false, error: "That email is already in the team." };
      }
      // The login account is matched by the member's *current* email.
      const account = store.users.find(
        (u) => u.email.toLowerCase() === member.email.toLowerCase(),
      );
      const userConflict = store.users.find(
        (u) =>
          u.email.toLowerCase() === email.toLowerCase() &&
          u.id !== account?.id,
      );
      if (userConflict) {
        return { success: false, error: "That email is already in use by another account." };
      }
      if (password && password.length < 8) {
        return { success: false, error: "Password must be at least 8 characters." };
      }
      member.name = data.name;
      member.email = email;
      member.role = data.role;
      if (account) {
        account.name = data.name;
        account.email = email;
        if (password) account.password = hashPassword(password);
      } else {
        // No linked login yet (legacy member) → create one now.
        store.users.unshift({
          id: makeId("user"),
          name: data.name,
          email,
          password: hashPassword(password || "ChangeMe@123"),
          role: "superadmin",
          createdAt: new Date().toISOString(),
        });
      }
      persist();
      return { success: true as const, hadPassword: !!password };
    }

    // Creating a brand-new member requires a starting password.
    if (password.length < 8) {
      return {
        success: false,
        error: "Set a password (min 8 characters) so the member can sign in.",
      };
    }
    if (store.adminTeam.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: "That email is already in the team." };
    }
    if (store.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: "That email is already in use by another account." };
    }
    store.users.unshift({
      id: makeId("user"),
      name: data.name,
      email,
      password: hashPassword(password),
      role: "superadmin",
      createdAt: new Date().toISOString(),
    });
    store.adminTeam.unshift({
      id: makeId("adm"),
      name: data.name,
      email,
      role: data.role,
      lastSeen: "Just now",
      createdAt: new Date().toISOString(),
    });
    persist();
    return { success: true as const, created: true };
  });

export const deleteAdminMemberFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const actor = await requireRole("superadmin");
    const member = store.adminTeam.find((m) => m.id === data.id);
    if (!member) return { success: false as const, error: "Member not found." };
    const account = store.users.find(
      (u) => u.email.toLowerCase() === member.email.toLowerCase(),
    );
    if (account) {
      if (account.id === actor.id) {
        return { success: false as const, error: "You can't remove your own account." };
      }
      const adminCount = store.users.filter((u) => u.role === "superadmin").length;
      if (account.role === "superadmin" && adminCount <= 1) {
        return { success: false as const, error: "Can't remove the only super admin." };
      }
      // Remove the login account too so the member can no longer sign in.
      store.users = store.users.filter((u) => u.id !== account.id);
    }
    store.adminTeam = store.adminTeam.filter((m) => m.id !== data.id);
    persist();
    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// Super admin: real analytics (computed from store)
// ---------------------------------------------------------------------------

export const getAdminAnalyticsFn = createServerFn().handler(async () => {
  await requireRole("superadmin");
  const customerCount = store.users.filter((u) => u.role === "customer").length;
  const vendorCount = store.users.filter((u) => u.role === "vendor").length;
  const activeVendorCount = store.users.filter(
    (u) => u.role === "vendor" && u.vendorStatus === "active",
  ).length;
  const totalOrders = store.customerOrders.length;
  const totalGmv = store.customerOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = totalOrders === 0 ? 0 : Math.round(totalGmv / totalOrders);
  const conversionBase = Math.max(customerCount, 1);
  const conversion = Math.min(100, (totalOrders / conversionBase) * 100);

  // Build a real 7-day activity trend from the store. "visits" is the count of
  // real account + order activity that day (new sign-ups plus orders placed) —
  // deterministic, never random, and it updates as the data changes.
  const now = Date.now();
  const trend: { day: string; visits: number; conv: number }[] = [];
  const dayLabel = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    const dayKey = date.toDateString();
    const conv = store.customerOrders.filter(
      (o) => new Date(o.createdAt).toDateString() === dayKey,
    ).length;
    const signups = store.users.filter(
      (u) => new Date(u.createdAt).toDateString() === dayKey,
    ).length;
    trend.push({
      day: dayLabel[date.getDay() === 0 ? 6 : date.getDay() - 1],
      visits: signups + conv,
      conv,
    });
  }

  // Top categories by orders
  const categoryHits = new Map<string, number>();
  for (const o of store.customerOrders) {
    for (const item of o.items) {
      const slug = item.product.category;
      categoryHits.set(slug, (categoryHits.get(slug) ?? 0) + item.quantity);
    }
  }
  const topCategories = Array.from(categoryHits.entries())
    .map(([slug, qty]) => {
      const c = findCategory(slug);
      return { slug, name: c?.name ?? slug, qty };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  return {
    metrics: {
      customers: customerCount,
      vendors: vendorCount,
      activeVendors: activeVendorCount,
      totalOrders,
      totalGmv,
      avgOrderValue,
      conversionRate: Number(conversion.toFixed(2)),
    },
    trend,
    topCategories,
  };
});
