import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  IndianRupee,
  MapPin,
  MessageSquare,
  Package,
  RotateCcw,
  Store,
  Truck,
  User as UserIcon,
} from "lucide-react";
import {
  lookupOrderFn,
  respondComplaintFn,
  updateRefundFn,
} from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";

type Found = Extract<Awaited<ReturnType<typeof lookupOrderFn>>, { found: true }>;

function paymentLabel(method?: "razorpay" | "phonepe" | "manual") {
  if (method === "razorpay") return "Razorpay";
  if (method === "phonepe") return "PhonePe";
  return "Paid at checkout";
}

const refundBadge: Record<string, string> = {
  requested: "bg-warning/15 text-warning",
  approved: "bg-sky-100 text-sky-700",
  processing: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

export function OrderDisputePanel({
  result,
  onChanged,
}: {
  result: Found;
  onChanged: () => void | Promise<void>;
}) {
  const co = result.customerOrder;
  const vo = result.vendorOrder;
  const complaint = result.complaint;

  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Refund controls (super admin)
  const [refundAmount, setRefundAmount] = useState(
    String(co?.refund?.amount ?? co?.total ?? 0),
  );
  const [refundRef, setRefundRef] = useState(co?.refund?.reference ?? "");
  const [refundNote, setRefundNote] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);

  const sendReply = async () => {
    if (!complaint || !reply.trim()) return;
    setReplyBusy(true);
    setMsg(null);
    try {
      const res = await respondComplaintFn({
        data: { id: complaint.id, message: reply.trim() },
      });
      if (!res.success) {
        setMsg({ ok: false, text: res.error ?? "Could not send reply." });
        return;
      }
      setReply("");
      await onChanged();
    } catch (err) {
      setMsg({ ok: false, text: getFriendlyError(err, "Could not send reply.") });
    } finally {
      setReplyBusy(false);
    }
  };

  const applyRefund = async (
    status: "approved" | "processing" | "completed" | "rejected",
  ) => {
    if (!co) return;
    setRefundBusy(true);
    setMsg(null);
    try {
      const res = await updateRefundFn({
        data: {
          orderId: co.id,
          status,
          amount: Number(refundAmount) || 0,
          reference: refundRef.trim() || undefined,
          note: refundNote.trim() || undefined,
        },
      });
      if (!res.success) {
        setMsg({ ok: false, text: res.error ?? "Could not update refund." });
        return;
      }
      setMsg({ ok: true, text: `Refund marked ${status}.` });
      await onChanged();
    } catch (err) {
      setMsg({ ok: false, text: getFriendlyError(err, "Could not update refund.") });
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header / identifiers */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Package className="h-5 w-5 text-primary" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-primary">{co?.id ?? "—"}</span>
            {vo && (
              <Badge variant="secondary" className="capitalize">
                {vo.status.replace("_", " ")}
              </Badge>
            )}
            <span className="text-muted-foreground">matched by {result.matchedBy}</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Vendor order:</span>{" "}
            <span className="font-mono">{vo?.id ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Placed:</span>{" "}
            {co ? new Date(co.createdAt).toLocaleString() : "—"}
          </div>
          <div className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Tracking:</span>{" "}
            <span className="font-mono">{vo?.trackingNumber ?? "—"}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Payment */}
        {co && (
          <Card className="p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-primary" /> Payment
            </h4>
            <dl className="space-y-1 text-xs">
              <Row label="Method" value={paymentLabel(co.payment?.method)} />
              <Row label="Status" value={co.payment?.status ?? "paid"} />
              {co.payment?.reference && (
                <Row label="Reference" value={co.payment.reference} mono />
              )}
              <div className="my-1 border-t" />
              <Row label="Subtotal" value={`₹${co.subtotal.toLocaleString()}`} />
              {(co.discount ?? 0) > 0 && (
                <Row
                  label={`Discount${co.couponCode ? ` (${co.couponCode})` : ""}`}
                  value={`−₹${co.discount!.toLocaleString()}`}
                />
              )}
              <Row label="Total paid" value={`₹${co.total.toLocaleString()}`} strong />
            </dl>
          </Card>
        )}

        {/* Customer + shipping */}
        {co && (
          <Card className="p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" /> Customer & shipping
            </h4>
            <div className="space-y-0.5 text-xs">
              <div className="font-medium">{co.shipping?.fullName ?? co.customerName}</div>
              <div className="text-muted-foreground">
                {co.shipping?.phone ?? "—"} · {co.shipping?.email ?? co.customerEmail}
              </div>
              {co.shipping && (
                <div className="text-muted-foreground">
                  {co.shipping.address}
                  {co.shipping.landmark ? ` (${co.shipping.landmark})` : ""}, {co.shipping.city}, {co.shipping.state} — {co.shipping.pincode}
                </div>
              )}
            </div>
            {result.vendor && (
              <div className="mt-3 flex items-center gap-2 border-t pt-2 text-xs">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Print partner:</span>
                <span className="font-medium">{result.vendor.name}</span>
                {result.vendor.city && <span className="text-muted-foreground">· {result.vendor.city}</span>}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Items */}
      {co?.items?.length ? (
        <Card className="p-4">
          <h4 className="mb-2 text-sm font-semibold">Items ({co.items.length})</h4>
          <ul className="space-y-2">
            {co.items.map((item, idx) => (
              <li key={item.id ?? idx} className="flex items-start gap-2 text-xs">
                <img
                  src={item.product.image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded border bg-white object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {item.product.name} <span className="text-muted-foreground">×{item.quantity}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {item.size}
                    {item.finish ? ` · ${item.finish}` : ""} · {item.turnaround.label}
                  </div>
                  {item.artwork && (
                    <div className="text-muted-foreground">Artwork: {item.artwork.name}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Refund */}
      {co && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <RotateCcw className="h-4 w-4 text-primary" /> Refund
            </h4>
            {co.refund ? (
              <Badge className={`rounded-full capitalize ${refundBadge[co.refund.status] ?? "bg-muted"}`}>
                {co.refund.status}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">No refund activity</span>
            )}
          </div>
          {co.refund && (
            <dl className="mt-2 space-y-1 text-xs">
              <Row label="Amount" value={`₹${co.refund.amount.toLocaleString()}`} />
              {co.refund.reason && <Row label="Reason" value={co.refund.reason} />}
              {co.refund.reference && <Row label="Refund ref" value={co.refund.reference} mono />}
              {co.refund.note && <Row label="Note" value={co.refund.note} />}
              {co.refund.updatedAt && (
                <Row label="Updated" value={new Date(co.refund.updatedAt).toLocaleString()} />
              )}
            </dl>
          )}

          <div className="mt-3 space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Issue a refund at your discretion — e.g. cancellation or a wrong item sent.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Refund amount (₹)</Label>
                <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gateway refund reference</Label>
                <Input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} placeholder="rfnd_…" className="h-9 font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Internal note (optional)</Label>
              <Input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={refundBusy} onClick={() => applyRefund("approved")}>Approve</Button>
              <Button size="sm" variant="outline" disabled={refundBusy} onClick={() => applyRefund("processing")}>Mark processing</Button>
              <Button size="sm" disabled={refundBusy} onClick={() => applyRefund("completed")}>Mark refunded</Button>
              <Button size="sm" variant="outline" className="text-destructive" disabled={refundBusy} onClick={() => applyRefund("rejected")}>Reject</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Complaint thread */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" /> Dispute / complaint
          </h4>
          {complaint && (
            <Badge variant="secondary" className="capitalize">{complaint.status}</Badge>
          )}
        </div>
        {complaint ? (
          <>
            <div className="mt-2 rounded-lg border bg-muted/20 p-2 text-xs">
              <div className="font-semibold">{complaint.issue}</div>
              {complaint.detail && <div className="mt-0.5 text-muted-foreground">{complaint.detail}</div>}
            </div>
            <div className="mt-3 space-y-2">
              {complaint.responses.length === 0 ? (
                <p className="text-xs text-muted-foreground">No replies yet.</p>
              ) : (
                complaint.responses.map((r, i) => (
                  <div key={i} className="rounded-lg bg-primary/5 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{r.author}</span>
                      <span className="text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap">{r.message}</p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 space-y-2">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the customer…" rows={2} />
              <div className="flex justify-end">
                <Button size="sm" onClick={sendReply} disabled={replyBusy || !reply.trim()}>Send reply</Button>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            <UserIcon className="mr-1 inline h-3 w-3" />
            No complaint has been filed for this order.
          </p>
        )}
      </Card>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`${mono ? "font-mono" : ""} ${strong ? "font-bold text-primary" : "font-medium"} text-right`}>
        {value}
      </dd>
    </div>
  );
}
