import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, IndianRupee, TrendingUp, Wallet } from "lucide-react";
import {
  getVendorFinanceFn,
  requestPayoutFn,
} from "@/lib/backend";

export const Route = createFileRoute("/vendor/finance")({
  loader: async () => await getVendorFinanceFn(),
  component: VendorFinance,
});

function VendorFinance() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getVendorFinanceFn>>;
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [amount, setAmount] = useState(String(data.available));
  const [confirmation, setConfirmation] = useState("");

  const submitPayout = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setConfirmation("Please enter a valid amount.");
      return;
    }
    const result = await requestPayoutFn({ data: { amount: value } });
    if (!result.success) {
      setConfirmation(result.error ?? "Could not submit payout request.");
      return;
    }
    setConfirmation(`Payout request for ₹${value.toLocaleString()} submitted.`);
    setShowPayoutForm(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Financial Management</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Net Earnings",
            value: `₹${data.metrics.total.toLocaleString()}`,
            sub: `after ${data.metrics.commissionPercent}% commission`,
            icon: IndianRupee,
            color: "bg-success/15 text-success",
          },
          {
            label: "Gross Sales",
            value: `₹${data.metrics.gross.toLocaleString()}`,
            sub: `commission −₹${data.metrics.commission.toLocaleString()}`,
            icon: TrendingUp,
            color: "bg-primary/10 text-primary",
          },
          {
            label: "This Month",
            value: `₹${data.metrics.thisMonth.toLocaleString()}`,
            sub: "net of commission",
            icon: TrendingUp,
            color: "bg-primary/10 text-primary",
          },
          {
            label: "Pending Settlement",
            value: `₹${data.metrics.pendingSettlement.toLocaleString()}`,
            sub: "in payout queue",
            icon: Wallet,
            color: "bg-warning/15 text-warning",
          },
        ].map((m) => (
          <Card key={m.label} className="p-5">
            <div
              className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${m.color}`}
            >
              <m.icon className="h-5 w-5" />
            </div>
            <div className="text-2xl font-bold">{m.value}</div>
            <div className="text-sm text-muted-foreground">{m.label}</div>
            {m.sub && <div className="text-xs text-muted-foreground/80">{m.sub}</div>}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Transaction history</h3>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export GST Report
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Txn ID</th>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Gross</th>
                  <th>Commission</th>
                  <th>Net</th>
                  <th>Status</th>
                  <th>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {data.txns.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No transactions yet.
                    </td>
                  </tr>
                )}
                {data.txns.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-3 font-mono text-xs">{t.id}</td>
                    <td className="font-mono text-xs">{t.order}</td>
                    <td>{t.date}</td>
                    <td>₹{t.amount.toLocaleString()}</td>
                    <td className="text-destructive">−₹{t.commission.toLocaleString()}</td>
                    <td className="font-semibold text-success">
                      ₹{t.net.toLocaleString()}
                    </td>
                    <td>
                      <Badge
                        variant={t.status === "settled" ? "secondary" : "default"}
                        className="capitalize"
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td>
                      <Button variant="ghost" size="sm">
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold">Request Payout</h3>
          <p className="mt-2 text-sm text-muted-foreground">Available balance</p>
          <div className="mt-1 text-3xl font-bold text-primary">
            ₹{data.available.toLocaleString()}
          </div>
          {showPayoutForm ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Amount (₹)</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPayoutForm(false)}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={submitPayout}>
                  Confirm
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="mt-4 w-full"
              onClick={() => setShowPayoutForm(true)}
            >
              Request Payout
            </Button>
          )}
          {confirmation && (
            <p className="mt-3 text-xs text-muted-foreground">{confirmation}</p>
          )}
          <div className="mt-4 text-xs text-muted-foreground">
            Settlements processed within 3 business days.
          </div>
        </Card>
      </div>
    </div>
  );
}
