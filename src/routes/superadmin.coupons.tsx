import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  deleteCouponFn,
  getCouponsFn,
  saveCouponFn,
} from "@/lib/backend";

export const Route = createFileRoute("/superadmin/coupons")({
  loader: async () => await getCouponsFn(),
  component: Coupons,
});

type Coupon = Awaited<ReturnType<typeof getCouponsFn>>[number];

function Coupons() {
  const initial = Route.useLoaderData() as Awaited<ReturnType<typeof getCouponsFn>>;
  const [coupons, setCoupons] = useState<Coupon[]>(initial);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    const next = await getCouponsFn();
    setCoupons(next);
  };

  const save = async (data: {
    code: string;
    type: string;
    description: string;
    minOrder: number;
    limit: number;
    status: "active" | "paused" | "expired";
  }) => {
    await saveCouponFn({ data });
    setEditing(null);
    setCreating(false);
    await refresh();
  };

  const remove = async (code: string) => {
    if (!confirm(`Delete coupon ${code}?`)) return;
    await deleteCouponFn({ data: { code } });
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Coupons</h2>
          <p className="text-sm text-muted-foreground">
            Manage discount codes across the marketplace
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="rounded-xl">
          <Plus className="mr-2 h-4 w-4" /> New Coupon
        </Button>
      </div>

      {(creating || editing) && (
        <CouponForm
          initial={editing ?? undefined}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={save}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {coupons.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3 p-10 text-center text-muted-foreground">
            No coupons configured.
          </Card>
        )}
        {coupons.map((c) => (
          <Card key={c.code} className="glass border-white/40 p-5">
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-primary-soft px-3 py-1 font-mono font-bold text-primary">
                {c.code}
              </div>
              <Badge
                variant={c.status === "active" ? "secondary" : "default"}
                className="capitalize"
              >
                {c.status}
              </Badge>
            </div>
            <div className="mt-3 text-lg font-semibold">{c.type}</div>
            <div className="text-xs text-muted-foreground">{c.description}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Min order: ₹{c.minOrder.toLocaleString()}
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${Math.min(100, (c.used / c.limit) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {c.used.toLocaleString()} / {c.limit.toLocaleString()} used
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(c)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => remove(c.code)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CouponForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Coupon;
  onCancel: () => void;
  onSave: (data: {
    code: string;
    type: string;
    description: string;
    minOrder: number;
    limit: number;
    status: "active" | "paused" | "expired";
  }) => void | Promise<void>;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [minOrder, setMinOrder] = useState(String(initial?.minOrder ?? 0));
  const [limit, setLimit] = useState(String(initial?.limit ?? 100));
  const [status, setStatus] = useState<"active" | "paused" | "expired">(
    initial?.status ?? "active",
  );

  return (
    <Card className="glass border-white/40 p-6">
      <h3 className="mb-4 font-semibold">
        {initial ? `Edit ${initial.code}` : "Create new coupon"}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME50"
            disabled={!!initial}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "active" | "paused" | "expired")
            }
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Type / discount</Label>
          <Input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="50% off (max ₹150)"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Welcome offer for new customers"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Minimum order (₹)</Label>
          <Input
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Usage limit</Label>
          <Input value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave({
              code,
              type,
              description,
              minOrder: Number(minOrder) || 0,
              limit: Number(limit) || 1,
              status,
            })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
