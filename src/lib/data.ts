// Type definitions and category skeletons for the storefront.
// All product/order/vendor data now lives in the SQLite database — this file
// only declares the 8 starter category names so that consumers (homepage,
// navigation) have something to render before any product is created.

export type Category = {
  slug: string;
  name: string;
  tagline: string;
  image: string;
  productCount: number;
  products: Product[];
};

export type PrintColorMode = "bw" | "color";
export type PrintSides = "single" | "duplex";

export type PrintRate = {
  colorMode: PrintColorMode;
  paperSize: string; // e.g. "A4" | "A3" | "Legal" | "Letter"
  sides: PrintSides;
  pricePerPage: number;
};

export type PrintAddon = {
  name: string; // e.g. "Spiral binding" | "Hard binding" | "Lamination"
  price: number; // flat fee per order
};

export type PhotoPricingTier = {
  count: number; // number of photos in the tier, e.g. 8
  price: number; // total price for the tier, e.g. 50
};

export type PhotoBackgroundColor = {
  name: string; // display label, e.g. "White"
  hex: string;  // CSS color, e.g. "#ffffff"
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  basePrice: number;
  sku: string;
  rating: number;
  reviews: number;
  image: string;
  images: string[];
  videoUrls?: string[];
  badge?: string;
  description: string;
  quantityOptions: number[];
  sizes: string[];
  finishes: string[];
  turnarounds: { label: string; days: number; multiplier: number }[];
  artworkRequired: boolean;
  artworkHint: string;
  swatches: { name: string; hex: string }[];
  variations: { name: string; sku: string; price: number; image?: string; active?: boolean }[];
  // Print-quote engine. When `acceptsDocumentUpload` is true the storefront
  // renders a PDF picker + rate selector + addon checkboxes and computes the
  // price as `pages * matched rate + sum(addons)`.
  acceptsDocumentUpload?: boolean;
  printPageRates?: PrintRate[];
  printAddons?: PrintAddon[];
  // Passport-photo widget. When `acceptsPhotoUpload` is true the storefront
  // shows an image picker → background removal → color-swatch picker → tier
  // (e.g. "8 photos / ₹50", "32 photos / ₹100").
  acceptsPhotoUpload?: boolean;
  photoPricingTiers?: PhotoPricingTier[];
  photoBackgroundColors?: PhotoBackgroundColor[];
};

const u = (q: string, w = 800, h = 600) =>
  `https://images.unsplash.com/${q}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

// The 8 starter categories. Products are created via the Super Admin
// "Content & Catalog" page once the app is running.
export const categories: Category[] = [
  {
    slug: "business-essentials",
    name: "Business Essentials",
    tagline: "Cards, letterheads, envelopes & stamps",
    image: "/business-card.png",
    productCount: 0,
    products: [],
  },
  {
    slug: "marketing-materials",
    name: "Marketing Materials",
    tagline: "Flyers, brochures, posters & banners",
    image: u("photo-1611532736597-de2d4265fba3"),
    productCount: 0,
    products: [],
  },
  {
    slug: "clothing-apparel",
    name: "Clothing & Apparel",
    tagline: "T-shirts, polos, workwear & caps",
    image: u("photo-1521572163474-6864f9cf17ab"),
    productCount: 0,
    products: [],
  },
  {
    slug: "signage-display",
    name: "Signage & Display",
    tagline: "Foam boards, standees & decals",
    image: u("photo-1521791136064-7986c2920216"),
    productCount: 0,
    products: [],
  },
  {
    slug: "promotional-gifts",
    name: "Promotional Gifts",
    tagline: "Mugs, bags, pens & calendars",
    image: u("photo-1577563908411-5077b6dc7624"),
    productCount: 0,
    products: [],
  },
  {
    slug: "photo-personal",
    name: "Photo & Personal",
    tagline: "Photo prints, canvas & framed posters",
    image: u("photo-1452587925148-ce544e77e70d"),
    productCount: 0,
    products: [],
  },
  {
    slug: "office-supplies",
    name: "Office Supplies",
    tagline: "ID cards & corporate stationery",
    image: u("photo-1497366811353-6870744d04b2"),
    productCount: 0,
    products: [],
  },
  {
    slug: "seasonal-events",
    name: "Seasonal & Events",
    tagline: "Wedding, birthday & festival prints",
    image: u("photo-1519225421980-715cb0215aed"),
    productCount: 0,
    products: [],
  },
];

// Storefront helpers. Now that the catalog lives in the DB, these are only
// used as type-safe lookups during SSR rendering of routes that read from
// fetched server data. They intentionally return empty / undefined when called
// against the static skeleton — real lookups go through getProductFn /
// getCategoryFn in lib/backend.ts.
export const allProducts: Product[] = [];

export const getCategory = (slug: string) =>
  categories.find((c) => c.slug === slug);

export const getProduct = (_slug: string): Product | undefined => undefined;

export const trendingProducts: Product[] = [];

// Marketing-only content on the homepage. Kept as an empty array so the
// "Loved by businesses" section degrades gracefully — add real testimonials
// via a future CMS or remove the section from the page.
export const testimonials: { name: string; role: string; quote: string; avatar: string }[] = [];

// Chart skeletons used by the dashboards. Values default to 0 — the backend
// overlays real counts onto these labels when there is data.
export const weeklyRevenue = [
  { day: "Mon", revenue: 0 },
  { day: "Tue", revenue: 0 },
  { day: "Wed", revenue: 0 },
  { day: "Thu", revenue: 0 },
  { day: "Fri", revenue: 0 },
  { day: "Sat", revenue: 0 },
  { day: "Sun", revenue: 0 },
];

export const orderStatusBreakdown = [
  { name: "New", value: 0, color: "var(--color-chart-1)" },
  { name: "In Production", value: 0, color: "var(--color-chart-2)" },
  { name: "Dispatched", value: 0, color: "var(--color-chart-3)" },
  { name: "Completed", value: 0, color: "var(--color-chart-4)" },
];

// Empty seeds for shapes the backend still imports as fall-back arrays.
export const vendorOrders: { id: string; customer: string; product: string; amount: number; status: string; deadline: string; date: string }[] = [];
export const pendingVendors: { id: string; name: string; city: string; services: string; appliedOn: string }[] = [];
