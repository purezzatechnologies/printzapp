import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRef, useState, type ChangeEvent } from "react";
import { Upload, Loader2, Link2, Copy, Check } from "lucide-react";
import {
  getAdminSlugFn,
  getPhonePeAdminFn,
  getPlatformSettingsFn,
  getRazorpayAdminFn,
  resetLogoFn,
  saveAdminSlugFn,
  savePhonePeSettingsFn,
  savePlatformSettingsFn,
  saveRazorpaySettingsFn,
  uploadLogoFn,
} from "@/lib/backend";
import { useBranding } from "@/lib/branding";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/superadmin/settings")({
  loader: async () => ({
    settings: await getPlatformSettingsFn(),
    razorpay: await getRazorpayAdminFn(),
    phonepe: await getPhonePeAdminFn(),
    adminSlug: (await getAdminSlugFn()).slug,
  }),
  component: PlatformSettings,
});

function PlatformSettings() {
  const loaded = Route.useLoaderData() as {
    settings: Awaited<ReturnType<typeof getPlatformSettingsFn>>;
    razorpay: Awaited<ReturnType<typeof getRazorpayAdminFn>>;
    phonepe: Awaited<ReturnType<typeof getPhonePeAdminFn>>;
    adminSlug: string;
  };
  const initial = loaded.settings;
  const [commissionPercent, setCommissionPercent] = useState(String(initial.commissionPercent));
  const [minimumPayout, setMinimumPayout] = useState(String(initial.minimumPayout));
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(String(initial.freeShippingThreshold));
  const [sameDayDelivery, setSameDayDelivery] = useState(initial.flags.sameDayDelivery);
  const [aiDesignAssistant, setAiDesignAssistant] = useState(initial.flags.aiDesignAssistant);
  const [vendorSelfOnboarding, setVendorSelfOnboarding] = useState(initial.flags.vendorSelfOnboarding);
  const [internationalShipping, setInternationalShipping] = useState(initial.flags.internationalShipping);
  const [saved, setSaved] = useState("");

  // --- Payments (Razorpay) -------------------------------------------------
  const [rzpEnabled, setRzpEnabled] = useState(loaded.razorpay.enabled);
  const [rzpKeyId, setRzpKeyId] = useState(loaded.razorpay.keyId);
  const [rzpKeySecret, setRzpKeySecret] = useState("");
  const [rzpMode, setRzpMode] = useState<"test" | "live">(loaded.razorpay.mode);
  const [rzpHasSecret, setRzpHasSecret] = useState(loaded.razorpay.hasSecret);
  const [rzpMsg, setRzpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rzpBusy, setRzpBusy] = useState(false);

  const saveRazorpay = async () => {
    setRzpBusy(true);
    setRzpMsg(null);
    try {
      const res = await saveRazorpaySettingsFn({
        data: {
          enabled: rzpEnabled,
          keyId: rzpKeyId.trim(),
          keySecret: rzpKeySecret.trim(),
          mode: rzpMode,
        },
      });
      if (!res.success) {
        setRzpMsg({ ok: false, text: res.error ?? "Could not save." });
        return;
      }
      setRzpHasSecret(res.hasSecret);
      setRzpKeySecret("");
      setRzpMsg({
        ok: true,
        text: res.enabled
          ? "Razorpay is enabled. Customers will pay via Razorpay at checkout."
          : "Razorpay settings saved (currently disabled).",
      });
    } catch (err) {
      setRzpMsg({ ok: false, text: getFriendlyError(err) });
    } finally {
      setRzpBusy(false);
    }
  };

  // --- Payments (PhonePe) --------------------------------------------------
  const [ppEnabled, setPpEnabled] = useState(loaded.phonepe.enabled);
  const [ppMerchantId, setPpMerchantId] = useState(loaded.phonepe.merchantId);
  const [ppSaltKey, setPpSaltKey] = useState("");
  const [ppSaltIndex, setPpSaltIndex] = useState(loaded.phonepe.saltIndex);
  const [ppMode, setPpMode] = useState<"test" | "live">(loaded.phonepe.mode);
  const [ppHasSalt, setPpHasSalt] = useState(loaded.phonepe.hasSaltKey);
  const [ppMsg, setPpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ppBusy, setPpBusy] = useState(false);

  const savePhonePe = async () => {
    setPpBusy(true);
    setPpMsg(null);
    try {
      const res = await savePhonePeSettingsFn({
        data: {
          enabled: ppEnabled,
          merchantId: ppMerchantId.trim(),
          saltKey: ppSaltKey.trim(),
          saltIndex: ppSaltIndex.trim() || "1",
          mode: ppMode,
        },
      });
      if (!res.success) {
        setPpMsg({ ok: false, text: res.error ?? "Could not save." });
        return;
      }
      setPpHasSalt(res.hasSaltKey);
      setPpSaltKey("");
      setPpMsg({
        ok: true,
        text: res.enabled
          ? "PhonePe is enabled. Customers can pay via PhonePe at checkout."
          : "PhonePe settings saved (currently disabled).",
      });
    } catch (err) {
      setPpMsg({ ok: false, text: getFriendlyError(err) });
    } finally {
      setPpBusy(false);
    }
  };

  // --- Branding (logo upload) ---------------------------------------------
  const branding = useBranding();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasCustomLogo = branding.logoUrl !== "/logo.svg";

  const onLogoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoMsg({ ok: false, text: "Please choose an image file." });
      return;
    }
    if (file.size > 512 * 1024) {
      setLogoMsg({ ok: false, text: "Logo is too large (max 512 KB)." });
      return;
    }
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.readAsDataURL(file);
      });
      const result = await uploadLogoFn({ data: { dataUrl } });
      if (!result.success) {
        setLogoMsg({ ok: false, text: result.error ?? "Upload failed." });
        return;
      }
      await branding.refresh();
      setLogoMsg({ ok: true, text: "Logo updated. It now shows across the app." });
    } catch (err) {
      setLogoMsg({ ok: false, text: getFriendlyError(err) });
    } finally {
      setLogoBusy(false);
    }
  };

  const onResetLogo = async () => {
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      await resetLogoFn();
      await branding.refresh();
      setLogoMsg({ ok: true, text: "Reverted to the default logo." });
    } catch (err) {
      setLogoMsg({ ok: false, text: getFriendlyError(err) });
    } finally {
      setLogoBusy(false);
    }
  };

  // --- Secret admin URL ----------------------------------------------------
  const [adminSlug, setAdminSlug] = useState(loaded.adminSlug);
  const [adminSlugSaved, setAdminSlugSaved] = useState(loaded.adminSlug);
  const [adminSlugBusy, setAdminSlugBusy] = useState(false);
  const [adminSlugMsg, setAdminSlugMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-site";
  const adminUrl = `${origin}/${adminSlugSaved}`;

  const saveAdminSlug = async () => {
    setAdminSlugBusy(true);
    setAdminSlugMsg(null);
    try {
      const res = await saveAdminSlugFn({ data: { slug: adminSlug } });
      if (!res.success) {
        setAdminSlugMsg({ ok: false, text: res.error ?? "Could not save." });
        return;
      }
      setAdminSlug(res.slug);
      setAdminSlugSaved(res.slug);
      setAdminSlugMsg({
        ok: true,
        text:
          res.slug === "control"
            ? "Staff login is back at the default /control path."
            : `Staff login is now only reachable at /${res.slug}. Bookmark it — the old /control path is now hidden.`,
      });
    } catch (err) {
      setAdminSlugMsg({ ok: false, text: getFriendlyError(err) });
    } finally {
      setAdminSlugBusy(false);
    }
  };

  const copyAdminUrl = async () => {
    try {
      await navigator.clipboard.writeText(adminUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platform Settings</h2>
        <p className="text-sm text-muted-foreground">Global configuration, fees and feature flags</p>
      </div>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold">
          <Link2 className="h-4 w-4 text-primary" /> Admin access URL
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          The staff sign-in page lives at a secret path so it can't be found by guessing. Change it to something only your team knows. 3–41 characters, lowercase letters, numbers and dashes.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor="admin-slug" className="mb-1 block">Secret slug</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">{origin}/</span>
              <Input
                id="admin-slug"
                value={adminSlug}
                onChange={(e) => setAdminSlug(e.target.value)}
                placeholder="e.g. staff-7hq2"
                className="h-10 rounded-xl"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <Button
            type="button"
            className="rounded-xl"
            disabled={adminSlugBusy || adminSlug.trim() === adminSlugSaved}
            onClick={saveAdminSlug}
          >
            {adminSlugBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save URL
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current admin URL:</span>
          <code className="rounded bg-muted px-2 py-0.5 text-xs">{adminUrl}</code>
          <button
            type="button"
            onClick={copyAdminUrl}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-accent"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {adminSlugSaved !== "control" && (
          <p className="mt-2 text-xs text-amber-600">
            ⚠️ The default <code>/control</code> path is now disabled. If you forget this slug, reset it by setting it back to <code>control</code> in the database.
          </p>
        )}
        {adminSlugMsg && (
          <p className={`mt-3 text-sm ${adminSlugMsg.ok ? "text-success" : "text-destructive"}`}>
            {adminSlugMsg.text}
          </p>
        )}
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-1 font-semibold">Branding</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload your logo — it appears in the header, footer, sign-in pages and portals. PNG, JPG, WEBP or SVG, up to 512 KB.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border bg-white p-2">
            <img src={branding.logoUrl} alt="Current logo" className="h-full w-auto object-contain" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={onLogoFile}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={logoBusy}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {hasCustomLogo ? "Replace logo" : "Upload logo"}
            </Button>
            {hasCustomLogo && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-destructive"
                disabled={logoBusy}
                onClick={onResetLogo}
              >
                Reset to default
              </Button>
            )}
          </div>
        </div>
        {logoMsg && (
          <p className={`mt-3 text-sm ${logoMsg.ok ? "text-success" : "text-destructive"}`}>
            {logoMsg.text}
          </p>
        )}
      </Card>

      <Card className="glass border-white/40 p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold">Payments · Razorpay</h3>
          <Switch checked={rzpEnabled} onCheckedChange={setRzpEnabled} />
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Enable Razorpay to collect online payments (UPI, cards, net banking, wallets) at checkout. Your keys are stored securely — the secret is never exposed to customers. Get keys from the{" "}
          <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">Razorpay dashboard</a>.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Key ID</Label>
            <Input
              value={rzpKeyId}
              onChange={(e) => setRzpKeyId(e.target.value)}
              placeholder="rzp_test_xxxxxxxxxxxx"
              className="h-11 rounded-xl bg-white/60 font-mono backdrop-blur"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Key Secret</Label>
            <Input
              type="password"
              value={rzpKeySecret}
              onChange={(e) => setRzpKeySecret(e.target.value)}
              placeholder={rzpHasSecret ? "•••••••• (leave blank to keep current)" : "Enter key secret"}
              className="h-11 rounded-xl bg-white/60 font-mono backdrop-blur"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <select
              value={rzpMode}
              onChange={(e) => setRzpMode(e.target.value as "test" | "live")}
              className="h-11 w-full rounded-xl border bg-white/60 px-3 text-sm backdrop-blur"
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button className="rounded-xl" onClick={saveRazorpay} disabled={rzpBusy}>
            {rzpBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save payment settings
          </Button>
          {rzpMsg && (
            <span className={`text-sm ${rzpMsg.ok ? "text-success" : "text-destructive"}`}>
              {rzpMsg.text}
            </span>
          )}
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold">Payments · PhonePe</h3>
          <Switch checked={ppEnabled} onCheckedChange={setPpEnabled} />
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Enable PhonePe to collect payments via UPI, cards and net banking. Customers are redirected to PhonePe's secure page and back. Your salt key is stored securely and never exposed to customers. Get credentials from the{" "}
          <a href="https://business.phonepe.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">PhonePe Business dashboard</a>.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Merchant ID</Label>
            <Input
              value={ppMerchantId}
              onChange={(e) => setPpMerchantId(e.target.value)}
              placeholder="PGTESTPAYUAT"
              className="h-11 rounded-xl bg-white/60 font-mono backdrop-blur"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Salt Key</Label>
            <Input
              type="password"
              value={ppSaltKey}
              onChange={(e) => setPpSaltKey(e.target.value)}
              placeholder={ppHasSalt ? "•••••••• (leave blank to keep current)" : "Enter salt key"}
              className="h-11 rounded-xl bg-white/60 font-mono backdrop-blur"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Salt Index</Label>
            <Input
              value={ppSaltIndex}
              onChange={(e) => setPpSaltIndex(e.target.value)}
              placeholder="1"
              className="h-11 rounded-xl bg-white/60 font-mono backdrop-blur"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <select
              value={ppMode}
              onChange={(e) => setPpMode(e.target.value as "test" | "live")}
              className="h-11 w-full rounded-xl border bg-white/60 px-3 text-sm backdrop-blur"
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button className="rounded-xl" onClick={savePhonePe} disabled={ppBusy}>
            {ppBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save payment settings
          </Button>
          {ppMsg && (
            <span className={`text-sm ${ppMsg.ok ? "text-success" : "text-destructive"}`}>
              {ppMsg.text}
            </span>
          )}
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Marketplace economics</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Default commission %</Label>
            <Input value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} className="h-11 rounded-xl bg-white/60 backdrop-blur" />
          </div>
          <div className="space-y-1.5">
            <Label>Minimum payout (₹)</Label>
            <Input value={minimumPayout} onChange={(e) => setMinimumPayout(e.target.value)} className="h-11 rounded-xl bg-white/60 backdrop-blur" />
          </div>
          <div className="space-y-1.5">
            <Label>Free shipping threshold (₹)</Label>
            <Input value={freeShippingThreshold} onChange={(e) => setFreeShippingThreshold(e.target.value)} className="h-11 rounded-xl bg-white/60 backdrop-blur" />
          </div>
        </div>
      </Card>

      <Card className="glass border-white/40 p-5">
        <h3 className="mb-4 font-semibold">Feature flags</h3>
        <div className="space-y-3">
          {[
            { label: "Same-day delivery (metros)", on: sameDayDelivery, set: setSameDayDelivery },
            { label: "AI design assistant beta", on: aiDesignAssistant, set: setAiDesignAssistant },
            { label: "Vendor self-onboarding", on: vendorSelfOnboarding, set: setVendorSelfOnboarding },
            { label: "International shipping", on: internationalShipping, set: setInternationalShipping },
          ].map((f) => (
            <div key={f.label} className="flex items-center justify-between rounded-xl bg-primary/6 p-3">
              <span className="text-sm font-medium">{f.label}</span>
              <Switch checked={f.on} onCheckedChange={f.set} />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          className="rounded-xl"
          onClick={async () => {
            const result = await savePlatformSettingsFn({
              data: {
                commissionPercent,
                minimumPayout,
                freeShippingThreshold,
                sameDayDelivery,
                aiDesignAssistant,
                vendorSelfOnboarding,
                internationalShipping,
              },
            });
            setSaved(`Saved commission ${result.commissionPercent}% and payout settings.`);
          }}
        >
          Save changes
        </Button>
      </div>
      {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
    </div>
  );
}
