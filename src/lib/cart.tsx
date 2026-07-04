import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product, PrintColorMode, PrintSides } from "@/lib/data";

export type PrintSpec = {
  // Computed on the client from the uploaded PDF + selected options. The
  // total is what gets charged for the line; the breakdown is persisted so
  // vendors can see the parameters of the print job.
  pageCount: number;
  colorMode: PrintColorMode;
  paperSize: string;
  sides: PrintSides;
  pricePerPage: number;
  addons: { name: string; price: number }[];
  addonTotal: number;
  perPageTotal: number;
  total: number;
};

export type PhotoSpec = {
  // Captured for passport-photo line items. The customer uploaded a photo,
  // we removed the background in-browser and composited their selected
  // backdrop color back in. The PNG that the vendor will print is stored
  // as the artwork; this struct is the human-readable description of what
  // they ordered.
  photoCount: number;
  bgColorName: string;
  bgColorHex: string;
  total: number;
};

export type CartArtwork = {
  name: string;
  size: number;
  type: string;
  /** Base64 data URL of the file. Persisted to disk at order creation time
   *  and replaced with `id` server-side; kept in localStorage so reload
   *  doesn't lose the artwork before checkout completes. */
  dataUrl?: string;
};

export type CartCustomization = {
  printSides?: string;
  dimensions?: { width: string; height: string; unit: string } | null;
  notes?: string;
  contactName?: string;
  contactPhone?: string;
  printSpec?: PrintSpec;
  photoSpec?: PhotoSpec;
};

export type CartItem = {
  id: string;
  product: Product;
  quantity: number;
  size: string;
  finish: string;
  turnaround: Product["turnarounds"][number];
  artwork: CartArtwork | null;
  customization?: CartCustomization;
  /** When set, replaces the computed subtotal (used by print-quote items
   *  whose price is driven by document pages × selected rate + add-ons). */
  overrideSubtotal?: number;
};

export type AddCartItemInput = {
  product: Product;
  quantity: number;
  size: string;
  finish: string;
  turnaround: Product["turnarounds"][number];
  artwork: CartArtwork | null;
  customization?: CartCustomization;
  overrideSubtotal?: number;
};

export type AppliedCoupon = { code: string; discount: number };

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  coupon: AppliedCoupon | null;
  gst: number;
  total: number;
  addItem: (item: AddCartItemInput) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  removeCoupon: () => void;
};

const STORAGE_KEY = "printzapp-cart-v1";
const COUPON_KEY = "printzapp-coupon-v1";

const CartContext = createContext<CartContextValue | null>(null);

const getSizeMultiplier = (product: Product, size: string) => {
  // Order snapshots only carry a trimmed product (no `sizes` array), so guard
  // against it being absent — otherwise reorder/cart math throws.
  const index = (product.sizes ?? []).indexOf(size);
  if (index <= 0) return 1;
  if (index === 1) return 1.4;
  return 1.9;
};

const getFinishMultiplier = (finish: string) => {
  if (finish === "Matte") return 1;
  if (finish === "Glossy") return 1.1;
  return 1.25;
};

export const calculateItemSubtotal = (
  item: Pick<CartItem, "product" | "quantity" | "size" | "finish" | "turnaround"> & {
    overrideSubtotal?: number;
  },
) => {
  if (typeof item.overrideSubtotal === "number" && Number.isFinite(item.overrideSubtotal)) {
    return Math.round(item.overrideSubtotal);
  }
  const subtotal =
    item.product.basePrice *
    (item.quantity / 50) *
    getSizeMultiplier(item.product, item.size) *
    getFinishMultiplier(item.finish) *
    item.turnaround.multiplier;

  return Math.round(subtotal);
};

const makeItemId = (item: AddCartItemInput) =>
  [
    item.product.slug,
    item.size,
    item.finish,
    item.turnaround.label,
    item.artwork?.name ?? "no-artwork",
    item.customization?.printSides ?? "default-side",
    item.customization?.dimensions?.width ?? "default-width",
    item.customization?.dimensions?.height ?? "default-height",
  ].join("|");

const loadCart = () => {
  if (typeof window === "undefined") return [] as CartItem[];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as CartItem[];
    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.product && item?.turnaround) : [];
  } catch {
    return [] as CartItem[];
  }
};

const loadCoupon = (): AppliedCoupon | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COUPON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppliedCoupon;
    return parsed?.code ? parsed : null;
  } catch {
    return null;
  }
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setCoupon(loadCoupon());
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      if (coupon) window.localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
      else window.localStorage.removeItem(COUPON_KEY);
    } catch {
      /* ignore */
    }
  }, [coupon, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    // Large artwork data URLs can blow past localStorage's ~5 MB quota.
    // Try once with the full payload; on QuotaExceededError, retry with
    // the artwork dataUrls stripped (file metadata is still preserved so
    // the UI can show what was uploaded — only the binary is lost).
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      try {
        const compact = items.map((item) =>
          item.artwork?.dataUrl
            ? { ...item, artwork: { ...item.artwork, dataUrl: undefined } }
            : item,
        );
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      } catch {
        /* give up gracefully */
      }
    }
  }, [items, isMounted]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
    // Coupon discount is clamped to the current subtotal (a discount can never
    // exceed the order value). GST is charged on the post-discount amount so
    // the cart matches the authoritative total computed in createOrderFn.
    const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
    const discountedSubtotal = Math.max(0, subtotal - discount);
    // GST is no longer charged to customers; the total is the discounted
    // subtotal. `gst` stays in the value as 0 for back-compat with consumers.
    const gst = 0;
    const total = discountedSubtotal;

    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      discount,
      coupon: discount > 0 ? coupon : null,
      gst,
      total,
      applyCoupon: (next) => setCoupon(next),
      removeCoupon: () => setCoupon(null),
      addItem: (incoming) => {
        const id = makeItemId(incoming);
        setItems((current) => {
          const existingIndex = current.findIndex((item) => item.id === id);
          const nextItem: CartItem = { ...incoming, id };

          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = nextItem;
            return next;
          }

          return [nextItem, ...current];
        });
      },
      updateQuantity: (id, quantity) => {
        setItems((current) =>
          current
            .map((item) => (item.id === id ? { ...item, quantity } : item))
            .filter((item) => item.quantity > 0),
        );
      },
      removeItem: (id) => {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      clearCart: () => {
        setItems([]);
        setCoupon(null);
      },
    };
  }, [items, coupon]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
