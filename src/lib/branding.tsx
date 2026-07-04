import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getBrandingFn } from "@/lib/backend";

const DEFAULT_LOGO = "/logo.svg";

type BrandingContextValue = {
  /** The logo URL to render (custom upload or the bundled default). */
  logoUrl: string;
  /** Re-fetch after an admin uploads/resets the logo. */
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string>(DEFAULT_LOGO);

  const refresh = useCallback(async () => {
    try {
      const { logoUrl: custom } = await getBrandingFn();
      setLogoUrl(custom || DEFAULT_LOGO);
    } catch {
      setLogoUrl(DEFAULT_LOGO);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <BrandingContext.Provider value={{ logoUrl, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  // Safe fallback so <Logo> still works if rendered outside the provider.
  if (!ctx) return { logoUrl: DEFAULT_LOGO, refresh: async () => {} };
  return ctx;
}
