import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalLayout, vendorNavItems } from "@/components/portal-layout";
import { getCurrentUserFn } from "@/lib/backend";

export const Route = createFileRoute("/vendor")({
  head: () => ({ meta: [{ title: "Vendor Portal — PRINTZAPP" }] }),
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: "/vendor" } as any });
    }
    if (user.role !== "vendor" && user.role !== "superadmin") {
      throw redirect({ to: "/" });
    }
    return { user };
  },
  component: () => (
    <PortalLayout kind="vendor" navItems={vendorNavItems} title="Vendor Portal" />
  ),
});
