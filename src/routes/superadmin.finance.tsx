import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { IndianRupee, TrendingUp, Wallet, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { getFinanceOverviewFn } from "@/lib/backend";

export const Route = createFileRoute("/superadmin/finance")({
  loader: async () => await getFinanceOverviewFn(),
  component: Finance,
});

function formatCurrency(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  return `₹${value.toLocaleString()}`;
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function Finance() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getFinanceOverviewFn>>;

  const tiles = [
    { label: "GMV", value: formatCurrency(data.metrics.gmv), icon: IndianRupee },
    {
      label: `Commission (${data.metrics.commissionPercent}%)`,
      value: formatCurrency(data.metrics.netRevenue),
      icon: TrendingUp,
    },
    {
      label: "Vendor Earnings",
      value: formatCurrency(data.metrics.vendorEarnings),
      icon: Wallet,
    },
    {
      label: "Disputed",
      value: formatCurrency(data.metrics.disputed),
      icon: AlertCircle,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Finance</h2>
        <p className="text-sm text-muted-foreground">
          GMV, payouts and reconciliation across all vendors
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="glass border-white/40 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <t.icon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-2xl font-bold">{t.value}</div>
            <div className="text-sm text-muted-foreground">{t.label}</div>
          </Card>
        ))}
      </div>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">
          Daily commission earned (₹ thousand)
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.weeklyRevenue.map((d) => ({
                ...d,
                revenue: Math.round(d.revenue * (data.metrics.commissionPercent / 100)),
              }))}
            >
              <XAxis dataKey="day" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "rgba(255,255,255,0.9)",
                }}
              />
              <Bar
                dataKey="revenue"
                fill="var(--primary)"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Upcoming payouts</h3>
        <div className="space-y-2">
          {data.upcomingPayouts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No payouts in the queue.
            </p>
          )}
          {data.upcomingPayouts.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-primary/6 p-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
                {p.vendorName.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{p.vendorName}</div>
                <div className="text-xs text-muted-foreground">
                  Requested {relativeDate(p.requestedAt)} · {p.status}
                </div>
              </div>
              <div className="text-sm font-bold">
                ₹{p.amount.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
