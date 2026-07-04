import { useBranding } from "@/lib/branding";

/**
 * Brand logo. Renders the custom logo uploaded in the super-admin panel, or the
 * bundled default. Size it with the `className` height, e.g. <Logo className="h-9" />.
 */
export function Logo({ className = "h-9" }: { className?: string }) {
  const { logoUrl } = useBranding();
  return (
    <img
      src={logoUrl}
      alt="Printzapp"
      className={`w-auto object-contain ${className}`}
      draggable={false}
    />
  );
}
