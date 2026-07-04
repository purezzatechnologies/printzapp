import { createFileRoute, notFound } from "@tanstack/react-router";
import { StaffLogin } from "@/components/staff-login";
import { staffPortalMatchesFn } from "@/lib/backend";

// Built-in staff (super admin) sign-in. Reachable at /control only while the
// admin slug is left at its default. Once a custom secret slug is configured
// in Platform Settings, this default path is hidden (404) and the portal is
// reached solely through the secret slug route.
export const Route = createFileRoute("/control")({
  beforeLoad: async () => {
    const { valid } = await staffPortalMatchesFn({ data: { slug: "control" } });
    if (!valid) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Staff Sign in — PRINTZAPP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffLogin,
});
