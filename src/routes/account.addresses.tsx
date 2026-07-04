import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import {
  deleteAddressFn,
  getMyAddressesFn,
  saveAddressFn,
} from "@/lib/backend";

export const Route = createFileRoute("/account/addresses")({
  loader: async () => await getMyAddressesFn(),
  component: AddressesPage,
});

type Address = Awaited<ReturnType<typeof getMyAddressesFn>>[number];
type FormState = Omit<Address, "id" | "isDefault"> & {
  id?: string;
  isDefault: boolean;
};

const emptyForm = (): FormState => ({
  label: "Home",
  fullName: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  isDefault: false,
});

function AddressesPage() {
  const initial = Route.useLoaderData() as Address[];
  const [addresses, setAddresses] = useState<Address[]>(initial);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Address | null>(null);

  const startCreate = () => {
    setEditing({
      ...emptyForm(),
      isDefault: addresses.length === 0,
    });
    setError(null);
  };

  const startEdit = (a: Address) => {
    setEditing({
      id: a.id,
      label: a.label,
      fullName: a.fullName,
      phone: a.phone,
      address: a.address,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      landmark: a.landmark ?? "",
      isDefault: a.isDefault,
    });
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    if (!/^\d{6}$/.test(editing.pincode)) {
      setError("Pincode must be a 6-digit number.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveAddressFn({ data: editing });
      if (!result.success || !result.addresses) {
        setError(result.error ?? "Could not save address.");
        return;
      }
      setAddresses(result.addresses);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const result = await deleteAddressFn({ data: { id } });
    if (result.success && result.addresses) {
      setAddresses(result.addresses);
    }
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Addresses</h2>
          <p className="text-sm text-muted-foreground">
            Save delivery addresses to make checkout faster.
          </p>
        </div>
        {!editing && (
          <Button onClick={startCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add new address
          </Button>
        )}
      </div>

      {editing && (
        <Card className="p-6">
          <h3 className="font-semibold">
            {editing.id ? "Edit address" : "New address"}
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1 block">Label</Label>
              <Input
                value={editing.label}
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
                placeholder="Home / Office / Warehouse"
              />
            </div>
            <div>
              <Label className="mb-1 block">Full name</Label>
              <Input
                value={editing.fullName}
                onChange={(e) =>
                  setEditing({ ...editing, fullName: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-1 block">Phone</Label>
              <Input
                value={editing.phone}
                onChange={(e) =>
                  setEditing({ ...editing, phone: e.target.value })
                }
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <Label className="mb-1 block">Pincode</Label>
              <Input
                value={editing.pincode}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    pincode: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block">Street address</Label>
              <textarea
                className="min-h-[60px] w-full rounded-lg border bg-background p-3 text-sm"
                value={editing.address}
                onChange={(e) =>
                  setEditing({ ...editing, address: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-1 block">City</Label>
              <Input
                value={editing.city}
                onChange={(e) =>
                  setEditing({ ...editing, city: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-1 block">State</Label>
              <Input
                value={editing.state}
                onChange={(e) =>
                  setEditing({ ...editing, state: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block">Landmark (optional)</Label>
              <Input
                value={editing.landmark ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, landmark: e.target.value })
                }
              />
            </div>
            <label className="md:col-span-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.isDefault}
                onChange={(e) =>
                  setEditing({ ...editing, isDefault: e.target.checked })
                }
                className="h-4 w-4"
              />
              Set as default delivery address
            </label>
          </div>
          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save address"}
            </Button>
          </div>
        </Card>
      )}

      {addresses.length === 0 && !editing && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">No addresses saved yet</h3>
            <p className="text-sm text-muted-foreground">
              Add your delivery details once — we&apos;ll auto-fill them at
              checkout.
            </p>
          </div>
          <Button onClick={startCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add address
          </Button>
        </Card>
      )}

      {addresses.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {addresses.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="rounded-full font-semibold"
                    >
                      {a.label}
                    </Badge>
                    {a.isDefault && (
                      <Badge className="rounded-full bg-success/15 text-success">
                        <Star className="mr-1 h-3 w-3 fill-current" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 font-semibold">{a.fullName}</div>
                  <div className="text-sm text-muted-foreground">
                    {a.address}
                    {a.landmark && ` (${a.landmark})`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {a.city}, {a.state} —{" "}
                    <span className="font-mono">{a.pincode}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Phone: {a.phone}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(a)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  This will permanently remove the &ldquo;{confirmDelete.label}
                  &rdquo; address. You can always add it again later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep address</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) void remove(confirmDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
