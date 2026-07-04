import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Store,
  Package,
  IndianRupee,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { getSuperAdminKPIsFn } from "@/lib/backend";

export const Route = createFileRoute("/superadmin/")({
  loader: async () => await getSuperAdminKPIsFn(),
  component: SuperAdminOverview,
});

const regions = [
  { region: "Mumbai", gmv: 142 },
  { region: "Bengaluru", gmv: 128 },
  { region: "Delhi NCR", gmv: 119 },
  { region: "Hyderabad", gmv: 88 },
  { region: "Pune", gmv: 71 },
  { region: "Chennai", gmv: 64 },
];

function formatCurrency(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  return `₹${value.toLocaleString()}`;
}

function SuperAdminOverview() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getSuperAdminKPIsFn>>;

  const kpis = [
    {
      label: "GMV (total)",
      value: formatCurrency(data.kpis.gmv),
      delta: "live",
      icon: IndianRupee,
    },
    {
      label: "Active Vendors",
      value: data.kpis.activeVendors.toLocaleString(),
      delta: "+",
      icon: Store,
    },
    {
      label: "Customers",
      value: data.kpis.customers.toLocaleString(),
      delta: "+",
      icon: Users,
    },
    {
      label: "Orders today",
      value: data.kpis.ordersToday.toLocaleString(),
      delta: "today",
      icon: Package,
    },
  ];

  const incidents = [
    { type: "Payment failure spike", scope: "Razorpay UPI · 09:42", level: "warn" },
    { type: "Vendor SLA breach", scope: "V-118 · Inkwell Press", level: "danger" },
    { type: "Coupon abuse detected", scope: "WELCOME50 · 14 accounts", level: "warn" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Platform Overview</h2>
          <p className="text-sm text-muted-foreground">
            Real-time pulse of the entire PRINTZAPP marketplace
          </p>
        </div>
        <Badge className="rounded-full bg-success/15 text-success border border-success/30">
          <Activity className="mr-1 h-3 w-3" /> All systems nominal
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="glass border-white/40 p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <k.icon className="h-5 w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                <TrendingUp className="h-3 w-3" /> {k.delta}
              </span>
            </div>
            <div className="mt-4 text-2xl font-bold">{k.value}</div>
            <div className="text-sm text-muted-foreground">{k.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue */}
        <Card className="glass border-white/40 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Platform GMV (last 7 days)</h3>
            <span className="text-xs text-muted-foreground">in ₹ thousands</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.weeklyRevenue.map((d) => ({ ...d, revenue: d.revenue * 18 }))}>
                <defs>
                  <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "rgba(255,255,255,0.9)",
                    backdropFilter: "blur(10px)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#gmv)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Status pie */}
        <Card className="glass border-white/40 p-5">
          <h3 className="mb-4 font-semibold">Order status mix</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.orderStatusBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.orderStatusBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Regions */}
        <Card className="glass border-white/40 p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Top regions by GMV (₹ lakh)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regions} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" stroke="#888" fontSize={12} />
                <YAxis
                  dataKey="region"
                  type="category"
                  stroke="#888"
                  fontSize={12}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "rgba(255,255,255,0.9)",
                  }}
                />
                <Bar dataKey="gmv" fill="var(--primary)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pending approvals */}
        <Card className="glass border-white/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Pending vendor approvals</h3>
            <Badge variant="secondary" className="rounded-full">
              {data.pendingVendors.length}
            </Badge>
          </div>
          <ul className="space-y-3">
            {data.pendingVendors.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No pending vendor applications.
              </li>
            )}
            {data.pendingVendors.map((v) => (
              <li
                key={v.id}
                className="rounded-2xl bg-primary/8 p-3 ring-1 ring-primary/20"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">{v.name}</div>
                  <span className="text-[11px] text-muted-foreground">
                    {v.appliedOn}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {v.city} · {v.services}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Incidents */}
      <Card className="glass border-white/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Live incidents & alerts
          </h3>
          <span className="text-xs text-muted-foreground">Auto-refresh · 30s</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {incidents.map((i) => (
            <div
              key={i.type}
              className={`rounded-2xl p-4 ring-1 ${i.level === "danger" ? "bg-destructive/10 ring-destructive/30" : "bg-warning/10 ring-warning/30"}`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle
                  className={`h-4 w-4 ${i.level === "danger" ? "text-destructive" : "text-warning"}`}
                />
                {i.type}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{i.scope}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
