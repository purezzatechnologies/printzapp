import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Download,
  Clock,
  FileText,
  MapPin,
  Search,
  ArrowUpRight,
  MoreVertical,
  Phone,
  Package,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  IndianRupee,
  ListChecks,
  Factory,
  Truck,
  ShieldCheck,
} from "lucide-react";
import {
  getArtworkFn,
  getVendorOrderDetailsFn,
  getVendorOrdersFn,
  updateVendorOrderStatusFn,
} from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/vendor/orders")({
  loader: async () => ({ orders: await getVendorOrdersFn() }),
  component: VendorOrders,
});

type OrderItem = Awaited<ReturnType<typeof getVendorOrdersFn>>[number];
type Details = Awaited<ReturnType<typeof getVendorOrderDetailsFn>>;
type Status = OrderItem["status"];

const STAGES: { key: Status; label: string; icon: typeof Package }[] = [
  { key: "new", label: "New", icon: Package },
  { key: "accepted", label: "Accepted", icon: ListChecks },
  { key: "in_production", label: "In Production", icon: Factory },
  { key: "quality_check", label: "Quality Check", icon: ShieldCheck },
  { key: "dispatched", label: "Dispatched", icon: Truck },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

const ALL_TABS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...STAGES.map((s) => ({ key: s.key, label: s.label })),
  { key: "cancelled", label: "Cancelled" },
];

const NEXT_ACTION: Record<Status, { label: string; next: Status } | null> = {
  new: { label: "Accept Order", next: "accepted" },
  accepted: { label: "Start Production", next: "in_production" },
  in_production: { label: "Send for QC", next: "quality_check" },
  quality_check: { label: "Dispatch", next: "dispatched" },
  dispatched: { label: "Mark Delivered", next: "completed" },
  completed: null,
  cancelled: null,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function paymentMethodLabel(method?: "razorpay" | "phonepe" | "manual") {
  if (method === "razorpay") return "Razorpay";
  if (method === "phonepe") return "PhonePe";
  return "Paid at checkout";
}

function urgency(minutes: number | null, status: Status) {
  if (status === "completed" || status === "cancelled" || minutes == null) {
    return { level: "none" as const, label: "" };
  }
  if (minutes < 0) return { level: "overdue" as const, label: "OVERDUE" };
  if (minutes < 60) return { level: "critical" as const, label: "Due soon" };
  if (minutes < 240) return { level: "high" as const, label: "Urgent" };
  if (minutes < 1440) return { level: "medium" as const, label: "Today" };
  return { level: "low" as const, label: "Scheduled" };
}

function urgencyClasses(level: ReturnType<typeof urgency>["level"]) {
  switch (level) {
    case "overdue":
      return {
        strip: "bg-destructive",
        chip: "bg-destructive/15 text-destructive border border-destructive/30",
      };
    case "critical":
      return {
        strip: "bg-destructive/70",
        chip: "bg-destructive/10 text-destructive border border-destructive/20",
      };
    case "high":
      return {
        strip: "bg-warning",
        chip: "bg-warning/15 text-warning border border-warning/30",
      };
    case "medium":
      return {
        strip: "bg-primary",
        chip: "bg-primary/10 text-primary border border-primary/20",
      };
    case "low":
      return {
        strip: "bg-success/70",
        chip: "bg-success/10 text-success border border-success/20",
      };
    default:
      return { strip: "bg-muted", chip: "bg-muted text-muted-foreground" };
  }
}

async function downloadArtwork(artworkId: string, fileName: string) {
  const file = await getArtworkFn({ data: { id: artworkId } });
  const a = document.createElement("a");
  a.href = file.dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function VendorOrders() {
  const { orders: initialOrders } = Route.useLoaderData() as {
    orders: OrderItem[];
  };
  const [orders, setOrders] = useState(initialOrders);
  const [tab, setTab] = useState<Status | "all">("new");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"urgency" | "amount" | "newest">(
    "urgency",
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  const [details, setDetails] = useState<Details | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<OrderItem | null>(
    null,
  );

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: orders.length };
    for (const o of orders) next[o.status] = (next[o.status] ?? 0) + 1;
    return next;
  }, [orders]);

  const todaysRevenue = useMemo(
    () =>
      orders
        .filter((o) => o.date === "Today" && o.status !== "cancelled")
        .reduce((sum, o) => sum + o.amount, 0),
    [orders],
  );

  const dueSoon = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== "completed" &&
          o.status !== "cancelled" &&
          o.deadlineMinutes != null &&
          o.deadlineMinutes < 240,
      ).length,
    [orders],
  );

  const activeWork = useMemo(
    () =>
      orders.filter((o) =>
        ["accepted", "in_production", "quality_check"].includes(o.status),
      ).length,
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = orders.filter((o) => (tab === "all" ? true : o.status === tab));
    if (q) {
      list = list.filter((o) =>
        [
          o.id,
          o.customer,
          o.firstItemName,
          o.product,
          o.pincode,
          o.city,
        ].some((s) => s.toLowerCase().includes(q)),
      );
    }
    if (sortBy === "urgency") {
      list = [...list].sort((a, b) => {
        const am = a.deadlineMinutes ?? Number.MAX_SAFE_INTEGER;
        const bm = b.deadlineMinutes ?? Number.MAX_SAFE_INTEGER;
        return am - bm;
      });
    } else if (sortBy === "amount") {
      list = [...list].sort((a, b) => b.amount - a.amount);
    } else {
      // newest first — id is sequential
      list = [...list].sort((a, b) => b.id.localeCompare(a.id));
    }
    return list;
  }, [orders, query, sortBy, tab]);

  const advance = async (id: string, next: Status) => {
    await updateVendorOrderStatusFn({ data: { id, status: next } });
    setOrders((current) =>
      current.map((o) => (o.id === id ? { ...o, status: next } : o)),
    );
  };

  const cancelOrder = async (order: OrderItem) => {
    await updateVendorOrderStatusFn({
      data: { id: order.id, status: "cancelled" },
    });
    setOrders((current) =>
      current.map((o) =>
        o.id === order.id ? { ...o, status: "cancelled" } : o,
      ),
    );
    setConfirmingCancel(null);
  };

  const openSpecs = async (id: string) => {
    setDetailsLoading(true);
    setDetails(null);
    try {
      const next = await getVendorOrderDetailsFn({ data: { id } });
      setDetails(next);
    } catch (err) {
      setDownloadError(getFriendlyError(err, "Could not load specs."));
    } finally {
      setDetailsLoading(false);
    }
  };

  const triggerArtworkDownload = async (artworkId: string, name: string) => {
    setDownloadError(null);
    try {
      await downloadArtwork(artworkId, name);
    } catch (err) {
      setDownloadError(getFriendlyError(err, "Download failed."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Order Management</h2>
          <p className="text-sm text-muted-foreground">
            Triage incoming work, track production, and dispatch on time.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={Package}
          label="New"
          value={String(counts.new ?? 0)}
          hint="Awaiting your acceptance"
          tone="primary"
          onClick={() => setTab("new")}
        />
        <SummaryTile
          icon={Factory}
          label="In Flight"
          value={String(activeWork)}
          hint="Accepted → QC"
          tone="muted"
          onClick={() => setTab("accepted")}
        />
        <SummaryTile
          icon={AlertCircle}
          label="Due Soon"
          value={String(dueSoon)}
          hint="Within 4 hours"
          tone={dueSoon > 0 ? "warning" : "muted"}
        />
        <SummaryTile
          icon={IndianRupee}
          label="Today"
          value={`₹${todaysRevenue.toLocaleString()}`}
          hint="Orders placed today"
          tone="success"
        />
      </div>

      {/* Filters */}
      <Card className="p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by order ID, customer, product or pincode…"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sort
            </label>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "urgency" | "amount" | "newest")
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm"
            >
              <option value="urgency">Urgency</option>
              <option value="amount">Amount (high → low)</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="-mb-1 mt-3 flex gap-1 overflow-x-auto pb-1">
          {ALL_TABS.map((t) => {
            const count = counts[t.key] ?? 0;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-base ${active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent"}`}
              >
                <span>{t.label}</span>
                <span
                  className={`min-w-[1.5rem] rounded-full px-1.5 text-center text-[11px] ${active ? "bg-primary-foreground/20" : "bg-muted text-foreground"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Order cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            {query
              ? "No orders match that search."
              : tab === "new"
                ? "No new orders waiting. Nice work!"
                : "Nothing in this stage."}
          </Card>
        )}
        {filtered.map((o) => {
          const u = urgency(o.deadlineMinutes, o.status);
          const u_classes = urgencyClasses(u.level);
          const stageIdx = STAGES.findIndex((s) => s.key === o.status);
          const nextAction = NEXT_ACTION[o.status];
          const isExpanded = expanded === o.id;
          return (
            <Card
              key={o.id}
              className="overflow-hidden p-0 transition-shadow hover:shadow-md"
            >
              <div className="flex">
                {/* Urgency strip */}
                <div className={`w-1.5 shrink-0 ${u_classes.strip}`} />

                <div className="flex-1 p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* Thumbnail */}
                    {o.firstItemImage ? (
                      <img
                        src={o.firstItemImage}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}

                    {/* Main info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {o.id}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {o.status.replace("_", " ")}
                        </Badge>
                        {u.label && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${u_classes.chip}`}
                          >
                            <Clock className="h-3 w-3" />
                            {u.label}
                          </span>
                        )}
                        {o.hasArtwork && (
                          <Badge
                            variant="secondary"
                            className="border-primary/20 bg-primary/5 text-primary"
                          >
                            <FileText className="mr-1 h-3 w-3" />
                            Artwork attached
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 truncate font-semibold">
                        {o.firstItemName}
                        {o.itemCount > 1 && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            +{o.itemCount - 1} more line item
                            {o.itemCount > 2 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Qty {o.totalQty}
                        </span>
                        <span>•</span>
                        <span>{o.customer}</span>
                        {o.pincode && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {o.city ? `${o.city}, ` : ""}
                              {o.pincode}
                            </span>
                          </>
                        )}
                        {o.customerPhone && (
                          <>
                            <span>•</span>
                            <a
                              href={`tel:${o.customerPhone}`}
                              className="inline-flex items-center gap-1 hover:text-primary"
                            >
                              <Phone className="h-3 w-3" />
                              {o.customerPhone}
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amount + deadline */}
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">
                        ₹{o.amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.date}
                      </div>
                      {o.deadline !== "—" &&
                        o.status !== "completed" &&
                        o.status !== "cancelled" && (
                          <div className="mt-1 text-xs">
                            <span
                              className={
                                u.level === "overdue" ||
                                u.level === "critical"
                                  ? "font-semibold text-destructive"
                                  : "text-muted-foreground"
                              }
                            >
                              {u.level === "overdue"
                                ? "Past deadline"
                                : `Due ${o.deadline}`}
                            </span>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Stage progress */}
                  {o.status !== "cancelled" && (
                    <div className="mt-4 flex items-center gap-1">
                      {STAGES.map((s, idx) => {
                        const done = idx < stageIdx;
                        const current = idx === stageIdx;
                        return (
                          <div
                            key={s.key}
                            className="flex flex-1 items-center"
                          >
                            <div
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                                done
                                  ? "bg-success text-success-foreground"
                                  : current
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                              }`}
                              title={s.label}
                            >
                              {done ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <s.icon className="h-3 w-3" />
                              )}
                            </div>
                            {idx < STAGES.length - 1 && (
                              <div
                                className={`mx-1 h-0.5 flex-1 rounded transition-colors ${idx < stageIdx ? "bg-success" : "bg-muted"}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openSpecs(o.id)}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      View Specs
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpanded(isExpanded ? null : o.id)
                      }
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                          Quick preview
                        </>
                      )}
                    </Button>

                    <div className="ml-auto flex items-center gap-2">
                      {nextAction && (
                        <Button
                          size="sm"
                          onClick={() => advance(o.id, nextAction.next)}
                        >
                          {nextAction.label}
                          <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="px-2">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openSpecs(o.id)}>
                            <FileText className="mr-2 h-4 w-4" />
                            View full specs
                          </DropdownMenuItem>
                          {o.customerPhone && (
                            <DropdownMenuItem asChild>
                              <a href={`tel:${o.customerPhone}`}>
                                <Phone className="mr-2 h-4 w-4" />
                                Call {o.customer}
                              </a>
                            </DropdownMenuItem>
                          )}
                          {o.customerEmail && (
                            <DropdownMenuItem asChild>
                              <a
                                href={`mailto:${o.customerEmail}?subject=Update%20on%20order%20${o.id}`}
                              >
                                Email customer
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {o.status !== "completed" &&
                            o.status !== "cancelled" && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmingCancel(o)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel order
                              </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Inline expand: quick preview */}
                  {isExpanded && (
                    <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 text-xs md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">
                          Line items
                        </p>
                        <p className="text-foreground">{o.product}</p>
                      </div>
                      {o.pincode && (
                        <div>
                          <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">
                            Ship to
                          </p>
                          <p className="text-foreground">
                            {o.customer} · {o.city ? `${o.city}, ` : ""}
                            <span className="font-mono">{o.pincode}</span>
                          </p>
                        </div>
                      )}
                      <div className="md:col-span-2">
                        <Button
                          size="sm"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => openSpecs(o.id)}
                        >
                          Open full specs &amp; download artwork →
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Specs dialog */}
      <Dialog
        open={details !== null || detailsLoading}
        onOpenChange={(open) => {
          if (!open) {
            setDetails(null);
            setDownloadError(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Order specs{" "}
              {details?.vendorOrder?.id ? `· ${details.vendorOrder.id}` : ""}
            </DialogTitle>
            <DialogDescription>
              Everything the customer chose at checkout, plus shipping info.
            </DialogDescription>
          </DialogHeader>

          {detailsLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading specs…
            </p>
          )}

          {details && (
            <div className="space-y-4">
              {details.customerOrder?.shipping && (
                <Card className="p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-primary" /> Ship to
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Name:</span>{" "}
                      <span className="font-medium">
                        {details.customerOrder.shipping.fullName}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>{" "}
                      {details.customerOrder.shipping.phone}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>{" "}
                      {details.customerOrder.shipping.email}
                    </div>
                    {details.customerOrder.shipping.company && (
                      <div>
                        <span className="text-muted-foreground">Company:</span>{" "}
                        {details.customerOrder.shipping.company}
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Address:</span>{" "}
                      {details.customerOrder.shipping.address}
                      {details.customerOrder.shipping.landmark
                        ? ` (${details.customerOrder.shipping.landmark})`
                        : ""}
                      , {details.customerOrder.shipping.city},{" "}
                      {details.customerOrder.shipping.state} —{" "}
                      <span className="font-mono">
                        {details.customerOrder.shipping.pincode}
                      </span>
                    </div>
                    {details.customerOrder.shipping.gstin && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">GSTIN:</span>{" "}
                        <span className="font-mono">
                          {details.customerOrder.shipping.gstin}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {details.customerOrder && (
                <Card className="p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <IndianRupee className="h-4 w-4 text-primary" /> Payment
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Method:</span>{" "}
                      <span className="font-medium">
                        {paymentMethodLabel(details.customerOrder.payment?.method)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <span className="font-medium capitalize">
                        {details.customerOrder.payment?.status ?? "paid"}
                      </span>
                    </div>
                    {details.customerOrder.payment?.reference && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Reference:</span>{" "}
                        <span className="font-mono">
                          {details.customerOrder.payment.reference}
                        </span>
                      </div>
                    )}
                    <div className="col-span-2 mt-1 border-t pt-2" />
                    <div>
                      <span className="text-muted-foreground">Subtotal:</span>{" "}
                      ₹{details.customerOrder.subtotal.toLocaleString()}
                    </div>
                    {(details.customerOrder.discount ?? 0) > 0 && (
                      <div>
                        <span className="text-muted-foreground">
                          Discount{details.customerOrder.couponCode ? ` (${details.customerOrder.couponCode})` : ""}:
                        </span>{" "}
                        −₹{details.customerOrder.discount!.toLocaleString()}
                      </div>
                    )}
                    <div className="col-span-2 font-semibold">
                      <span className="text-muted-foreground">Total paid:</span>{" "}
                      <span className="text-primary">
                        ₹{details.customerOrder.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </Card>
              )}

              {details.customerOrder?.items.length ? (
                details.customerOrder.items.map((item, idx) => (
                  <Card key={item.id ?? idx} className="p-4">
                    <div className="flex items-start gap-3">
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="h-16 w-16 rounded-md object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{item.product.name}</h4>
                          <span className="text-sm font-bold text-primary">
                            Qty {item.quantity}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.product.category} · base ₹
                          {item.product.basePrice} / 50
                        </p>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <SpecRow label="Size" value={item.size} />
                      <SpecRow label="Finish" value={item.finish || "—"} />
                      <SpecRow
                        label="Turnaround"
                        value={`${item.turnaround.label} (${item.turnaround.days}d, ×${item.turnaround.multiplier})`}
                      />
                      {item.customization?.printSides && (
                        <SpecRow
                          label="Print sides"
                          value={item.customization.printSides}
                        />
                      )}
                      {item.customization?.dimensions && (
                        <SpecRow
                          label="Dimensions"
                          value={`${item.customization.dimensions.width} × ${item.customization.dimensions.height} ${item.customization.dimensions.unit}`}
                        />
                      )}
                      {item.customization?.contactName && (
                        <SpecRow
                          label="Contact name"
                          value={item.customization.contactName}
                        />
                      )}
                      {item.customization?.contactPhone && (
                        <SpecRow
                          label="Contact"
                          value={item.customization.contactPhone}
                        />
                      )}
                      {item.customization?.notes && (
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Notes</dt>
                          <dd className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-foreground">
                            {item.customization.notes}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-3 rounded-lg border border-dashed border-primary/40 bg-primary-soft/40 p-3">
                      {item.artwork ? (
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {item.artwork.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatBytes(item.artwork.size)} ·{" "}
                              {item.artwork.type}
                            </div>
                          </div>
                          {item.artwork.id ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                triggerArtworkDownload(
                                  item.artwork!.id!,
                                  item.artwork!.name,
                                )
                              }
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" />{" "}
                              Download
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              file not uploaded
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No artwork uploaded for this item.
                        </p>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No detailed line items on file for this order.
                </p>
              )}

              {downloadError && (
                <p className="text-sm text-destructive">{downloadError}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog
        open={confirmingCancel !== null}
        onOpenChange={(open) => !open && setConfirmingCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingCancel && (
                <>
                  This will mark <b>{confirmingCancel.id}</b> for{" "}
                  <b>{confirmingCancel.customer}</b> as cancelled. The customer
                  will see the new status and any settlement for this order will
                  be reversed. You can&apos;t undo this from the vendor portal.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                confirmingCancel && void cancelOrder(confirmingCancel)
              }
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "muted" | "warning" | "success";
  onClick?: () => void;
}) {
  const toneClasses: Record<typeof tone, string> = {
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-foreground",
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border bg-card p-4 text-left transition-shadow ${onClick ? "hover:shadow-md" : "cursor-default"}`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        {onClick && (
          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}
