import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Mail, Lock, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginFn } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

// Shared staff (super admin) sign-in form. Rendered by both the built-in
// /control route and the configurable secret-slug route. Authentication is
// enforced server-side (portal: "admin" only accepts superadmin accounts).
export function StaffLogin() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
            <Logo className="h-full" />
          </div>
          <h1 className="mt-4 inline-flex items-center gap-2 text-2xl font-bold text-white">
            <ShieldCheck className="h-5 w-5" /> Staff Portal
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Restricted access · authorized personnel only
          </p>
        </div>

        <div className="rounded-2xl bg-white/95 p-6 shadow-2xl backdrop-blur">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmitting(true);
              setError("");
              try {
                const result = await loginFn({
                  data: {
                    email: email.trim(),
                    password: password.trim(),
                    portal: "admin",
                  },
                });
                if ("error" in result && result.error) {
                  setError(result.error);
                  return;
                }
                if (result && "user" in result && result.user) {
                  setUser(result.user);
                  navigate({ to: "/superadmin" });
                } else {
                  setError("Sign-in failed. Please try again.");
                }
              } catch {
                setError("Sign-in failed due to a temporary issue. Please try again.");
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@printzapp.in"
                  className="h-11 rounded-xl pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl pl-10"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-base"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Signing in…"
              ) : (
                <>
                  Sign in <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} PRINTZAPP
        </p>
      </div>
    </div>
  );
}
