import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Pencil, KeyRound, Trash2, Eye, X, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  adminCreateCustomerFn,
  adminDeleteUserFn,
  adminResetPasswordFn,
  adminUpdateCustomerFn,
  getCustomerDetailFn,
  getCustomersFn,
} from "@/lib/backend";

export const Route = createFileRoute("/superadmin/customers")({
  loader: async () => await getCustomersFn(),
  component: Customers,
});

type Customer = Awaited<ReturnType<typeof getCustomersFn>>[number];
type CustomerDetail = Awaited<ReturnType<typeof getCustomerDetailFn>>;

function Customers() {
  const initial = Route.useLoaderData() as Customer[];
  const [customers, setCustomers] = useState<Customer[]>(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [resetting, setResetting] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<CustomerDetail | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = async () => setCustomers(await getCustomersFn());

  const filtered = useMemo(
    () =>
      customers.filter((c) =>
        [c.name, c.email, c.id].some((field) =>
          field.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    [customers, query],
  );

  const view = async (id: string) => {
    try {
      const detail = await getCustomerDetailFn({ data: { id } });
      setViewing(detail);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load customer.");
    }
  };

  const remove = async (c: Customer) => {
    if (!confirm(`Delete ${c.name}? This removes their account and orders link.`)) return;
    const result = await adminDeleteUserFn({ data: { id: c.id } });
    if (!result.success) {
      toast.error(result.error ?? "Delete failed.");
      return;
    }
    toast.success("Customer deleted.");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Customers</h2>
          <p className="text-sm text-muted-foreground">
            {customers.length} registered shoppers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers..."
              className="h-10 w-64 rounded-xl bg-white/60 pl-9 backdrop-blur"
            />
          </div>
          <Button className="h-10 rounded-xl" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      <Card className="glass border-white/40 p-5">
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No customers match that search.
            </p>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/6 p-3 transition-base hover:bg-primary/12"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                {c.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.email} · {c.id}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Orders
                <br />
                <span className="font-semibold text-foreground">{c.orders}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Spend
                <br />
                <span className="font-semibold text-foreground">
                  ₹{c.spend.toLocaleString()}
                </span>
              </div>
              <Badge
                className={`rounded-full ${c.tier === "Gold" ? "bg-warning/15 text-warning border border-warning/30" : c.tier === "Silver" ? "bg-muted text-foreground" : "bg-accent text-accent-foreground"}`}
              >
                {c.tier}
              </Badge>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => view(c.id)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> View
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setEditing(c)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setResetting(c)}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> Reset
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-destructive" onClick={() => remove(c)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {editing && (
        <EditCustomer
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => setResetting(null)}
        />
      )}
      {viewing && (
        <ViewCustomer detail={viewing} onClose={() => setViewing(null)} />
      )}
      {adding && (
        <AddCustomer
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function AddCustomer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

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
      toast.success(`Customer ${name} created.`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add new customer" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
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
      </div>
      <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        The customer can sign in at the public login page with this email and password.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create customer"}</Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </Card>
    </div>
  );
}

function EditCustomer({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await adminUpdateCustomerFn({
        data: { id: customer.id, name, email, phone, gstin },
      });
      if (!result.success) {
        toast.error(result.error ?? "Save failed.");
        return;
      }
      toast.success("Customer updated.");
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Edit ${customer.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>GSTIN (optional)</Label>
          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Save</Button>
      </div>
    </ModalShell>
  );
}

function ResetPassword({
  user,
  onClose,
  onSaved,
}: {
  user: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      const result = await adminResetPasswordFn({
        data: { id: user.id, newPassword: password },
      });
      if (!result.success) {
        toast.error(result.error ?? "Reset failed.");
        return;
      }
      toast.success(`Password reset for ${user.name}.`);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Reset password — ${user.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">
        Choose a new temporary password. Share it with the customer over a secure channel.
      </p>
      <div className="space-y-1.5">
        <Label>New password</Label>
        <Input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Reset</Button>
      </div>
    </ModalShell>
  );
}

function ViewCustomer({
  detail,
  onClose,
}: {
  detail: CustomerDetail;
  onClose: () => void;
}) {
  return (
    <ModalShell title={detail.profile.name} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <div className="font-medium">{detail.profile.email}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <div className="font-medium">{detail.profile.phone || "—"}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">GSTIN</Label>
            <div className="font-medium">{detail.profile.gstin || "—"}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Member since</Label>
            <div className="font-medium">
              {new Date(detail.profile.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Addresses</Label>
            <div className="font-medium">{detail.profile.addressCount}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Wishlist</Label>
            <div className="font-medium">{detail.profile.wishlistCount}</div>
          </div>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs uppercase text-muted-foreground">Orders</div>
          {detail.orders.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {detail.orders.map((o) => (
                <li key={o.id} className="flex justify-between rounded-lg bg-muted/40 p-2 text-xs">
                  <span className="font-mono">{o.id}</span>
                  <span>{o.itemCount} items</span>
                  <span className="capitalize">{o.status}</span>
                  <span className="font-semibold">₹{o.total.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 text-right text-xs text-muted-foreground">
            Lifetime spend{" "}
            <span className="ml-1 font-semibold text-foreground">
              ₹{detail.spend.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </ModalShell>
  );
}
