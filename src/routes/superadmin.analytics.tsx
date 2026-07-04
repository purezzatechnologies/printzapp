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
  BarChart,
  Bar,
} from "recharts";
import { getAdminAnalyticsFn } from "@/lib/backend";

export const Route = createFileRoute("/superadmin/analytics")({
  loader: async () => await getAdminAnalyticsFn(),
  component: Analytics,
});

function formatCurrency(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  return `₹${value.toLocaleString()}`;
}

function Analytics() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getAdminAnalyticsFn>>;

  const tiles = [
    { label: "Customers", value: data.metrics.customers.toLocaleString() },
    { label: "Vendors", value: `${data.metrics.activeVendors} / ${data.metrics.vendors}` },
    { label: "Total orders", value: data.metrics.totalOrders.toLocaleString() },
    { label: "Total GMV", value: formatCurrency(data.metrics.totalGmv) },
    { label: "Avg order value", value: formatCurrency(data.metrics.avgOrderValue) },
    { label: "Conversion", value: `${data.metrics.conversionRate}%` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Traffic, conversion & funnel performance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="glass border-white/40 p-5">
            <div className="text-xs uppercase text-muted-foreground">{t.label}</div>
            <div className="mt-2 text-2xl font-bold">{t.value}</div>
          </Card>
        ))}
      </div>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Daily activity — sign-ups &amp; orders (last 7 days)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "rgba(255,255,255,0.9)",
                }}
              />
              <Line type="monotone" dataKey="visits" name="Sign-ups + orders" stroke="#185FA5" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="conv" name="Orders" stroke="#0C447C" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Top categories by quantity sold</h3>
        {data.topCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No category data yet — make some orders to populate this chart.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topCategories} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" stroke="#888" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#888" fontSize={12} width={140} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "rgba(255,255,255,0.9)",
                  }}
                />
                <Bar dataKey="qty" fill="var(--primary)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
