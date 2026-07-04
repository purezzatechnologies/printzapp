import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPayoutsFn, updatePayoutStatusFn } from "@/lib/backend";

export const Route = createFileRoute("/superadmin/payouts")({
  loader: async () => await getPayoutsFn(),
  component: Payouts,
});

function relativeDate(iso: string) {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function Payouts() {
  const initial = Route.useLoaderData() as Awaited<ReturnType<typeof getPayoutsFn>>;
  const [payouts, setPayouts] = useState(initial);

  const update = async (id: string, status: "approved" | "rejected" | "paid") => {
    const result = await updatePayoutStatusFn({ data: { id, status } });
    if (result.success) {
      setPayouts((current) =>
        current.map((p) => (p.id === id ? { ...p, status } : p)),
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Vendor Payout Queue</h2>
        <p className="text-sm text-muted-foreground">
          Approve, reject and settle vendor cash-outs
        </p>
      </div>
      <div className="space-y-3">
        {payouts.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            No payout requests yet.
          </Card>
        )}
        {payouts.map((p) => (
          <Card
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 p-5"
          >
            <div>
              <div className="font-semibold">{p.vendorName}</div>
              <div className="text-xs text-muted-foreground">
                {p.id} · Requested {relativeDate(p.requestedAt)}
              </div>
            </div>
            <div className="text-xl font-bold text-primary">
              ₹{p.amount.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={p.status === "pending" ? "default" : "secondary"}
                className="capitalize"
              >
                {p.status}
              </Badge>
              {p.status === "pending" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => update(p.id, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => update(p.id, "approved")}>
                    Approve
                  </Button>
                </>
              )}
              {p.status === "approved" && (
                <Button size="sm" onClick={() => update(p.id, "paid")}>
                  Mark Paid
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
