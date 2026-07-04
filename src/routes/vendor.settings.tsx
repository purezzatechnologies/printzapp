import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { getVendorSettingsFn, saveVendorSettingsFn } from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/vendor/settings")({
  loader: async () => await getVendorSettingsFn(),
  component: VendorSettings,
});

type Settings = NonNullable<Awaited<ReturnType<typeof getVendorSettingsFn>>>;

const DAYS: Settings["hours"][number]["day"][] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function defaultSettings(): Settings {
  return {
    vendorId: "",
    businessName: "",
    gstin: "",
    email: "",
    phone: "",
    panIndia: false,
    pincodes: "",
    hours: DAYS.map((day) => ({
      day,
      from: "09:00",
      to: "19:00",
      on: day !== "Sunday",
    })),
  };
}

function parsePincodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter((p) => /^\d{6}$/.test(p)),
    ),
  );
}

function VendorSettings() {
  const initial = Route.useLoaderData() as Settings | null;
  const [settings, setSettings] = useState<Settings>(initial ?? defaultSettings());
  const [savedMsg, setSavedMsg] = useState<{
    text: string;
    kind: "ok" | "error";
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pincodeDraft, setPincodeDraft] = useState("");

  const pincodes = useMemo(() => parsePincodes(settings.pincodes), [
    settings.pincodes,
  ]);

  const setHours = (idx: number, patch: Partial<Settings["hours"][number]>) => {
    setSettings((current) => ({
      ...current,
      hours: current.hours.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    }));
  };

  const addPincodesFromDraft = () => {
    const next = parsePincodes(`${settings.pincodes} ${pincodeDraft}`);
    setSettings((current) => ({ ...current, pincodes: next.join(", ") }));
    setPincodeDraft("");
  };

  const removePincode = (pin: string) => {
    setSettings((current) => ({
      ...current,
      pincodes: pincodes.filter((p) => p !== pin).join(", "),
    }));
  };

  const save = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      if (!settings.panIndia && pincodes.length === 0) {
        setSavedMsg({
          text: "Add at least one pincode or enable Pan India delivery so customers can order from you.",
          kind: "error",
        });
        return;
      }
      const result = await saveVendorSettingsFn({
        data: {
          businessName: settings.businessName,
          gstin: settings.gstin,
          email: settings.email,
          phone: settings.phone,
          panIndia: settings.panIndia,
          // normalize stored pincodes (dedup + valid only)
          pincodes: pincodes.join(", "),
          hours: settings.hours,
        },
      });
      if (result.success) {
        setSavedMsg({ text: "Settings saved.", kind: "ok" });
      } else {
        setSavedMsg({
          text: result.error ?? "Could not save.",
          kind: "error",
        });
      }
    } catch (err) {
      setSavedMsg({
        text: getFriendlyError(err, "Could not save your settings."),
        kind: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Card className="p-6">
        <h3 className="font-semibold">Business Profile</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block">Business Name</Label>
            <Input
              value={settings.businessName}
              onChange={(e) =>
                setSettings({ ...settings, businessName: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block">GSTIN</Label>
            <Input
              value={settings.gstin}
              onChange={(e) =>
                setSettings({ ...settings, gstin: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block">Email</Label>
            <Input
              type="email"
              value={settings.email}
              onChange={(e) =>
                setSettings({ ...settings, email: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block">Phone</Label>
            <Input
              value={settings.phone}
              onChange={(e) =>
                setSettings({ ...settings, phone: e.target.value })
              }
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Delivery Coverage</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enable Pan India to accept orders from anywhere. When off, only
              the pincodes listed below are serviceable.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium ${settings.panIndia ? "text-success" : "text-muted-foreground"}`}
            >
              Pan India delivery
            </span>
            <Switch
              checked={settings.panIndia}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, panIndia: checked })
              }
            />
          </div>
        </div>

        <div
          className={`mt-5 transition-opacity ${settings.panIndia ? "opacity-50" : ""}`}
        >
          <Label className="mb-1 block">Serviceable Pincodes</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            Add the 6-digit pincodes you can deliver to. Customers outside
            this list will be blocked at checkout.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Add pincodes — comma or space separated (e.g. 400001, 400052)"
              value={pincodeDraft}
              onChange={(e) => setPincodeDraft(e.target.value)}
              disabled={settings.panIndia}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPincodesFromDraft();
                }
              }}
            />
            <Button
              type="button"
              onClick={addPincodesFromDraft}
              disabled={settings.panIndia}
            >
              Add
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pincodes.length === 0 && !settings.panIndia && (
              <p className="text-xs text-warning">
                No pincodes added yet — customers can&apos;t place orders with you.
              </p>
            )}
            {pincodes.map((p) => (
              <Badge
                key={p}
                variant="secondary"
                className="rounded-full pl-3 pr-1 font-mono text-xs"
              >
                {p}
                <button
                  type="button"
                  onClick={() => removePincode(p)}
                  className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${p}`}
                  disabled={settings.panIndia}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold">Working Hours</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Set distinct hours for each day of the week. Toggle off any day you
          don&apos;t work.
        </p>
        <div className="mt-4 space-y-3">
          {settings.hours.map((h, i) => (
            <div
              key={h.day}
              className="grid grid-cols-[110px_1fr_auto_1fr_auto] items-center gap-3"
            >
              <span className="text-sm font-medium">{h.day}</span>
              <input
                type="time"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                value={h.from}
                onChange={(e) => setHours(i, { from: e.target.value })}
                disabled={!h.on}
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                value={h.to}
                onChange={(e) => setHours(i, { to: e.target.value })}
                disabled={!h.on}
              />
              <Switch
                checked={h.on}
                onCheckedChange={(checked) => setHours(i, { on: checked })}
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {savedMsg && (
          <p
            className={`text-sm ${savedMsg.kind === "error" ? "text-destructive" : "text-success"}`}
          >
            {savedMsg.text}
          </p>
        )}
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
