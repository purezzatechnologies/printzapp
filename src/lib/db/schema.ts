import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// All "complex" fields (arrays, nested objects) are stored as JSON text and
// hydrated through helpers in `repo.ts`. This keeps the schema flat enough
// for any SQLite browser to inspect while still preserving the rich shapes
// the existing server functions return.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'customer' | 'vendor' | 'superadmin'
  gstin: text("gstin"),
  phone: text("phone"),
  vendorStatus: text("vendor_status"),
  city: text("city"),
  services: text("services"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const addresses = sqliteTable("addresses", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  landmark: text("landmark"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const wishlist = sqliteTable("wishlist", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  addedAt: text("added_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const newsletter = sqliteTable("newsletter", {
  email: text("email").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const categories = sqliteTable("categories", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  image: text("image").notNull(),
  position: integer("position").notNull().default(0),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category")
    .notNull()
    .references(() => categories.slug),
  basePrice: real("base_price").notNull(),
  sku: text("sku").notNull(),
  rating: real("rating").notNull().default(4.5),
  reviews: integer("reviews").notNull().default(0),
  image: text("image").notNull(),
  // Arrays of strings stored as JSON text
  images: text("images").notNull().default("[]"),
  videoUrls: text("video_urls").notNull().default("[]"),
  badge: text("badge"),
  description: text("description").notNull(),
  quantityOptions: text("quantity_options").notNull().default("[]"),
  sizes: text("sizes").notNull().default("[]"),
  finishes: text("finishes").notNull().default("[]"),
  turnarounds: text("turnarounds").notNull().default("[]"),
  artworkRequired: integer("artwork_required", { mode: "boolean" })
    .notNull()
    .default(true),
  artworkHint: text("artwork_hint").notNull().default(""),
  swatches: text("swatches").notNull().default("[]"),
  variations: text("variations").notNull().default("[]"),
  position: integer("position").notNull().default(0),
});

export const customerOrders = sqliteTable("customer_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  // Shipping fields stored as JSON
  shipping: text("shipping"),
  subtotal: real("subtotal").notNull(),
  discount: real("discount").notNull().default(0),
  couponCode: text("coupon_code"),
  gst: real("gst").notNull(),
  total: real("total").notNull(),
  // Payment info as JSON ({ method, reference, status }).
  payment: text("payment"),
  // Refund lifecycle as JSON ({ status, amount, reason, reference, ... }).
  refund: text("refund"),
  status: text("status").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const customerOrderItems = sqliteTable("customer_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => customerOrders.id, { onDelete: "cascade" }),
  // Snapshot of product info
  productJson: text("product_json").notNull(),
  quantity: integer("quantity").notNull(),
  size: text("size").notNull(),
  finish: text("finish").notNull().default(""),
  turnaround: text("turnaround").notNull(),
  artwork: text("artwork"),
  customization: text("customization"),
});

export const vendorOrders = sqliteTable("vendor_orders", {
  id: text("id").primaryKey(),
  customerOrderId: text("customer_order_id"),
  customer: text("customer").notNull(),
  vendorId: text("vendor_id"),
  product: text("product").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull(),
  deadline: text("deadline").notNull(),
  date: text("date").notNull(),
  trackingNumber: text("tracking_number"),
  statusHistory: text("status_history").notNull().default("[]"),
});

export const vendorProducts = sqliteTable("vendor_products", {
  slug: text("slug").primaryKey(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  dailyCap: integer("daily_cap").notNull().default(500),
  turnaroundDays: integer("turnaround_days").notNull().default(3),
});

export const pendingVendors = sqliteTable("pending_vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  services: text("services").notNull(),
  appliedOn: text("applied_on").notNull(),
});

export const platformSettings = sqliteTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  commissionPercent: real("commission_percent").notNull().default(18),
  minimumPayout: real("minimum_payout").notNull().default(500),
  freeShippingThreshold: real("free_shipping_threshold").notNull().default(499),
  sameDayDelivery: integer("same_day_delivery", { mode: "boolean" })
    .notNull()
    .default(true),
  aiDesignAssistant: integer("ai_design_assistant", { mode: "boolean" })
    .notNull()
    .default(true),
  vendorSelfOnboarding: integer("vendor_self_onboarding", { mode: "boolean" })
    .notNull()
    .default(false),
  internationalShipping: integer("international_shipping", { mode: "boolean" })
    .notNull()
    .default(false),
  logoUrl: text("logo_url"),
  // Homepage hero slider images stored as a JSON array of URLs / data URLs.
  heroSlides: text("hero_slides").notNull().default("[]"),
  // Secret URL slug for the staff/admin sign-in page.
  adminSlug: text("admin_slug").notNull().default("control"),
  // "Loved by businesses" testimonials as a JSON array.
  testimonials: text("testimonials").notNull().default("[]"),
  // Razorpay gateway config stored as JSON ({ enabled, keyId, keySecret, mode }).
  razorpay: text("razorpay"),
  // PhonePe gateway config as JSON ({ enabled, merchantId, saltKey, saltIndex, mode }).
  phonepe: text("phonepe"),
});

export const coupons = sqliteTable("coupons", {
  code: text("code").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  minOrder: real("min_order").notNull().default(0),
  used: integer("used").notNull().default(0),
  limit: integer("limit").notNull().default(1000),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const payouts = sqliteTable("payouts", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  amount: real("amount").notNull(),
  requestedAt: text("requested_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  status: text("status").notNull(),
});

export const complaints = sqliteTable("complaints", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  customerName: text("customer_name").notNull(),
  vendorId: text("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  issue: text("issue").notNull(),
  detail: text("detail"),
  penalty: real("penalty").notNull().default(0),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const complaintResponses = sqliteTable("complaint_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  complaintId: text("complaint_id")
    .notNull()
    .references(() => complaints.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  message: text("message").notNull(),
  at: text("at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const complaintEvidence = sqliteTable("complaint_evidence", {
  id: text("id").primaryKey(),
  complaintId: text("complaint_id")
    .notNull()
    .references(() => complaints.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  type: text("type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: text("uploaded_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  reach: integer("reach").notNull().default(0),
  ctr: text("ctr").notNull().default("—"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const vendorSettings = sqliteTable("vendor_settings", {
  vendorId: text("vendor_id").primaryKey(),
  businessName: text("business_name").notNull(),
  gstin: text("gstin").notNull().default(""),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  panIndia: integer("pan_india", { mode: "boolean" }).notNull().default(false),
  pincodes: text("pincodes").notNull().default(""),
  hours: text("hours").notNull().default("[]"),
  // Uploaded compliance documents as a JSON array ({ name, kind, dataUrl }).
  documents: text("documents").notNull().default("[]"),
  // Compliance metadata as JSON ({ pan, gstin, businessType, ... }).
  compliance: text("compliance").notNull().default("{}"),
});

export const adminTeam = sqliteTable("admin_team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  lastSeen: text("last_seen").notNull().default("Just now"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  vendorId: text("vendor_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  orderId: text("order_id"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});
