import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { adminCreateCustomerFn } from "@/lib/backend";

export const Route = createFileRoute("/vendor/customers")({
  component: VendorCustomers,
});

type Added = { id: string; name: string; email: string };

function VendorCustomers() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<Added[]>([]);

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Enter a name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email.");
    if (password.trim().length < 8) return toast.error("Password must be at least 8 characters.");
    setSaving(true);
    try {
      const result = await adminCreateCustomerFn({
        data: { name: name.trim(), email: email.trim(), password: password.trim(), phone: phone.trim() },
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not create customer.");
        return;
      }
      toast.success(`Customer ${result.name} created.`);
      setAdded((cur) => [{ id: result.id, name: result.name, email: result.email }, ...cur]);
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Customers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Onboard a walk-in or repeat client by creating their account.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <UserPlus className="h-5 w-5 text-primary" /> Add a customer
          </h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Starting password *</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <Button className="w-full rounded-xl" onClick={submit} disabled={saving}>
              {saving ? "Creating…" : "Create customer"}
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            The customer signs in at the public login page with this email and password, then can place orders normally.
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 font-semibold">Added this session ({added.length})</h3>
          {added.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
              Customers you add will appear here.
            </div>
          ) : (
            <ul className="space-y-2">
              {added.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl bg-primary/6 p-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
