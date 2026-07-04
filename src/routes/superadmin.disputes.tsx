import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, RotateCcw, MessageSquareWarning } from "lucide-react";
import {
  getComplaintsFn,
  getRefundsFn,
  lookupOrderFn,
} from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";
import { OrderDisputePanel } from "@/components/order-dispute-panel";

export const Route = createFileRoute("/superadmin/disputes")({
  loader: async () => ({
    refunds: await getRefundsFn(),
    complaints: await getComplaintsFn(),
  }),
  component: Disputes,
});

type LookupResult = Awaited<ReturnType<typeof lookupOrderFn>>;

const refundBadge: Record<string, string> = {
  requested: "bg-warning/15 text-warning",
  approved: "bg-sky-100 text-sky-700",
  processing: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

function Disputes() {
  const initial = Route.useLoaderData() as {
    refunds: Awaited<ReturnType<typeof getRefundsFn>>;
    complaints: Awaited<ReturnType<typeof getComplaintsFn>>;
  };
  const [refunds, setRefunds] = useState(initial.refunds);
  const [complaints, setComplaints] = useState(initial.complaints);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const refreshLists = async () => {
    setRefunds(await getRefundsFn());
    setComplaints(await getComplaintsFn());
  };

  const search = async (q?: string) => {
    const term = (q ?? query).trim();
    if (!term) return;
    if (q) setQuery(q);
    setBusy(true);
    setError(null);
    try {
      const res = await lookupOrderFn({ data: { query: term } });
      setResult(res);
      if (!res.found) setError("No order found for that order number, payment reference, or tracking number.");
    } catch (err) {
      setError(getFriendlyError(err, "Lookup failed."));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const onPanelChanged = async () => {
    await search();
    await refreshLists();
  };

  const openComplaints = complaints.filter((c) => c.status !== "resolved");
  const activeRefunds = refunds.filter((r) => r.status !== "completed" && r.status !== "rejected");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dispute Center</h2>
        <p className="text-sm text-muted-foreground">
          Look up any order by order number, payment reference or tracking number — resolve complaints and manage refunds in one place.
        </p>
      </div>

      {/* Search */}
      <Card className="glass border-white/40 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
              placeholder="Order # (PZ-… / ORD-…), payment reference (pay_…), or tracking number"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <Button className="h-11 rounded-xl" onClick={() => search()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Look up
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {/* Result */}
      {result?.found && (
        <OrderDisputePanel result={result} onChanged={onPanelChanged} />
      )}

      {/* Monitoring lists */}
      {!result?.found && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass border-white/40 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <RotateCcw className="h-4 w-4 text-primary" /> Refund monitor
              <Badge variant="secondary">{activeRefunds.length} active</Badge>
            </h3>
            <div className="space-y-2">
              {refunds.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No refund activity yet.</p>
              )}
              {refunds.map((r) => (
                <button
                  key={r.orderId}
                  type="button"
                  onClick={() => search(r.orderId)}
                  className="flex w-full items-center gap-3 rounded-xl bg-primary/6 p-3 text-left transition-base hover:bg-primary/12"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-primary">{r.orderId}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.customerName} · {r.paymentMethod}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">₹{r.amount.toLocaleString()}</div>
                  <Badge className={`rounded-full capitalize ${refundBadge[r.status] ?? "bg-muted"}`}>
                    {r.status}
                  </Badge>
                </button>
              ))}
            </div>
          </Card>

          <Card className="glass border-white/40 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <MessageSquareWarning className="h-4 w-4 text-primary" /> Open complaints
              <Badge variant="secondary">{openComplaints.length}</Badge>
            </h3>
            <div className="space-y-2">
              {openComplaints.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No open complaints.</p>
              )}
              {openComplaints.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => search(c.orderId)}
                  className="flex w-full items-center gap-3 rounded-xl bg-primary/6 p-3 text-left transition-base hover:bg-primary/12"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-primary">{c.orderId}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.customerName} · {c.issue}
                    </div>
                  </div>
                  <Badge variant="secondary" className="capitalize">{c.status}</Badge>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
