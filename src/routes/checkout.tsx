import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin, CreditCard, PartyPopper, Loader2 } from "lucide-react";
import { StorefrontLayout } from "@/components/storefront-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { getFriendlyError } from "@/lib/errors";
import {
  checkPincodeFn,
  createOrderFn,
  createRazorpayOrderFn,
  getCurrentUserFn,
  getMyAddressesFn,
  getPaymentConfigFn,
  startPhonePePaymentFn,
  verifyPhonePePaymentFn,
  verifyRazorpayPaymentFn,
} from "@/lib/backend";

// Razorpay's checkout widget is loaded on demand from their CDN.
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

type PincodeStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "covered"; vendors: { id: string; name: string; city: string }[] }
  | { state: "uncovered" }
  | { state: "error"; message: string };

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — PRINTZAPP" }] }),
  // Checkout requires a signed-in account. Send guests to login and bring them
  // back here afterwards.
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: "/checkout" } as any });
    }
  },
  loader: async () => {
    const [addresses, user, payment] = await Promise.all([
      getMyAddressesFn(),
      getCurrentUserFn(),
      getPaymentConfigFn(),
    ]);
    return { addresses, userEmail: user?.email ?? "", payment };
  },
  component: CheckoutPage,
});

const steps = [
  { id: 1, name: "Address", icon: MapPin },
  { id: 2, name: "Payment", icon: CreditCard },
  { id: 3, name: "Confirmation", icon: PartyPopper },
];

function CheckoutPage() {
  const { addresses, userEmail, payment } = Route.useLoaderData() as {
    addresses: Awaited<ReturnType<typeof getMyAddressesFn>>;
    userEmail: string;
    payment: Awaited<ReturnType<typeof getPaymentConfigFn>>;
  };
  const defaultAddress =
    addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [selectedAddressId, setSelectedAddressId] = useState<string | "new">(
    defaultAddress?.id ?? "new",
  );
  const [step, setStep] = useState(1);
  const [orderSummary, setOrderSummary] = useState<{ subtotal: number; discount: number; gst: number; total: number; reference: string } | null>(null);
  const [shipping, setShipping] = useState({
    fullName: defaultAddress?.fullName ?? "",
    phone: defaultAddress?.phone ?? "",
    alternatePhone: "",
    email: userEmail,
    pincode: defaultAddress?.pincode ?? "",
    address: defaultAddress?.address ?? "",
    company: "",
    city: defaultAddress?.city ?? "",
    state: defaultAddress?.state ?? "",
    landmark: defaultAddress?.landmark ?? "",
    gstin: "",
  });
  const [checkoutError, setCheckoutError] = useState("");
  const [paying, setPaying] = useState(false);
  const [verifyingPhonePe, setVerifyingPhonePe] = useState(false);
  // Which gateway to charge with. Prefer Razorpay, then PhonePe, then the
  // built-in fallback when nothing is configured.
  const [gateway, setGateway] = useState<"razorpay" | "phonepe" | "mock">(
    payment.razorpayEnabled ? "razorpay" : payment.phonePeEnabled ? "phonepe" : "mock",
  );
  const [pincodeStatus, setPincodeStatus] = useState<PincodeStatus>({
    state: "idle",
  });
  const pincodeCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { items, subtotal, discount, coupon, total, clearCart } = useCart();

  // Single payload shared by both payment paths (mock + Razorpay).
  const buildOrderPayload = () => ({
    items,
    shipping: {
      fullName: shipping.fullName,
      phone: shipping.phone,
      email: shipping.email,
      pincode: shipping.pincode,
      address: shipping.address,
      city: shipping.city,
      state: shipping.state,
      company: shipping.company || undefined,
      landmark: shipping.landmark || undefined,
      gstin: shipping.gstin || undefined,
    },
    couponCode: coupon?.code,
    saveAddress: selectedAddressId === "new",
  });

  const finishOrder = (order: {
    subtotal: number;
    discount?: number;
    gst: number;
    total: number;
    id: string;
  }) => {
    setOrderSummary({
      subtotal: order.subtotal,
      discount: order.discount ?? 0,
      gst: order.gst,
      total: order.total,
      reference: order.id,
    });
    setStep(3);
    clearCart();
  };

  const handlePay = async () => {
    setCheckoutError("");
    setPaying(true);
    const payload = buildOrderPayload();
    try {
      if (gateway === "phonepe") {
        // PhonePe is redirect-based: the server holds the order, we send the
        // customer to PhonePe's hosted page, and verify on return.
        const res = await startPhonePePaymentFn({
          data: { order: payload, origin: window.location.origin },
        });
        window.location.href = res.redirectUrl;
        return; // navigating away
      }

      if (gateway === "razorpay") {
        // 1) Create the Razorpay order on the server (amount computed there).
        const rzp = await createRazorpayOrderFn({ data: payload });
        const ok = await loadRazorpayScript();
        if (!ok || !window.Razorpay) {
          throw new Error("Razorpay checkout could not load. Check that checkout.razorpay.com is reachable and not blocked by the browser.");
        }
        // 2) Open the Razorpay checkout widget.
        const checkout = new window.Razorpay({
          key: rzp.keyId,
          amount: rzp.amount,
          currency: rzp.currency,
          name: "PRINTZAPP",
          description: "Order payment",
          order_id: rzp.orderId,
          prefill: {
            name: rzp.customerName || shipping.fullName,
            email: rzp.customerEmail || shipping.email,
            contact: shipping.phone,
          },
          theme: { color: "#2563eb" },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            // 3) Verify the signature server-side, then place the order.
            try {
              const order = await verifyRazorpayPaymentFn({
                data: {
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  order: payload,
                },
              });
              finishOrder(order);
            } catch (err) {
              setCheckoutError(getFriendlyError(err, "Payment verification failed."));
            } finally {
              setPaying(false);
            }
          },
          modal: {
            ondismiss: () => {
              setPaying(false);
              setCheckoutError("Payment was cancelled.");
            },
          },
        });
        checkout.open();
        // Razorpay flow continues in the handler/ondismiss callbacks.
        return;
      }

      // Fallback: no gateway configured — record the order directly.
      const order = await createOrderFn({ data: payload });
      finishOrder(order);
    } catch (err) {
      setCheckoutError(getFriendlyError(err, "Payment failed. Please try again."));
    } finally {
      // Razorpay keeps `paying` true until the widget resolves; PhonePe
      // navigates away. Only release the spinner for the mock path.
      if (gateway === "mock") setPaying(false);
    }
  };

  // On return from PhonePe (?phonepe=<txnId>): verify the payment and place the
  // order. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txn = params.get("phonepe");
    if (!txn) return;
    setVerifyingPhonePe(true);
    void (async () => {
      try {
        const res = await verifyPhonePePaymentFn({
          data: { merchantTransactionId: txn },
        });
        if (res.success) {
          finishOrder(res.order);
        } else {
          setCheckoutError(res.error || "Payment was not completed.");
          setStep(2);
        }
      } catch (err) {
        setCheckoutError(getFriendlyError(err, "Could not verify payment."));
        setStep(2);
      } finally {
        setVerifyingPhonePe(false);
        window.history.replaceState({}, "", "/checkout");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced serviceability check whenever the pincode field changes.
  useEffect(() => {
    const pin = shipping.pincode.trim();
    if (pincodeCheckTimer.current) clearTimeout(pincodeCheckTimer.current);
    if (!/^\d{6}$/.test(pin)) {
      setPincodeStatus({ state: "idle" });
      return;
    }
    setPincodeStatus({ state: "checking" });
    pincodeCheckTimer.current = setTimeout(async () => {
      try {
        const result = await checkPincodeFn({ data: { pincode: pin } });
        if (result.serviceable) {
          setPincodeStatus({ state: "covered", vendors: result.vendors });
        } else {
          setPincodeStatus({ state: "uncovered" });
        }
      } catch (err) {
        setPincodeStatus({
          state: "error",
          message: getFriendlyError(err, "Could not check pincode."),
        });
      }
    }, 350);
    return () => {
      if (pincodeCheckTimer.current) clearTimeout(pincodeCheckTimer.current);
    };
  }, [shipping.pincode]);

  if (verifyingPhonePe) {
    return (
      <StorefrontLayout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <h1 className="mt-4 text-2xl font-bold">Confirming your payment…</h1>
          <p className="mt-2 text-muted-foreground">
            Please wait while we verify your PhonePe payment. Don't close this window.
          </p>
        </div>
      </StorefrontLayout>
    );
  }

  if (items.length === 0 && step !== 3) {
    return (
      <StorefrontLayout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="text-3xl font-bold">Nothing to checkout</h1>
          <p className="mt-3 text-muted-foreground">Add a product to your cart before continuing.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link to="/"><Button>Shop products</Button></Link>
            <Link to="/cart"><Button variant="outline">View cart</Button></Link>
          </div>
        </div>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* Stepper */}
        <div className="mb-10 flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.id} className="flex flex-1 items-center">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${step >= s.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
                {step > s.id ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <div className="ml-3 hidden sm:block">
                <div className="text-xs text-muted-foreground">Step {s.id}</div>
                <div className={`text-sm font-semibold ${step >= s.id ? "text-foreground" : "text-muted-foreground"}`}>{s.name}</div>
              </div>
              {i < steps.length - 1 && <div className={`mx-3 h-1 flex-1 rounded ${step > s.id ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card className="p-6">
            <h2 className="text-xl font-bold">Shipping address</h2>

            {addresses.length > 0 && (
              <div className="mt-4 space-y-2 rounded-xl border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Saved addresses
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {addresses.map((a) => {
                    const selected = selectedAddressId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setSelectedAddressId(a.id);
                          setShipping((current) => ({
                            ...current,
                            fullName: a.fullName,
                            phone: a.phone,
                            pincode: a.pincode,
                            address: a.address,
                            city: a.city,
                            state: a.state,
                            landmark: a.landmark ?? "",
                          }));
                        }}
                        className={`rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{a.label}</span>
                          {a.isDefault && (
                            <span className="text-[10px] uppercase tracking-wider text-success">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm font-medium">
                          {a.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.city}, {a.state} ·{" "}
                          <span className="font-mono">{a.pincode}</span>
                        </div>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAddressId("new");
                      setShipping({
                        fullName: "",
                        phone: "",
                        alternatePhone: "",
                        email: shipping.email,
                        pincode: "",
                        address: "",
                        company: "",
                        city: "",
                        state: "",
                        landmark: "",
                        gstin: "",
                      });
                    }}
                    className={`rounded-lg border border-dashed p-3 text-center text-sm font-medium transition-colors ${selectedAddressId === "new" ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
                  >
                    + Use a new address
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Full name *</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.fullName}
                  onChange={(e) => setShipping((current) => ({ ...current, fullName: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Company Name (Optional)</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.company}
                  onChange={(e) => setShipping((current) => ({ ...current, company: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Phone *</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.phone}
                  onChange={(e) => setShipping((current) => ({ ...current, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Alternate Phone (Optional)</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.alternatePhone}
                  onChange={(e) => setShipping((current) => ({ ...current, alternatePhone: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email *</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.email}
                  onChange={(e) => setShipping((current) => ({ ...current, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">GSTIN (Optional for B2B billing)</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  value={shipping.gstin}
                  onChange={(e) => setShipping((current) => ({ ...current, gstin: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">Street Address *</label>
                <textarea
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                  rows={2}
                  value={shipping.address}
                  onChange={(e) => setShipping((current) => ({ ...current, address: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Pincode *</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  inputMode="numeric"
                  maxLength={6}
                  value={shipping.pincode}
                  onChange={(e) => setShipping((current) => ({ ...current, pincode: e.target.value.replace(/\D/g, "") }))}
                />
                <div className="mt-1 text-xs">
                  {pincodeStatus.state === "checking" && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking serviceability…
                    </span>
                  )}
                  {pincodeStatus.state === "covered" && (
                    <span className="text-success">
                      ✓ Delivers via {pincodeStatus.vendors[0]?.name}
                      {pincodeStatus.vendors.length > 1
                        ? ` and ${pincodeStatus.vendors.length - 1} other`
                        : ""}
                    </span>
                  )}
                  {pincodeStatus.state === "uncovered" && (
                    <span className="text-destructive">
                      No vendor delivers to this pincode yet.
                    </span>
                  )}
                  {pincodeStatus.state === "error" && (
                    <span className="text-destructive">
                      {pincodeStatus.message}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">City *</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.city}
                  onChange={(e) => setShipping((current) => ({ ...current, city: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">State *</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.state}
                  onChange={(e) => setShipping((current) => ({ ...current, state: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Landmark (Optional)</label>
                <input
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={shipping.landmark}
                  onChange={(e) => setShipping((current) => ({ ...current, landmark: e.target.value }))}
                />
              </div>

            </div>
            {checkoutError && <p className="mt-4 text-sm text-destructive">{checkoutError}</p>}
            <Button
              className="mt-6 w-full md:w-auto"
              disabled={pincodeStatus.state === "checking"}
              onClick={() => {
                if (!shipping.fullName.trim() || !shipping.phone.trim() || !shipping.email.trim() || !shipping.pincode.trim() || !shipping.address.trim() || !shipping.city.trim() || !shipping.state.trim()) {
                  setCheckoutError("Please fill all required shipping details (*) before continuing.");
                  return;
                }
                if (pincodeStatus.state === "uncovered") {
                  setCheckoutError(
                    `Sorry — no vendor delivers to pincode ${shipping.pincode}. Please use a different address.`,
                  );
                  return;
                }
                if (pincodeStatus.state === "checking") return;
                setCheckoutError("");
                setStep(2);
              }}
              size="lg"
            >
              Continue to Payment
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6">
            <h2 className="text-xl font-bold">Payment method</h2>
            {payment.razorpayEnabled || payment.phonePeEnabled ? (
              <div className="mt-5 space-y-3">
                {payment.razorpayEnabled && (
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${gateway === "razorpay" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}>
                    <input type="radio" name="gateway" className="mt-1 text-primary" checked={gateway === "razorpay"} onChange={() => setGateway("razorpay")} />
                    <div className="text-sm">
                      <div className="font-semibold">Razorpay</div>
                      <p className="mt-0.5 text-muted-foreground">UPI, cards, net banking & wallets — paid in a secure Razorpay window.</p>
                    </div>
                  </label>
                )}
                {payment.phonePeEnabled && (
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${gateway === "phonepe" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}>
                    <input type="radio" name="gateway" className="mt-1 text-primary" checked={gateway === "phonepe"} onChange={() => setGateway("phonepe")} />
                    <div className="text-sm">
                      <div className="font-semibold">PhonePe</div>
                      <p className="mt-0.5 text-muted-foreground">UPI, cards & net banking — you'll be redirected to PhonePe's secure page.</p>
                    </div>
                  </label>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {["UPI / GPay / PhonePe", "Credit / Debit Card", "Net Banking", "Razorpay Wallet"].map((m, i) => (
                  <label key={m} className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:border-primary">
                    <input type="radio" name="pay" defaultChecked={i === 0} className="text-primary" />
                    <span className="font-medium">{m}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Order summary */}
            <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{Math.round(subtotal).toLocaleString()}</span></div>
              {discount > 0 && (
                <div className="mt-1 flex justify-between text-success"><span>Discount{coupon ? ` (${coupon.code})` : ""}</span><span>−₹{discount.toLocaleString()}</span></div>
              )}
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="text-success">FREE</span></div>
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span className="text-primary">₹{total.toLocaleString()}</span></div>
            </div>
            {checkoutError && (
              <p className="mt-4 text-sm text-destructive">{checkoutError}</p>
            )}
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} disabled={paying}>Back</Button>
              <Button
                onClick={handlePay}
                disabled={paying}
                size="lg"
                className="flex-1"
              >
                {paying ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                ) : (
                  <>
                    {gateway === "razorpay"
                      ? "Pay with Razorpay"
                      : gateway === "phonepe"
                        ? "Pay with PhonePe"
                        : "Pay"}{" "}
                    ₹{total.toLocaleString()}
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="p-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h2 className="mt-5 text-3xl font-bold">Order placed! 🎉</h2>
            <p className="mt-2 text-muted-foreground">Order #{orderSummary?.reference ?? "PZ-10246"} confirmed. Estimated delivery: 4–5 days.</p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link to="/account"><Button>Track Order</Button></Link>
              <Link to="/"><Button variant="outline">Continue Shopping</Button></Link>
            </div>
            <div className="mt-6 text-sm text-muted-foreground">
              {(orderSummary?.discount ?? 0) > 0 && (
                <>Coupon saved you ₹{orderSummary!.discount.toLocaleString()}. </>
              )}
              Total charged ₹{(orderSummary?.total ?? total).toLocaleString()}.
            </div>
          </Card>
        )}
      </div>
    </StorefrontLayout>
  );
}
