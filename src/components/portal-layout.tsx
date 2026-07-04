import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Package, Wallet, MessageSquareWarning, BarChart3, Settings, Boxes, LogOut, Home, Search, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const navItems = [
  { to: "/vendor", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/vendor/orders", label: "Orders", icon: Package },
  { to: "/vendor/customers", label: "Customers", icon: Users },
  { to: "/vendor/lookup", label: "Order Lookup", icon: Search },
  { to: "/vendor/products", label: "Products & Pricing", icon: Boxes },
  { to: "/vendor/finance", label: "Finance", icon: Wallet },
  { to: "/vendor/complaints", label: "Complaints", icon: MessageSquareWarning },
  { to: "/vendor/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/vendor/settings", label: "Settings", icon: Settings },
];

function makeInitials(name: string | undefined, fallback: string) {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const settingsPathByKind: Record<"vendor" | "admin" | "superadmin", string> = {
  vendor: "/vendor/settings",
  superadmin: "/superadmin/settings",
  admin: "/superadmin/settings",
};

export function PortalLayout({ kind, navItems: items, title }: { kind: "vendor" | "admin" | "superadmin"; navItems: typeof navItems; title: string }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const fallbackInitials = kind === "vendor" ? "IP" : kind === "superadmin" ? "SA" : "AD";
  const fallbackName = kind === "vendor" ? "Vendor" : kind === "superadmin" ? "Super Admin" : "Admin";
  const initials = makeInitials(user?.name, fallbackInitials);
  const who = user?.name ?? fallbackName;
  const settingsPath = settingsPathByKind[kind];

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out");
      // Staff return to the separate admin sign-in; vendors to the public one.
      navigate({ to: kind === "superadmin" || kind === "admin" ? "/control" : "/login" });
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />

      <aside className="relative z-10 hidden w-64 flex-col glass-strong border-r border-white/40 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-white/40 px-5">
          <Logo className="h-9" />
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active = item.exact ? loc.pathname === item.to : loc.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-base ${active ? "glass-tint text-primary-foreground font-semibold shadow-elevated" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"}`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/40 p-3">
          <Link to="/" className="block rounded-2xl px-3 py-2 text-xs text-muted-foreground hover:bg-primary/10">← Back to storefront</Link>
        </div>
      </aside>

      <div className="relative z-10 flex-1">
        <header className="flex h-16 items-center gap-3 glass-nav px-4 lg:px-8">
          <h1 className="text-lg font-bold capitalize">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full glass px-3 py-1.5 transition-colors hover:bg-primary/10"
                >
                  <div className="grid h-7 w-7 place-items-center rounded-full glass-tint text-xs font-bold text-primary-foreground">{initials}</div>
                  <span className="hidden text-sm font-medium md:inline">{who}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="text-sm font-semibold">{who}</span>
                  {user?.email && (
                    <span className="text-xs font-normal text-foreground/60">{user.email}</span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={settingsPath} className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/" className="flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    Back to storefront
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleLogout();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

export const vendorNavItems = navItems;
