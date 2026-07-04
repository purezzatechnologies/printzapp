import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  PackageOpen,
  Phone,
  RotateCcw,
  RotateCw,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelMyOrderFn,
  getMyOrderArtworkFn,
  getMyOrderFn,
  raiseComplaintFn,
  replyToMyComplaintFn,
  reorderFn,
} from "@/lib/backend";
import { useCart } from "@/lib/cart";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/account/orders/$id")({
  loader: async ({ params }) => await getMyOrderFn({ data: { id: params.id } }),
  component: OrderDetail,
});

type Loaded = Awaited<ReturnType<typeof getMyOrderFn>>;
type Step = Loaded["timeline"][number];

const customerStatusBadge: Record<string, { label: string; cls: string; icon: typeof Package }> = {
  confirmed: { label: "Confirmed", cls: "bg-primary/10 text-primary", icon: CheckCircle2 },
  processing: { label: "In Production", cls: "bg-warning/15 text-warning", icon: PackageOpen },
  dispatched: { label: "Dispatched", cls: "bg-indigo-100 text-indigo-700", icon: Truck },
  delivered: { label: "Delivered", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", cls: "bg-destructive/15 text-destructive", icon: XCircle },
};

function OrderDetail() {
  const data = Route.useLoaderData() as Loaded;
  const router = useRouter();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Complaint dialog state
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintIssue, setComplaintIssue] = useState("");
  const [complaintDetail, setComplaintDetail] = useState("");
  const [complaintBusy, setComplaintBusy] = useState(false);
  const [complaintErr, setComplaintErr] = useState<string | null>(null);

  // Complaint reply (follow-up) state
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const complaint = data.complaint;

  // Refund is decided/issued by the vendor or platform — the customer only sees
  // the resulting status (read-only) here.
  const refund = data.order.refund;

  // Ordered-artwork previews, keyed by artwork id (fetched on mount).
  const [artworkPreviews, setArtworkPreviews] = useState<Record<string, string>>({});

  const badge = customerStatusBadge[data.order.status] ?? customerStatusBadge.confirmed;
  const Icon = badge.icon;
  const canCancel = !["dispatched", "delivered", "cancelled"].includes(data.order.status);

  // Fetch the actual artwork the customer ordered so we can preview it.
  useEffect(() => {
    const ids = data.order.items
      .map((i) => i.artwork?.id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (artworkId) => {
          try {
            const file = await getMyOrderArtworkFn({
              data: { orderId: data.order.id, artworkId },
            });
            return [artworkId, file.dataUrl] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setArtworkPreviews(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.order.id]);

  const handleReorder = async () => {
    setActionErr(null);
    setActionMsg(null);
    setReordering(true);
    try {
      const result = await reorderFn({ data: { id: data.order.id } });
      if (!result.success || !result.items) {
        setActionErr(result.error ?? "Could not reorder.");
        return;
      }
      for (const item of result.items) {
        addItem({
          product: item.product as any,
          quantity: item.quantity,
          size: item.size,
          finish: item.finish,
          turnaround: item.turnaround,
          artwork: item.artwork
            ? {
                name: item.artwork.name,
                size: item.artwork.size,
                type: item.artwork.type,
              }
            : null,
          customization: item.customization,
        });
      }
      // Take them straight to the cart so the reorder is visible/actionable.
      navigate({ to: "/cart" });
    } catch (err) {
      setActionErr(getFriendlyError(err, "Could not reorder."));
    } finally {
      setReordering(false);
    }
  };

  const handleComplaint = async () => {
    // Match the server rule so users get instant, friendly feedback.
    if (complaintIssue.trim().length < 3) {
      setComplaintErr("Please describe the issue in at least 3 characters.");
      return;
    }
    setComplaintBusy(true);
    setComplaintErr(null);
    try {
      const res = await raiseComplaintFn({
        data: {
          orderId: data.order.id,
          issue: complaintIssue.trim(),
          detail: complaintDetail.trim() || undefined,
        },
      });
      if (!res.success) {
        setComplaintErr(res.error ?? "Could not submit complaint.");
        return;
      }
      setComplaintOpen(false);
      setComplaintIssue("");
      setComplaintDetail("");
      setActionMsg("Complaint submitted. Our team and the print partner will review it.");
      router.invalidate();
    } catch (err) {
      setComplaintErr(getFriendlyError(err, "Could not submit complaint."));
    } finally {
      setComplaintBusy(false);
    }
  };

  const handleReply = async () => {
    if (!complaint || !replyText.trim()) return;
    setReplyBusy(true);
    setReplyErr(null);
    try {
      const res = await replyToMyComplaintFn({
        data: { complaintId: complaint.id, message: replyText.trim() },
      });
      if (!res.success) {
        setReplyErr(res.error ?? "Could not send reply.");
        return;
      }
      setReplyText("");
      router.invalidate();
    } catch (err) {
      setReplyErr(getFriendlyError(err, "Could not send reply."));
    } finally {
      setReplyBusy(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelMyOrderFn({ data: { id: data.order.id } });
      if (!result.success) {
        setActionErr(result.error ?? "Could not cancel order.");
        return;
      }
      setCancelOpen(false);
      router.invalidate();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          to="/account/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to all orders
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">Order {data.order.id}</h2>
              <Badge className={`rounded-full ${badge.cls}`}>
                <Icon className="mr-1 h-3 w-3" />
                {badge.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Placed{" "}
              {new Date(data.order.createdAt).toLocaleString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleReorder} disabled={reordering}>
              {reordering ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-1.5 h-4 w-4" />
              )}
              Reorder
            </Button>
            {!complaint && (
              <Button variant="outline" onClick={() => { setComplaintErr(null); setComplaintOpen(true); }}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Raise complaint
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Cancel order
              </Button>
            )}
          </div>
        </div>
        {actionMsg && (
          <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            {actionMsg}
          </p>
        )}
        {actionErr && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionErr}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {/* Tracking timeline */}
          <Card className="p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="text-lg font-semibold">Tracking</h3>
              {data.eta && data.order.status !== "delivered" && data.order.status !== "cancelled" && (
                <div className="text-right text-sm">
                  <span className="text-muted-foreground">Estimated delivery</span>
                  <div className="font-semibold">
                    {new Date(data.eta).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
              )}
            </div>

            {data.trackingNumber && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <Truck className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Tracking number
                  </div>
                  <div className="font-mono text-sm font-semibold">
                    {data.trackingNumber}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(data.trackingNumber!);
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            )}

            <ol className="mt-6 space-y-0">
              {data.timeline.map((step, idx) => (
                <TimelineRow
                  key={step.key}
                  step={step}
                  isLast={idx === data.timeline.length - 1}
                />
              ))}
            </ol>
          </Card>

          {/* Line items */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold">
              {data.order.items.length}{" "}
              {data.order.items.length === 1 ? "item" : "items"}
            </h3>
            <div className="mt-4 space-y-4">
              {data.order.items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No item-level data is available for this order.
                </p>
              )}
              {data.order.items.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  className="flex flex-wrap gap-4 rounded-lg border bg-muted/20 p-3"
                >
                  <img
                    src={
                      (item.artwork?.id && artworkPreviews[item.artwork.id]) ||
                      item.product.image
                    }
                    alt={item.product.name}
                    className="h-20 w-20 shrink-0 rounded-md border bg-white object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/product/$slug"
                      params={{ slug: item.product.slug }}
                      className="font-semibold hover:text-primary"
                    >
                      {item.product.name}
                    </Link>
                    <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                      {item.product.category.replace(/-/g, " ")}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <li>
                        <span className="font-medium text-foreground">
                          Qty {item.quantity}
                        </span>
                      </li>
                      <li>{item.size}</li>
                      {item.finish && <li>{item.finish}</li>}
                      <li>{item.turnaround.label}</li>
                      {item.customization?.printSides && (
                        <li>{item.customization.printSides}</li>
                      )}
                      {item.customization?.dimensions && (
                        <li>
                          {item.customization.dimensions.width} ×{" "}
                          {item.customization.dimensions.height}{" "}
                          {item.customization.dimensions.unit}
                        </li>
                      )}
                    </ul>
                    {item.customization?.notes && (
                      <p className="mt-2 rounded-md bg-card p-2 text-xs">
                        <span className="font-semibold">Notes:</span>{" "}
                        {item.customization.notes}
                      </p>
                    )}
                    {item.artwork && (
                      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        Artwork: {item.artwork.name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Complaint thread */}
          {complaint && (
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Complaint
                </h3>
                <Badge
                  className={`rounded-full capitalize ${
                    complaint.status === "resolved"
                      ? "bg-success/15 text-success"
                      : complaint.status === "escalated"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning"
                  }`}
                >
                  {complaint.status}
                </Badge>
              </div>

              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                <div className="text-sm font-semibold">{complaint.issue}</div>
                {complaint.detail && (
                  <p className="mt-1 text-sm text-muted-foreground">{complaint.detail}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Raised{" "}
                  {new Date(complaint.createdAt).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {/* Responses */}
              <div className="mt-4 space-y-3">
                {complaint.responses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No replies yet. The print partner or our support team will respond here.
                  </p>
                ) : (
                  complaint.responses.map((r, i) => (
                    <div key={i} className="rounded-lg bg-primary/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{r.author}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.at).toLocaleString(undefined, {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{r.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Reply box */}
              <div className="mt-4 space-y-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Add a reply…"
                  rows={3}
                  maxLength={2000}
                />
                {replyErr && <p className="text-sm text-destructive">{replyErr}</p>}
                <div className="flex justify-end">
                  <Button onClick={handleReply} disabled={replyBusy || !replyText.trim()}>
                    {replyBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send reply
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Price breakdown */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Price details
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <Line label="Subtotal" value={`₹${data.order.subtotal.toLocaleString()}`} />
              {(data.order.discount ?? 0) > 0 && (
                <Line
                  label={`Discount${data.order.couponCode ? ` (${data.order.couponCode})` : ""}`}
                  value={`−₹${data.order.discount!.toLocaleString()}`}
                  valueClass="text-success"
                />
              )}
              {/* GST line intentionally omitted — no tax charged to customers. */}
              {data.order.gst > 0 && (
                <Line label="GST (18%)" value={`₹${data.order.gst.toLocaleString()}`} />
              )}
              <Line label="Shipping" value="FREE" valueClass="text-success" />
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t pt-3">
              <span className="font-semibold">Total paid</span>
              <span className="text-2xl font-bold text-primary">
                ₹{data.order.total.toLocaleString()}
              </span>
            </div>
          </Card>

          {/* Payment details */}
          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              Payment
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <Line label="Method" value={paymentMethodLabel(data.order.payment?.method)} />
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    className={`rounded-full ${
                      (data.order.payment?.status ?? "paid") === "paid"
                        ? "bg-success/15 text-success"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {(data.order.payment?.status ?? "paid") === "paid" ? "Paid" : "Pending"}
                  </Badge>
                </dd>
              </div>
              {data.order.payment?.reference && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="flex items-center gap-1.5">
                    <span className="font-mono text-xs">{data.order.payment.reference}</span>
                    <button
                      type="button"
                      aria-label="Copy reference"
                      onClick={() => void navigator.clipboard?.writeText(data.order.payment!.reference!)}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </dd>
                </div>
              )}
              <Line label="Amount" value={`₹${data.order.total.toLocaleString()}`} />
            </dl>
          </Card>

          {/* Refund status */}
          {refund && (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refund
                </h3>
                <Badge
                  className={`rounded-full capitalize ${
                    refund.status === "completed"
                      ? "bg-success/15 text-success"
                      : refund.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning"
                  }`}
                >
                  {refund.status}
                </Badge>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <Line label="Amount" value={`₹${refund.amount.toLocaleString()}`} />
                {refund.reference && <Line label="Reference" value={refund.reference} />}
                {refund.updatedAt && (
                  <Line label="Updated" value={new Date(refund.updatedAt).toLocaleDateString()} />
                )}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {refund.status === "completed"
                  ? "Your refund has been processed. It may take 5–7 business days to reflect."
                  : refund.status === "rejected"
                    ? "This refund request was not approved. Contact support for details."
                    : "Your refund request is being reviewed by the platform team."}
              </p>
            </Card>
          )}

          {/* Shipping address */}
          {data.order.shipping ? (
            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Shipping address
              </h3>
              <div className="mt-3 space-y-1 text-sm">
                <div className="font-semibold">{data.order.shipping.fullName}</div>
                {data.order.shipping.company && (
                  <div className="text-muted-foreground">
                    {data.order.shipping.company}
                  </div>
                )}
                <div>{data.order.shipping.address}</div>
                {data.order.shipping.landmark && (
                  <div className="text-muted-foreground">
                    Landmark: {data.order.shipping.landmark}
                  </div>
                )}
                <div>
                  {data.order.shipping.city}, {data.order.shipping.state} —{" "}
                  <span className="font-mono">{data.order.shipping.pincode}</span>
                </div>
                <div className="pt-2 text-xs text-muted-foreground">
                  Phone: {data.order.shipping.phone} · Email:{" "}
                  {data.order.shipping.email}
                </div>
                {data.order.shipping.gstin && (
                  <div className="text-xs text-muted-foreground">
                    GSTIN: <span className="font-mono">{data.order.shipping.gstin}</span>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {/* Vendor card */}
          {data.vendor && (
            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
                Print partner
              </h3>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                  {data.vendor.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{data.vendor.name}</div>
                  {data.vendor.city && (
                    <div className="text-xs text-muted-foreground">
                      {data.vendor.city}
                    </div>
                  )}
                </div>
              </div>
              {data.vendor.phone && (
                <a
                  href={`tel:${data.vendor.phone}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {data.vendor.phone}
                </a>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Raise complaint */}
      <Dialog open={complaintOpen} onOpenChange={setComplaintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise a complaint</DialogTitle>
            <DialogDescription>
              Tell us what went wrong with order {data.order.id}. Our team and the
              print partner will review it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="issue">Issue</Label>
              <Input
                id="issue"
                value={complaintIssue}
                onChange={(e) => setComplaintIssue(e.target.value)}
                placeholder="e.g. Print quality, wrong item, late delivery"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail">Details (optional)</Label>
              <Textarea
                id="detail"
                value={complaintDetail}
                onChange={(e) => setComplaintDetail(e.target.value)}
                placeholder="Add any details that help us resolve this faster."
                rows={4}
                maxLength={2000}
              />
            </div>
            {complaintErr && (
              <p className="text-sm text-destructive">{complaintErr}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplaintOpen(false)} disabled={complaintBusy}>
              Cancel
            </Button>
            <Button onClick={handleComplaint} disabled={complaintBusy}>
              {complaintBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit complaint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {data.order.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              You can cancel this order while it&apos;s still in production. Once
              dispatched you&apos;ll need to contact support for a return. Refunds
              are processed in 5-7 business days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void handleCancel();
              }}
            >
              {cancelling ? "Cancelling…" : "Yes, cancel order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function paymentMethodLabel(method?: "razorpay" | "phonepe" | "manual"): string {
  if (method === "razorpay") return "Razorpay";
  if (method === "phonepe") return "PhonePe";
  return "Paid at checkout";
}

function Line({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${valueClass}`}>{value}</dd>
    </div>
  );
}

function TimelineRow({ step, isLast }: { step: Step; isLast: boolean }) {
  const isCancel = step.key === "cancelled";
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {/* Dot + connector */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isCancel
              ? "bg-destructive text-destructive-foreground"
              : step.reached
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {isCancel ? (
            <XCircle className="h-4 w-4" />
          ) : step.reached ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
        </div>
        {!isLast && (
          <div
            className={`mt-1 w-0.5 flex-1 ${step.reached ? "bg-primary" : "bg-muted"}`}
            style={{ minHeight: 24 }}
          />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span
            className={`font-semibold ${step.reached || isCancel ? "text-foreground" : "text-muted-foreground"}`}
          >
            {step.label}
          </span>
          {step.at && (
            <span className="text-xs text-muted-foreground">
              {new Date(step.at).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
      </div>
    </li>
  );
}
