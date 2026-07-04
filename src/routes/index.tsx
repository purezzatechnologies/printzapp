import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Upload, Palette, Truck, CheckCircle2, Sparkles, Briefcase, Megaphone, Shirt, Coffee, Image as ImageIcon, PartyPopper } from "lucide-react";
import { StorefrontLayout } from "@/components/storefront-layout";
import { HeroSlider } from "@/components/hero-slider";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categories } from "@/lib/data";
import { getTrendingProductsFn, getHeroSlidesFn, getTestimonialsFn } from "@/lib/backend";

// Fallback shown when the super admin hasn't configured any hero slides yet.
const DEFAULT_HERO_SLIDES = [
  "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=900&h=900&fit=crop&auto=format&q=80",
];

export const Route = createFileRoute("/")({
  loader: async () => ({
    trending: await getTrendingProductsFn({ data: { limit: 8 } }),
    heroSlides: (await getHeroSlidesFn()).slides,
    testimonials: (await getTestimonialsFn()).testimonials,
  }),
  head: () => ({
    meta: [
      { title: "PRINTZAPP — India's Smartest Online Printing Marketplace" },
      { name: "description", content: "Order business cards, banners, t-shirts, mugs and 100+ print products. Same-day delivery, vendor network across India." },
      { property: "og:title", content: "PRINTZAPP — Online Printing Made Easy" },
      { property: "og:description", content: "Premium printing on demand. Trusted by 50,000+ Indian businesses." },
      { property: "og:image", content: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1200&h=630&fit=crop&auto=format&q=80" },
    ],
  }),
  component: HomePage,
});

const stats = [
  { label: "Happy Customers", value: "50K+" },
  { label: "Verified Vendors", value: "1,200+" },
  { label: "Products Printed", value: "8M+" },
  { label: "Cities Covered", value: "320+" },
];

const steps = [
  { icon: Palette, title: "Choose & Customize", desc: "Pick a product, set quantity, finish and turnaround." },
  { icon: Upload, title: "Upload Artwork", desc: "Drag your PDF/AI/PSD. We check bleed & resolution." },
  { icon: CheckCircle2, title: "Approve Proof", desc: "Get a digital proof and confirm in one click." },
  { icon: Truck, title: "Doorstep Delivery", desc: "Tracked shipping with same-day options in metros." },
];

const offerings = [
  {
    icon: Briefcase,
    slug: "business-essentials",
    title: "Business Essentials",
    desc: "Cards, letterheads, envelopes & stamps that make a first impression.",
    image: "/business-card.png",
    items: ["Visiting cards", "Letterheads", "Envelopes", "Rubber stamps"],
    accent: "from-sky-400/40 to-primary/30",
  },
  {
    icon: Megaphone,
    slug: "marketing-materials",
    title: "Marketing Materials",
    desc: "Brochures, flyers, posters & banners that move your numbers.",
    image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=900&h=700&fit=crop&auto=format&q=80",
    items: ["Brochures", "Flyers", "Posters", "Vinyl banners"],
    accent: "from-indigo-400/40 to-primary/30",
  },
  {
    icon: Shirt,
    slug: "clothing-apparel",
    title: "Apparel Printing",
    desc: "Custom t-shirts, polos, workwear & caps for teams and events.",
    image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=900&h=700&fit=crop&auto=format&q=80",
    items: ["T-shirts", "Polos", "Workwear", "Caps"],
    accent: "from-cyan-400/40 to-primary/30",
  },
  {
    icon: Coffee,
    slug: "promotional-gifts",
    title: "Promotional Gifts",
    desc: "Branded mugs, bags, pens & calendars your clients will keep.",
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=900&h=700&fit=crop&auto=format&q=80",
    items: ["Mugs", "Tote bags", "Notebooks", "Calendars"],
    accent: "from-blue-400/40 to-primary/30",
  },
  {
    icon: ImageIcon,
    slug: "photo-personal",
    title: "Photo & Personal",
    desc: "Photo prints, canvas & framed posters that bring memories home.",
    image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=900&h=700&fit=crop&auto=format&q=80",
    items: ["Photo prints", "Canvas", "Framed posters"],
    accent: "from-sky-400/40 to-indigo-400/30",
  },
  {
    icon: PartyPopper,
    slug: "seasonal-events",
    title: "Events & Seasonal",
    desc: "Wedding invitations, welcome boards & festival-ready prints.",
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?w=900&h=700&fit=crop&auto=format&q=80",
    items: ["Wedding cards", "Welcome boards", "Event banners"],
    accent: "from-rose-300/40 to-primary/30",
  },
];

function HomePage() {
  const { trending, heroSlides, testimonials } = Route.useLoaderData() as Awaited<ReturnType<typeof Route.options.loader>>;
  const slides = heroSlides.length > 0 ? heroSlides : DEFAULT_HERO_SLIDES;
  return (
    <StorefrontLayout>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-primary/35 blur-3xl animate-blob" />
        <div className="pointer-events-none absolute right-0 top-1/4 h-[28rem] w-[28rem] rounded-full bg-sky-300/55 blur-3xl animate-blob" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="animate-float-up">
            <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Same-day delivery in 50+ cities
            </div>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-6xl">
              Print anything.<br />
              <span className="text-primary">Delivered fast.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              From business cards to billboards — order premium printing online and get it shipped across India by our trusted vendor network.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/category/$slug" params={{ slug: "business-essentials" }}>
                <Button size="lg" className="rounded-xl">Start Designing <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </Link>
              <Link to="/signup">
                <Button size="lg" variant="outline" className="rounded-xl glass">Become a Vendor</Button>
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-bold text-primary md:text-3xl">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="glass-strong rounded-[2rem] p-3 shadow-elevated ring-1 ring-white/45">
              <HeroSlider slides={slides} />
            </div>
            {/* floating mini cards */}
            <div className="absolute -left-6 top-10 hidden glass rounded-2xl p-3 md:block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trusted vendors</div>
              <div className="text-lg font-bold">1,247</div>
            </div>
            <div className="absolute -right-4 bottom-8 hidden glass rounded-2xl p-3 md:block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg dispatch</div>
              <div className="text-lg font-bold">⏱ 18 hrs</div>
            </div>
          </div>
        </div>
      </section>

      {/* KEY OFFERINGS */}
      <section className="relative mx-auto max-w-7xl px-4 py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> What we print best
          </div>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">Our key offerings</h2>
          <p className="mt-3 text-muted-foreground">Six battle-tested print categories — each backed by a curated vendor network, transparent pricing and bleed-aware QC.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {offerings.map((o, i) => (
            <Link
              key={o.slug}
              to="/category/$slug"
              params={{ slug: o.slug }}
              className="group animate-float-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="relative h-full overflow-hidden rounded-3xl glass border-white/35 p-5 transition-base hover:-translate-y-1.5 hover:shadow-elevated">
                <div className={`absolute inset-0 -z-0 bg-gradient-to-br ${o.accent} opacity-60`} />
                <div className="pointer-events-none absolute inset-x-5 top-0 h-16 rounded-b-3xl bg-white/28 blur-xl" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/55 text-primary backdrop-blur ring-1 ring-white/45">
                      <o.icon className="h-6 w-6" />
                    </div>
                    <div className="overflow-hidden rounded-2xl ring-1 ring-white/45">
                      <img src={o.image} alt={o.title} loading="lazy" className="h-20 w-28 object-cover transition-transform duration-500 group-hover:scale-110" />
                    </div>
                  </div>
                  <h3 className="mt-5 text-xl font-bold">{o.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{o.desc}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {o.items.map((it) => (
                      <li key={it} className="rounded-full bg-white/55 px-2.5 py-1 text-[11px] font-medium text-foreground/80 backdrop-blur ring-1 ring-white/45">{it}</li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-center text-sm font-semibold text-primary">
                    Explore {o.title.toLowerCase()} <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Browse all link */}
        <div className="mt-10 text-center">
          <Link to="/category/$slug" params={{ slug: categories[0].slug }}>
            <Button variant="outline" size="lg" className="rounded-xl glass">Browse all {categories.length} categories <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold md:text-4xl">How it works</h2>
            <p className="mt-2 text-muted-foreground">From idea to doorstep in 4 simple steps</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.title} className="glass rounded-3xl p-6 hover-lift">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow">
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-semibold text-primary">STEP {i + 1}</div>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRENDING */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold md:text-4xl">Trending now</h2>
            <p className="mt-2 text-muted-foreground">What India is printing this week</p>
          </div>
          {trending.length > 0 && (
            <Link to="/category/$slug" params={{ slug: categories[0].slug }} className="hidden text-sm font-semibold text-primary hover:underline md:inline">
              Browse all categories →
            </Link>
          )}
        </div>
        {trending.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <p className="text-base">No products yet.</p>
            <p className="mt-1 text-sm">
              Sign in as a super admin and head to{" "}
              <Link to="/superadmin/content" className="text-primary hover:underline">Content & Catalog</Link>
              {" "}to add your first product.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {trending.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* TESTIMONIALS — managed from Super Admin → Products → "Loved by businesses" */}
      {testimonials.length > 0 && (
        <section className="relative py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-center text-3xl font-bold md:text-4xl">Loved by businesses</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {testimonials.map((t, i) => (
                <Card key={`${t.name}-${i}`} className="glass border-white/35 p-6">
                  <p className="text-sm text-foreground/90">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5 flex items-center gap-3">
                    {t.avatar ? (
                      <img src={t.avatar} alt={t.name} className="h-10 w-10 rounded-full object-cover ring-2 ring-white/75" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-2 ring-white/75">
                        {t.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      {t.role && <div className="text-xs text-muted-foreground">{t.role}</div>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-[2rem] glass-strong p-10 md:p-14">
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-bold md:text-3xl">Ready to print at scale?</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">Sign up free, upload your artwork, and our network does the rest. Vendors and admins get their own purpose-built dashboard.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/signup"><Button size="lg" className="rounded-xl">Create account</Button></Link>
              <Link to="/login"><Button size="lg" variant="outline" className="rounded-xl glass">Sign in</Button></Link>
            </div>
          </div>
        </div>
      </section>
    </StorefrontLayout>
  );
}
