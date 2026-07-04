// Bridges the in-memory `Store` shape used by backend.ts with the normalized
// SQLite tables defined in schema.ts. The DB is the source of truth; on
// startup we hydrate the in-memory store from it, and on every persist() we
// rewrite the relevant tables. This keeps all existing server-function logic
// unchanged while giving us a real, browseable database file.
import { rawDb } from "./client";
import { ensureBootstrapped } from "./bootstrap";

type AnyObject = Record<string, any>;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function isoNow() {
  return new Date().toISOString();
}

export function loadStoreFromDb(): AnyObject {
  ensureBootstrapped();

  const users = rawDb.prepare("SELECT * FROM users").all().map(rowToUser);
  const addressRows = rawDb
    .prepare("SELECT * FROM addresses")
    .all() as AnyObject[];
  const wishlistRows = rawDb
    .prepare("SELECT * FROM wishlist")
    .all() as AnyObject[];
  for (const u of users) {
    u.addresses = addressRows
      .filter((a) => a.user_id === u.id)
      .map(rowToAddress);
    u.wishlist = wishlistRows
      .filter((w) => w.user_id === u.id)
      .map((w) => w.product_slug);
  }

  const newsletter = (rawDb
    .prepare("SELECT email FROM newsletter")
    .all() as AnyObject[]).map((r) => r.email as string);

  const catalogCategories = rawDb
    .prepare("SELECT * FROM categories ORDER BY position")
    .all()
    .map(rowToCategory) as AnyObject[];

  const productRows = rawDb
    .prepare("SELECT * FROM products ORDER BY position")
    .all() as AnyObject[];
  for (const cat of catalogCategories) {
    cat.products = productRows
      .filter((p) => p.category === cat.slug)
      .map(rowToProduct);
    cat.productCount = cat.products.length;
  }

  const orderRows = rawDb
    .prepare("SELECT * FROM customer_orders ORDER BY datetime(created_at) DESC")
    .all() as AnyObject[];
  const itemRows = rawDb
    .prepare("SELECT * FROM customer_order_items")
    .all() as AnyObject[];
  const customerOrders = orderRows.map((o) => ({
    id: o.id,
    userId: o.user_id,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    shipping: parseJson(o.shipping, undefined),
    items: itemRows
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        id: i.id,
        product: parseJson(i.product_json, {}),
        quantity: i.quantity,
        size: i.size,
        finish: i.finish,
        turnaround: parseJson(i.turnaround, {}),
        artwork: parseJson(i.artwork, null),
        customization: parseJson(i.customization, undefined),
      })),
    subtotal: o.subtotal,
    discount: o.discount ?? 0,
    couponCode: o.coupon_code ?? undefined,
    gst: o.gst,
    total: o.total,
    payment: parseJson(o.payment, undefined),
    refund: parseJson(o.refund, undefined),
    status: o.status,
    createdAt: o.created_at,
  }));

  const vendorOrders = (rawDb
    .prepare("SELECT * FROM vendor_orders ORDER BY datetime(date) DESC")
    .all() as AnyObject[]).map(rowToVendorOrder);

  const vendorProducts = (rawDb
    .prepare("SELECT * FROM vendor_products")
    .all() as AnyObject[]).map((p) => ({
    slug: p.slug,
    active: !!p.active,
    dailyCap: p.daily_cap,
    turnaroundDays: p.turnaround_days,
  }));

  const pendingVendors = (rawDb
    .prepare("SELECT * FROM pending_vendors")
    .all() as AnyObject[]).map((v) => ({
    id: v.id,
    name: v.name,
    city: v.city,
    services: v.services,
    appliedOn: v.applied_on,
  }));

  const settingsRow = rawDb
    .prepare("SELECT * FROM platform_settings WHERE id = 1")
    .get() as AnyObject | undefined;
  const settings = settingsRow
    ? {
        commissionPercent: settingsRow.commission_percent,
        minimumPayout: settingsRow.minimum_payout,
        freeShippingThreshold: settingsRow.free_shipping_threshold,
        logoUrl: settingsRow.logo_url ?? null,
        heroSlides: parseJson<string[]>(settingsRow.hero_slides, []),
        adminSlug: settingsRow.admin_slug ?? "control",
        testimonials: parseJson<any[]>(settingsRow.testimonials, []),
        razorpay: parseJson(settingsRow.razorpay, {
          enabled: false,
          keyId: "",
          keySecret: "",
          mode: "test",
        }),
        phonepe: parseJson(settingsRow.phonepe, {
          enabled: false,
          merchantId: "",
          saltKey: "",
          saltIndex: "1",
          mode: "test",
        }),
        flags: {
          sameDayDelivery: !!settingsRow.same_day_delivery,
          aiDesignAssistant: !!settingsRow.ai_design_assistant,
          vendorSelfOnboarding: !!settingsRow.vendor_self_onboarding,
          internationalShipping: !!settingsRow.international_shipping,
        },
      }
    : {
        commissionPercent: 18,
        minimumPayout: 500,
        freeShippingThreshold: 499,
        heroSlides: [],
        adminSlug: "control",
        testimonials: [],
        flags: {
          sameDayDelivery: true,
          aiDesignAssistant: true,
          vendorSelfOnboarding: false,
          internationalShipping: false,
        },
      };

  const coupons = (rawDb
    .prepare(`SELECT * FROM coupons`)
    .all() as AnyObject[]).map((c) => ({
    code: c.code,
    type: c.type,
    description: c.description,
    minOrder: c.min_order,
    used: c.used,
    limit: c.limit,
    status: c.status,
    createdAt: c.created_at,
  }));

  const payouts = (rawDb
    .prepare("SELECT * FROM payouts")
    .all() as AnyObject[]).map((p) => ({
    id: p.id,
    vendorId: p.vendor_id,
    vendorName: p.vendor_name,
    amount: p.amount,
    requestedAt: p.requested_at,
    status: p.status,
  }));

  const complaintRows = rawDb
    .prepare("SELECT * FROM complaints")
    .all() as AnyObject[];
  const responseRows = rawDb
    .prepare("SELECT * FROM complaint_responses ORDER BY id")
    .all() as AnyObject[];
  const evidenceRows = rawDb
    .prepare("SELECT * FROM complaint_evidence")
    .all() as AnyObject[];
  const complaints = complaintRows.map((c) => ({
    id: c.id,
    orderId: c.order_id,
    customerName: c.customer_name,
    vendorId: c.vendor_id,
    vendorName: c.vendor_name,
    issue: c.issue,
    detail: c.detail ?? undefined,
    penalty: c.penalty,
    status: c.status,
    createdAt: c.created_at,
    responses: responseRows
      .filter((r) => r.complaint_id === c.id)
      .map((r) => ({ author: r.author, message: r.message, at: r.at })),
    evidence: evidenceRows
      .filter((e) => e.complaint_id === c.id)
      .map((e) => ({
        id: e.id,
        name: e.name,
        size: e.size,
        type: e.type,
        uploadedBy: e.uploaded_by,
        uploadedAt: e.uploaded_at,
      })),
  }));

  const campaigns = (rawDb
    .prepare("SELECT * FROM campaigns")
    .all() as AnyObject[]).map((c) => ({
    id: c.id,
    name: c.name,
    channel: c.channel,
    status: c.status,
    reach: c.reach,
    ctr: c.ctr,
    createdAt: c.created_at,
  }));

  const vendorSettings = (rawDb
    .prepare("SELECT * FROM vendor_settings")
    .all() as AnyObject[]).map((v) => ({
    vendorId: v.vendor_id,
    businessName: v.business_name,
    gstin: v.gstin,
    email: v.email,
    phone: v.phone,
    panIndia: !!v.pan_india,
    pincodes: v.pincodes,
    hours: parseJson(v.hours, []),
    documents: parseJson(v.documents, []),
    compliance: parseJson(v.compliance, {}),
  }));

  const adminTeam = (rawDb
    .prepare("SELECT * FROM admin_team ORDER BY datetime(created_at) DESC")
    .all() as AnyObject[]).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    lastSeen: m.last_seen,
    createdAt: m.created_at,
  }));

  const notifications = (rawDb
    .prepare("SELECT * FROM notifications ORDER BY datetime(created_at) DESC")
    .all() as AnyObject[]).map((n) => ({
    id: n.id,
    scope: n.scope,
    vendorId: n.vendor_id ?? undefined,
    type: n.type,
    title: n.title,
    message: n.message,
    orderId: n.order_id ?? undefined,
    read: !!n.read,
    createdAt: n.created_at,
  }));

  return {
    users,
    newsletter,
    catalogCategories,
    customerOrders,
    vendorOrders,
    pendingVendors,
    vendorProducts,
    settings,
    coupons,
    payouts,
    complaints,
    campaigns,
    vendorSettings,
    adminTeam,
    notifications,
  };
}

// Wipe + re-insert in a single transaction. Simple and correct given the
// modest data size; we don't need per-row diffing.
export function saveStoreToDb(store: AnyObject) {
  ensureBootstrapped();

  const tx = rawDb.transaction(() => {
    rawDb.prepare("DELETE FROM wishlist").run();
    rawDb.prepare("DELETE FROM addresses").run();
    rawDb.prepare("DELETE FROM complaint_responses").run();
    rawDb.prepare("DELETE FROM complaint_evidence").run();
    rawDb.prepare("DELETE FROM complaints").run();
    rawDb.prepare("DELETE FROM customer_order_items").run();
    rawDb.prepare("DELETE FROM customer_orders").run();
    rawDb.prepare("DELETE FROM vendor_orders").run();
    rawDb.prepare("DELETE FROM vendor_products").run();
    rawDb.prepare("DELETE FROM pending_vendors").run();
    rawDb.prepare("DELETE FROM coupons").run();
    rawDb.prepare("DELETE FROM payouts").run();
    rawDb.prepare("DELETE FROM campaigns").run();
    rawDb.prepare("DELETE FROM vendor_settings").run();
    rawDb.prepare("DELETE FROM admin_team").run();
    rawDb.prepare("DELETE FROM notifications").run();
    rawDb.prepare("DELETE FROM newsletter").run();
    rawDb.prepare("DELETE FROM products").run();
    rawDb.prepare("DELETE FROM categories").run();
    rawDb.prepare("DELETE FROM users").run();

    const insertUser = rawDb.prepare(
      `INSERT INTO users (id, name, email, password, role, gstin, phone, vendor_status, city, services, created_at)
       VALUES (@id, @name, @email, @password, @role, @gstin, @phone, @vendor_status, @city, @services, @created_at)`,
    );
    const insertAddress = rawDb.prepare(
      `INSERT INTO addresses (id, user_id, label, full_name, phone, address, city, state, pincode, landmark, is_default)
       VALUES (@id, @user_id, @label, @full_name, @phone, @address, @city, @state, @pincode, @landmark, @is_default)`,
    );
    const insertWishlist = rawDb.prepare(
      `INSERT OR IGNORE INTO wishlist (user_id, product_slug, added_at) VALUES (@user_id, @product_slug, @added_at)`,
    );
    for (const u of store.users ?? []) {
      insertUser.run({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        gstin: u.gstin ?? null,
        phone: u.phone ?? null,
        vendor_status: u.vendorStatus ?? null,
        city: u.city ?? null,
        services: u.services ?? null,
        created_at: u.createdAt ?? isoNow(),
      });
      for (const addr of u.addresses ?? []) {
        insertAddress.run({
          id: addr.id,
          user_id: u.id,
          label: addr.label,
          full_name: addr.fullName,
          phone: addr.phone,
          address: addr.address,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          landmark: addr.landmark ?? null,
          is_default: addr.isDefault ? 1 : 0,
        });
      }
      for (const slug of u.wishlist ?? []) {
        insertWishlist.run({
          user_id: u.id,
          product_slug: slug,
          added_at: isoNow(),
        });
      }
    }

    const insertNewsletter = rawDb.prepare(
      `INSERT OR IGNORE INTO newsletter (email, created_at) VALUES (@email, @created_at)`,
    );
    for (const email of store.newsletter ?? []) {
      insertNewsletter.run({ email, created_at: isoNow() });
    }

    const insertCategory = rawDb.prepare(
      `INSERT INTO categories (slug, name, tagline, image, position)
       VALUES (@slug, @name, @tagline, @image, @position)`,
    );
    const insertProduct = rawDb.prepare(
      `INSERT INTO products (id, slug, name, category, base_price, sku, rating, reviews, image, images, video_urls, badge, description, quantity_options, sizes, finishes, turnarounds, artwork_required, artwork_hint, swatches, variations, accepts_document_upload, print_page_rates, print_addons, accepts_photo_upload, photo_pricing_tiers, photo_background_colors, position)
       VALUES (@id, @slug, @name, @category, @base_price, @sku, @rating, @reviews, @image, @images, @video_urls, @badge, @description, @quantity_options, @sizes, @finishes, @turnarounds, @artwork_required, @artwork_hint, @swatches, @variations, @accepts_document_upload, @print_page_rates, @print_addons, @accepts_photo_upload, @photo_pricing_tiers, @photo_background_colors, @position)`,
    );
    const categoryList = (store.catalogCategories ?? []) as AnyObject[];
    for (let i = 0; i < categoryList.length; i++) {
      const cat = categoryList[i];
      insertCategory.run({
        slug: cat.slug,
        name: cat.name,
        tagline: cat.tagline,
        image: cat.image,
        position: i,
      });
      for (let j = 0; j < (cat.products ?? []).length; j++) {
        const p = cat.products[j];
        insertProduct.run({
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: cat.slug,
          base_price: p.basePrice,
          sku: p.sku,
          rating: p.rating ?? 4.5,
          reviews: p.reviews ?? 0,
          image: p.image,
          images: safeJson(p.images ?? []),
          video_urls: safeJson(p.videoUrls ?? []),
          badge: p.badge ?? null,
          description: p.description,
          quantity_options: safeJson(p.quantityOptions ?? []),
          sizes: safeJson(p.sizes ?? []),
          finishes: safeJson(p.finishes ?? []),
          turnarounds: safeJson(p.turnarounds ?? []),
          artwork_required: p.artworkRequired ? 1 : 0,
          artwork_hint: p.artworkHint ?? "",
          swatches: safeJson(p.swatches ?? []),
          variations: safeJson(p.variations ?? []),
          accepts_document_upload: p.acceptsDocumentUpload ? 1 : 0,
          print_page_rates: safeJson(p.printPageRates ?? []),
          print_addons: safeJson(p.printAddons ?? []),
          accepts_photo_upload: p.acceptsPhotoUpload ? 1 : 0,
          photo_pricing_tiers: safeJson(p.photoPricingTiers ?? []),
          photo_background_colors: safeJson(p.photoBackgroundColors ?? []),
          position: j,
        });
      }
    }

    const insertOrder = rawDb.prepare(
      `INSERT INTO customer_orders (id, user_id, customer_name, customer_email, shipping, subtotal, discount, coupon_code, gst, total, payment, refund, status, created_at)
       VALUES (@id, @user_id, @customer_name, @customer_email, @shipping, @subtotal, @discount, @coupon_code, @gst, @total, @payment, @refund, @status, @created_at)`,
    );
    const insertOrderItem = rawDb.prepare(
      `INSERT INTO customer_order_items (id, order_id, product_json, quantity, size, finish, turnaround, artwork, customization)
       VALUES (@id, @order_id, @product_json, @quantity, @size, @finish, @turnaround, @artwork, @customization)`,
    );
    for (const o of store.customerOrders ?? []) {
      insertOrder.run({
        id: o.id,
        user_id: o.userId ?? null,
        customer_name: o.customerName,
        customer_email: o.customerEmail,
        shipping: o.shipping ? safeJson(o.shipping) : null,
        subtotal: o.subtotal,
        discount: o.discount ?? 0,
        coupon_code: o.couponCode ?? null,
        gst: o.gst,
        total: o.total,
        payment: o.payment ? safeJson(o.payment) : null,
        refund: o.refund ? safeJson(o.refund) : null,
        status: o.status,
        created_at: o.createdAt ?? isoNow(),
      });
      for (const item of o.items ?? []) {
        insertOrderItem.run({
          id: item.id,
          order_id: o.id,
          product_json: safeJson(item.product),
          quantity: item.quantity,
          size: item.size,
          finish: item.finish ?? "",
          turnaround: safeJson(item.turnaround),
          artwork: item.artwork ? safeJson(item.artwork) : null,
          customization: item.customization ? safeJson(item.customization) : null,
        });
      }
    }

    const insertVendorOrder = rawDb.prepare(
      `INSERT INTO vendor_orders (id, customer_order_id, customer, vendor_id, product, amount, status, deadline, date, tracking_number, status_history)
       VALUES (@id, @customer_order_id, @customer, @vendor_id, @product, @amount, @status, @deadline, @date, @tracking_number, @status_history)`,
    );
    for (const vo of store.vendorOrders ?? []) {
      insertVendorOrder.run({
        id: vo.id,
        customer_order_id: vo.customerOrderId ?? null,
        customer: vo.customer,
        vendor_id: vo.vendorId ?? null,
        product: vo.product,
        amount: vo.amount,
        status: vo.status,
        deadline: vo.deadline,
        date: vo.date,
        tracking_number: vo.trackingNumber ?? null,
        status_history: safeJson(vo.statusHistory ?? []),
      });
    }

    const insertVendorProduct = rawDb.prepare(
      `INSERT INTO vendor_products (slug, active, daily_cap, turnaround_days) VALUES (@slug, @active, @daily_cap, @turnaround_days)`,
    );
    for (const vp of store.vendorProducts ?? []) {
      insertVendorProduct.run({
        slug: vp.slug,
        active: vp.active ? 1 : 0,
        daily_cap: vp.dailyCap,
        turnaround_days: vp.turnaroundDays,
      });
    }

    const insertPendingVendor = rawDb.prepare(
      `INSERT INTO pending_vendors (id, name, city, services, applied_on) VALUES (@id, @name, @city, @services, @applied_on)`,
    );
    for (const pv of store.pendingVendors ?? []) {
      insertPendingVendor.run({
        id: pv.id,
        name: pv.name,
        city: pv.city,
        services: pv.services,
        applied_on: pv.appliedOn,
      });
    }

    const s = store.settings ?? {};
    const flags = s.flags ?? {};
    rawDb
      .prepare(
        `INSERT INTO platform_settings (id, commission_percent, minimum_payout, free_shipping_threshold, same_day_delivery, ai_design_assistant, vendor_self_onboarding, international_shipping, logo_url, hero_slides, admin_slug, testimonials, razorpay, phonepe)
         VALUES (1, @cp, @mp, @ft, @sd, @ai, @vs, @is, @logo, @hero, @adminSlug, @testimonials, @razorpay, @phonepe)
         ON CONFLICT(id) DO UPDATE SET commission_percent=excluded.commission_percent,
           minimum_payout=excluded.minimum_payout,
           free_shipping_threshold=excluded.free_shipping_threshold,
           same_day_delivery=excluded.same_day_delivery,
           ai_design_assistant=excluded.ai_design_assistant,
           vendor_self_onboarding=excluded.vendor_self_onboarding,
           international_shipping=excluded.international_shipping,
           logo_url=excluded.logo_url,
           hero_slides=excluded.hero_slides,
           admin_slug=excluded.admin_slug,
           testimonials=excluded.testimonials,
           razorpay=excluded.razorpay,
           phonepe=excluded.phonepe`,
      )
      .run({
        cp: s.commissionPercent ?? 18,
        mp: s.minimumPayout ?? 500,
        ft: s.freeShippingThreshold ?? 499,
        sd: flags.sameDayDelivery ? 1 : 0,
        ai: flags.aiDesignAssistant ? 1 : 0,
        vs: flags.vendorSelfOnboarding ? 1 : 0,
        is: flags.internationalShipping ? 1 : 0,
        logo: s.logoUrl ?? null,
        hero: safeJson(s.heroSlides ?? []),
        adminSlug: s.adminSlug ?? "control",
        testimonials: safeJson(s.testimonials ?? []),
        razorpay: s.razorpay ? safeJson(s.razorpay) : null,
        phonepe: s.phonepe ? safeJson(s.phonepe) : null,
      });

    const insertCoupon = rawDb.prepare(
      `INSERT INTO coupons (code, type, description, min_order, used, "limit", status, created_at)
       VALUES (@code, @type, @description, @min_order, @used, @limit, @status, @created_at)`,
    );
    for (const c of store.coupons ?? []) {
      insertCoupon.run({
        code: c.code,
        type: c.type,
        description: c.description,
        min_order: c.minOrder,
        used: c.used,
        limit: c.limit,
        status: c.status,
        created_at: c.createdAt ?? isoNow(),
      });
    }

    const insertPayout = rawDb.prepare(
      `INSERT INTO payouts (id, vendor_id, vendor_name, amount, requested_at, status) VALUES (@id, @vendor_id, @vendor_name, @amount, @requested_at, @status)`,
    );
    for (const p of store.payouts ?? []) {
      insertPayout.run({
        id: p.id,
        vendor_id: p.vendorId,
        vendor_name: p.vendorName,
        amount: p.amount,
        requested_at: p.requestedAt,
        status: p.status,
      });
    }

    const insertComplaint = rawDb.prepare(
      `INSERT INTO complaints (id, order_id, customer_name, vendor_id, vendor_name, issue, detail, penalty, status, created_at)
       VALUES (@id, @order_id, @customer_name, @vendor_id, @vendor_name, @issue, @detail, @penalty, @status, @created_at)`,
    );
    const insertResponse = rawDb.prepare(
      `INSERT INTO complaint_responses (complaint_id, author, message, at) VALUES (@complaint_id, @author, @message, @at)`,
    );
    const insertEvidence = rawDb.prepare(
      `INSERT INTO complaint_evidence (id, complaint_id, name, size, type, uploaded_by, uploaded_at)
       VALUES (@id, @complaint_id, @name, @size, @type, @uploaded_by, @uploaded_at)`,
    );
    for (const c of store.complaints ?? []) {
      insertComplaint.run({
        id: c.id,
        order_id: c.orderId,
        customer_name: c.customerName,
        vendor_id: c.vendorId,
        vendor_name: c.vendorName,
        issue: c.issue,
        detail: c.detail ?? null,
        penalty: c.penalty,
        status: c.status,
        created_at: c.createdAt ?? isoNow(),
      });
      for (const r of c.responses ?? []) {
        insertResponse.run({
          complaint_id: c.id,
          author: r.author,
          message: r.message,
          at: r.at ?? isoNow(),
        });
      }
      for (const ev of c.evidence ?? []) {
        insertEvidence.run({
          id: ev.id,
          complaint_id: c.id,
          name: ev.name,
          size: ev.size,
          type: ev.type,
          uploaded_by: ev.uploadedBy,
          uploaded_at: ev.uploadedAt ?? isoNow(),
        });
      }
    }

    const insertCampaign = rawDb.prepare(
      `INSERT INTO campaigns (id, name, channel, status, reach, ctr, created_at) VALUES (@id, @name, @channel, @status, @reach, @ctr, @created_at)`,
    );
    for (const c of store.campaigns ?? []) {
      insertCampaign.run({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        reach: c.reach,
        ctr: c.ctr,
        created_at: c.createdAt ?? isoNow(),
      });
    }

    const insertVendorSettings = rawDb.prepare(
      `INSERT INTO vendor_settings (vendor_id, business_name, gstin, email, phone, pan_india, pincodes, hours, documents, compliance)
       VALUES (@vendor_id, @business_name, @gstin, @email, @phone, @pan_india, @pincodes, @hours, @documents, @compliance)`,
    );
    for (const vs of store.vendorSettings ?? []) {
      insertVendorSettings.run({
        vendor_id: vs.vendorId,
        business_name: vs.businessName,
        gstin: vs.gstin ?? "",
        email: vs.email,
        phone: vs.phone ?? "",
        pan_india: vs.panIndia ? 1 : 0,
        pincodes: vs.pincodes ?? "",
        hours: safeJson(vs.hours ?? []),
        documents: safeJson(vs.documents ?? []),
        compliance: safeJson(vs.compliance ?? {}),
      });
    }

    const insertTeam = rawDb.prepare(
      `INSERT INTO admin_team (id, name, email, role, last_seen, created_at) VALUES (@id, @name, @email, @role, @last_seen, @created_at)`,
    );
    for (const m of store.adminTeam ?? []) {
      insertTeam.run({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        last_seen: m.lastSeen ?? "Just now",
        created_at: m.createdAt ?? isoNow(),
      });
    }

    const insertNotification = rawDb.prepare(
      `INSERT INTO notifications (id, scope, vendor_id, type, title, message, order_id, read, created_at)
       VALUES (@id, @scope, @vendor_id, @type, @title, @message, @order_id, @read, @created_at)`,
    );
    // Keep only the most recent 500 to bound growth.
    for (const n of (store.notifications ?? []).slice(0, 500)) {
      insertNotification.run({
        id: n.id,
        scope: n.scope,
        vendor_id: n.vendorId ?? null,
        type: n.type,
        title: n.title,
        message: n.message,
        order_id: n.orderId ?? null,
        read: n.read ? 1 : 0,
        created_at: n.createdAt ?? isoNow(),
      });
    }
  });
  tx();
}

// --- Row → object helpers -------------------------------------------------

function rowToUser(r: AnyObject) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    password: r.password,
    role: r.role,
    gstin: r.gstin ?? undefined,
    phone: r.phone ?? undefined,
    vendorStatus: r.vendor_status ?? undefined,
    city: r.city ?? undefined,
    services: r.services ?? undefined,
    createdAt: r.created_at,
    addresses: [] as AnyObject[],
    wishlist: [] as string[],
  };
}

function rowToAddress(r: AnyObject) {
  return {
    id: r.id,
    label: r.label,
    fullName: r.full_name,
    phone: r.phone,
    address: r.address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    landmark: r.landmark ?? undefined,
    isDefault: !!r.is_default,
  };
}

function rowToCategory(r: AnyObject) {
  return {
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    image: r.image,
    productCount: 0,
    products: [] as AnyObject[],
  };
}

function rowToProduct(r: AnyObject) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    basePrice: r.base_price,
    sku: r.sku,
    rating: r.rating,
    reviews: r.reviews,
    image: r.image,
    images: parseJson<string[]>(r.images, []),
    videoUrls: parseJson<string[]>(r.video_urls, []),
    badge: r.badge ?? "",
    description: r.description,
    quantityOptions: parseJson<number[]>(r.quantity_options, []),
    sizes: parseJson<string[]>(r.sizes, []),
    finishes: parseJson<string[]>(r.finishes, []),
    turnarounds: parseJson<any[]>(r.turnarounds, []),
    artworkRequired: !!r.artwork_required,
    artworkHint: r.artwork_hint,
    swatches: parseJson<any[]>(r.swatches, []),
    variations: parseJson<any[]>(r.variations, []),
    acceptsDocumentUpload: !!r.accepts_document_upload,
    printPageRates: parseJson<any[]>(r.print_page_rates, []),
    printAddons: parseJson<any[]>(r.print_addons, []),
    acceptsPhotoUpload: !!r.accepts_photo_upload,
    photoPricingTiers: parseJson<any[]>(r.photo_pricing_tiers, []),
    photoBackgroundColors: parseJson<any[]>(r.photo_background_colors, []),
  };
}

function rowToVendorOrder(r: AnyObject) {
  return {
    id: r.id,
    customerOrderId: r.customer_order_id ?? undefined,
    customer: r.customer,
    vendorId: r.vendor_id ?? undefined,
    product: r.product,
    amount: r.amount,
    status: r.status,
    deadline: r.deadline,
    date: r.date,
    trackingNumber: r.tracking_number ?? undefined,
    statusHistory: parseJson<any[]>(r.status_history, []),
  };
}
