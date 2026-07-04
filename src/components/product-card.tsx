import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import type { Product } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to="/product/$slug" params={{ slug: product.slug }} className="group">
      <Card className="overflow-hidden glass p-0 transition-base hover-lift">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_46%,oklch(0_0_0_/0.1)_100%)]" />
          {product.badge && <Badge className="absolute left-3 top-3 glass-subtle text-primary shadow-sm">{product.badge}</Badge>}
        </div>
        <div className="p-4">
          <h3 className="line-clamp-1 text-sm font-semibold tracking-tight">{product.name}</h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            <span className="font-medium text-foreground">{product.rating.toFixed(1)}</span>
            <span>({product.reviews})</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Starting at</span>
              <span className="text-base font-bold text-primary">₹{product.basePrice}</span>
            </div>
            <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-primary shadow-sm ring-1 ring-border/60">View</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
