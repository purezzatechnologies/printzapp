import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Auto-advancing hero image slider. Images are managed by the super admin in
// Super Admin → Products → "Homepage hero slider". Falls back to a single
// static image when only one slide is present.
export function HeroSlider({ slides }: { slides: string[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  // Keep the active index valid if the slide list changes.
  useEffect(() => {
    setIndex((i) => (i >= count ? 0 : i));
  }, [count]);

  // Auto-advance every 5s (only when there is more than one slide).
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(id);
  }, [count]);

  const go = (next: number) => setIndex(((next % count) + count) % count);

  return (
    <div className="group relative aspect-square w-full overflow-hidden rounded-[1.6rem]">
      {slides.map((src, i) => (
        <img
          key={`${src.slice(0, 32)}-${i}`}
          src={src}
          alt={`Printing sample ${i + 1}`}
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-white/70 text-foreground opacity-0 backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-white/70 text-foreground opacity-0 backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
