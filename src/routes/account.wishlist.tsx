import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import { getMyWishlistFn, toggleWishlistFn } from "@/lib/backend";

export const Route = createFileRoute("/account/wishlist")({
  loader: async () => await getMyWishlistFn(),
  component: WishlistPage,
});

type Product = Awaited<ReturnType<typeof getMyWishlistFn>>[number];

function WishlistPage() {
  const initial = Route.useLoaderData() as Product[];
  const [items, setItems] = useState<Product[]>(initial);

  const remove = async (slug: string) => {
    const result = await toggleWishlistFn({ data: { slug } });
    if (result.success) {
      setItems((current) => current.filter((p) => p.slug !== slug));
    }
  };

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <Heart className="h-10 w-10 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-bold">Your wishlist is empty</h2>
          <p className="text-sm text-muted-foreground">
            Tap the heart icon on any product to save it for later.
          </p>
        </div>
        <Link to="/">
          <Button>
            <ShoppingBag className="mr-1.5 h-4 w-4" />
            Browse catalog
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Wishlist</h2>
        <p className="text-sm text-muted-foreground">
          {items.length} saved {items.length === 1 ? "design" : "designs"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <Card key={p.id} className="group flex flex-col overflow-hidden p-0">
            <Link
              to="/product/$slug"
              params={{ slug: p.slug }}
              className="block overflow-hidden"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={p.image}
                  alt={p.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </Link>
            <div className="flex flex-1 flex-col p-3">
              <Link
                to="/product/$slug"
                params={{ slug: p.slug }}
                className="line-clamp-1 text-sm font-semibold hover:text-primary"
              >
                {p.name}
              </Link>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {p.category.replace(/-/g, " ")}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-primary">
                  ₹{p.basePrice}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => remove(p.slug)}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              </div>
              <Link
                to="/product/$slug"
                params={{ slug: p.slug }}
                className="mt-2"
              >
                <Button size="sm" className="w-full">
                  Customize &amp; order
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
