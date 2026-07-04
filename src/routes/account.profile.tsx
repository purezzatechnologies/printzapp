import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ShieldCheck, UserCog } from "lucide-react";
import {
  changeMyPasswordFn,
  getCurrentUserFn,
  updateMyProfileFn,
} from "@/lib/backend";

export const Route = createFileRoute("/account/profile")({
  loader: async () => await getCurrentUserFn(),
  component: ProfilePage,
});

type Msg = { kind: "ok" | "error"; text: string } | null;

function ProfilePage() {
  const user = Route.useLoaderData() as Awaited<ReturnType<typeof getCurrentUserFn>>;
  const router = useRouter();

  if (!user) return null;

  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    gstin: user.gstin ?? "",
  });
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdMsg, setPwdMsg] = useState<Msg>(null);
  const [savingPwd, setSavingPwd] = useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const result = await updateMyProfileFn({ data: profile });
      if (!result.success) {
        setProfileMsg({ kind: "error", text: result.error ?? "Could not save." });
      } else {
        setProfileMsg({ kind: "ok", text: "Profile updated." });
        router.invalidate();
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setSavingPwd(true);
    setPwdMsg(null);
    try {
      if (pwd.next !== pwd.confirm) {
        setPwdMsg({ kind: "error", text: "New passwords don't match." });
        return;
      }
      if (pwd.next.length < 8) {
        setPwdMsg({
          kind: "error",
          text: "Password must be at least 8 characters.",
        });
        return;
      }
      const result = await changeMyPasswordFn({
        data: { currentPassword: pwd.current, newPassword: pwd.next },
      });
      if (!result.success) {
        setPwdMsg({ kind: "error", text: result.error ?? "Could not save." });
      } else {
        setPwdMsg({ kind: "ok", text: "Password updated." });
        setPwd({ current: "", next: "", confirm: "" });
      }
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your personal details and account credentials.
        </p>
      </div>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <UserCog className="h-4 w-4 text-primary" />
          Personal details
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block">Full name</Label>
            <Input
              value={profile.name}
              onChange={(e) =>
                setProfile({ ...profile, name: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block">Email</Label>
            <Input
              type="email"
              value={profile.email}
              onChange={(e) =>
                setProfile({ ...profile, email: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block">Phone</Label>
            <Input
              value={profile.phone}
              onChange={(e) =>
                setProfile({ ...profile, phone: e.target.value })
              }
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <Label className="mb-1 block">GSTIN (optional)</Label>
            <Input
              value={profile.gstin}
              onChange={(e) =>
                setProfile({ ...profile, gstin: e.target.value })
              }
              placeholder="22AAAAA0000A1Z5"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {profileMsg && (
            <span
              className={`text-sm ${profileMsg.kind === "ok" ? "text-success" : "text-destructive"}`}
            >
              {profileMsg.text}
            </span>
          )}
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          Change password
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <Label className="mb-1 block">Current password</Label>
            <Input
              type="password"
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1 block">New password</Label>
            <Input
              type="password"
              value={pwd.next}
              onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <Label className="mb-1 block">Confirm new password</Label>
            <Input
              type="password"
              value={pwd.confirm}
              onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {pwdMsg && (
            <span
              className={`text-sm ${pwdMsg.kind === "ok" ? "text-success" : "text-destructive"}`}
            >
              {pwdMsg.text}
            </span>
          )}
          <Button onClick={savePassword} disabled={savingPwd}>
            {savingPwd ? "Saving…" : "Update password"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Account security
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is protected by a session cookie. Sign out from all
          devices by clicking <b>Sign out</b> in the header above.
        </p>
      </Card>
    </div>
  );
}
