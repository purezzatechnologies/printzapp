import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Package,
  Search,
  CheckCircle2,
  Truck,
  PackageOpen,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { getMyOrdersFn } from "@/lib/backend";

export const Route = createFileRoute("/account/orders/")({
  loader: async () => await getMyOrdersFn(),
  component: OrdersList,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const statusBadge: Record<string, { label: string; cls: string; icon: typeof Package }> = {
  confirmed: {
    label: "Confirmed",
    cls: "bg-primary/10 text-primary",
    icon: CheckCircle2,
  },
  processing: {
    label: "In Production",
    cls: "bg-warning/15 text-warning",
    icon: PackageOpen,
  },
  dispatched: {
    label: "Dispatched",
    cls: "bg-indigo-100 text-indigo-700",
    icon: Truck,
  },
  delivered: {
    label: "Delivered",
    cls: "bg-success/15 text-success",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-destructive/15 text-destructive",
    icon: XCircle,
  },
};

function OrdersList() {
  const orders = Route.useLoaderData() as Awaited<ReturnType<typeof getMyOrdersFn>>;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "active" && (o.status === "delivered" || o.status === "cancelled"))
        return false;
      if (filter === "delivered" && o.status !== "delivered") return false;
      if (filter === "cancelled" && o.status !== "cancelled") return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.items.some((item) => item.product.name.toLowerCase().includes(q))
      );
    });
  }, [orders, filter, query]);

  const counts = useMemo(() => {
    return {
      all: orders.length,
      active: orders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled",
      ).length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
    };
  }, [orders]);

  if (orders.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <Package className="h-10 w-10 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-bold">No orders yet</h2>
          <p className="text-sm text-muted-foreground">
            Place your first order to start tracking it here.
          </p>
        </div>
        <Link to="/">
          <Button>Start designing</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">My Orders</h2>
        <p className="text-sm text-muted-foreground">
          {orders.length} {orders.length === 1 ? "order" : "orders"} on file.
        </p>
      </div>

      <Card className="p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by order ID or product…"
              className="h-10 rounded-xl pl-9"
            />
          </div>
        </div>
        <div className="-mb-1 mt-3 flex gap-1 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-base ${active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent"}`}
              >
                <span>{f.label}</span>
                <span
                  className={`min-w-[1.5rem] rounded-full px-1.5 text-center text-[11px] ${active ? "bg-primary-foreground/20" : "bg-muted text-foreground"}`}
                >
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            No orders match.
          </Card>
        )}
        {filtered.map((o) => {
          const badge = statusBadge[o.status] ?? statusBadge.confirmed;
          const Icon = badge.icon;
          const itemPreview = o.items.slice(0, 3);
          return (
            <Link
              key={o.id}
              to="/account/orders/$id"
              params={{ id: o.id }}
              className="group block"
            >
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex shrink-0 -space-x-2">
                    {itemPreview.length > 0 ? (
                      itemPreview.map((item, idx) => (
                        <img
                          key={idx}
                          src={item.artwork?.dataUrl || item.product.image}
                          alt=""
                          className="h-14 w-14 rounded-lg object-cover ring-2 ring-card"
                        />
                      ))
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    {o.items.length > 3 && (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-xs font-medium ring-2 ring-card">
                        +{o.items.length - 3}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {o.id}
                      </span>
                      <Badge className={`rounded-full ${badge.cls}`}>
                        <Icon className="mr-1 h-3 w-3" />
                        {badge.label}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold">
                      {o.items[0]?.product.name ?? "Order placed"}
                      {o.items.length > 1 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          +{o.items.length - 1} more line item
                          {o.items.length > 2 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Placed{" "}
                      {new Date(o.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {o.shipping?.pincode && (
                        <>
                          {" "}
                          · Ship to <span className="font-mono">{o.shipping.pincode}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">
                      ₹{o.total.toLocaleString()}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      View details
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
