import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, User as UserIcon, Store, Building2, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { registerFn } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — PRINTZAPP" }] }),
  component: SignupPage,
});

const roles = [
  { value: "customer", label: "Customer", icon: UserIcon, dest: "/account" as const, perks: ["Track every order", "Loyalty rewards", "Faster reorder"] },
  { value: "vendor", label: "Vendor", icon: Store, dest: "/vendor" as const, perks: ["Receive bulk orders", "Same-day payouts", "Analytics suite"] },
];

function SignupPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [role, setRole] = useState("customer");
  const [isVendorSubmitted, setIsVendorSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const active = roles.find((r) => r.value === role)!;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-10 h-[28rem] w-[28rem] rounded-full bg-primary/25 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -left-20 top-1/2 h-96 w-96 rounded-full bg-sky-300/40 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-indigo-300/30 blur-3xl animate-blob" />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <Link to="/" className="flex items-center">
            <Logo className="h-12" />
          </Link>
          <div>
            <h1 className="text-5xl font-bold leading-tight">Join the print<br /><span className="text-primary">revolution.</span></h1>
            <p className="mt-4 max-w-md text-muted-foreground">50,000+ businesses and 1,200+ vendors use PRINTZAPP every day. Pick your role to get started.</p>
            <div className="mt-8 glass-panel max-w-md rounded-3xl p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl glass-tint text-primary-foreground"><active.icon className="h-6 w-6" /></div>
                <div>
                  <div className="text-sm text-muted-foreground">Joining as</div>
                  <div className="text-lg font-bold">{active.label}</div>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5">
                {active.perks.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} PRINTZAPP</div>
        </div>

        <div className="flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-8 inline-flex items-center lg:hidden">
              <Logo className="h-10" />
            </Link>

            {isVendorSubmitted ? (
              <div className="glass-strong rounded-3xl p-8 text-center animate-in fade-in zoom-in duration-500">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-inner">
                  <Clock className="h-10 w-10 animate-pulse" />
                </div>
                <h2 className="mb-3 text-2xl font-bold">Application Under Review</h2>
                <p className="mb-8 text-muted-foreground">
                  Thank you for applying to become a PRINTZAPP vendor! Our team is currently reviewing your application. We will notify you via email once your account is approved.
                </p>
                <Link to="/" className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90">
                  Return to Home
                </Link>
              </div>
            ) : (
            <div className="glass-strong rounded-3xl p-7">
              <h2 className="text-2xl font-bold">Create your account</h2>
              <p className="mt-1 text-sm text-muted-foreground">Get started in less than 60 seconds</p>

              <Tabs value={role} onValueChange={setRole} className="mt-6">
                <TabsList className="glass-panel grid w-full grid-cols-2 rounded-2xl p-1">
                  {roles.map((r) => (
                    <TabsTrigger key={r.value} value={r.value} className="rounded-xl text-xs data-[state=active]:bg-white/95 data-[state=active]:shadow-md">
                      <r.icon className="mr-1.5 h-3.5 w-3.5" />{r.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  setIsLoading(true);
                  try {
                    const form = new FormData(e.currentTarget);
                    const result = await registerFn({
                      data: {
                        name: String(form.get("name") ?? ""),
                        email: String(form.get("email") ?? ""),
                        password: String(form.get("password") ?? ""),
                        role: role as "customer" | "vendor",
                        gstin: role === "vendor" ? String(form.get("gst") ?? "") : undefined,
                      },
                    });
                    
                    if (result && "error" in result && result.error) {
                      setError(result.error);
                      return;
                    }
                    
                    if (role === "vendor") {
                      setIsVendorSubmitted(true);
                    } else {
                      if (result && "user" in result && result.user) {
                        setUser(result.user);
                      }
                      navigate({ to: active.dest });
                    }
                  } catch (err: any) {
                    let errorMessage = err.message || "An error occurred. Please check your inputs.";
                    try {
                      // Attempt to parse Zod validation errors from the server
                      const parsedError = JSON.parse(errorMessage);
                      if (Array.isArray(parsedError) && parsedError.length > 0 && parsedError[0].message) {
                        errorMessage = parsedError.map(e => e.message).join(", ");
                      }
                    } catch (e) {
                      // Not a JSON string, keep the original message
                    }
                    setError(errorMessage);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="mt-6 space-y-4"
              >
                {error && (
                  <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="name">{role === "vendor" ? "Business name" : "Full name"}</Label>
                  <div className="relative">
                    {role === "vendor" ? (
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    ) : (
                      <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    )}
                    <Input name="name" id="name" placeholder={role === "vendor" ? "Inkwell Press Pvt Ltd" : "Priya Sharma"} className="h-11 rounded-xl bg-white/78 pl-10 backdrop-blur" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input name="email" id="email" type="email" placeholder="you@company.com" className="h-11 rounded-xl bg-white/78 pl-10 backdrop-blur" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input name="password" id="password" type="password" placeholder="At least 8 characters" className="h-11 rounded-xl bg-white/78 pl-10 backdrop-blur" required />
                  </div>
                </div>

                {role === "vendor" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="gst">GSTIN (optional)</Label>
                    <Input name="gst" id="gst" placeholder="22AAAAA0000A1Z5" className="h-11 rounded-xl bg-white/78 backdrop-blur" />
                  </div>
                )}

                <Button type="submit" disabled={isLoading} className="h-11 w-full rounded-xl text-base">
                  {isLoading ? "Creating account..." : `Create ${active.label} account`} {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  By continuing you agree to our Terms of Service & Privacy Policy.
                </p>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
              </p>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
