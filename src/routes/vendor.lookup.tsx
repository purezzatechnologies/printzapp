import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { lookupOrderFn } from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";
import { OrderDisputePanel } from "@/components/order-dispute-panel";

export const Route = createFileRoute("/vendor/lookup")({
  component: VendorLookup,
});

type LookupResult = Awaited<ReturnType<typeof lookupOrderFn>>;

function VendorLookup() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const search = async () => {
    const term = query.trim();
    if (!term) return;
    setBusy(true);
    setError(null);
    try {
      const res = await lookupOrderFn({ data: { query: term } });
      setResult(res);
      if (!res.found)
        setError("No order found among yours for that order number, payment reference, or tracking number.");
    } catch (err) {
      setError(getFriendlyError(err, "Lookup failed."));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Order Lookup</h2>
        <p className="text-sm text-muted-foreground">
          Find any of your orders by order number, payment reference or tracking number to see full details and respond to disputes.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
              placeholder="Order # (ORD-… / PZ-…), payment reference, or tracking number"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <Button className="h-11 rounded-xl" onClick={search} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Look up
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {result?.found && (
        <OrderDisputePanel result={result} onChanged={search} />
      )}
    </div>
  );
}
