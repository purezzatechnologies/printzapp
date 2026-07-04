import { Link, useNavigate } from "@tanstack/react-router";
import {
  ShoppingCart,
  User,
  Menu,
  Search,
  Loader2,
  LogOut,
  Package,
  UserCog,
  LayoutDashboard,
  Store,
  ShieldCheck,
  X,
  Boxes,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categories } from "@/lib/data";
import { Logo } from "@/components/logo";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { subscribeNewsletterFn, getAllProductsFn } from "@/lib/backend";
import { toast } from "sonner";

type SearchProduct = { slug: string; name: string; image: string; categoryName?: string };

const portalByRole = {
  customer: { to: "/account" as const, label: "My Account", icon: LayoutDashboard },
  vendor: { to: "/vendor" as const, label: "Vendor Portal", icon: Store },
  superadmin: { to: "/superadmin" as const, label: "Super Admin", icon: ShieldCheck },
};

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { itemCount } = useCart();
  const { user, logout } = useAuth();
  const portal = user ? portalByRole[user.role] : null;
  const initial = user?.name?.charAt(0).toUpperCase() ?? "";

  // In-page search overlay state. Products are fetched from the real catalog
  // the first time the overlay opens (never the browser's native search).
  const [searchOpen, setSearchOpen] = useState(false);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const openSearch = () => {
    setSearchOpen(true);
    if (!productsLoaded) {
      getAllProductsFn()
        .then((all) => setProducts(all as SearchProduct[]))
        .catch(() => {})
        .finally(() => setProductsLoaded(true));
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out");
      navigate({ to: "/" });
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <>
      {searchOpen && (
        <SearchOverlay
          products={products}
          productsLoaded={productsLoaded}
          onClose={() => setSearchOpen(false)}
          onPickProduct={(slug) => {
            setSearchOpen(false);
            navigate({ to: "/product/$slug", params: { slug } });
          }}
          onPickCategory={(slug) => {
            setSearchOpen(false);
            navigate({ to: "/category/$slug", params: { slug } });
          }}
        />
      )}
      <header className="sticky top-0 z-40 glass-nav shadow-[0_12px_44px_-22px_oklch(0.5_0.16_248_/_0.36)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden glass-chip">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 glass-strong border-white/50">
              <div className="mt-8 space-y-1">
                {categories.map((c) => (
                  <Link
                    key={c.slug}
                    to="/category/$slug"
                    params={{ slug: c.slug }}
                    onClick={() => setOpen(false)}
                    className="block rounded-2xl px-3 py-3 text-sm font-medium transition-base hover:bg-accent/75 hover:text-accent-foreground"
                  >
                    {c.name}
                  </Link>
                ))}
                <div className="my-3 border-t" />
                <Link
                  to="/vendor"
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-3 py-3 text-sm font-medium transition-base hover:bg-accent/75 hover:text-accent-foreground"
                >
                  Vendor Portal
                </Link>
                <div className="my-3 border-t" />
                {user && portal ? (
                  <>
                    <div className="px-3 py-2 text-xs text-foreground/60">Signed in as</div>
                    <div className="px-3 pb-2 text-sm font-semibold">{user.name}</div>
                    <Link
                      to={portal.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl px-3 py-3 text-sm font-medium transition-base hover:bg-accent/75 hover:text-accent-foreground"
                    >
                      {portal.label}
                    </Link>
                    {user.role === "customer" && (
                      <>
                        <Link
                          to="/account/orders"
                          onClick={() => setOpen(false)}
                          className="block rounded-2xl px-3 py-3 text-sm font-medium transition-base hover:bg-accent/75 hover:text-accent-foreground"
                        >
                          Orders
                        </Link>
                        <Link
                          to="/account/profile"
                          onClick={() => setOpen(false)}
                          className="block rounded-2xl px-3 py-3 text-sm font-medium transition-base hover:bg-accent/75 hover:text-accent-foreground"
                        >
                          Profile
                        </Link>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        await handleLogout();
                      }}
                      className="block w-full rounded-2xl px-3 py-3 text-left text-sm font-medium text-destructive transition-base hover:bg-destructive/10"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl px-3 py-3 text-sm font-medium transition-base hover:bg-accent/75 hover:text-accent-foreground"
                    >
                      Sign in
                    </Link>
                    <Link
                      to="/signup"
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl glass-tint px-3 py-3 text-sm font-semibold text-primary-foreground"
                    >
                      Create account
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center">
            <Logo className="h-10" />
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {categories.slice(0, 5).map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="rounded-2xl px-3 py-2 text-sm font-medium text-foreground/80 transition-base hover:bg-accent/70 hover:text-accent-foreground"
                activeProps={{
                  className:
                    "rounded-2xl px-3 py-2 text-sm font-semibold text-primary-foreground bg-primary shadow-[0_10px_28px_-14px_oklch(0.52_0.16_248_/_0.52)]",
                }}
              >
                {c.name}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="glass-chip"
              aria-label="Search"
              onClick={openSearch}
            >
              <Search className="h-5 w-5" />
            </Button>
            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative glass-chip">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {itemCount}
                </span>
              </Button>
            </Link>
            {user && portal ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden md:inline-flex items-center gap-2 glass-chip"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {initial}
                      </span>
                      <span className="max-w-[10rem] truncate">{user.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="flex flex-col">
                      <span className="text-sm font-semibold">{user.name}</span>
                      <span className="text-xs font-normal text-foreground/60">{user.email}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={portal.to} className="flex items-center gap-2">
                        <portal.icon className="h-4 w-4" />
                        {portal.label}
                      </Link>
                    </DropdownMenuItem>
                    {user.role === "customer" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/account/orders" className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Orders
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/account/profile" className="flex items-center gap-2">
                            <UserCog className="h-4 w-4" />
                            Profile
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
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
                <Link to={portal.to} className="md:hidden">
                  <Button variant="ghost" size="icon" className="glass-chip">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {initial}
                    </span>
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden md:inline-flex">
                  <Button variant="ghost" size="sm" className="glass-chip">
                    Sign in
                  </Button>
                </Link>
                <Link to="/signup" className="hidden md:inline-flex">
                  <Button size="sm" className="glass-tint">
                    Sign up
                  </Button>
                </Link>
                <Link to="/login" className="md:hidden">
                  <Button variant="ghost" size="icon" className="glass-chip">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

// In-page search overlay. Filters the real product catalog + categories live
// and navigates on selection — replaces the browser's native prompt/search.
function SearchOverlay({
  products,
  productsLoaded,
  onClose,
  onPickProduct,
  onPickCategory,
}: {
  products: SearchProduct[];
  productsLoaded: boolean;
  onClose: () => void;
  onPickProduct: (slug: string) => void;
  onPickCategory: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const matchedProducts = q
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.slug.toLowerCase().includes(q) ||
            (p.categoryName ?? "").toLowerCase().includes(q),
        )
        .slice(0, 8)
    : [];
  const matchedCategories = q
    ? categories
        .filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
        .slice(0, 5)
    : [];
  const hasResults = matchedProducts.length > 0 || matchedCategories.length > 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (matchedProducts[0]) onPickProduct(matchedProducts[0].slug);
    else if (matchedCategories[0]) onPickCategory(matchedCategories[0].slug);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={onSubmit} className="flex items-center gap-2 border-b px-4">
          <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products or categories…"
            className="h-14 w-full bg-transparent text-base outline-none"
            aria-label="Search products or categories"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>
        </form>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {!q ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Start typing to search the catalog.
            </p>
          ) : !productsLoaded ? (
            <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
            </p>
          ) : !hasResults ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No products or categories match “{query}”.
            </p>
          ) : (
            <>
              {matchedCategories.length > 0 && (
                <div className="mb-1">
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Categories
                  </div>
                  {matchedCategories.map((c) => (
                    <button
                      key={c.slug}
                      onClick={() => onPickCategory(c.slug)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <Boxes className="h-4 w-4 text-primary" />
                      <span className="font-medium">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {matchedProducts.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Products
                  </div>
                  {matchedProducts.map((p) => (
                    <button
                      key={p.slug}
                      onClick={() => onPickProduct(p.slug)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <img
                        src={p.image}
                        alt=""
                        className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        {p.categoryName && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.categoryName}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <footer className="mt-20 glass-subtle border-t border-white/40 shadow-[0_-14px_42px_-24px_oklch(0.52_0.16_248_/_0.34)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4">
        <div>
          <Logo className="h-11" />
          <p className="mt-3 text-sm text-foreground/80">
            India&apos;s smartest online printing marketplace. Trusted by 50,000+ businesses.
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Shop</h4>
          <ul className="space-y-2 text-sm text-foreground/80">
            {categories.slice(0, 5).map((c) => (
              <li key={c.slug}>
                <Link to="/category/$slug" params={{ slug: c.slug }} className="hover:text-primary">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Company</h4>
          <ul className="space-y-2 text-sm text-foreground/80">
            <li>
              <Link to="/vendor" className="hover:text-primary">
                Become a Vendor
              </Link>
            </li>
            <li>
              <a
                href="mailto:hello@printzapp.in?subject=About%20PRINTZAPP"
                className="hover:text-primary"
              >
                About Us
              </a>
            </li>
            <li>
              <a
                href="mailto:support@printzapp.in?subject=Contact%20PRINTZAPP"
                className="hover:text-primary"
              >
                Contact
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Newsletter</h4>
          <p className="mb-3 text-sm text-foreground/80">Get 10% off your first order.</p>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const trimmedEmail = newsletterEmail.trim();
              if (!trimmedEmail) {
                setNewsletterStatus("Enter an email address first.");
                toast.error("Please enter an email address.");
                return;
              }

              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(trimmedEmail)) {
                setNewsletterStatus("Please enter a valid email address.");
                toast.error("Invalid email address.");
                return;
              }

              setIsSubmitting(true);
              setNewsletterStatus("");

              try {
                await subscribeNewsletterFn({ data: { email: trimmedEmail } });
                setNewsletterStatus("Thanks for subscribing!");
                toast.success("Successfully subscribed to newsletter!");
                setNewsletterEmail("");
              } catch (error) {
                setNewsletterStatus("Failed to subscribe. Please try again.");
                toast.error("Subscription failed. Please try again.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <input
              className="glass h-10 flex-1 rounded-2xl px-3 text-sm"
              placeholder="Email address"
              type="email"
              value={newsletterEmail}
              disabled={isSubmitting}
              onChange={(e) => {
                setNewsletterEmail(e.target.value);
                setNewsletterStatus("");
              }}
            />
            <Button className="glass-tint" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
            </Button>
          </form>
          {newsletterStatus && (
            <p
              className={`mt-2 text-xs font-medium ${newsletterStatus.includes("Thanks") ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
            >
              {newsletterStatus}
            </p>
          )}
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-foreground/80">
        © {new Date().getFullYear()} PRINTZAPP. All rights reserved.
      </div>
    </footer>
  );
}
