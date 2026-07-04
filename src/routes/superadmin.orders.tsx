import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Eye, X } from "lucide-react";
import { toast } from "sonner";
import {
  adminCancelOrderFn,
  getAdminOrderDetailFn,
  getAllOrdersFn,
  reassignOrderFn,
  updateVendorOrderStatusFn,
} from "@/lib/backend";

export const Route = createFileRoute("/superadmin/orders")({
  loader: async () => await getAllOrdersFn(),
  component: AllOrders,
});

type Order = Awaited<ReturnType<typeof getAllOrdersFn>>[number];
type OrderDetail = Awaited<ReturnType<typeof getAdminOrderDetailFn>>;
type VendorOrderStatus =
  | "new"
  | "accepted"
  | "in_production"
  | "quality_check"
  | "dispatched"
  | "completed"
  | "cancelled";

const statusColor: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  accepted: "bg-sky-100 text-sky-700 border-sky-200",
  in_production: "bg-warning/15 text-warning border-warning/30",
  quality_check: "bg-purple-100 text-purple-700 border-purple-200",
  dispatched: "bg-indigo-100 text-indigo-700 border-indigo-200",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

function paymentLabel(method?: "razorpay" | "phonepe" | "manual") {
  if (method === "razorpay") return "Razorpay";
  if (method === "phonepe") return "PhonePe";
  return "Paid at checkout";
}

const allStatuses: VendorOrderStatus[] = [
  "new",
  "accepted",
  "in_production",
  "quality_check",
  "dispatched",
  "completed",
  "cancelled",
];

function AllOrders() {
  const initial = Route.useLoaderData() as Order[];
  const [orders, setOrders] = useState<Order[]>(initial);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const refresh = async () => setOrders(await getAllOrdersFn());

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        const matchesQuery = [o.id, o.customer, o.product, (o as any).vendorName].some((field) =>
          (field ?? "").toString().toLowerCase().includes(query.toLowerCase()),
        );
        const matchesStatus = statusFilter === "all" || o.status === statusFilter;
        return matchesQuery && matchesStatus;
      }),
    [orders, query, statusFilter],
  );

  const view = async (id: string) => {
    try {
      const next = await getAdminOrderDetailFn({ data: { id } });
      setDetail(next);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load order.");
    }
  };

  const cancel = async (o: Order) => {
    if (!confirm(`Cancel order ${o.id}? Customer will be notified.`)) return;
    const result = await adminCancelOrderFn({ data: { id: o.id } });
    if (!result.success) {
      toast.error(result.error ?? "Cancel failed.");
      return;
    }
    toast.success("Order cancelled.");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Orders</h2>
          <p className="text-sm text-muted-foreground">
            All orders across the marketplace · {orders.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl bg-white/60 px-3 text-sm backdrop-blur"
          >
            <option value="all">All statuses</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search orders..."
              className="h-10 w-72 rounded-xl bg-white/60 pl-9 backdrop-blur"
            />
          </div>
        </div>
      </div>

      <Card className="glass border-white/40 p-5">
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No orders match.
            </p>
          )}
          {filtered.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/6 p-3 transition-base hover:bg-primary/12"
            >
              <div className="font-mono text-xs font-semibold text-primary">
                {o.id}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{o.product}</div>
                <div className="text-xs text-muted-foreground">
                  {o.customer} · {o.date} · Vendor: {(o as any).vendorName ?? "Unassigned"}
                </div>
              </div>
              <div className="text-sm font-semibold">
                ₹{o.amount.toLocaleString()}
              </div>
              <Badge
                className={`rounded-full border ${statusColor[o.status]}`}
              >
                {o.status.replace("_", " ")}
              </Badge>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => view(o.id)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Manage
                </Button>
                {o.status !== "cancelled" && o.status !== "completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-destructive"
                    onClick={() => cancel(o)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {detail && (
        <OrderDetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            const next = await getAdminOrderDetailFn({
              data: { id: detail.vendorOrder.id },
            });
            setDetail(next);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function OrderDetailModal({
  detail,
  onClose,
  onChanged,
}: {
  detail: OrderDetail;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<VendorOrderStatus>(
    detail.vendorOrder.status as VendorOrderStatus,
  );
  const [vendorId, setVendorId] = useState<string>(detail.vendorOrder.vendorId ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);

  const saveStatus = async () => {
    setSavingStatus(true);
    try {
      const result = await updateVendorOrderStatusFn({
        data: { id: detail.vendorOrder.id, status },
      });
      if (!result.success) {
        toast.error("Status update failed.");
        return;
      }
      toast.success(`Status updated to ${status.replace("_", " ")}.`);
      await onChanged();
    } finally {
      setSavingStatus(false);
    }
  };

  const saveVendor = async () => {
    if (!vendorId) {
      toast.error("Pick a vendor first.");
      return;
    }
    setSavingVendor(true);
    try {
      const result = await reassignOrderFn({
        data: { id: detail.vendorOrder.id, vendorId },
      });
      if (!result.success) {
        toast.error("Reassign failed.");
        return;
      }
      toast.success("Order reassigned.");
      await onChanged();
    } finally {
      setSavingVendor(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Order {detail.vendorOrder.id}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <div className="font-medium">{detail.vendorOrder.customer}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Amount</Label>
            <div className="font-medium">₹{detail.vendorOrder.amount.toLocaleString()}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Product</Label>
            <div className="font-medium">{detail.vendorOrder.product}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Deadline</Label>
            <div className="font-medium">{detail.vendorOrder.deadline}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Current vendor</Label>
            <div className="font-medium">{detail.vendor?.name ?? "Unassigned"}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Customer order</Label>
            <div className="font-mono text-xs font-medium">
              {detail.customerOrder?.id ?? "—"}
            </div>
          </div>
        </div>

        {detail.customerOrder?.shipping && (
          <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs">
            <div className="text-[10px] uppercase text-muted-foreground">Shipping address</div>
            <div className="mt-1 font-medium">
              {detail.customerOrder.shipping.fullName} · {detail.customerOrder.shipping.phone}
            </div>
            <div className="text-muted-foreground">
              {detail.customerOrder.shipping.email}
            </div>
            <div className="text-muted-foreground">
              {detail.customerOrder.shipping.address}
              {detail.customerOrder.shipping.landmark ? ` (${detail.customerOrder.shipping.landmark})` : ""}, {detail.customerOrder.shipping.city},
              {" "}
              {detail.customerOrder.shipping.state} - {detail.customerOrder.shipping.pincode}
            </div>
            {detail.customerOrder.shipping.gstin && (
              <div className="text-muted-foreground">
                GSTIN: <span className="font-mono">{detail.customerOrder.shipping.gstin}</span>
              </div>
            )}
          </div>
        )}

        {/* Payment + pricing */}
        {detail.customerOrder && (
          <div className="mt-4 rounded-lg border bg-card p-3 text-xs">
            <div className="text-[10px] uppercase text-muted-foreground">Payment</div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              <div>
                <span className="text-muted-foreground">Method:</span>{" "}
                <span className="font-medium">
                  {paymentLabel(detail.customerOrder.payment?.method)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <span className="font-medium capitalize">
                  {detail.customerOrder.payment?.status ?? "paid"}
                </span>
              </div>
              {detail.customerOrder.payment?.reference && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Reference:</span>{" "}
                  <span className="font-mono">{detail.customerOrder.payment.reference}</span>
                </div>
              )}
              <div className="col-span-2 mt-1 border-t pt-2" />
              <div>
                <span className="text-muted-foreground">Subtotal:</span> ₹
                {detail.customerOrder.subtotal.toLocaleString()}
              </div>
              {(detail.customerOrder.discount ?? 0) > 0 && (
                <div>
                  <span className="text-muted-foreground">
                    Discount{detail.customerOrder.couponCode ? ` (${detail.customerOrder.couponCode})` : ""}:
                  </span>{" "}
                  −₹{detail.customerOrder.discount!.toLocaleString()}
                </div>
              )}
              <div className="col-span-2 font-semibold">
                <span className="text-muted-foreground">Total paid:</span>{" "}
                <span className="text-primary">₹{detail.customerOrder.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Line items */}
        {detail.customerOrder?.items?.length ? (
          <div className="mt-4 rounded-lg border bg-card p-3 text-xs">
            <div className="text-[10px] uppercase text-muted-foreground">
              Items ({detail.customerOrder.items.length})
            </div>
            <ul className="mt-2 space-y-2">
              {detail.customerOrder.items.map((item, idx) => (
                <li key={item.id ?? idx} className="flex items-start gap-2">
                  <img
                    src={item.product.image}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded border bg-white object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {item.product.name}{" "}
                      <span className="text-muted-foreground">×{item.quantity}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {item.size}
                      {item.finish ? ` · ${item.finish}` : ""} · {item.turnaround.label}
                    </div>
                    {item.artwork && (
                      <div className="text-muted-foreground">
                        Artwork: {item.artwork.name}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 border-t pt-4">
          <div>
            <Label className="text-xs text-muted-foreground">Change status</Label>
            <div className="mt-1 flex gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VendorOrderStatus)}
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
              >
                {[
                  "new",
                  "accepted",
                  "in_production",
                  "quality_check",
                  "dispatched",
                  "completed",
                  "cancelled",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
              <Button onClick={saveStatus} disabled={savingStatus}>
                Apply
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Reassign vendor</Label>
            <div className="mt-1 flex gap-2">
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Pick a vendor…</option>
                {detail.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.city})
                  </option>
                ))}
              </select>
              <Button onClick={saveVendor} disabled={savingVendor}>
                Reassign
              </Button>
            </div>
          </div>
        </div>

        {detail.vendorOrder.statusHistory && detail.vendorOrder.statusHistory.length > 0 && (
          <div className="mt-5 border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">History</div>
            <ul className="mt-2 space-y-1 text-xs">
              {detail.vendorOrder.statusHistory.map((ev, i) => (
                <li key={i} className="flex justify-between rounded bg-muted/40 px-2 py-1">
                  <span className="capitalize">{ev.status.replace("_", " ")}</span>
                  <span className="text-muted-foreground">
                    {new Date(ev.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </Card>
    </div>
  );
}
