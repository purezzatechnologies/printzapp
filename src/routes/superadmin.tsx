import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Store,
  Users,
  Package,
  IndianRupee,
  ShieldCheck,
  BarChart3,
  Settings,
  Megaphone,
  Boxes,
  Tag,
  Wallet,
  MessageSquareWarning,
  LifeBuoy,
  UsersRound,
} from "lucide-react";
import { PortalLayout } from "@/components/portal-layout";
import { getCurrentUserFn } from "@/lib/backend";

const superadminNav = [
  { to: "/superadmin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/superadmin/vendors", label: "Vendor Network", icon: Store },
  { to: "/superadmin/users", label: "All Users", icon: UsersRound },
  { to: "/superadmin/customers", label: "Customers", icon: Users },
  { to: "/superadmin/orders", label: "Orders", icon: Package },
  { to: "/superadmin/finance", label: "Finance", icon: IndianRupee },
  { to: "/superadmin/payouts", label: "Payouts", icon: Wallet },
  { to: "/superadmin/coupons", label: "Coupons", icon: Tag },
  { to: "/superadmin/complaints", label: "Complaints", icon: MessageSquareWarning },
  { to: "/superadmin/disputes", label: "Dispute Center", icon: LifeBuoy },
  { to: "/superadmin/marketing", label: "Marketing", icon: Megaphone },
  { to: "/superadmin/content", label: "Products", icon: Boxes },
  { to: "/superadmin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/superadmin/security", label: "Security & Roles", icon: ShieldCheck },
  { to: "/superadmin/settings", label: "Platform Settings", icon: Settings },
];

export const Route = createFileRoute("/superadmin")({
  head: () => ({ meta: [{ title: "Super Admin — PRINTZAPP" }] }),
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      // Unauthenticated → staff sign-in (kept separate from the public login).
      throw redirect({ to: "/control" });
    }
    if (user.role !== "superadmin") {
      throw redirect({ to: "/" });
    }
    return { user };
  },
  component: () => (
    <PortalLayout kind="superadmin" navItems={superadminNav} title="Super Admin" />
  ),
});
