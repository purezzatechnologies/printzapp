import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, IndianRupee, Clock, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { orderStatusBreakdown } from "@/lib/data";
import { getVendorDashboardFn } from "@/lib/backend";

export const Route = createFileRoute("/vendor/")({
  loader: async () => await getVendorDashboardFn(),
  component: VendorDashboard,
});

function VendorDashboard() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getVendorDashboardFn>>;

  const metrics = [
    {
      label: "Today's Orders",
      value: String(data.metrics.todaysOrders),
      trend: "live",
      icon: TrendingUp,
      color:
        "glass-tint text-primary-foreground shadow-[0_8px_20px_-8px_oklch(0.52_0.16_248)]",
    },
    {
      label: "Today's Revenue",
      value: `₹${data.metrics.todaysRevenue.toLocaleString()}`,
      trend: "live",
      icon: IndianRupee,
      color:
        "glass bg-success/20 text-success border border-success/30 shadow-sm",
    },
    {
      label: "Pending",
      value: String(data.metrics.pending),
      trend: "—",
      icon: Clock,
      color:
        "glass bg-warning/20 text-warning border border-warning/30 shadow-sm",
    },
    {
      label: "Completed",
      value: String(data.metrics.completed),
      trend: "lifetime",
      icon: CheckCircle2,
      color:
        "glass-tint text-primary-foreground shadow-[0_8px_20px_-8px_oklch(0.52_0.16_248)]",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Good morning, {data.vendorName} 👋</h2>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card
            key={m.label}
            className="p-5 glass-subtle border-white/40 shadow-[0_12px_44px_-22px_oklch(0.5_0.16_248_/_0.2)] hover:shadow-[0_16px_50px_-20px_oklch(0.5_0.16_248_/_0.3)] transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.color}`}
              >
                <m.icon className="h-5 w-5" />
              </div>
              <Badge variant="secondary">{m.trend}</Badge>
            </div>
            <div className="mt-4 text-2xl font-bold">{m.value}</div>
            <div className="text-sm text-muted-foreground">{m.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2 glass-subtle border-white/40 shadow-[0_12px_44px_-22px_oklch(0.5_0.16_248_/_0.2)]">
          <h3 className="font-semibold">Weekly revenue</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeklyRevenue}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `₹${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border:
                      "1px solid color-mix(in oklab, white 60%, oklch(0.65 0.12 244) 40%)",
                    background:
                      "color-mix(in oklab, var(--color-surface) 90%, transparent 10%)",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 10px 30px -10px oklch(0.4 0.08 245 / 0.2)",
                  }}
                  itemStyle={{
                    color: "var(--color-primary)",
                    fontWeight: "bold",
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill="url(#colorRevenue)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 glass-subtle border-white/40 shadow-[0_12px_44px_-22px_oklch(0.5_0.16_248_/_0.2)]">
          <h3 className="font-semibold">Order status</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={orderStatusBreakdown}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                >
                  {orderStatusBreakdown.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border:
                      "1px solid color-mix(in oklab, white 60%, oklch(0.65 0.12 244) 40%)",
                    background:
                      "color-mix(in oklab, var(--color-surface) 90%, transparent 10%)",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 10px 30px -10px oklch(0.4 0.08 245 / 0.2)",
                  }}
                  itemStyle={{ fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5 glass-subtle border-white/40 shadow-[0_12px_44px_-22px_oklch(0.5_0.16_248_/_0.2)]">
        <h3 className="mb-4 font-semibold">Recent orders</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Order</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No orders yet.
                  </td>
                </tr>
              )}
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="py-3 font-mono text-xs">{o.id}</td>
                  <td>{o.customer}</td>
                  <td className="text-muted-foreground">{o.product}</td>
                  <td className="font-semibold">
                    ₹{o.amount.toLocaleString()}
                  </td>
                  <td>
                    <Badge variant="secondary" className="capitalize">
                      {o.status.replace("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
