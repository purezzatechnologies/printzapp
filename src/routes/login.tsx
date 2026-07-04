import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, Store, User as UserIcon, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { loginFn } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — PRINTZAPP" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

// Public sign-in is for customers and vendors only. Platform staff sign in on a
// separate, unlinked path (see /control) so the admin surface isn't bundled
// with the customer/vendor login.
const roles = [
  { value: "customer", label: "Customer", icon: UserIcon, hint: "Track orders, manage your designs" },
  { value: "vendor", label: "Vendor", icon: Store, hint: "Manage orders, products & payouts" },
];

const destinationByRole = {
  customer: "/account" as const,
  vendor: "/vendor" as const,
  superadmin: "/superadmin" as const,
};

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const { setUser } = useAuth();
  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const active = roles.find((r) => r.value === role)!;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* floating blobs */}
      <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-primary/30 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full bg-sky-300/40 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-indigo-300/30 blur-3xl animate-blob" />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        {/* Left: branding */}
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <Link to="/" className="flex items-center">
            <Logo className="h-12" />
          </Link>
          <div className="space-y-6">
            <h1 className="text-5xl font-bold leading-tight">Print anything.<br /><span className="text-primary">Delivered fast.</span></h1>
            <p className="max-w-md text-muted-foreground">A unified workspace for customers and vendors — built like the apps you love on iOS.</p>
            <div className="grid max-w-md grid-cols-2 gap-3">
              {roles.map((r) => (
                <div key={r.value} className="glass-panel rounded-2xl p-4">
                  <r.icon className="h-5 w-5 text-primary" />
                  <div className="mt-2 text-sm font-semibold">{r.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} PRINTZAPP. Made for India.</div>
        </div>

        {/* Right: form */}
        <div className="flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-8 inline-flex items-center lg:hidden">
              <Logo className="h-10" />
            </Link>

            <div className="glass-strong rounded-3xl p-7">
              <h2 className="text-2xl font-bold">Welcome back</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your dashboard</p>

              <Tabs value={role} onValueChange={setRole} className="mt-6">
                <TabsList className="glass-panel grid w-full grid-cols-2 rounded-2xl p-1">
                  {roles.map((r) => (
                    <TabsTrigger key={r.value} value={r.value} className="rounded-xl text-xs data-[state=active]:bg-white/95 data-[state=active]:shadow-md">
                      <r.icon className="mr-1.5 h-3.5 w-3.5" />{r.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {roles.map((r) => (
                  <TabsContent key={r.value} value={r.value} className="mt-1">
                    <p className="text-xs text-muted-foreground">{r.hint}</p>
                  </TabsContent>
                ))}
              </Tabs>

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
                        role: role as "customer" | "vendor",
                      },
                    });

                    if ("error" in result && result.error) {
                      setError(result.error);
                      return;
                    }

                    if (result && "user" in result && result.user) {
                      setUser(result.user);
                      // Return to where they came from (e.g. checkout) when set
                      // and safe (same-origin path); otherwise go by role.
                      if (redirectTo && redirectTo.startsWith("/")) {
                        navigate({ to: redirectTo });
                      } else {
                        navigate({ to: destinationByRole[result.user.role] });
                      }
                    } else {
                      setError("Sign-in failed. User profile could not be loaded.");
                    }
                  } catch {
                    setError("Sign-in failed due to a temporary issue. Please try again.");
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="mt-6 space-y-4"
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
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11 rounded-xl bg-white/78 pl-10 backdrop-blur" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a href="mailto:support@printzapp.in?subject=Printzapp%20password%20reset" className="text-xs font-medium text-primary hover:underline">Forgot?</a>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 rounded-xl bg-white/78 pl-10 backdrop-blur" required />
                  </div>
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl text-base" disabled={isSubmitting}>
                  Sign in as {active.label} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                New here? <Link to="/signup" className="font-semibold text-primary hover:underline">Create an account</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
