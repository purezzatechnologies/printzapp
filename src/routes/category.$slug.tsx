import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { StorefrontLayout } from "@/components/storefront-layout";
import { ProductCard } from "@/components/product-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories } from "@/lib/data";
import { getCategoryFn } from "@/lib/backend";

export const Route = createFileRoute("/category/$slug")({
  loader: async ({ params }) => ({ cat: await getCategoryFn({ data: { slug: params.slug } }) }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.cat.name} — PRINTZAPP` },
      { name: "description", content: loaderData.cat.tagline },
      { property: "og:title", content: `${loaderData.cat.name} — PRINTZAPP` },
      { property: "og:description", content: loaderData.cat.tagline },
      { property: "og:image", content: loaderData.cat.image },
    ] : [],
  }),
  component: CategoryPage,
  notFoundComponent: () => (
    <StorefrontLayout>
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-3xl font-bold">Category not found</h1>
        <Link to="/" className="mt-4 inline-block text-primary">← Back to home</Link>
      </div>
    </StorefrontLayout>
  ),
});

function FilterSidebar({
  selectedPrices = [],
  setSelectedPrices = () => {},
  selectedTurnarounds = [],
  setSelectedTurnarounds = () => {},
}: {
  selectedPrices?: string[];
  setSelectedPrices?: (v: string[]) => void;
  selectedTurnarounds?: string[];
  setSelectedTurnarounds?: (v: string[]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-3 text-sm font-semibold">Categories</h4>
        <div className="space-y-1">
          {categories.map((c) => (
            <Link key={c.slug} to="/category/$slug" params={{ slug: c.slug }}
              className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: "block rounded-md px-2 py-1.5 text-sm font-semibold text-primary bg-accent" }}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-3 text-sm font-semibold">Price range</h4>
        <div className="space-y-2 text-sm">
          {["Under ₹500", "₹500 – ₹1500", "₹1500 – ₹5000", "Above ₹5000"].map((r) => (
            <label key={r} className="flex items-center gap-2 text-muted-foreground">
              <input 
                type="checkbox" 
                className="rounded" 
                checked={selectedPrices.includes(r)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedPrices([...selectedPrices, r]);
                  else setSelectedPrices(selectedPrices.filter((x) => x !== r));
                }}
              />
              {r}
            </label>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-3 text-sm font-semibold">Turnaround</h4>
        <div className="space-y-2 text-sm">
          {["Same Day", "Express (2 days)", "Standard (5 days)"].map((r) => (
            <label key={r} className="flex items-center gap-2 text-muted-foreground">
              <input 
                type="checkbox" 
                className="rounded" 
                checked={selectedTurnarounds.includes(r)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedTurnarounds([...selectedTurnarounds, r]);
                  else setSelectedTurnarounds(selectedTurnarounds.filter((x) => x !== r));
                }}
              />
              {r}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryPage() {
  const { cat } = Route.useLoaderData() as Awaited<ReturnType<typeof Route.options.loader>>;
  const [sortOption, setSortOption] = useState("Featured");
  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);
  const [selectedTurnarounds, setSelectedTurnarounds] = useState<string[]>([]);
  
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setSelectedPrices([]);
    setSelectedTurnarounds([]);
  }, [cat.name]);

  const sortedProducts = useMemo(() => {
    let products = [...cat.products];

    if (selectedPrices.length > 0) {
      products = products.filter((p) =>
        selectedPrices.some((r) => {
          if (r === "Under ₹500") return p.basePrice < 500;
          if (r === "₹500 – ₹1500") return p.basePrice >= 500 && p.basePrice <= 1500;
          if (r === "₹1500 – ₹5000") return p.basePrice >= 1500 && p.basePrice <= 5000;
          if (r === "Above ₹5000") return p.basePrice > 5000;
          return false;
        })
      );
    }

    if (selectedTurnarounds.length > 0) {
      products = products.filter((p) =>
        selectedTurnarounds.some((r) => {
          if (r === "Same Day") return p.turnarounds.some((t: any) => t.days === 1 || t.label.includes("Same Day") || t.label.includes("Next Day"));
          if (r === "Express (2 days)") return p.turnarounds.some((t: any) => t.label.includes("Express") || t.days === 2 || t.days === 3);
          if (r === "Standard (5 days)") return p.turnarounds.some((t: any) => t.label.includes("Standard") || t.days >= 4);
          return false;
        })
      );
    }

    switch (sortOption) {
      case "Price: Low to High":
        return products.sort((a, b) => a.basePrice - b.basePrice);
      case "Price: High to Low":
        return products.sort((a, b) => b.basePrice - a.basePrice);
      case "Top Rated":
        return products.sort((a, b) => b.rating - a.rating);
      case "Featured":
      default:
        return products;
    }
  }, [cat.products, sortOption, selectedPrices, selectedTurnarounds]);

  return (
    <StorefrontLayout>
      <div className="relative h-56 overflow-hidden md:h-72">
        <img src={cat.image} alt={cat.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-dark/85 via-primary/60 to-transparent" />
        <div className="absolute inset-0 mx-auto flex max-w-7xl flex-col justify-center px-4 text-white">
          <div className="text-xs font-medium uppercase tracking-wider opacity-80">Category</div>
          <h1 className="mt-1 text-3xl font-bold md:text-5xl">{cat.name}</h1>
          <p className="mt-2 max-w-xl text-white/90">{cat.tagline}</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[240px_1fr]">
        <aside className="hidden md:block">
          <Card className="p-5"><FilterSidebar selectedPrices={selectedPrices} setSelectedPrices={setSelectedPrices} selectedTurnarounds={selectedTurnarounds} setSelectedTurnarounds={setSelectedTurnarounds} /></Card>
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{sortedProducts.length} products</div>
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="md:hidden"><SlidersHorizontal className="mr-2 h-4 w-4" /> Filters</Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
                  <div className="pt-6"><FilterSidebar selectedPrices={selectedPrices} setSelectedPrices={setSelectedPrices} selectedTurnarounds={selectedTurnarounds} setSelectedTurnarounds={setSelectedTurnarounds} /></div>
                </SheetContent>
              </Sheet>
              <Select value={sortOption} onValueChange={setSortOption}>
                <SelectTrigger className="w-auto justify-center gap-2 rounded-xl">
                  <SelectValue placeholder="Featured" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Featured">Featured</SelectItem>
                  <SelectItem value="Price: Low to High">Price: Low to High</SelectItem>
                  <SelectItem value="Price: High to Low">Price: High to Low</SelectItem>
                  <SelectItem value="Top Rated">Top Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {sortedProducts.map((p: typeof cat.products[number]) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      </div>
    </StorefrontLayout>
  );
}
