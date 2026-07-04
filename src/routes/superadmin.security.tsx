import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShieldCheck, Users, Link2, Plus, Pencil, Trash2, X, Info } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAdminMemberFn,
  getAdminSlugFn,
  getAdminTeamFn,
  saveAdminMemberFn,
} from "@/lib/backend";

export const Route = createFileRoute("/superadmin/security")({
  loader: async () => ({
    team: await getAdminTeamFn(),
    adminSlug: (await getAdminSlugFn()).slug,
  }),
  component: Security,
});

type LoaderData = Awaited<ReturnType<typeof getAdminTeamFn>>;
type Member = LoaderData[number];

function Security() {
  const loaded = Route.useLoaderData() as { team: Member[]; adminSlug: string };
  const [team, setTeam] = useState<Member[]>(loaded.team);
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-site";
  const staffUrl = `${origin}/${loaded.adminSlug}`;

  const refresh = async () => setTeam((await getAdminTeamFn()) as Member[]);

  const remove = async (m: Member) => {
    if (!confirm(`Remove ${m.name}? This deletes their admin login too.`)) return;
    const result = await deleteAdminMemberFn({ data: { id: m.id } });
    if (!result.success) {
      toast.error(result.error ?? "Delete failed.");
      return;
    }
    toast.success("Team member removed.");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            Security &amp; Roles
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="How admin access works"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  <Info className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-96 text-sm">
                <h4 className="mb-2 font-semibold">How team members sign in &amp; what they access</h4>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Where they log in:</span> the private staff portal at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{staffUrl}</code> — not the public sign-in page.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Credentials:</span> the email and starting password you set when inviting them. They can change the password from their profile after first login.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Access level:</span> every team member is a full super admin and can reach <em>all</em> sections of this panel. The role dropdown (Operations, Finance, …) is an organizational label — it does not yet restrict access.
                  </li>
                  <li>
                    Removing a member here deletes their login immediately, so they can no longer sign in.
                  </li>
                </ul>
              </PopoverContent>
            </Popover>
          </h2>
          <p className="text-sm text-muted-foreground">
            Internal team accounts that sign in through the staff portal.
          </p>
        </div>
        <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Invite member
        </Button>
      </div>

      {/* Honest, real stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass border-white/40 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div className="mt-4 text-2xl font-bold">{team.length}</div>
          <div className="text-sm font-semibold">Admin accounts</div>
          <div className="text-xs text-muted-foreground">Each can sign in to this panel</div>
        </Card>
        <Card className="glass border-white/40 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="mt-4 text-2xl font-bold">Full</div>
          <div className="text-sm font-semibold">Access level</div>
          <div className="text-xs text-muted-foreground">Single admin tier — every section</div>
        </Card>
        <Card className="glass border-white/40 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Link2 className="h-5 w-5" />
          </div>
          <div className="mt-4 truncate text-sm font-bold" title={staffUrl}>
            /{loaded.adminSlug}
          </div>
          <div className="text-sm font-semibold">Staff login URL</div>
          <div className="text-xs text-muted-foreground">Change it in Platform Settings</div>
        </Card>
      </div>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Internal team ({team.length})</h3>
        <div className="space-y-2">
          {team.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No team members yet. Invite one to give them staff-portal access.
            </p>
          )}
          {team.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/6 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                {u.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <Badge className="rounded-full border border-primary/30 bg-primary/10 text-primary">{u.role}</Badge>
              <div className="text-xs text-muted-foreground">{u.lastSeen}</div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setEditing(u)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-destructive" onClick={() => remove(u)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {(creating || editing) && (
        <MemberForm
          initial={editing ?? undefined}
          staffUrl={staffUrl}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function MemberForm({
  initial,
  staffUrl,
  onCancel,
  onSaved,
}: {
  initial?: Member;
  staffUrl: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState(initial?.role ?? "Operations");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!initial && password.trim().length < 8) {
      toast.error("Set a password of at least 8 characters.");
      return;
    }
    if (initial && password.trim() && password.trim().length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveAdminMemberFn({
        data: { id: initial?.id, name, email, role, password: password.trim() },
      });
      if (!result.success) {
        toast.error(result.error ?? "Save failed.");
        return;
      }
      toast.success(initial ? "Member updated." : "Member invited — they can sign in now.");
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {initial ? `Edit ${initial.name}` : "Invite team member"}
          </h3>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@yourcompany.com" />
          </div>
          <div className="space-y-1.5">
            <Label>{initial ? "New password (leave blank to keep)" : "Starting password"}</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role (label only)</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option>Super Admin</option>
              <option>Operations</option>
              <option>Finance</option>
              <option>Support Lead</option>
              <option>Support Agent</option>
              <option>Read-only</option>
            </select>
          </div>
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            They sign in at <code className="rounded bg-background px-1">{staffUrl}</code> with this email and password, and get full super-admin access.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {initial ? "Save" : "Invite"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
