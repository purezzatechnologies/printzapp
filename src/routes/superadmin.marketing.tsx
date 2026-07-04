import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Megaphone, Tag, Mail, Plus, Pencil, Trash2, PlayCircle, PauseCircle, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCampaignFn,
  getCampaignsFn,
  getCouponsFn,
  saveCampaignFn,
  updateCampaignFn,
} from "@/lib/backend";

export const Route = createFileRoute("/superadmin/marketing")({
  loader: async () => ({
    campaigns: await getCampaignsFn(),
    coupons: await getCouponsFn(),
  }),
  component: Marketing,
});

type CampaignStatus = "Draft" | "Scheduled" | "Live" | "Paused" | "Ended";
type Campaign = Awaited<ReturnType<typeof getCampaignsFn>>[number];
type CampaignFormData = {
  name: string;
  channel: string;
  status: CampaignStatus;
  reach: number;
  ctr: string;
};

function Marketing() {
  const { campaigns: initialCampaigns, coupons } = Route.useLoaderData() as {
    campaigns: Campaign[];
    coupons: Awaited<ReturnType<typeof getCouponsFn>>;
  };
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  const refresh = async () => setCampaigns(await getCampaignsFn());

  const saveCampaign = async (data: CampaignFormData) => {
    await saveCampaignFn({ data });
    toast.success("Campaign created.");
    await refresh();
    setCreating(false);
  };

  const updateCampaign = async (id: string, data: CampaignFormData) => {
    const result = await updateCampaignFn({ data: { id, ...data } });
    if (!result.success) {
      toast.error(result.error ?? "Save failed.");
      return;
    }
    toast.success("Campaign updated.");
    await refresh();
    setEditing(null);
  };

  const toggleStatus = async (c: Campaign) => {
    const next: CampaignStatus = c.status === "Live" ? "Paused" : c.status === "Paused" ? "Live" : c.status;
    if (next === c.status) {
      toast.info("Use Edit to change campaign status.");
      return;
    }
    const result = await updateCampaignFn({
      data: { id: c.id, name: c.name, channel: c.channel, status: next, reach: c.reach, ctr: c.ctr },
    });
    if (!result.success) {
      toast.error(result.error ?? "Update failed.");
      return;
    }
    toast.success(`Campaign ${next.toLowerCase()}.`);
    await refresh();
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    const result = await deleteCampaignFn({ data: { id: c.id } });
    if (!result.success) {
      toast.error(result.error ?? "Delete failed.");
      return;
    }
    toast.success("Campaign deleted.");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Marketing</h2>
          <p className="text-sm text-muted-foreground">
            Campaigns, coupons & messaging across channels
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {creating && (
        <CampaignForm
          onCancel={() => setCreating(false)}
          onSave={saveCampaign}
        />
      )}
      {editing && (
        <CampaignForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(data) => updateCampaign(editing.id, data)}
        />
      )}

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Megaphone className="h-4 w-4 text-primary" />
          Campaigns ({campaigns.length})
        </h3>
        <div className="space-y-2">
          {campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No campaigns yet. Create one to start tracking reach &amp; CTR.
            </p>
          )}
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/6 p-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.channel}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Reach
                <br />
                <span className="font-semibold text-foreground">
                  {c.reach.toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                CTR
                <br />
                <span className="font-semibold text-foreground">{c.ctr}</span>
              </div>
              <Badge
                className={`rounded-full ${c.status === "Live" ? "bg-success/15 text-success border border-success/30" : c.status === "Scheduled" ? "bg-warning/15 text-warning border border-warning/30" : c.status === "Paused" ? "bg-muted text-foreground border" : "bg-muted text-foreground"}`}
              >
                {c.status}
              </Badge>
              <div className="flex gap-1.5">
                {(c.status === "Live" || c.status === "Paused") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() => toggleStatus(c)}
                  >
                    {c.status === "Live" ? (
                      <>
                        <PauseCircle className="mr-1 h-3.5 w-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <PlayCircle className="mr-1 h-3.5 w-3.5" /> Resume
                      </>
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg"
                  onClick={() => setEditing(c)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg text-destructive"
                  onClick={() => remove(c)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Tag className="h-4 w-4 text-primary" />
          Coupons ({coupons.length})
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {coupons.map((c) => (
            <div
              key={c.code}
              className="rounded-2xl bg-primary/8 p-4 ring-1 ring-primary/20"
            >
              <div className="font-mono text-lg font-bold text-primary">
                {c.code}
              </div>
              <div className="mt-1 text-sm">{c.type}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {c.used.toLocaleString()} / {c.limit.toLocaleString()} used
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CampaignForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Campaign;
  onCancel: () => void;
  onSave: (data: CampaignFormData) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "Email + Push");
  const [status, setStatus] = useState<CampaignStatus>(initial?.status ?? "Draft");
  const [reach, setReach] = useState(String(initial?.reach ?? 0));
  const [ctr, setCtr] = useState(initial?.ctr ?? "—");

  return (
    <Card className="glass border-white/40 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{initial ? `Edit ${initial.name}` : "Create campaign"}</h3>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali Mega Sale"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Channel</Label>
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="Email + Push"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CampaignStatus)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option>Draft</option>
            <option>Scheduled</option>
            <option>Live</option>
            <option>Paused</option>
            <option>Ended</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Reach (audience size)</Label>
          <Input value={reach} onChange={(e) => setReach(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>CTR</Label>
          <Input value={ctr} onChange={(e) => setCtr(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave({
              name,
              channel,
              status,
              reach: Number(reach) || 0,
              ctr,
            })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
