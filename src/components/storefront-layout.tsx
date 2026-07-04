import { SiteHeader, SiteFooter } from "@/components/site-chrome";

export function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,oklch(1_0_0_/0.72),transparent_32%),radial-gradient(circle_at_top_right,oklch(0.84_0.08_240_/0.16),transparent_28%),radial-gradient(circle_at_bottom,oklch(0.78_0.06_236_/0.12),transparent_54%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,oklch(1_0_0_/0.72),transparent)]" />
      <SiteHeader />
      <main className="relative z-10 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
