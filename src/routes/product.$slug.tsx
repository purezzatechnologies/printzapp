import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, type DragEvent, type ChangeEvent } from "react";
import { Star, Upload, ShieldCheck, Truck, CheckCircle2, FileText, X, CheckCircle, Heart, Loader2 } from "lucide-react";
import { StorefrontLayout } from "@/components/storefront-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  type PhotoBackgroundColor,
  type PhotoPricingTier,
  type Product,
  type PrintColorMode,
  type PrintSides,
} from "@/lib/data";
import { getCurrentUserFn, getMyWishlistFn, getProductFn, removeBackgroundFn, toggleWishlistFn } from "@/lib/backend";
import { useCart, type PhotoSpec, type PrintSpec } from "@/lib/cart";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ params }) => {
    const [product, user] = await Promise.all([
      getProductFn({ data: { slug: params.slug } }),
      getCurrentUserFn(),
    ]);
    const wishlist = user ? await getMyWishlistFn() : [];
    return {
      product,
      isAuthed: !!user,
      isSaved: wishlist.some((p) => p.slug === params.slug),
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.product.name} — PRINTZAPP` },
      { name: "description", content: loaderData.product.description },
      { property: "og:title", content: loaderData.product.name },
      { property: "og:description", content: loaderData.product.description },
      { property: "og:image", content: loaderData.product.image },
    ] : [],
  }),
  component: ProductPage,
  notFoundComponent: () => (
    <StorefrontLayout>
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-3xl font-bold">Product not found</h1>
        <Link to="/" className="mt-4 inline-block text-primary">← Back to home</Link>
      </div>
    </StorefrontLayout>
  ),
});

// Read a File into a base64 data URL so we can ship it to the server fn for
// background removal. Kept small and deliberately readable.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(new Error("Could not read the uploaded photo."));
    reader.readAsDataURL(file);
  });
}

function ProductPage() {
  const navigate = useNavigate();
  const { product, isAuthed, isSaved: initialSaved } = Route.useLoaderData() as Awaited<ReturnType<typeof Route.options.loader>>;
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [toggleHint, setToggleHint] = useState<string | null>(null);
  const navigateToLogin = () => navigate({ to: "/login" });

  const toggleSave = async () => {
    if (!isAuthed) {
      setToggleHint("Sign in to save items to your wishlist.");
      return;
    }
    setToggleHint(null);
    const result = await toggleWishlistFn({ data: { slug: product.slug } });
    if (result.success) {
      setIsSaved(!!result.saved);
    }
  };
  const { addItem } = useCart();
  const isPrintQuote = !!product.acceptsDocumentUpload && (product.printPageRates?.length ?? 0) > 0;
  const isPhotoQuote = !!product.acceptsPhotoUpload && (product.photoPricingTiers?.length ?? 0) > 0 && !isPrintQuote;

  const [qty, setQty] = useState(product.quantityOptions[0] ?? 1);
  const [size, setSize] = useState(product.sizes[0]);
  const [finish, setFinish] = useState(product.finishes[0] ?? "");
  const [turnaround, setTurnaround] = useState(
    product.turnarounds[0] ?? { label: "Standard", days: 5, multiplier: 1 },
  );
  const [printSides, setPrintSides] = useState("Single Side");

  // --- Print-quote engine state ---------------------------------------------
  const rates = useMemo(() => product.printPageRates ?? [], [product.printPageRates]);
  const addons = useMemo(() => product.printAddons ?? [], [product.printAddons]);
  const availableColors = useMemo(
    () => Array.from(new Set(rates.map((r) => r.colorMode))) as PrintColorMode[],
    [rates],
  );
  const availablePapers = useMemo(
    () => Array.from(new Set(rates.map((r) => r.paperSize))),
    [rates],
  );
  const availableSidesList = useMemo(
    () => Array.from(new Set(rates.map((r) => r.sides))) as PrintSides[],
    [rates],
  );

  const [quoteColor, setQuoteColor] = useState<PrintColorMode>(availableColors[0] ?? "bw");
  const [quotePaper, setQuotePaper] = useState<string>(availablePapers[0] ?? "A4");
  const [quoteSides, setQuoteSides] = useState<PrintSides>(availableSidesList[0] ?? "single");
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [pageCount, setPageCount] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const matchedRate = useMemo(
    () =>
      rates.find(
        (r) =>
          r.colorMode === quoteColor &&
          r.paperSize === quotePaper &&
          r.sides === quoteSides,
      ),
    [rates, quoteColor, quotePaper, quoteSides],
  );

  const selectedAddonObjs = useMemo(
    () => addons.filter((a) => selectedAddons.has(a.name)),
    [addons, selectedAddons],
  );

  const printQuote = useMemo(() => {
    const pricePerPage = matchedRate?.pricePerPage ?? 0;
    const perPageTotal = Math.round(pricePerPage * pageCount * 100) / 100;
    const addonTotal = selectedAddonObjs.reduce((s, a) => s + a.price, 0);
    const total = Math.round((perPageTotal + addonTotal) * 100) / 100;
    return { pricePerPage, perPageTotal, addonTotal, total };
  }, [matchedRate, pageCount, selectedAddonObjs]);

  const buildPrintSpec = (): PrintSpec | null => {
    if (!isPrintQuote || !matchedRate || pageCount <= 0) return null;
    return {
      pageCount,
      colorMode: quoteColor,
      paperSize: quotePaper,
      sides: quoteSides,
      pricePerPage: matchedRate.pricePerPage,
      addons: selectedAddonObjs,
      addonTotal: printQuote.addonTotal,
      perPageTotal: printQuote.perPageTotal,
      total: printQuote.total,
    };
  };

  const detectPdfPages = async (file: File) => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const buf = await file.arrayBuffer();
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      const count = pdf.getPageCount();
      setPageCount(count);
    } catch {
      setPdfError(
        "Couldn't read this PDF automatically. You can still proceed — set the page count manually below.",
      );
      setPageCount(0);
    } finally {
      setPdfBusy(false);
    }
  };

  const toggleAddon = (name: string, on: boolean) => {
    setSelectedAddons((current) => {
      const next = new Set(current);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  // --- Passport-photo state ------------------------------------------------
  const tiers = useMemo<PhotoPricingTier[]>(
    () => product.photoPricingTiers ?? [],
    [product.photoPricingTiers],
  );
  const palette = useMemo<PhotoBackgroundColor[]>(
    () => product.photoBackgroundColors ?? [],
    [product.photoBackgroundColors],
  );
  const [photoOrigUrl, setPhotoOrigUrl] = useState<string | null>(null);
  const [photoCutoutUrl, setPhotoCutoutUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{
    label: string;
    pct: number;
  } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoTier, setPhotoTier] = useState<PhotoPricingTier | null>(
    tiers[0] ?? null,
  );
  const [photoBg, setPhotoBg] = useState<PhotoBackgroundColor | null>(
    palette[0] ?? null,
  );
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoTier && tiers[0]) setPhotoTier(tiers[0]);
    if (!photoBg && palette[0]) setPhotoBg(palette[0]);
  }, [tiers, palette, photoTier, photoBg]);

  useEffect(() => {
    return () => {
      if (photoOrigUrl) URL.revokeObjectURL(photoOrigUrl);
      if (photoCutoutUrl) URL.revokeObjectURL(photoCutoutUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhotoFile = async (file: File) => {
    setPhotoError(null);
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please upload an image (JPG, PNG, HEIC).");
      return;
    }
    if (photoOrigUrl) URL.revokeObjectURL(photoOrigUrl);
    if (photoCutoutUrl) URL.revokeObjectURL(photoCutoutUrl);
    const origUrl = URL.createObjectURL(file);
    setPhotoOrigUrl(origUrl);
    setPhotoCutoutUrl(null);
    setPhotoBusy(true);
    setPhotoProgress({ label: "Uploading photo", pct: 25 });
    try {
      // Run BRIA RMBG-1.4 on the server (or remove.bg if an API key is set
      // server-side). The customer pays no model-download cost; the server
      // process keeps the model in RAM after the first request.
      const dataUrl = await fileToDataUrl(file);
      setPhotoProgress({ label: "Removing background", pct: 60 });
      const result = await removeBackgroundFn({ data: { dataUrl } });
      if (!result?.success || !result.dataUrl) {
        throw new Error("Server returned no image.");
      }
      setPhotoProgress({ label: "Refining edges", pct: 90 });
      const cutoutBlob = await (await fetch(result.dataUrl)).blob();
      // Refine the alpha edge once so the live preview and the final order
      // PNG match. Without this the preview can show small haloes that
      // disappear after compositing — confusing for the customer.
      const cleaned = await refineAlphaEdges(cutoutBlob);
      setPhotoCutoutUrl(URL.createObjectURL(cleaned));
      setPhotoProgress(null);
    } catch (err) {
      console.error("[passport] bg removal failed:", err);
      const message = (err as Error)?.message ?? String(err);
      let friendly: string;
      if (/Failed to fetch|NetworkError|net::/i.test(message)) {
        friendly =
          "Couldn't reach the background-removal service. Check your connection and try again.";
      } else if (/dimensions|Invalid data URL/i.test(message)) {
        friendly =
          "We couldn't read this image. Try a JPG or PNG straight from your camera roll.";
      } else {
        friendly = `Background removal failed: ${message}`;
      }
      setPhotoError(friendly);
      setPhotoProgress(null);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handlePhotoFile(f);
    e.target.value = "";
  };

  // Light alpha touch-up on the cutout returned by the server. The server now
  // does the heavy lifting (median + blur + steep contrast on the mask), so
  // here we only run a single cheap gamma pass to firm up the soft edge:
  // values below ~8% → transparent, above ~92% → opaque, and the thin band
  // between is gamma-corrected so haloes fall off sharply. One linear pass over
  // the pixels keeps this fast even on large phone photos.
  const refineAlphaEdges = async (blob: Blob): Promise<Blob> => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.src = url;
    try {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;

      const LOWER_THRESHOLD = 20; // ≈8% — below this → fully transparent
      const UPPER_THRESHOLD = 235; // ≈92% — above this → fully opaque
      const MID_RANGE = UPPER_THRESHOLD - LOWER_THRESHOLD;

      for (let i = 3; i < px.length; i += 4) {
        const a = px[i];
        if (a < LOWER_THRESHOLD) {
          px[i] = 0;
        } else if (a > UPPER_THRESHOLD) {
          px[i] = 255;
        } else {
          const t = (a - LOWER_THRESHOLD) / MID_RANGE; // 0..1
          px[i] = Math.round(Math.pow(t, 0.45) * 255);
        }
      }
      ctx.putImageData(data, 0, 0);

      const refined = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      return refined ?? blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Compose the cleaned cutout PNG over the selected background colour and
  // return a base64 data URL. Used when the customer clicks Add to Cart.
  const composePhotoDataUrl = async (): Promise<string | null> => {
    if (!photoCutoutUrl || !photoBg) return null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = photoCutoutUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = photoBg.hex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [activeImg, setActiveImg] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [artwork, setArtwork] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supportsDimensions = ["signage-display", "photo-personal"].includes(product.category);
  const supportsPrintSides = ["business-essentials", "marketing-materials", "office-supplies", "seasonal-events"].includes(product.category);

  useEffect(() => {
    return () => {
      if (artwork?.previewUrl) URL.revokeObjectURL(artwork.previewUrl);
    };
  }, [artwork?.previewUrl]);

  useEffect(() => {
    if (product.slug === "biz-cards" || product.slug === "visiting-cards") {
      setCustomWidth("85");
      setCustomHeight("55");
      setSize("Standard (85x55 mm)");
    }
  }, [product.slug]);

  const ACCEPTED = [".pdf", ".ai", ".psd", ".png", ".jpg", ".jpeg"];
  const MAX_BYTES = 50 * 1024 * 1024;

  const handleFiles = (files: FileList | null) => {
    setFileError(null);
    const file = files?.[0];
    if (!file) return;
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setFileError("Unsupported format. Use PDF, AI, PSD, PNG or JPG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("File too large. Maximum 50 MB.");
      return;
    }
    if (artwork?.previewUrl) URL.revokeObjectURL(artwork.previewUrl);
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setArtwork({ file, previewUrl });
    if (isPrintQuote && ext === ".pdf") {
      void detectPdfPages(file);
    } else if (isPrintQuote) {
      setPageCount(0);
      setPdfError(null);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };

  const removeArtwork = () => {
    if (artwork?.previewUrl) URL.revokeObjectURL(artwork.previewUrl);
    setArtwork(null);
    setFileError(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const clampQuantity = (next: number) => {
    if (!Number.isFinite(next)) return qty;
    return Math.max(1, Math.round(next));
  };

  const sizeMul = product.sizes.indexOf(size) === 0 ? 1 : product.sizes.indexOf(size) === 1 ? 1.4 : 1.9;
  const finishMul = finish === "Matte" ? 1 : finish === "Glossy" ? 1.1 : 1.25;

  // GST is not charged to customers — total equals the subtotal. `gst` kept at
  // 0 so the existing breakdown markup doesn't need restructuring.
  const total = useMemo(() => {
    if (isPrintQuote) {
      const subtotal = Math.round(printQuote.total);
      return { subtotal, gst: 0, total: subtotal };
    }
    if (isPhotoQuote) {
      const subtotal = Math.round(photoTier?.price ?? 0);
      return { subtotal, gst: 0, total: subtotal };
    }
    const subtotal = Math.round(product.basePrice * (qty / 50) * sizeMul * finishMul * turnaround.multiplier);
    return { subtotal, gst: 0, total: subtotal };
  }, [isPrintQuote, isPhotoQuote, printQuote.total, photoTier?.price, product.basePrice, qty, sizeMul, finishMul, turnaround.multiplier]);

  const gallery = [product.image, product.image, product.image];

  // Centralized add-to-cart so we don't repeat the FileReader logic three
  // times (desktop Add to Cart, Buy Now, mobile sticky CTA).
  const handleAddToCart = async (nextRoute: "/cart" | "/checkout") => {
    if (isPrintQuote) {
      if (!artwork) {
        setActionError("Please upload a document to get a quote.");
        return;
      }
      if (!matchedRate) {
        setActionError(
          "No matching print rate. Pick a color / paper / sides combo that exists in the catalog.",
        );
        return;
      }
      if (pageCount <= 0) {
        setActionError(
          "Page count is 0. Re-upload the PDF or enter the page count manually.",
        );
        return;
      }
    } else if (isPhotoQuote) {
      if (!photoCutoutUrl) {
        setActionError("Please upload a photo so we can prepare the print.");
        return;
      }
      if (!photoBg) {
        setActionError("Pick a background color first.");
        return;
      }
      if (!photoTier) {
        setActionError("Pick how many photos you want.");
        return;
      }
    } else if (product.artworkRequired && !artwork) {
      setActionError("Please upload your artwork before continuing.");
      return;
    }
    setActionError(null);

    let dataUrl: string | undefined;
    if (artwork) {
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () =>
            reject(new Error("Could not read the artwork file."));
          reader.readAsDataURL(artwork.file);
        });
      } catch (err) {
        setActionError(getFriendlyError(err, "Could not read the artwork file."));
        return;
      }
    }

    const printSpec = buildPrintSpec();

    let photoSpec: PhotoSpec | undefined;
    let photoDataUrl: string | undefined;
    let photoArtworkMeta:
      | { name: string; size: number; type: string }
      | undefined;
    if (isPhotoQuote && photoBg && photoTier) {
      const composed = await composePhotoDataUrl();
      if (composed) {
        photoDataUrl = composed;
        // Approximate "file size" from the base64 length so cart UI shows
        // something meaningful (kept as bytes).
        const b64 = composed.split(",")[1] ?? "";
        photoArtworkMeta = {
          name: `passport-${photoTier.count}-${photoBg.name.replace(/\s+/g, "")}.png`,
          size: Math.floor((b64.length * 3) / 4),
          type: "image/png",
        };
        photoSpec = {
          photoCount: photoTier.count,
          bgColorName: photoBg.name,
          bgColorHex: photoBg.hex,
          total: photoTier.price,
        };
      }
    }

    addItem({
      product,
      quantity: isPrintQuote || isPhotoQuote ? 1 : qty,
      size: isPrintQuote ? quotePaper : isPhotoQuote ? "Passport" : size,
      finish: isPrintQuote
        ? quoteColor === "bw"
          ? "B/W"
          : "Color"
        : isPhotoQuote
          ? `${photoTier?.count ?? 0} photos`
          : finish,
      turnaround,
      artwork: isPhotoQuote && photoArtworkMeta && photoDataUrl
        ? {
            name: photoArtworkMeta.name,
            size: photoArtworkMeta.size,
            type: photoArtworkMeta.type,
            dataUrl: photoDataUrl,
          }
        : artwork
        ? {
            name: artwork.file.name,
            size: artwork.file.size,
            type: artwork.file.type || "application/octet-stream",
            dataUrl,
          }
        : null,
      customization: {
        printSides: isPrintQuote
          ? quoteSides === "duplex"
            ? "Both sides (duplex)"
            : "Single side"
          : supportsPrintSides
            ? printSides
            : undefined,
        dimensions:
          !isPrintQuote &&
          (supportsDimensions ||
            product.slug === "biz-cards" ||
            product.slug === "visiting-cards") &&
          customWidth.trim() &&
          customHeight.trim()
            ? {
                width: customWidth.trim(),
                height: customHeight.trim(),
                unit: supportsDimensions ? "ft" : "mm",
              }
            : null,
        notes: notes.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        printSpec: printSpec ?? undefined,
        photoSpec: photoSpec ?? undefined,
      },
      overrideSubtotal: printSpec?.total ?? photoSpec?.total,
    });
    navigate({ to: nextRoute });
  };

  return (
    <StorefrontLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary">Home</Link> / <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-primary capitalize">{product.category.replace(/-/g, " ")}</Link> / <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Gallery */}
          <div>
            <Card className="overflow-hidden p-0">
              <div className="relative aspect-square bg-muted">
                <img src={gallery[activeImg]} alt={product.name} className="h-full w-full object-cover" />
                {product.badge && <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">{product.badge}</Badge>}
              </div>
            </Card>
            <div className="mt-3 flex gap-2">
              {gallery.map((g, i) => (
                <button key={i} onClick={() => setActiveImg(i)} className={`h-20 w-20 overflow-hidden rounded-lg border-2 ${activeImg === i ? "border-primary" : "border-transparent"}`}>
                  <img src={g} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold md:text-4xl">{product.name}</h1>
              <button
                type="button"
                onClick={() => { void toggleSave(); }}
                aria-pressed={isSaved}
                aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${isSaved ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100" : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"}`}
              >
                <Heart className={`h-5 w-5 ${isSaved ? "fill-current" : ""}`} />
              </button>
            </div>
            {toggleHint && (
              <p className="mt-1 text-xs text-muted-foreground">
                {toggleHint}{" "}
                <button
                  type="button"
                  onClick={navigateToLogin}
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
            <div className="mt-2 flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-warning text-warning" />
                <span className="font-semibold">{product.rating.toFixed(1)}</span>
                <span className="text-muted-foreground">({product.reviews} reviews)</span>
              </div>
              <span className="text-muted-foreground">•</span>
              <span className="text-success font-medium">In stock</span>
            </div>
            <p className="mt-4 text-muted-foreground">{product.description}</p>

            {isPhotoQuote ? (
              <Card className="mt-6 space-y-5 p-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Upload your photo
                  </label>
                  <input
                    ref={photoFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPhotoChange}
                  />
                  {!photoOrigUrl ? (
                    <button
                      type="button"
                      onClick={() => photoFileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-sm hover:border-primary hover:bg-primary/5"
                    >
                      <Upload className="mb-2 h-6 w-6 text-primary" />
                      <span className="font-medium">Click to choose a photo</span>
                      <span className="text-xs text-muted-foreground">
                        JPG / PNG / HEIC · we&apos;ll remove the background automatically
                      </span>
                    </button>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="overflow-hidden rounded-xl border bg-muted">
                        <div className="px-3 py-1.5 text-[10px] uppercase text-muted-foreground">
                          Original
                        </div>
                        <img
                          src={photoOrigUrl}
                          alt="Original"
                          className="aspect-[3/4] w-full object-cover"
                        />
                      </div>
                      <div className="overflow-hidden rounded-xl border">
                        <div className="px-3 py-1.5 text-[10px] uppercase text-muted-foreground">
                          Preview ({photoBg?.name ?? "Pick a color"})
                        </div>
                        <div
                          className="relative aspect-[3/4] w-full"
                          style={{ background: photoBg?.hex ?? "#ffffff" }}
                        >
                          {photoCutoutUrl ? (
                            <img
                              src={photoCutoutUrl}
                              alt="Preview"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-xs text-muted-foreground">
                              {photoBusy ? (
                                <>
                                  <span className="flex items-center gap-2 font-medium text-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {photoProgress?.label ?? "Removing background"}…
                                  </span>
                                  {photoProgress && (
                                    <>
                                      <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
                                        <div
                                          className="h-full bg-primary transition-all"
                                          style={{ width: `${photoProgress.pct}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px]">
                                        {photoProgress.pct}%
                                        {photoProgress.label === "Downloading model" &&
                                          " · cached after first use"}
                                      </span>
                                    </>
                                  )}
                                </>
                              ) : (
                                <span>Processing failed</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => photoFileInputRef.current?.click()}
                        >
                          Replace photo
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (photoOrigUrl) URL.revokeObjectURL(photoOrigUrl);
                            if (photoCutoutUrl) URL.revokeObjectURL(photoCutoutUrl);
                            setPhotoOrigUrl(null);
                            setPhotoCutoutUrl(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                  {photoError && (
                    <p className="mt-2 text-xs text-destructive">{photoError}</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Background color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {palette.map((c) => {
                      const active = photoBg?.hex === c.hex;
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setPhotoBg(c)}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary"}`}
                        >
                          <span
                            className="h-5 w-5 rounded-full border"
                            style={{ background: c.hex }}
                          />
                          <span className="font-medium">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Pricing
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tiers.map((t, idx) => {
                      const active = photoTier?.count === t.count && photoTier?.price === t.price;
                      return (
                        <button
                          key={`${t.count}-${idx}`}
                          type="button"
                          onClick={() => setPhotoTier(t)}
                          className={`flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-left text-sm transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary"}`}
                        >
                          <span className="font-medium">{t.count} photos</span>
                          <span className="font-bold">₹{t.price}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between">
                    <span>{photoTier?.count ?? 0} photos · {photoBg?.name ?? "-"}</span>
                    <span className="font-semibold">
                      ₹{photoTier?.price.toLocaleString() ?? "0"}
                    </span>
                  </div>
                </div>
              </Card>
            ) : isPrintQuote ? (
              <Card className="mt-6 space-y-5 p-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Upload document (PDF preferred)
                  </label>
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-sm transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary"}`}
                  >
                    <Upload className="mb-2 h-6 w-6 text-primary" />
                    <p className="font-medium">
                      {artwork ? artwork.file.name : "Click or drop a PDF here"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {artwork
                        ? `${formatSize(artwork.file.size)} · we auto-count pages from PDFs`
                        : "Up to 50 MB · we read the page count automatically"}
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.PDF,application/pdf"
                    className="hidden"
                    onChange={onChange}
                  />
                  {pdfBusy && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Counting pages…
                    </p>
                  )}
                  {pdfError && (
                    <p className="mt-2 text-xs text-amber-600">{pdfError}</p>
                  )}
                  {fileError && (
                    <p className="mt-2 text-xs text-destructive">{fileError}</p>
                  )}
                  {artwork && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Pages:</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={pageCount}
                        onChange={(e) =>
                          setPageCount(Math.max(0, Math.round(Number(e.target.value))))
                        }
                        className="h-8 w-20 rounded-md border bg-background px-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={removeArtwork}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Color mode</label>
                    <select
                      value={quoteColor}
                      onChange={(e) => setQuoteColor(e.target.value as PrintColorMode)}
                      className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                    >
                      {availableColors.map((c) => (
                        <option key={c} value={c}>
                          {c === "bw" ? "Black & White" : "Color"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Paper size</label>
                    <select
                      value={quotePaper}
                      onChange={(e) => setQuotePaper(e.target.value)}
                      className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                    >
                      {availablePapers.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Sides</label>
                    <select
                      value={quoteSides}
                      onChange={(e) => setQuoteSides(e.target.value as PrintSides)}
                      className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                    >
                      {availableSidesList.map((s) => (
                        <option key={s} value={s}>
                          {s === "single" ? "Single-sided" : "Duplex (both sides)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {matchedRate ? (
                  <p className="text-xs text-muted-foreground">
                    Rate:{" "}
                    <span className="font-semibold text-foreground">
                      ₹{matchedRate.pricePerPage.toFixed(2)} / page
                    </span>{" "}
                    × {pageCount || 0} {pageCount === 1 ? "page" : "pages"} ={" "}
                    <span className="font-semibold text-foreground">
                      ₹{printQuote.perPageTotal.toFixed(2)}
                    </span>
                  </p>
                ) : (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
                    No published rate for this combination. Pick another color /
                    paper / sides combo.
                  </p>
                )}

                {addons.length > 0 && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Add-ons</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {addons.map((a) => (
                        <label
                          key={a.name}
                          className="flex cursor-pointer items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm hover:bg-accent"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedAddons.has(a.name)}
                              onChange={(e) =>
                                toggleAddon(a.name, e.target.checked)
                              }
                            />
                            {a.name}
                          </span>
                          <span className="font-semibold">
                            ₹{a.price.toLocaleString()}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Notes for the print partner (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. print pages 1-10 only, keep margins as-is"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Pages × rate</span>
                    <span>₹{printQuote.perPageTotal.toFixed(2)}</span>
                  </div>
                  {selectedAddonObjs.length > 0 && (
                    <div className="flex justify-between">
                      <span>Add-ons</span>
                      <span>₹{printQuote.addonTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                    <span>Subtotal</span>
                    <span>₹{printQuote.total.toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            ) : (
            <Card className="mt-6 space-y-5 p-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">Quantity</label>
                <div className="flex flex-wrap gap-2">
                  {product.quantityOptions.map((q) => (
                    <button key={q} onClick={() => setQty(q)} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-base ${qty === q ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>{q}</button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setQty((current) => clampQuantity(current - 1))}>-</Button>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={qty}
                    onChange={(e) => setQty(clampQuantity(Number(e.target.value)))}
                    className="h-9 w-28 rounded-lg border bg-background px-2 text-sm"
                  />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setQty((current) => clampQuantity(current + 1))}>+</Button>
                  <span className="text-xs text-muted-foreground">Custom quantity allowed</span>
                </div>
              </div>
              {product.slug === "biz-cards" || product.slug === "visiting-cards" ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold">Card Size</label>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[
                      { label: "Standard (85x55 mm)", w: "85", h: "55" },
                      { label: "Square (65x65 mm)", w: "65", h: "65" },
                      { label: "Slim (85x40 mm)", w: "85", h: "40" },
                    ].map((s) => (
                      <button
                        key={s.label}
                        onClick={() => { setCustomWidth(s.w); setCustomHeight(s.h); setSize(s.label); }}
                        className={`rounded-lg border px-4 py-2 text-sm transition-base ${customWidth === s.w && customHeight === s.h ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border hover:border-primary"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      placeholder="Width"
                      value={customWidth}
                      onChange={(e) => { setCustomWidth(e.target.value); setSize("Custom"); }}
                      className="h-10 rounded-lg border bg-background px-3 text-sm"
                    />
                    <input
                      placeholder="Height"
                      value={customHeight}
                      onChange={(e) => { setCustomHeight(e.target.value); setSize("Custom"); }}
                      className="h-10 rounded-lg border bg-background px-3 text-sm"
                    />
                    <div className="flex items-center rounded-lg border px-3 text-sm text-muted-foreground">mm</div>
                  </div>
                </div>
              ) : product.sizes.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-semibold">Size</label>
                <div className="flex gap-2">
                  {product.sizes.map((s) => (
                    <button key={s} onClick={() => setSize(s)} className={`rounded-lg border px-4 py-2 text-sm transition-base ${size === s ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border"}`}>{s}</button>
                  ))}
                </div>
              </div>
              )}
              {product.finishes.length > 0 ? (
              <div>
                <label className="mb-2 block text-sm font-semibold">Finish <span className="text-muted-foreground">(required when offered)</span></label>
                <div className="flex gap-2">
                  {product.finishes.map((f) => (
                    <button key={f} onClick={() => setFinish(f)} className={`rounded-lg border px-4 py-2 text-sm transition-base ${finish === f ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border"}`}>{f}</button>
                  ))}
                </div>
              </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Finish not applicable for this product.
                </div>
              )}
              {product.turnarounds.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-semibold">Turnaround</label>
                <div className="space-y-2">
                  {product.turnarounds.map((t) => (
                    <button key={t.label} onClick={() => setTurnaround(t)} className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-base ${turnaround.label === t.label ? "border-primary bg-primary/5" : "border-border"}`}>
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground">×{t.multiplier}</span>
                    </button>
                  ))}
                </div>
              </div>
              )}

              {supportsPrintSides && (
                <div>
                  <label className="mb-2 block text-sm font-semibold">Print sides</label>
                  <div className="flex gap-2">
                    {["Single Side", "Double Side"].map((side) => (
                      <button
                        key={side}
                        onClick={() => setPrintSides(side)}
                        className={`rounded-lg border px-4 py-2 text-sm transition-base ${printSides === side ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border"}`}
                      >
                        {side}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {supportsDimensions && (
                <div>
                  <label className="mb-2 block text-sm font-semibold">Custom dimensions (optional)</label>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      placeholder="Width"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      className="h-10 rounded-lg border bg-background px-3 text-sm"
                    />
                    <input
                      placeholder="Height"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      className="h-10 rounded-lg border bg-background px-3 text-sm"
                    />
                    <div className="flex items-center rounded-lg border px-3 text-sm text-muted-foreground">ft</div>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold">Contact Details <span className="text-muted-foreground">(for order queries)</span></label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Contact Name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  />
                  <input
                    placeholder="Phone Number / Email"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Special instructions (optional)</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Mention preferred color profile, packaging notes, or reference details"
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
              </div>

              {/* Upload */}
              <div>
                <div className="mb-1 text-sm font-semibold">
                  Artwork {product.artworkRequired ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                  className="hidden"
                  onChange={onChange}
                />
                {!artwork ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-base ${dragActive ? "border-primary bg-primary-soft" : "border-primary/40 bg-primary-soft/40 hover:border-primary hover:bg-primary-soft/70"}`}
                  >
                    <Upload className="mx-auto h-8 w-8 text-primary" />
                    <div className="mt-2 text-sm font-semibold">Upload artwork</div>
                    <p className="mt-1 text-xs text-muted-foreground">{product.artworkHint}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>Choose file</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-success/40 bg-success/5 p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border bg-muted">
                          {artwork.previewUrl ? (
                            <>
                              <img src={artwork.previewUrl} alt={artwork.file.name} className="h-full w-full object-cover" />
                              {/* Bleed guide overlay */}
                              <div className="pointer-events-none absolute inset-1 rounded-sm border border-dashed border-primary/70" />
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <FileText className="h-8 w-8 text-primary" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4 flex-shrink-0 text-success" />
                            <span className="truncate text-sm font-semibold">{artwork.file.name}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{formatSize(artwork.file.size)} • Ready to print</p>
                          <div className="mt-2 flex gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()}>Replace</Button>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={removeArtwork} aria-label="Remove file">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {artwork.previewUrl && (
                      <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                        <img src={artwork.previewUrl} alt={artwork.file.name} className="w-full h-auto object-contain max-h-[400px]" />
                      </div>
                    )}
                  </div>
                )}
                {fileError && <p className="mt-2 text-xs text-destructive">{fileError}</p>}
                {actionError && <p className="mt-2 text-xs text-destructive">{actionError}</p>}
              </div>
            </Card>
            )}

            {/* Price summary */}
            <Card className="mt-5 bg-primary text-primary-foreground p-5">
              <div className="flex items-baseline justify-between text-sm">
                <span>Subtotal</span><span>₹{total.subtotal.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm opacity-90">
                <span>Shipping</span><span>FREE</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-white/20 pt-3">
                <span className="text-sm">Total</span>
                <span className="text-3xl font-bold">₹{total.total.toLocaleString()}</span>
              </div>
              {actionError && (
                <div className="mt-4 rounded-lg bg-red-500/20 border border-red-500/50 p-3 text-center text-sm font-semibold text-white">
                  {actionError}
                </div>
              )}
              <Button
                size="lg"
                className="mt-4 w-full bg-white text-primary hover:bg-white/90 shadow-md font-bold text-base border-none"
                style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)' }}
                onClick={() => { void handleAddToCart("/cart"); }}
              >
                Add to Cart
              </Button>
              <Button
                size="lg"
                className="mt-3 w-full border-2 border-white bg-transparent text-white hover:bg-white/10 font-bold text-base shadow-sm"
                style={{ backgroundColor: 'transparent' }}
                onClick={() => { void handleAddToCart("/checkout"); }}
              >
                Buy Now
              </Button>
            </Card>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-lg bg-surface p-3"><ShieldCheck className="mx-auto mb-1 h-5 w-5 text-primary" />Quality assured</div>
              <div className="rounded-lg bg-surface p-3"><Truck className="mx-auto mb-1 h-5 w-5 text-primary" />Fast delivery</div>
              <div className="rounded-lg bg-surface p-3"><CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-primary" />Free reprint*</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <div className="sticky bottom-0 z-30 border-t bg-card/95 p-3 backdrop-blur md:hidden">
        {actionError && (
          <div className="mb-3 rounded-lg bg-destructive/10 p-2 text-center text-xs font-semibold text-destructive border border-destructive/20">
            {actionError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-bold text-primary">₹{total.total.toLocaleString()}</div>
          </div>
          <Button
            className="flex-1 font-bold shadow-md"
            style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
            size="lg"
            onClick={() => { void handleAddToCart("/cart"); }}
          >
            Add to Cart
          </Button>
        </div>
      </div>
    </StorefrontLayout>
  );
}
