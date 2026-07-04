import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for the orders section. The list lives in
// `account.orders.index.tsx` and the single-order view in
// `account.orders.$id.tsx`; this just renders whichever child matches so the
// detail page isn't shadowed by the list.
export const Route = createFileRoute("/account/orders")({
  component: () => <Outlet />,
});
