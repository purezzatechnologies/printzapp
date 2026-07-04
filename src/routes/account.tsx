import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Heart,
  MapPin,
  UserCog,
  LogOut,
} from "lucide-react";
import { StorefrontLayout } from "@/components/storefront-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUserFn } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

const tabs = [
  { to: "/account", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/account/orders", label: "Orders", icon: Package },
  { to: "/account/wishlist", label: "Wishlist", icon: Heart },
  { to: "/account/addresses", label: "Addresses", icon: MapPin },
  { to: "/account/profile", label: "Profile", icon: UserCog },
];

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "My Account — PRINTZAPP" }] }),
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirect: "/account" } as any,
      });
    }
    return { user };
  },
  loader: async () => ({ user: await getCurrentUserFn() }),
  component: AccountLayout,
});

function AccountLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { user } = Route.useLoaderData() as {
    user: Awaited<ReturnType<typeof getCurrentUserFn>>;
  };

  if (!user) return null;

  const memberSince = user.memberSince
    ? new Date(user.memberSince).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <StorefrontLayout>
      <div className="border-b bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="mx-auto max-w-7xl px-4 pb-2 pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">{user.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {user.email} · Member since {memberSince}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>

          <nav className="-mb-px mt-6 flex gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const active = t.exact
                ? location.pathname === t.to
                : location.pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${active ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </div>
    </StorefrontLayout>
  );
}

// Default export so the existing public-not-signed-in fallback still has
// somewhere to land — but really beforeLoad redirects to /login.
export function NotSignedIn() {
  return (
    <StorefrontLayout>
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">Sign in required</h1>
        <p className="mt-3 text-muted-foreground">
          Please sign in to view your orders and saved details.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/login">
            <Button>Sign in</Button>
          </Link>
          <Link to="/signup">
            <Button variant="outline">Create account</Button>
          </Link>
        </div>
      </div>
    </StorefrontLayout>
  );
}

// Re-export helper so card components can render bytes consistently
export { Card };
