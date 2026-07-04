import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getVendorProductsFn, setVendorProductActiveFn } from "@/lib/backend";

export const Route = createFileRoute("/vendor/products")({
  loader: async () => ({ products: await getVendorProductsFn() }),
  component: VendorProducts,
});

function VendorProducts() {
  const { products: initialProducts } = Route.useLoaderData() as { products: Awaited<ReturnType<typeof getVendorProductsFn>> };
  const [products, setProducts] = useState(initialProducts);

  const toggle = async (slug: string, active: boolean) => {
    await setVendorProductActiveFn({ data: { slug, active } });
    setProducts((current) => current.map((product) => (product.slug === slug ? { ...product, active } : product)));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Products & Pricing</h2>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th>50 qty</th><th>100 qty</th><th>250 qty</th><th>500 qty</th>
                <th>Daily Cap</th><th>Turnaround</th><th>Active</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 10).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={p.image} alt={p.name} className="h-10 w-10 rounded-md object-cover" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td>₹{p.basePrice}</td>
                  <td>₹{Math.round(p.basePrice * 1.8)}</td>
                  <td>₹{Math.round(p.basePrice * 4)}</td>
                  <td>₹{Math.round(p.basePrice * 7.5)}</td>
                  <td>500</td>
                  <td>3 days</td>
                  <td><Switch checked={Boolean(p.active)} onCheckedChange={(checked) => toggle(p.slug, checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
