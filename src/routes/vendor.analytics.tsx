import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getVendorAnalyticsFn } from "@/lib/backend";

export const Route = createFileRoute("/vendor/analytics")({
  loader: async () => await getVendorAnalyticsFn(),
  component: VendorAnalytics,
});

function VendorAnalytics() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getVendorAnalyticsFn>>;
  const m = data.metrics;
  const hasVolume = data.monthlyVolume.some((v) => v.orders > 0);

  const cards = [
    { label: "Total Orders", value: String(m.totalOrders), sub: `${m.active} active` },
    { label: "Acceptance Rate", value: `${m.acceptanceRate}%`, sub: "assigned vs cancelled" },
    { label: "Fulfilment Rate", value: `${m.fulfilmentRate}%`, sub: "dispatched / completed" },
    { label: "Satisfaction", value: `${m.satisfaction}/5`, sub: "from complaint history" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Performance Analytics</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live metrics computed from your real orders — refreshes every visit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-sm text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-3xl font-bold text-primary">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-semibold">Monthly order volume</h3>
          <span
            className={`text-sm font-medium ${
              m.momGrowth >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {m.momGrowth >= 0 ? "▲" : "▼"} {Math.abs(m.momGrowth)}% MoM
          </span>
        </div>
        {hasVolume ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }} />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="#185FA5"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#185FA5" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
            <p>No orders yet in the last 6 months.</p>
            <p className="mt-1">Your volume trend appears here as orders come in.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
