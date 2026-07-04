import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Eye, X, KeyRound, ShieldCheck, Store, User } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteUserFn, adminResetPasswordFn, getAllUsersAdminFn } from "@/lib/backend";

export const Route = createFileRoute("/superadmin/users")({
  loader: async () => await getAllUsersAdminFn(),
  component: AllUsers,
});

type AppUserRow = Awaited<ReturnType<typeof getAllUsersAdminFn>>[number];
type RoleFilter = "all" | "customer" | "vendor" | "superadmin";

const roleMeta: Record<string, { label: string; icon: typeof User; className: string }> = {
  customer: { label: "Customer", icon: User, className: "bg-sky-500/10 text-sky-600" },
  vendor: { label: "Vendor", icon: Store, className: "bg-amber-500/10 text-amber-600" },
  superadmin: {
    label: "Super Admin",
    icon: ShieldCheck,
    className: "bg-primary/10 text-primary",
  },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function AllUsers() {
  const initial = Route.useLoaderData() as AppUserRow[];
  const [users, setUsers] = useState<AppUserRow[]>(initial);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [viewing, setViewing] = useState<AppUserRow | null>(null);
  const [resetting, setResetting] = useState<AppUserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => setUsers(await getAllUsersAdminFn());

  const counts = useMemo(
    () => ({
      all: users.length,
      customer: users.filter((u) => u.role === "customer").length,
      vendor: users.filter((u) => u.role === "vendor").length,
      superadmin: users.filter((u) => u.role === "superadmin").length,
    }),
    [users],
  );

  const filtered = useMemo(
    () =>
      users
        .filter((u) => (roleFilter === "all" ? true : u.role === roleFilter))
        .filter((u) =>
          [u.name, u.email, u.id, u.phone, u.city].some((field) =>
            (field ?? "").toLowerCase().includes(query.toLowerCase()),
          ),
        ),
    [users, roleFilter, query],
  );

  const remove = async (u: AppUserRow) => {
    if (
      !confirm(
        `Delete ${u.name} (${u.email})?\nThis permanently removes the account. Order history is kept but unlinked.`,
      )
    )
      return;
    setBusyId(u.id);
    try {
      const result = await adminDeleteUserFn({ data: { id: u.id } });
      if (!result.success) {
        toast.error(result.error ?? "Delete failed.");
        return;
      }
      toast.success(`Deleted ${u.name}.`);
      if (viewing?.id === u.id) setViewing(null);
      await refresh();
    } catch (err) {
      toast.error((err as Error)?.message ?? "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const submitReset = async () => {
    if (!resetting) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusyId(resetting.id);
    try {
      const result = await adminResetPasswordFn({
        data: { id: resetting.id, newPassword },
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not reset password.");
        return;
      }
      toast.success(`Password reset for ${resetting.name}.`);
      setResetting(null);
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error)?.message ?? "Could not reset password.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">All Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every account on the platform — customers, vendors and admins. View full details or remove
          accounts.
        </p>
      </div>

      {/* Stat cards double as role filters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { key: "all", label: "Total Users", value: counts.all },
            { key: "customer", label: "Customers", value: counts.customer },
            { key: "vendor", label: "Vendors", value: counts.vendor },
            { key: "superadmin", label: "Admins", value: counts.superadmin },
          ] as const
        ).map((c) => (
          <button key={c.key} onClick={() => setRoleFilter(c.key)} className="text-left">
            <Card
              className={`p-4 transition-colors ${
                roleFilter === c.key
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-primary/40"
              }`}
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-2xl font-bold">{c.value}</div>
            </Card>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, id, phone or city…"
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left font-semibold">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No users match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const meta = roleMeta[u.role] ?? roleMeta.customer;
                  const RoleIcon = meta.icon;
                  return (
                    <tr key={u.id} className="border-b transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                        >
                          <RoleIcon className="h-3 w-3" /> {meta.label}
                        </span>
                        {u.role === "vendor" && u.vendorStatus && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {u.vendorStatus}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{u.phone || "—"}</div>
                        <div className="text-xs">{u.city || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.role === "vendor" ? (
                          <span>{u.assignedOrders} assigned</span>
                        ) : (
                          <span>
                            {u.orderCount} orders · ₹{u.spend.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="View details"
                            onClick={() => setViewing(u)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Reset password"
                            onClick={() => {
                              setResetting(u);
                              setNewPassword("");
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title="Delete user"
                            disabled={busyId === u.id}
                            onClick={() => remove(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail modal */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewing(null)}
        >
          <Card className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{viewing.name}</h3>
                <p className="text-sm text-muted-foreground">{viewing.email}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setViewing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Detail label="User ID" value={viewing.id} mono />
              <Detail label="Role" value={roleMeta[viewing.role]?.label ?? viewing.role} />
              <Detail label="Phone" value={viewing.phone || "—"} />
              <Detail label="GSTIN" value={viewing.gstin || "—"} />
              <Detail label="City" value={viewing.city || "—"} />
              <Detail label="Joined" value={fmtDate(viewing.createdAt)} />
              {viewing.role === "vendor" ? (
                <>
                  <Detail label="Vendor status" value={viewing.vendorStatus ?? "—"} />
                  <Detail label="Assigned orders" value={String(viewing.assignedOrders)} />
                  <Detail label="Services" value={viewing.services || "—"} span />
                </>
              ) : (
                <>
                  <Detail label="Orders" value={String(viewing.orderCount)} />
                  <Detail label="Lifetime spend" value={`₹${viewing.spend.toLocaleString()}`} />
                  <Detail label="Saved addresses" value={String(viewing.addressCount)} />
                  <Detail label="Wishlist items" value={String(viewing.wishlistCount)} />
                </>
              )}
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResetting(viewing);
                  setNewPassword("");
                  setViewing(null);
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" /> Reset password
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => remove(viewing)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reset password modal */}
      {resetting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setResetting(null)}
        >
          <Card className="w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Reset password</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Set a new password for <span className="font-medium">{resetting.name}</span>.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium">New password</label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button disabled={busyId === resetting.id} onClick={submitReset}>
                Set password
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  span,
}: {
  label: string;
  value: string;
  mono?: boolean;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
