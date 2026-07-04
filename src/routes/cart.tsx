import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, Minus, Plus, Tag, X, Loader2 } from "lucide-react";
import { StorefrontLayout } from "@/components/storefront-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculateItemSubtotal, useCart } from "@/lib/cart";
import { validateCouponFn } from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your Cart — PRINTZAPP" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotal, discount, coupon, total, updateQuantity, removeItem, applyCoupon, removeCoupon } = useCart();
  const [code, setCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const handleApplyCoupon = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const result = await validateCouponFn({ data: { code: trimmed, subtotal } });
      if (result.valid) {
        applyCoupon({ code: result.code, discount: result.discount });
        setCode("");
      } else {
        setCouponError(result.reason);
      }
    } catch (err) {
      setCouponError(getFriendlyError(err, "Could not apply coupon."));
    } finally {
      setCouponBusy(false);
    }
  };

  if (items.length === 0) {
    return (
      <StorefrontLayout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="text-3xl font-bold">Your cart is empty</h1>
          <p className="mt-3 text-muted-foreground">Browse a category and add a product to start a print order.</p>
          <Link to="/" className="mt-6 inline-block"><Button size="lg">Continue shopping</Button></Link>
        </div>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold">Your Cart</h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {items.map((i) => (
              <Card key={i.id} className="flex gap-4 p-4">
                <img src={i.artwork?.dataUrl || i.product.image} alt={i.product.name} className="h-24 w-24 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-semibold">{i.product.name}</h3>
                      <p className="text-xs text-muted-foreground">{i.finish || "Finish not applicable"} • {i.size} • {i.turnaround.label}</p>
                      {i.customization?.printSides && <p className="mt-1 text-xs text-muted-foreground">Sides: {i.customization.printSides}</p>}
                      {i.customization?.dimensions && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Dimensions: {i.customization.dimensions.width} × {i.customization.dimensions.height} {i.customization.dimensions.unit}
                        </p>
                      )}
                      {i.customization?.notes && <p className="mt-1 text-xs text-muted-foreground">Notes: {i.customization.notes}</p>}
                      {i.artwork && <p className="mt-1 text-xs text-muted-foreground">Artwork: {i.artwork.name}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(i.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(i.id, i.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={i.quantity}
                        onChange={(e) => updateQuantity(i.id, Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 w-16 rounded-md border bg-background px-2 text-center text-sm font-semibold"
                      />
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(i.id, i.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <div className="font-bold">₹{calculateItemSubtotal(i).toLocaleString()}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card className="h-fit p-6">
            <h3 className="font-semibold">Order Summary</h3>

            {/* Coupon */}
            <div className="mt-4">
              {coupon ? (
                <div className="flex items-center justify-between rounded-lg border border-success/40 bg-success/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4 text-success" />
                    <span className="font-mono font-semibold text-success">{coupon.code}</span>
                    <span className="text-muted-foreground">applied</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { removeCoupon(); setCouponError(null); }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove coupon"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleApplyCoupon(); }}
                    placeholder="Coupon code"
                    className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm uppercase"
                  />
                  <Button variant="outline" onClick={handleApplyCoupon} disabled={couponBusy || !code.trim()}>
                    {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
              )}
              {couponError && <p className="mt-2 text-xs text-destructive">{couponError}</p>}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{Math.round(subtotal).toLocaleString()}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-success"><span>Discount{coupon ? ` (${coupon.code})` : ""}</span><span>−₹{discount.toLocaleString()}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="text-success">FREE</span></div>
              <div className="my-2 border-t" />
              <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">₹{total.toLocaleString()}</span></div>
            </div>
            <Link to="/checkout"><Button className="mt-5 w-full" size="lg">Proceed to Checkout</Button></Link>
          </Card>
        </div>
      </div>
    </StorefrontLayout>
  );
}
