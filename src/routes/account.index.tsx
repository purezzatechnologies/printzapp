import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Package,
  Heart,
  Star,
  Gift,
  ArrowRight,
  ShoppingBag,
  MapPin,
  Sparkles,
  Truck,
  CheckCircle2,
  PackageOpen,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyAccountFn } from "@/lib/backend";

export const Route = createFileRoute("/account/")({
  loader: async () => await getMyAccountFn(),
  component: AccountDashboard,
});

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
    icon: Package,
  },
};

function formatCurrency(value: number) {
  return `₹${value.toLocaleString()}`;
}

function AccountDashboard() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getMyAccountFn>>;
  if (!data) return null;

  const tiles = [
    {
      label: "Total Orders",
      value: String(data.metrics.totalOrders),
      hint: data.metrics.activeOrders
        ? `${data.metrics.activeOrders} in progress`
        : "All caught up",
      icon: Package,
      tone: "bg-primary/10 text-primary",
      link: "/account/orders" as const,
    },
    {
      label: "Lifetime Spend",
      value: formatCurrency(data.metrics.totalSpend),
      hint: `${data.metrics.tier} tier`,
      icon: ShoppingBag,
      tone: "bg-success/15 text-success",
    },
    {
      label: "Loyalty Points",
      value: data.metrics.loyaltyPoints.toLocaleString(),
      hint: "1 point per ₹100 spent",
      icon: Star,
      tone: "bg-warning/15 text-warning",
    },
    {
      label: "Saved Designs",
      value: String(data.wishlist.length),
      hint: data.wishlist.length ? "In your wishlist" : "Save items you love",
      icon: Heart,
      tone: "bg-rose-100 text-rose-600",
      link: "/account/wishlist" as const,
    },
  ];

  return (
    <div className="space-y-8">
      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Inner = (
            <Card className="group flex h-full flex-col p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.tone}`}>
                  <t.icon className="h-5 w-5" />
                </div>
                {t.link && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                )}
              </div>
              <div className="mt-4 text-2xl font-bold">{t.value}</div>
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.hint}</div>
            </Card>
          );
          return t.link ? (
            <Link key={t.label} to={t.link}>
              {Inner}
            </Link>
          ) : (
            <div key={t.label}>{Inner}</div>
          );
        })}
      </div>

      {/* Quick actions */}
      <Card className="border-dashed bg-gradient-to-br from-primary/5 via-background to-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Quick actions
            </h2>
            <p className="text-sm text-muted-foreground">
              The fastest path to your next order.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/">
              <Button>
                <ShoppingBag className="mr-1.5 h-4 w-4" />
                Browse catalog
              </Button>
            </Link>
            <Link to="/account/orders">
              <Button variant="outline">
                <Package className="mr-1.5 h-4 w-4" />
                Track an order
              </Button>
            </Link>
            <Link to="/account/addresses">
              <Button variant="outline">
                <MapPin className="mr-1.5 h-4 w-4" />
                Manage addresses
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Recent orders */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Recent orders</h2>
            <p className="text-sm text-muted-foreground">
              Your most recent four print jobs.
            </p>
          </div>
          {data.recentOrders.length > 0 && (
            <Link
              to="/account/orders"
              className="text-sm font-semibold text-primary hover:underline"
            >
              View all →
            </Link>
          )}
        </div>

        {data.recentOrders.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Gift className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No orders yet</h3>
              <p className="text-sm text-muted-foreground">
                Place your first order to start tracking it here.
              </p>
            </div>
            <Link to="/">
              <Button>Start designing</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3">
            {data.recentOrders.map((o) => {
              const badge = statusBadge[o.status] ?? statusBadge.confirmed;
              const Icon = badge.icon;
              return (
                <Link
                  key={o.id}
                  to="/account/orders/$id"
                  params={{ id: o.id }}
                  className="group block"
                >
                  <Card className="p-4 transition-shadow hover:shadow-md">
                    <div className="flex flex-wrap items-center gap-4">
                      {o.items[0]?.product.image ? (
                        <img
                          src={o.items[0].product.image}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
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
                              +{o.items.length - 1} more
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">
                          {formatCurrency(o.total)}
                        </div>
                        <div className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          Track order →
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Wishlist preview */}
      {data.wishlist.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">From your wishlist</h2>
              <p className="text-sm text-muted-foreground">
                Designs you saved for later.
              </p>
            </div>
            <Link
              to="/account/wishlist"
              className="text-sm font-semibold text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {data.wishlist.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                to="/product/$slug"
                params={{ slug: p.slug }}
                className="group block"
              >
                <Card className="overflow-hidden p-0 transition-shadow group-hover:shadow-md">
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-1 text-sm font-semibold group-hover:text-primary">
                      {p.name}
                    </div>
                    <div className="mt-1 text-sm font-bold text-primary">
                      ₹{p.basePrice}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
