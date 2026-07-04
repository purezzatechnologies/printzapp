import { createFileRoute, notFound } from "@tanstack/react-router";
import { StaffLogin } from "@/components/staff-login";
import { staffPortalMatchesFn } from "@/lib/backend";

// Catch-all single-segment route that powers the configurable "secret" staff
// URL. Static routes (/login, /cart, /superadmin, …) always take priority, so
// this only ever handles otherwise-unknown top-level paths: if the path equals
// the configured admin slug we show the staff login, otherwise we 404 exactly
// like any other unknown URL. The real slug is never revealed by the API.
export const Route = createFileRoute("/$adminSlug")({
  beforeLoad: async ({ params }) => {
    const { valid } = await staffPortalMatchesFn({
      data: { slug: params.adminSlug },
    });
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
