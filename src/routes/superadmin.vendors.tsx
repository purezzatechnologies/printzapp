import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Pencil,
  PauseCircle,
  PlayCircle,
  Trash2,
  KeyRound,
  X,
  Plus,
  Upload,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminCreateVendorFn,
  adminDeleteUserFn,
  adminResetPasswordFn,
  adminUpdateVendorFn,
  approveVendorFn,
  getVendorDetailFn,
  getVendorNetworkFn,
  rejectVendorFn,
  setVendorStatusFn,
} from "@/lib/backend";

export const Route = createFileRoute("/superadmin/vendors")({
  loader: async () => await getVendorNetworkFn(),
  component: VendorNetwork,
});

type Network = Awaited<ReturnType<typeof getVendorNetworkFn>>;
type ActiveVendor = Network["active"][number];
type PendingVendor = Network["pending"][number];
type VendorDetail = Awaited<ReturnType<typeof getVendorDetailFn>>;

function VendorNetwork() {
  const initial = Route.useLoaderData() as Network;
  const [pending, setPending] = useState(initial.pending);
  const [activeVendors, setActiveVendors] = useState(initial.active);
  const [query, setQuery] = useState("");
  const [reviewing, setReviewing] = useState<VendorDetail | null>(null);
  const [editing, setEditing] = useState<VendorDetail | null>(null);
  const [resetting, setResetting] = useState<ActiveVendor | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    const next = await getVendorNetworkFn();
    setPending(next.pending);
    setActiveVendors(next.active);
  };

  const filteredPending = useMemo(
    () =>
      pending.filter((v) =>
        [v.name, v.city, v.services].some((field) =>
          field?.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    [pending, query],
  );

  const filteredActive = useMemo(
    () =>
      activeVendors.filter((v) =>
        [v.name, v.city, v.id].some((field) =>
          field?.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    [activeVendors, query],
  );

  const approve = async (id: string) => {
    await approveVendorFn({ data: { id } });
    toast.success("Vendor approved.");
    await refresh();
  };

  const reject = async (id: string) => {
    await rejectVendorFn({ data: { id } });
    toast.success("Vendor rejected.");
    await refresh();
  };

  const review = async (id: string) => {
    try {
      const detail = await getVendorDetailFn({ data: { id } });
      setReviewing(detail);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load vendor.");
    }
  };

  const edit = async (id: string) => {
    try {
      const detail = await getVendorDetailFn({ data: { id } });
      setEditing(detail);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load vendor.");
    }
  };

  const setStatus = async (id: string, status: "active" | "warning" | "suspended") => {
    const result = await setVendorStatusFn({ data: { id, status } });
    if (!result.success) {
      toast.error(result.error ?? "Update failed.");
      return;
    }
    toast.success(`Vendor marked ${status}.`);
    await refresh();
  };

  const remove = async (v: ActiveVendor) => {
    if (!confirm(`Delete vendor ${v.name}? Their orders will be unassigned.`)) return;
    const result = await adminDeleteUserFn({ data: { id: v.id } });
    if (!result.success) {
      toast.error(result.error ?? "Delete failed.");
      return;
    }
    toast.success("Vendor deleted.");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Vendor Network</h2>
          <p className="text-sm text-muted-foreground">Approve, monitor & manage your print partners</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors..." className="h-10 w-64 rounded-xl bg-white/60 pl-9 backdrop-blur" />
          </div>
          <Button className="h-10 rounded-xl" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Vendor
          </Button>
        </div>
      </div>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Pending approvals ({filteredPending.length})</h3>
        <div className="space-y-3">
          {filteredPending.length === 0 && (
            <p className="text-sm text-muted-foreground">No vendor applications pending.</p>
          )}
          {filteredPending.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/6 p-4 ring-1 ring-primary/20">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold">{v.name.charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{v.name}</div>
                <div className="text-xs text-muted-foreground">{v.city} · {v.services}</div>
              </div>
              <span className="text-xs text-muted-foreground">Applied {v.appliedOn}</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="rounded-lg bg-primary/10" onClick={() => review(v.id)}><Eye className="mr-1 h-3.5 w-3.5" />Review</Button>
                <Button size="sm" variant="outline" className="rounded-lg bg-primary/10 text-destructive" onClick={() => reject(v.id)}><XCircle className="mr-1 h-3.5 w-3.5" />Reject</Button>
                <Button size="sm" className="rounded-lg" onClick={() => approve(v.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Active vendors ({filteredActive.length})</h3>
        <div className="space-y-2">
          {filteredActive.length === 0 && (
            <p className="text-sm text-muted-foreground">No matching vendors.</p>
          )}
          {filteredActive.map((v) => (
            <div key={v.id} className="flex flex-col gap-2 rounded-xl bg-primary/6 p-3 hover:bg-primary/12 transition-base">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">{v.name.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{v.name} <span className="text-xs font-normal text-muted-foreground">· {v.id}</span></div>
                  <div className="text-xs text-muted-foreground">{v.city}</div>
                </div>
                <div className="hidden text-xs text-muted-foreground md:block">Orders<br /><span className="font-semibold text-foreground">{v.orders}</span></div>
                <div className="hidden text-xs text-muted-foreground md:block">Rating<br /><span className="font-semibold text-foreground">{v.rating.toFixed(1)} ★</span></div>
                <div className="text-xs text-muted-foreground">GMV<br /><span className="font-semibold text-foreground">{v.gmv}</span></div>
                {v.panIndia ? (
                  <Badge className="rounded-full bg-primary/15 text-primary border border-primary/30">Pan India</Badge>
                ) : (
                  <Badge className="rounded-full bg-muted text-foreground">
                    {v.pincodeCount} pincode{v.pincodeCount === 1 ? "" : "s"}
                  </Badge>
                )}
                <Badge className={`rounded-full ${v.status === "warning" ? "bg-warning/15 text-warning border border-warning/30" : v.status === "suspended" ? "bg-destructive/15 text-destructive border border-destructive/30" : "bg-success/15 text-success border border-success/30"}`}>{v.status === "warning" ? "Watch" : v.status === "suspended" ? "Suspended" : "Healthy"}</Badge>
              </div>
              {!v.panIndia && v.pincodes.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-13">
                  {v.pincodes.map((p) => (
                    <span key={p} className="rounded-md bg-white/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {p}
                    </span>
                  ))}
                  {v.pincodeCount > v.pincodes.length && (
                    <span className="text-[10px] text-muted-foreground">
                      +{v.pincodeCount - v.pincodes.length} more
                    </span>
                  )}
                </div>
              )}
              {!v.panIndia && v.pincodeCount === 0 && (
                <p className="pl-13 text-[10px] text-warning">
                  No serviceable pincodes — vendor can&apos;t receive orders.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => review(v.id)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Details
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => edit(v.id)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setResetting(v)}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> Reset password
                </Button>
                {v.status === "suspended" ? (
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-success" onClick={() => setStatus(v.id, "active")}>
                    <PlayCircle className="mr-1 h-3.5 w-3.5" /> Reactivate
                  </Button>
                ) : (
                  <>
                    {v.status !== "warning" && (
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-warning" onClick={() => setStatus(v.id, "warning")}>
                        <PauseCircle className="mr-1 h-3.5 w-3.5" /> Watch
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-destructive" onClick={() => setStatus(v.id, "suspended")}>
                      <PauseCircle className="mr-1 h-3.5 w-3.5" /> Suspend
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-destructive" onClick={() => remove(v)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {reviewing && (
        <VendorDetailModal
          detail={reviewing}
          onClose={() => setReviewing(null)}
          onEdit={() => {
            setEditing(reviewing);
            setReviewing(null);
          }}
        />
      )}
      {editing && (
        <EditVendor
          detail={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {resetting && (
        <ResetVendorPassword
          vendor={resetting}
          onClose={() => setResetting(null)}
        />
      )}
      {adding && (
        <AddVendor
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

function VendorDetailModal({
  detail,
  onClose,
  onEdit,
}: {
  detail: VendorDetail;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <ModalShell title={detail.profile.name} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="font-medium capitalize">{detail.profile.status}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">City</Label>
            <div className="font-medium">{detail.profile.city || "—"}</div>
          </div>
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
            <Label className="text-xs text-muted-foreground">Services</Label>
            <div className="font-medium">{detail.profile.services || "—"}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Orders</Label>
            <div className="font-medium">{detail.orderCount}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Order value</Label>
            <div className="font-medium">₹{detail.orderValue.toLocaleString()}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Coverage</Label>
            <div className="font-medium">
              {detail.panIndia ? "Pan India" : `${detail.pincodes.length} pincode${detail.pincodes.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Joined</Label>
            <div className="font-medium">
              {new Date(detail.profile.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        {detail.documents && detail.documents.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">Compliance documents</div>
            <ul className="mt-2 space-y-1.5">
              {detail.documents.map((d, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{d.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <a href={d.dataUrl} download={d.name} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                    View
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.payouts.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs uppercase text-muted-foreground">Recent payouts</div>
            <ul className="mt-2 space-y-1.5">
              {detail.payouts.slice(0, 4).map((p) => (
                <li key={p.id} className="flex justify-between rounded-lg bg-muted/40 p-2 text-xs">
                  <span className="font-mono">{p.id}</span>
                  <span className="capitalize">{p.status}</span>
                  <span className="font-semibold">₹{p.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={onEdit}>Edit vendor</Button>
      </div>
    </ModalShell>
  );
}

function EditVendor({
  detail,
  onClose,
  onSaved,
}: {
  detail: VendorDetail;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(detail.profile.name);
  const [email, setEmail] = useState(detail.profile.email);
  const [phone, setPhone] = useState(detail.profile.phone);
  const [gstin, setGstin] = useState(detail.profile.gstin);
  const [city, setCity] = useState(detail.profile.city);
  const [services, setServices] = useState(detail.profile.services);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await adminUpdateVendorFn({
        data: { id: detail.profile.id, name, email, phone, gstin, city, services },
      });
      if (!result.success) {
        toast.error(result.error ?? "Save failed.");
        return;
      }
      toast.success("Vendor updated.");
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Edit ${detail.profile.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Business name</Label>
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
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>GSTIN</Label>
          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Services</Label>
          <Input value={services} onChange={(e) => setServices(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Save</Button>
      </div>
    </ModalShell>
  );
}

function ResetVendorPassword({
  vendor,
  onClose,
}: {
  vendor: ActiveVendor;
  onClose: () => void;
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
        data: { id: vendor.id, newPassword: password },
      });
      if (!result.success) {
        toast.error(result.error ?? "Reset failed.");
        return;
      }
      toast.success(`Password reset for ${vendor.name}.`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Reset password — ${vendor.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">
        Set a new password and share it with the vendor over a secure channel.
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

type NewDoc = { name: string; kind: string; dataUrl: string };
const DOC_KINDS = [
  "GST Certificate",
  "PAN Card",
  "Address Proof",
  "Cancelled Cheque",
  "MSME / Udyam",
  "Other",
];

function AddVendor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [f, setF] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    city: "",
    services: "",
    gstin: "",
    pan: "",
    businessType: "Proprietorship",
    pincodes: "",
    panIndia: false,
    status: "active" as "active" | "pending",
  });
  const [documents, setDocuments] = useState<NewDoc[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingKind, setPendingKind] = useState("GST Certificate");

  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));

  const onFiles = async (files: FileList | null, kind: string) => {
    if (!files?.length) return;
    const read = (file: File) =>
      new Promise<NewDoc>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({ name: file.name, kind, dataUrl: String(reader.result ?? "") });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    const next: NewDoc[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 3 * 1024 * 1024) {
        toast.error(`"${file.name}" is too large (max 3 MB).`);
        continue;
      }
      next.push(await read(file));
    }
    setDocuments((cur) => [...cur, ...next].slice(0, 8));
  };

  const submit = async () => {
    if (f.name.trim().length < 2) return toast.error("Enter a business name.");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return toast.error("Enter a valid email.");
    if (f.password.trim().length < 8)
      return toast.error("Set a password of at least 8 characters.");
    setSaving(true);
    try {
      const result = await adminCreateVendorFn({
        data: {
          name: f.name.trim(),
          email: f.email.trim(),
          password: f.password.trim(),
          phone: f.phone.trim(),
          city: f.city.trim(),
          services: f.services.trim(),
          gstin: f.gstin.trim(),
          pan: f.pan.trim(),
          businessType: f.businessType,
          panIndia: f.panIndia,
          pincodes: f.pincodes.trim(),
          status: f.status,
          documents,
        },
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not create vendor.");
        return;
      }
      toast.success(`Vendor ${f.name} created — they can sign in now.`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add new vendor" onClose={onClose}>
      <div className="space-y-5">
        {/* Account */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account & login</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business name *"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Email *"><Input value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="vendor@company.com" /></Field>
            <Field label="Starting password *"><Input type="text" value={f.password} onChange={(e) => set({ password: e.target.value })} placeholder="Min 8 characters" /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          </div>
        </section>

        {/* Compliance */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compliance</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="GSTIN"><Input value={f.gstin} onChange={(e) => set({ gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" /></Field>
            <Field label="PAN"><Input value={f.pan} onChange={(e) => set({ pan: e.target.value })} placeholder="ABCDE1234F" /></Field>
            <Field label="Business type">
              <select value={f.businessType} onChange={(e) => set({ businessType: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option>Proprietorship</option>
                <option>Partnership</option>
                <option>Private Limited</option>
                <option>LLP</option>
                <option>Individual</option>
              </select>
            </Field>
            <Field label="Services"><Input value={f.services} onChange={(e) => set({ services: e.target.value })} placeholder="Cards, Banners…" /></Field>
          </div>
        </section>

        {/* Coverage */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coverage</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
            <Field label="Status">
              <select value={f.status} onChange={(e) => set({ status: e.target.value as "active" | "pending" })} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="active">Active (can receive orders)</option>
                <option value="pending">Pending approval</option>
              </select>
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.panIndia} onChange={(e) => set({ panIndia: e.target.checked })} className="h-4 w-4" />
            Serves Pan-India
          </label>
          {!f.panIndia && (
            <Field label="Serviceable pincodes (comma separated)" className="mt-2">
              <Input value={f.pincodes} onChange={(e) => set({ pincodes: e.target.value })} placeholder="411001, 411002, …" />
            </Field>
          )}
        </section>

        {/* Documents */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</h4>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={async (e) => {
              await onFiles(e.target.files, pendingKind);
              e.currentTarget.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pendingKind}
              onChange={(e) => setPendingKind(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {DOC_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Upload (image / PDF)
            </Button>
          </div>
          {documents.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {documents.map((d, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm">
                  <FileText className="h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{d.kind}</span>
                  <button type="button" onClick={() => setDocuments((cur) => cur.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create vendor"}</Button>
      </div>
    </ModalShell>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
