import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Edit2, Image as ImageIcon, Layers3, X, Save, AlertCircle, Upload, Film, ArrowUp, ArrowDown, GalleryHorizontalEnd, RefreshCw, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type Category, type Product } from "@/lib/data";
import {
  createCatalogCategoryFn,
  createCatalogProductFn,
  deleteCatalogCategoryFn,
  deleteCatalogProductFn,
  getCatalogAdminFn,
  getHeroSlidesFn,
  getTestimonialsFn,
  saveCatalogCategoryFn,
  saveCatalogProductFn,
  saveHeroSlidesFn,
  saveTestimonialsFn,
} from "@/lib/backend";

type Testimonial = { name: string; role: string; quote: string; avatar: string };

type LoaderData = Awaited<ReturnType<typeof getCatalogAdminFn>>;

const demoImage = "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1200&h=900&fit=crop&auto=format&q=80";

const blankCategory = (): Category => ({
  slug: "new-category",
  name: "New Category",
  tagline: "Describe the product family here",
  image: demoImage,
  productCount: 0,
  products: [],
});

const blankProduct = (categorySlug: string): Product => {
  const uid = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  const slug = `new-product-${uid.slice(0, 8)}`;
  return {
    id: slug,
    slug,
    name: "New Product",
    category: categorySlug,
    basePrice: 999,
    sku: `SKU-${uid.slice(0, 8).toUpperCase()}`,
    rating: 4.5,
    reviews: 0,
    image: demoImage,
    images: [demoImage],
    videoUrls: [],
    badge: "",
    description: "Describe the product, its use case, and selling points.",
    quantityOptions: [100, 250, 500],
    sizes: ["Standard"],
    finishes: ["Matte"],
    turnarounds: [{ label: "Standard (5 days)", days: 5, multiplier: 1 }],
    artworkRequired: true,
    artworkHint: "Upload print-ready artwork.",
    swatches: [],
    variations: [],
    acceptsDocumentUpload: false,
    printPageRates: [],
    printAddons: [],
    acceptsPhotoUpload: false,
    photoPricingTiers: [],
    photoBackgroundColors: [],
  };
};

const splitCsv = (value: string) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const splitLines = (value: string) => value.split("\n").map((entry) => entry.trim()).filter(Boolean);
const joinCsv = (values: string[]) => values.join(", ");
const joinLines = (values: string[]) => values.join("\n");
const toNumberList = (value: string) =>
  splitCsv(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

export const Route = createFileRoute("/superadmin/content")({
  loader: async () => {
    try {
      const categories = await getCatalogAdminFn();
      return { categories };
    } catch (err: any) {
      return { categories: [], _loadError: String(err?.message ?? err) } as any;
    }
  },
  component: CatalogManagementPage,
});

function CatalogManagementPage() {
  const loaderData = Route.useLoaderData() as any;
  const { categories: initialCategories, _loadError } = loaderData as LoaderData extends Category[] ? { categories: LoaderData; _loadError?: string } : any;
  
  const [catalog, setCatalog] = useState<Category[]>(initialCategories);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editMode, setEditMode] = useState<"edit" | "create">("edit");
  const [modalTab, setModalTab] = useState<"basic" | "media" | "content" | "advanced" | "pricing">("basic");
  
  // Category form state
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategory, setNewCategory] = useState(blankCategory());

  useEffect(() => {
    setCatalog(initialCategories);
  }, [initialCategories]);

  const refreshCatalog = async () => {
    const next = await getCatalogAdminFn();
    setCatalog(next);
    return next;
  };

  const allProducts = useMemo(
    () => catalog.flatMap((entry) => entry.products.map((product) => ({ ...product, categoryName: entry.name }))),
    [catalog]
  );

  const openEditProduct = (product: Product) => {
    setEditingProduct({ ...product });
    setEditMode("edit");
    setModalTab("basic");
  };

  const openNewProduct = () => {
    const categorySlug = catalog[0]?.slug ?? "business-essentials";
    setEditingProduct(blankProduct(categorySlug));
    setEditMode("create");
    setModalTab("basic");
  };

  const closeModal = () => {
    setEditingProduct(null);
  };

  const saveProduct = async () => {
    if (!editingProduct) return;
    setBusy("product");
    setStatus(null);

    const normalized = {
      ...editingProduct,
      id: editingProduct.id || editingProduct.slug,
      sku: editingProduct.sku.trim(),
      name: editingProduct.name.trim(),
      slug: editingProduct.slug.trim(),
      category: editingProduct.category.trim(),
      image: (editingProduct.images[0] ?? editingProduct.image).trim(),
      images: editingProduct.images.map((entry) => entry.trim()).filter(Boolean),
      videoUrls: editingProduct.videoUrls?.map((entry) => entry.trim()).filter(Boolean) ?? [],
      badge: editingProduct.badge?.trim() || undefined,
      description: editingProduct.description.trim(),
      quantityOptions: editingProduct.quantityOptions.filter((entry) => Number.isFinite(entry) && entry > 0),
      sizes: editingProduct.sizes.map((entry) => entry.trim()).filter(Boolean),
      finishes: editingProduct.finishes.map((entry) => entry.trim()).filter(Boolean),
      turnarounds: editingProduct.turnarounds.map((entry) => ({
        label: entry.label.trim(),
        days: Number(entry.days),
        multiplier: Number(entry.multiplier),
      })),
      artworkHint: editingProduct.artworkHint.trim(),
      swatches: editingProduct.swatches.map((entry) => ({ name: entry.name.trim(), hex: entry.hex.trim() })).filter((entry) => entry.name && entry.hex),
      variations: editingProduct.variations.map((entry) => ({
        name: entry.name.trim(),
        sku: entry.sku.trim(),
        price: Number(entry.price),
        image: entry.image?.trim() || undefined,
        active: Boolean(entry.active),
      })),
      acceptsDocumentUpload: Boolean(editingProduct.acceptsDocumentUpload),
      printPageRates: (editingProduct.printPageRates ?? [])
        .map((r) => ({
          colorMode: r.colorMode,
          paperSize: r.paperSize.trim(),
          sides: r.sides,
          pricePerPage: Number(r.pricePerPage),
        }))
        .filter((r) => r.paperSize && Number.isFinite(r.pricePerPage) && r.pricePerPage >= 0),
      printAddons: (editingProduct.printAddons ?? [])
        .map((a) => ({ name: a.name.trim(), price: Number(a.price) }))
        .filter((a) => a.name && Number.isFinite(a.price) && a.price >= 0),
      acceptsPhotoUpload: Boolean(editingProduct.acceptsPhotoUpload),
      photoPricingTiers: (editingProduct.photoPricingTiers ?? [])
        .map((t) => ({ count: Number(t.count), price: Number(t.price) }))
        .filter((t) => Number.isFinite(t.count) && t.count > 0 && Number.isFinite(t.price) && t.price >= 0),
      photoBackgroundColors: (editingProduct.photoBackgroundColors ?? [])
        .map((c) => ({ name: c.name.trim(), hex: c.hex.trim() }))
        .filter((c) => c.name && /^#[0-9a-fA-F]{3,8}$/.test(c.hex)),
    } satisfies Product;

    const result =
      editMode === "create"
        ? await createCatalogProductFn({ data: { product: normalized } })
        : await saveCatalogProductFn({ data: { originalSlug: editingProduct.slug, product: normalized } });

    if (!result.success) {
      setStatus(result.error ?? "Could not save product.");
      setBusy(null);
      return;
    }

    await refreshCatalog();
    setStatus(editMode === "create" ? `Created product ${normalized.name}.` : `Saved product ${normalized.name}.`);
    setEditingProduct(null);
    setBusy(null);
  };

  const deleteProduct = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    
    setBusy("delete");
    setStatus(null);
    const result = await deleteCatalogProductFn({ data: { slug: product.slug } });
    
    if (!result.success) {
      setStatus("Could not delete the product.");
      setBusy(null);
      return;
    }

    await refreshCatalog();
    setStatus(`Deleted "${product.name}".`);
    setBusy(null);
  };

  // Mode for the category form: "create" inserts a new row, "edit" updates
  // an existing one identified by the captured `slug` (the slug itself cannot
  // change because it's the primary key referenced by products).
  const [categoryMode, setCategoryMode] = useState<"create" | "edit">("create");

  const startEditCategory = (cat: Category) => {
    setNewCategory({ ...cat });
    setCategoryMode("edit");
    setShowCategoryForm(true);
  };

  const startCreateCategory = () => {
    setNewCategory(blankCategory());
    setCategoryMode("create");
    setShowCategoryForm(true);
  };

  const saveCategory = async () => {
    setBusy("category");
    setStatus(null);
    const payload = {
      slug: newCategory.slug,
      name: newCategory.name,
      tagline: newCategory.tagline,
      image: newCategory.image,
    };
    const result =
      categoryMode === "create"
        ? await createCatalogCategoryFn({ data: payload })
        : await saveCatalogCategoryFn({ data: payload });

    if (!result.success) {
      setStatus(result.error ?? "Could not save category.");
      setBusy(null);
      return;
    }

    await refreshCatalog();
    setNewCategory(blankCategory());
    setShowCategoryForm(false);
    setCategoryMode("create");
    setStatus(
      categoryMode === "create"
        ? `Created category ${payload.name}.`
        : `Saved category ${payload.name}.`,
    );
    setBusy(null);
  };

  const deleteCategory = async (cat: Category) => {
    if (cat.products.length > 0) {
      setStatus(
        `Cannot delete "${cat.name}": move or delete its ${cat.products.length} product(s) first.`,
      );
      return;
    }
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    setBusy("category");
    setStatus(null);
    const result = await deleteCatalogCategoryFn({ data: { slug: cat.slug } });
    if (!result.success) {
      setStatus(result.error ?? "Could not delete category.");
      setBusy(null);
      return;
    }
    await refreshCatalog();
    setStatus(`Deleted category ${cat.name}.`);
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      {_loadError && (
        <Card className="border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Failed to load catalog: {_loadError}
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Products</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage your product catalog with ease</p>
        </div>
        <Button onClick={openNewProduct} size="lg" className="rounded-xl w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Add New Product
        </Button>
      </div>

      {/* Status message */}
      {status && (
        <Card className="border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary font-medium">
          {status}
        </Card>
      )}

      {/* Homepage hero slider manager */}
      <HeroSliderManager />

      {/* "Loved by businesses" testimonials manager */}
      <TestimonialsManager />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Categories</div>
          <div className="mt-1 text-2xl font-bold">{catalog.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Products</div>
          <div className="mt-1 text-2xl font-bold">{allProducts.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Categories</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {catalog.slice(0, 3).map((cat) => (
              <span key={cat.slug} className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {cat.name}
              </span>
            ))}
            {catalog.length > 3 && <span className="text-xs text-muted-foreground">+{catalog.length - 3}</span>}
          </div>
        </Card>
      </div>

      {/* Products table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-sm font-semibold">
                <th className="px-4 py-4 w-12"></th>
                <th className="px-4 py-4">Product</th>
                <th className="px-4 py-4">SKU</th>
                <th className="px-4 py-4">Category</th>
                <th className="px-4 py-4">Price</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No products yet. Create one to get started.</p>
                  </td>
                </tr>
              ) : (
                allProducts.map((product) => (
                  <tr key={product.slug} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4">
                      <img src={product.image} alt={product.name} className="h-10 w-10 rounded-lg object-cover" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">{product.slug}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{product.sku}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{product.categoryName}</td>
                    <td className="px-4 py-4 font-semibold">₹{product.basePrice}</td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => openEditProduct(product)}
                      >
                        <Edit2 className="mr-1 h-4 w-4" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-destructive hover:bg-destructive/10"
                        onClick={() => deleteProduct(product)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Categories section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-primary" />
              Product Categories
            </h3>
            <p className="text-sm text-muted-foreground mt-1">Organize your products by category</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => (showCategoryForm ? setShowCategoryForm(false) : startCreateCategory())}>
            <Plus className="mr-1 h-4 w-4" /> {showCategoryForm ? "Close form" : "New Category"}
          </Button>
        </div>

        {showCategoryForm && (
          <div className="bg-muted/40 rounded-xl p-4 mb-4 border border-dashed">
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Category name</label>
                <input
                  value={newCategory.name}
                  onChange={(e) => setNewCategory((current) => ({ ...current, name: e.target.value }))}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  placeholder="e.g., Business Essentials"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Slug {categoryMode === "edit" && (<span className="text-xs text-muted-foreground">(locked once products are linked)</span>)}
                </label>
                <input
                  value={newCategory.slug}
                  disabled={categoryMode === "edit"}
                  onChange={(e) => setNewCategory((current) => ({ ...current, slug: e.target.value }))}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm disabled:bg-muted disabled:text-muted-foreground"
                  placeholder="business-essentials"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Tagline</label>
                <input
                  value={newCategory.tagline}
                  onChange={(e) => setNewCategory((current) => ({ ...current, tagline: e.target.value }))}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  placeholder="Short description"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Image URL</label>
                <input
                  value={newCategory.image}
                  onChange={(e) => setNewCategory((current) => ({ ...current, image: e.target.value }))}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveCategory} disabled={busy === "category"} className="rounded-lg">
                  {categoryMode === "create" ? "Create Category" : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={() => { setShowCategoryForm(false); setCategoryMode("create"); }} className="rounded-lg">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          {catalog.map((category) => (
            <div key={category.slug} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <img src={category.image} alt={category.name} className="h-12 w-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{category.name}</div>
                <div className="text-xs text-muted-foreground">{category.tagline}</div>
                <div className="text-[10px] text-muted-foreground">{category.productCount} products</div>
              </div>
              <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full">{category.slug}</span>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => startEditCategory(category)}>
                <Edit2 className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-lg text-destructive disabled:opacity-50"
                disabled={category.products.length > 0}
                title={category.products.length > 0 ? "Move or delete its products first" : "Delete category"}
                onClick={() => deleteCategory(category)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Product Edit Modal */}
      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          mode={editMode}
          tab={modalTab}
          onTabChange={setModalTab}
          onProductChange={setEditingProduct}
          onClose={closeModal}
          onSave={saveProduct}
          isBusy={busy === "product"}
          catalog={catalog}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homepage hero slider manager
//
// Lets the super admin upload / replace / reorder / remove the images shown in
// the storefront homepage hero. Slides are persisted to platform settings and
// read publicly by the homepage loader.
// ---------------------------------------------------------------------------
function HeroSliderManager() {
  const [slides, setSlides] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const addInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceIndexRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    getHeroSlidesFn()
      .then((res) => {
        if (active) setSlides(res.slides);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const readFilesAsDataUrls = async (files: FileList | null) => {
    if (!files?.length) return [];
    return Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
            reader.readAsDataURL(file);
          }),
      ),
    );
  };

  const mutate = (next: string[]) => {
    setSlides(next);
    setDirty(true);
    setStatus(null);
    setError(null);
  };

  const addFiles = async (files: FileList | null) => {
    const uploaded = await readFilesAsDataUrls(files);
    if (!uploaded.length) return;
    mutate([...slides, ...uploaded].slice(0, 12));
  };

  const replaceFile = async (index: number, files: FileList | null) => {
    const uploaded = await readFilesAsDataUrls(files);
    if (!uploaded.length) return;
    mutate(slides.map((s, i) => (i === index ? uploaded[0] : s)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  };

  const remove = (index: number) => {
    mutate(slides.filter((_, i) => i !== index));
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    setError(null);
    const result = await saveHeroSlidesFn({ data: { slides } });
    if (!result.success) {
      setError(result.error ?? "Could not save hero slides.");
      setBusy(false);
      return;
    }
    setSlides(result.slides);
    setDirty(false);
    setStatus("Homepage hero slider updated.");
    setBusy(false);
  };

  return (
    <Card className="p-6">
      <input
        ref={addInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          await addFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const idx = replaceIndexRef.current;
          if (idx !== null) await replaceFile(idx, e.target.files);
          replaceIndexRef.current = null;
          e.currentTarget.value = "";
        }}
      />

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <GalleryHorizontalEnd className="h-5 w-5 text-primary" />
            Homepage hero slider
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload the images shown in the homepage hero. They rotate automatically as a slider.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => addInputRef.current?.click()} className="rounded-lg">
            <Upload className="mr-2 h-4 w-4" /> Add images
          </Button>
          <Button onClick={save} disabled={busy || !dirty} className="rounded-lg">
            <Save className="mr-2 h-4 w-4" /> {busy ? "Saving…" : "Save slider"}
          </Button>
        </div>
      </div>

      {status && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
          {status}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!loaded ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Loading slides…
        </p>
      ) : slides.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No slides yet — the homepage shows the default image. Click{" "}
            <span className="font-medium text-foreground">Add images</span> to build a slider.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slides.map((src, index) => (
            <div key={`${src.slice(0, 24)}-${index}`} className="overflow-hidden rounded-xl border bg-muted/30">
              <div className="relative aspect-video">
                <img src={src} alt={`Hero slide ${index + 1}`} className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                  Slide {index + 1}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg"
                    disabled={index === 0}
                    title="Move left"
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4 -rotate-90" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg"
                    disabled={index === slides.length - 1}
                    title="Move right"
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    title="Replace image"
                    onClick={() => {
                      replaceIndexRef.current = index;
                      replaceInputRef.current?.click();
                    }}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Replace
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                    title="Remove slide"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <p className="mt-3 text-xs text-muted-foreground">
          You have unsaved changes. Click <span className="font-medium">Save slider</span> to publish them to the homepage.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// "Loved by businesses" testimonials manager
//
// Lets the super admin add, edit, reorder and remove the testimonials shown on
// the homepage, including an uploaded avatar / brand-logo icon per entry.
// ---------------------------------------------------------------------------
function TestimonialsManager() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarIndexRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    getTestimonialsFn()
      .then((res) => {
        if (active) setItems(res.testimonials);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const mutate = (next: Testimonial[]) => {
    setItems(next);
    setDirty(true);
    setStatus(null);
    setError(null);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
      reader.readAsDataURL(file);
    });

  const addBlank = () =>
    mutate([...items, { name: "", role: "", quote: "", avatar: "" }].slice(0, 24));

  const update = (index: number, patch: Partial<Testimonial>) =>
    mutate(items.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const remove = (index: number) => mutate(items.filter((_, i) => i !== index));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  };

  const onAvatarFile = async (files: FileList | null) => {
    const idx = avatarIndexRef.current;
    avatarIndexRef.current = null;
    const file = files?.[0];
    if (idx === null || !file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the avatar.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Avatar is too large (max 1 MB).");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    update(idx, { avatar: dataUrl });
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    setError(null);
    const result = await saveTestimonialsFn({ data: { testimonials: items } });
    if (!result.success) {
      setError(result.error ?? "Could not save testimonials.");
      setBusy(false);
      return;
    }
    setItems(result.testimonials);
    setDirty(false);
    setStatus("“Loved by businesses” section updated.");
    setBusy(false);
  };

  return (
    <Card className="p-6">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          await onAvatarFile(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Quote className="h-5 w-5 text-primary" />
            Loved by businesses
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Testimonials shown on the homepage. Add a quote, name, role and an avatar / logo icon. Leave empty to hide the section.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addBlank} className="rounded-lg">
            <Plus className="mr-2 h-4 w-4" /> Add testimonial
          </Button>
          <Button onClick={save} disabled={busy || !dirty} className="rounded-lg">
            <Save className="mr-2 h-4 w-4" /> {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {status && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
          {status}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!loaded ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Loading testimonials…
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <Quote className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No testimonials yet — the section is hidden on the homepage. Click{" "}
            <span className="font-medium text-foreground">Add testimonial</span> to feature one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((t, index) => (
            <div key={index} className="rounded-xl border bg-muted/20 p-4">
              <div className="flex gap-4">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-2">
                  {t.avatar ? (
                    <img src={t.avatar} alt={t.name || "avatar"} className="h-16 w-16 rounded-full object-cover ring-1 ring-border" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {(t.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg px-2 text-xs"
                    onClick={() => {
                      avatarIndexRef.current = index;
                      avatarInputRef.current?.click();
                    }}
                  >
                    <Upload className="mr-1 h-3 w-3" /> Icon
                  </Button>
                  {t.avatar && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={() => update(index, { avatar: "" })}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Fields */}
                <div className="flex-1 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={t.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                      className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                      placeholder="Name (e.g. Aarav Shah)"
                    />
                    <input
                      value={t.role}
                      onChange={(e) => update(index, { role: e.target.value })}
                      className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                      placeholder="Role / company (e.g. Founder, Acme Co.)"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={t.quote}
                    onChange={(e) => update(index, { quote: e.target.value })}
                    className="w-full rounded-lg border bg-background p-3 text-sm"
                    placeholder="What did they say about you?"
                  />
                  <div className="flex items-center gap-1">
                    <span className="mr-auto text-xs text-muted-foreground">Or paste an image URL:</span>
                    <input
                      value={/^https?:\/\//i.test(t.avatar) || t.avatar.startsWith("/") ? t.avatar : ""}
                      onChange={(e) => update(index, { avatar: e.target.value })}
                      className="h-8 w-56 rounded-lg border bg-background px-2 text-xs"
                      placeholder="https://…"
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" disabled={index === 0} title="Move up" onClick={() => move(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" disabled={index === items.length - 1} title="Move down" onClick={() => move(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10" title="Remove" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <p className="mt-3 text-xs text-muted-foreground">
          Unsaved changes. Click <span className="font-medium">Save</span> to publish them to the homepage.
        </p>
      )}
    </Card>
  );
}

interface ProductEditModalProps {
  product: Product;
  mode: "edit" | "create";
  tab: "basic" | "media" | "content" | "advanced" | "pricing";
  onTabChange: (tab: "basic" | "media" | "content" | "advanced" | "pricing") => void;
  onProductChange: (product: Product) => void;
  onClose: () => void;
  onSave: () => void;
  isBusy: boolean;
  catalog: Category[];
}

function ProductEditModal({
  product,
  mode,
  tab,
  onTabChange,
  onProductChange,
  onClose,
  onSave,
  isBusy,
  catalog,
}: ProductEditModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {mode === "create" ? "Create Product" : `Edit: ${product.name}`}
            </h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Modal Tabs */}
        <div className="border-b flex bg-muted/50">
          {(["basic", "media", "content", "advanced", "pricing"] as const).map((tabName) => (
            <button
              key={tabName}
              onClick={() => onTabChange(tabName)}
              className={`px-4 py-3 font-medium text-sm capitalize transition-colors ${
                tab === tabName
                  ? "border-b-2 border-primary text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabName}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {tab === "basic" && (
            <ModalTabBasic product={product} onChange={onProductChange} catalog={catalog} />
          )}
          {tab === "media" && <ModalTabMedia product={product} onChange={onProductChange} />}
          {tab === "content" && <ModalTabContent product={product} onChange={onProductChange} />}
          {tab === "advanced" && (
            <ModalTabAdvanced product={product} onChange={onProductChange} />
          )}
          {tab === "pricing" && (
            <ModalTabPricing product={product} onChange={onProductChange} />
          )}
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-background border-t p-4 flex items-center justify-between">
          <Button variant="outline" onClick={onClose} className="rounded-lg">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isBusy} className="rounded-lg">
            <Save className="mr-2 h-4 w-4" /> {mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ModalTabBasic({
  product,
  onChange,
  catalog,
}: {
  product: Product;
  onChange: (p: Product) => void;
  catalog: Category[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Product name *</label>
          <input
            value={product.name}
            onChange={(e) => onChange({ ...product, name: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Slug *</label>
          <input
            value={product.slug}
            onChange={(e) => onChange({ ...product, slug: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">SKU *</label>
          <input
            value={product.sku}
            onChange={(e) => onChange({ ...product, sku: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Category *</label>
          <select
            value={product.category}
            onChange={(e) => onChange({ ...product, category: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {catalog.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Base Price *</label>
          <input
            type="number"
            min={0}
            step={1}
            value={product.basePrice}
            onChange={(e) => onChange({ ...product, basePrice: Number(e.target.value) })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Badge</label>
          <input
            value={product.badge ?? ""}
            onChange={(e) => onChange({ ...product, badge: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            placeholder="e.g., Best seller, New"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Quantity Options</label>
        <input
          value={joinCsv(product.quantityOptions.map(String))}
          onChange={(e) => onChange({ ...product, quantityOptions: toNumberList(e.target.value) })}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          placeholder="e.g., 100, 250, 500"
        />
      </div>
    </div>
  );
}

function ModalTabMedia({
  product,
  onChange,
}: {
  product: Product;
  onChange: (p: Product) => void;
}) {
  const primaryImageInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const readFilesAsDataUrls = async (files: FileList | null) => {
    if (!files?.length) return [];

    return Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
            reader.readAsDataURL(file);
          }),
      ),
    );
  };

  const uploadImages = async (files: FileList | null, replacePrimary: boolean) => {
    const uploaded = await readFilesAsDataUrls(files);
    if (!uploaded.length) return;

    onChange({
      ...product,
      images: replacePrimary ? uploaded : [...product.images, ...uploaded],
      image: replacePrimary ? uploaded[0] : product.images[0] ?? uploaded[0],
    });
  };

  const uploadVideos = async (files: FileList | null) => {
    const uploaded = await readFilesAsDataUrls(files);
    if (!uploaded.length) return;

    onChange({
      ...product,
      videoUrls: [...(product.videoUrls ?? []), ...uploaded],
    });
  };

  return (
    <div className="space-y-5">
      <input
        ref={primaryImageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (event) => {
          await uploadImages(event.target.files, true);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (event) => {
          await uploadImages(event.target.files, false);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={async (event) => {
          await uploadVideos(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Button type="button" variant="outline" onClick={() => primaryImageInputRef.current?.click()} className="justify-start rounded-xl">
          <Upload className="mr-2 h-4 w-4" /> Upload Primary Image
        </Button>
        <Button type="button" variant="outline" onClick={() => galleryInputRef.current?.click()} className="justify-start rounded-xl">
          <ImageIcon className="mr-2 h-4 w-4" /> Add Gallery Images
        </Button>
        <Button type="button" variant="outline" onClick={() => videoInputRef.current?.click()} className="justify-start rounded-xl">
          <Film className="mr-2 h-4 w-4" /> Upload Videos
        </Button>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Image URLs / data URLs</label>
        <textarea
          rows={4}
          value={joinLines(product.images)}
          onChange={(e) => {
            const images = splitLines(e.target.value);
            onChange({ ...product, images, image: images[0] ?? product.image });
          }}
          className="w-full rounded-lg border bg-background p-3 text-sm"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Video URLs / data URLs</label>
        <textarea
          rows={3}
          value={joinLines(product.videoUrls ?? [])}
          onChange={(e) => onChange({ ...product, videoUrls: splitLines(e.target.value) })}
          className="w-full rounded-lg border bg-background p-3 text-sm"
          placeholder="Upload a video or paste a video URL"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-muted/50 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Primary image</div>
          {product.images[0] ? (
            <img src={product.images[0]} alt={product.name} className="h-48 w-full rounded-lg object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No image uploaded yet
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-muted/50 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Gallery / media</div>
          <div className="grid grid-cols-2 gap-2">
            {product.images.slice(1, 5).map((image, index) => (
              <img key={`${image}-${index}`} src={image} alt={`${product.name} gallery ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />
            ))}
            {(product.videoUrls ?? []).slice(0, 2).map((video, index) => (
              <div key={`${video}-${index}`} className="flex h-24 items-center justify-center rounded-lg border bg-background p-2 text-center text-xs text-muted-foreground">
                Video uploaded
              </div>
            ))}
            {product.images.length <= 1 && (product.videoUrls?.length ?? 0) === 0 && (
              <div className="col-span-2 flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Use the buttons above to upload gallery images or videos
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalTabContent({
  product,
  onChange,
}: {
  product: Product;
  onChange: (p: Product) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <textarea
          rows={4}
          value={product.description}
          onChange={(e) => onChange({ ...product, description: e.target.value })}
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Artwork Hint</label>
        <textarea
          rows={4}
          value={product.artworkHint}
          onChange={(e) => onChange({ ...product, artworkHint: e.target.value })}
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      </div>
      <label className="flex items-center gap-3 p-3 border rounded-lg">
        <input
          type="checkbox"
          checked={product.artworkRequired}
          onChange={(e) => onChange({ ...product, artworkRequired: e.target.checked })}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
        <span className="text-sm font-medium">Artwork required</span>
      </label>
    </div>
  );
}

function ModalTabAdvanced({
  product,
  onChange,
}: {
  product: Product;
  onChange: (p: Product) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Sizes & Finishes */}
      <div className="border-t pt-6">
        <h4 className="font-semibold mb-3 text-sm">Selection options</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Sizes</label>
            <input
              value={joinCsv(product.sizes)}
              onChange={(e) => onChange({ ...product, sizes: splitCsv(e.target.value) })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              placeholder="e.g., Small, Medium, Large"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Finishes</label>
            <input
              value={joinCsv(product.finishes)}
              onChange={(e) => onChange({ ...product, finishes: splitCsv(e.target.value) })}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              placeholder="e.g., Matte, Glossy"
            />
          </div>
        </div>
      </div>

      {/* Turnarounds */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Turnarounds</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...product,
                turnarounds: [...product.turnarounds, { label: "New", days: 5, multiplier: 1 }],
              })
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        <div className="space-y-3">
          {product.turnarounds.map((turnaround, index) => (
            <div key={`${turnaround.label}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_80px_80px_40px]">
              <input
                value={turnaround.label}
                onChange={(e) =>
                  onChange({
                    ...product,
                    turnarounds: product.turnarounds.map((t, i) => (i === index ? { ...t, label: e.target.value } : t)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Label"
              />
              <input
                type="number"
                min={1}
                value={turnaround.days}
                onChange={(e) =>
                  onChange({
                    ...product,
                    turnarounds: product.turnarounds.map((t, i) => (i === index ? { ...t, days: Number(e.target.value) } : t)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Days"
              />
              <input
                type="number"
                min={0.1}
                step={0.05}
                value={turnaround.multiplier}
                onChange={(e) =>
                  onChange({
                    ...product,
                    turnarounds: product.turnarounds.map((t, i) => (i === index ? { ...t, multiplier: Number(e.target.value) } : t)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Multiplier"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...product,
                    turnarounds: product.turnarounds.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Swatches */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Swatches</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...product,
                swatches: [...product.swatches, { name: "Color", hex: "#56B0E3" }],
              })
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {product.swatches.map((swatch, index) => (
            <div key={`${swatch.name}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_120px_40px]">
              <input
                value={swatch.name}
                onChange={(e) =>
                  onChange({
                    ...product,
                    swatches: product.swatches.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Name"
              />
              <input
                value={swatch.hex}
                onChange={(e) =>
                  onChange({
                    ...product,
                    swatches: product.swatches.map((s, i) => (i === index ? { ...s, hex: e.target.value } : s)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="#56B0E3"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...product,
                    swatches: product.swatches.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Variations */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Variations</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...product,
                variations: [
                  ...product.variations,
                  { name: "Variant", sku: `${product.sku}-V1`, price: product.basePrice, image: "", active: true },
                ],
              })
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        <div className="space-y-3">
          {product.variations.map((variation, index) => (
            <div key={`${variation.sku}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_100px_100px_1fr_40px]">
              <input
                value={variation.name}
                onChange={(e) =>
                  onChange({
                    ...product,
                    variations: product.variations.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Name"
              />
              <input
                value={variation.sku}
                onChange={(e) =>
                  onChange({
                    ...product,
                    variations: product.variations.map((v, i) => (i === index ? { ...v, sku: e.target.value } : v)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="SKU"
              />
              <input
                type="number"
                min={0}
                value={variation.price}
                onChange={(e) =>
                  onChange({
                    ...product,
                    variations: product.variations.map((v, i) => (i === index ? { ...v, price: Number(e.target.value) } : v)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Price"
              />
              <input
                value={variation.image ?? ""}
                onChange={(e) =>
                  onChange({
                    ...product,
                    variations: product.variations.map((v, i) => (i === index ? { ...v, image: e.target.value } : v)),
                  })
                }
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                placeholder="Image URL"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...product,
                    variations: product.variations.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModalTabPricing({
  product,
  onChange,
}: {
  product: Product;
  onChange: (p: Product) => void;
}) {
  const rates = product.printPageRates ?? [];
  const addons = product.printAddons ?? [];
  const photoTiers = product.photoPricingTiers ?? [];
  const photoColors = product.photoBackgroundColors ?? [];

  const updatePhotoTier = (idx: number, patch: Partial<NonNullable<Product["photoPricingTiers"]>[number]>) => {
    const next = photoTiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange({ ...product, photoPricingTiers: next });
  };
  const addPhotoTier = () => {
    onChange({
      ...product,
      photoPricingTiers: [...photoTiers, { count: 8, price: 50 }],
    });
  };
  const removePhotoTier = (idx: number) => {
    onChange({
      ...product,
      photoPricingTiers: photoTiers.filter((_, i) => i !== idx),
    });
  };
  const updatePhotoColor = (idx: number, patch: Partial<NonNullable<Product["photoBackgroundColors"]>[number]>) => {
    const next = photoColors.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ ...product, photoBackgroundColors: next });
  };
  const addPhotoColor = () => {
    onChange({
      ...product,
      photoBackgroundColors: [...photoColors, { name: "White", hex: "#ffffff" }],
    });
  };
  const removePhotoColor = (idx: number) => {
    onChange({
      ...product,
      photoBackgroundColors: photoColors.filter((_, i) => i !== idx),
    });
  };
  const seedPassport = () => {
    onChange({
      ...product,
      acceptsPhotoUpload: true,
      photoPricingTiers: [
        { count: 8, price: 50 },
        { count: 32, price: 100 },
      ],
      photoBackgroundColors: [
        { name: "White", hex: "#ffffff" },
        { name: "Light Blue", hex: "#b8d4f0" },
        { name: "Royal Blue", hex: "#1e3a8a" },
        { name: "Red", hex: "#dc2626" },
        { name: "Light Grey", hex: "#e5e7eb" },
      ],
    });
  };

  const updateRate = (idx: number, patch: Partial<NonNullable<Product["printPageRates"]>[number]>) => {
    const next = rates.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...product, printPageRates: next });
  };

  const addRate = () => {
    onChange({
      ...product,
      printPageRates: [
        ...rates,
        { colorMode: "bw", paperSize: "A4", sides: "single", pricePerPage: 2 },
      ],
    });
  };

  const removeRate = (idx: number) => {
    onChange({ ...product, printPageRates: rates.filter((_, i) => i !== idx) });
  };

  const updateAddon = (idx: number, patch: Partial<NonNullable<Product["printAddons"]>[number]>) => {
    const next = addons.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange({ ...product, printAddons: next });
  };

  const addAddon = () => {
    onChange({
      ...product,
      printAddons: [...addons, { name: "Spiral binding", price: 30 }],
    });
  };

  const removeAddon = (idx: number) => {
    onChange({ ...product, printAddons: addons.filter((_, i) => i !== idx) });
  };

  const seedXerox = () => {
    onChange({
      ...product,
      acceptsDocumentUpload: true,
      printPageRates: [
        { colorMode: "bw", paperSize: "A4", sides: "single", pricePerPage: 2 },
        { colorMode: "bw", paperSize: "A4", sides: "duplex", pricePerPage: 1.58 },
        { colorMode: "color", paperSize: "A4", sides: "single", pricePerPage: 10 },
        { colorMode: "color", paperSize: "A4", sides: "duplex", pricePerPage: 7.45 },
        { colorMode: "bw", paperSize: "A3", sides: "single", pricePerPage: 7 },
        { colorMode: "color", paperSize: "A3", sides: "single", pricePerPage: 30 },
        { colorMode: "bw", paperSize: "Legal", sides: "single", pricePerPage: 5 },
      ],
      printAddons: [
        { name: "Spiral binding", price: 30 },
        { name: "Hard binding", price: 350 },
        { name: "Lamination", price: 140 },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-dashed bg-muted/30 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={!!product.acceptsDocumentUpload}
            onChange={(e) =>
              onChange({ ...product, acceptsDocumentUpload: e.target.checked })
            }
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-medium">
              Customer uploads a document and price is auto-calculated
            </span>
            <span className="block text-xs text-muted-foreground">
              When enabled, the storefront shows a PDF picker, counts pages
              automatically, and computes <code>pages × rate + add-ons</code>{" "}
              using the table below.
            </span>
          </span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={seedXerox}
            className="rounded-lg border bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            Seed with xerox defaults
          </button>
          <span className="text-[11px] text-muted-foreground self-center">
            Loads the standard B/W &amp; color rates for A4/A3/Legal plus
            spiral / hard / lamination add-ons.
          </span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Per-page rates</h4>
          <button
            type="button"
            onClick={addRate}
            className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent"
          >
            + Add rate
          </button>
        </div>
        {rates.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            No rates yet. Add a row or click &ldquo;Seed with xerox defaults&rdquo;.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Color</th>
                  <th className="p-2">Paper size</th>
                  <th className="p-2">Sides</th>
                  <th className="p-2">₹ / page</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-1">
                      <select
                        value={r.colorMode}
                        onChange={(e) =>
                          updateRate(idx, {
                            colorMode: e.target.value as "bw" | "color",
                          })
                        }
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="bw">B/W</option>
                        <option value="color">Color</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        value={r.paperSize}
                        onChange={(e) =>
                          updateRate(idx, { paperSize: e.target.value })
                        }
                        placeholder="A4"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      />
                    </td>
                    <td className="p-1">
                      <select
                        value={r.sides}
                        onChange={(e) =>
                          updateRate(idx, {
                            sides: e.target.value as "single" | "duplex",
                          })
                        }
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="single">Single</option>
                        <option value="duplex">Duplex</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={r.pricePerPage}
                        onChange={(e) =>
                          updateRate(idx, {
                            pricePerPage: Number(e.target.value),
                          })
                        }
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      />
                    </td>
                    <td className="p-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeRate(idx)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Add-ons (flat fee per order)</h4>
          <button
            type="button"
            onClick={addAddon}
            className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent"
          >
            + Add add-on
          </button>
        </div>
        {addons.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            No add-ons. Use them for things like spiral binding, hard binding,
            or lamination.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Price (₹)</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {addons.map((a, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-1">
                    <input
                      value={a.name}
                      onChange={(e) => updateAddon(idx, { name: e.target.value })}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={a.price}
                      onChange={(e) =>
                        updateAddon(idx, { price: Number(e.target.value) })
                      }
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="p-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeAddon(idx)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-dashed bg-muted/30 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={!!product.acceptsPhotoUpload}
            onChange={(e) =>
              onChange({ ...product, acceptsPhotoUpload: e.target.checked })
            }
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-medium">
              Passport-photo product (auto background removal &amp; color picker)
            </span>
            <span className="block text-xs text-muted-foreground">
              The storefront will let the customer upload a photo, remove the
              background in-browser, pick a backdrop color and a pricing tier
              (e.g. 8 photos / 32 photos).
            </span>
          </span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={seedPassport}
            className="rounded-lg border bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            Seed passport-photo defaults
          </button>
          <span className="text-[11px] text-muted-foreground self-center">
            Loads 8 photos / ₹50, 32 photos / ₹100 plus a default color palette.
          </span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Photo pricing tiers</h4>
          <button
            type="button"
            onClick={addPhotoTier}
            className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent"
          >
            + Add tier
          </button>
        </div>
        {photoTiers.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            No pricing tiers yet. Add tiers like &ldquo;8 photos / ₹50&rdquo;,
            &ldquo;32 photos / ₹100&rdquo;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Photo count</th>
                <th className="p-2">Price (₹)</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {photoTiers.map((t, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-1">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={t.count}
                      onChange={(e) =>
                        updatePhotoTier(idx, {
                          count: Math.max(1, Math.round(Number(e.target.value))),
                        })
                      }
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={t.price}
                      onChange={(e) =>
                        updatePhotoTier(idx, { price: Number(e.target.value) })
                      }
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="p-1 text-right">
                    <button
                      type="button"
                      onClick={() => removePhotoTier(idx)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Background color palette</h4>
          <button
            type="button"
            onClick={addPhotoColor}
            className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent"
          >
            + Add color
          </button>
        </div>
        {photoColors.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            No colors yet. Add at least one (white / blue / red).
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Hex</th>
                <th className="p-2">Preview</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {photoColors.map((c, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-1">
                    <input
                      value={c.name}
                      onChange={(e) => updatePhotoColor(idx, { name: e.target.value })}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={c.hex}
                      onChange={(e) => updatePhotoColor(idx, { hex: e.target.value })}
                      placeholder="#ffffff"
                      className="h-9 w-full rounded-md border bg-background px-2 font-mono text-sm"
                    />
                  </td>
                  <td className="p-1">
                    <span
                      className="inline-block h-7 w-12 rounded-md border"
                      style={{ background: c.hex }}
                    />
                  </td>
                  <td className="p-1 text-right">
                    <button
                      type="button"
                      onClick={() => removePhotoColor(idx)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
