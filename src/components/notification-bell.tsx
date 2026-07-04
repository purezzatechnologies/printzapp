import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Package, MessageSquareWarning, RotateCcw, Wallet, Store, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNotificationsFn, markNotificationsReadFn } from "@/lib/backend";

type Notification = Awaited<ReturnType<typeof getNotificationsFn>>["items"][number];

const typeIcon: Record<string, typeof Bell> = {
  order_new: Package,
  order_status: Package,
  complaint: MessageSquareWarning,
  complaint_reply: MessageSquareWarning,
  refund: RotateCcw,
  payout: Wallet,
  vendor_status: Store,
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const lastTopId = useRef<string | null>(null);
  const initialized = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioCtx.current ??= new Ctor();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") void ctx.resume();
      // Two quick ascending tones.
      [0, 0.16].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 740 : 988;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.15);
      });
    } catch {
      /* audio not available */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await getNotificationsFn();
      setItems(res.items);
      setUnread(res.unread);
      const topId = res.items[0]?.id ?? null;
      // Play a sound when a genuinely new notification arrives (not on first load).
      if (initialized.current && topId && topId !== lastTopId.current && res.unread > 0) {
        beep();
      }
      lastTopId.current = topId;
      initialized.current = true;
    } catch {
      /* ignore (e.g. not authorized) */
    }
  }, [beep]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    // Unlock audio on the first user interaction so beeps can play later.
    const resume = () => { try { void audioCtx.current?.resume(); } catch { /* noop */ } };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", resume);
    };
  }, [load]);

  const onOpenChange = async (o: boolean) => {
    setOpen(o);
    if (o && unread > 0) {
      try {
        await markNotificationsReadFn();
      } catch {
        /* ignore */
      }
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative glass-chip" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {items.some((n) => !n.read) && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCheck className="h-3.5 w-3.5" /> marking read…
            </span>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            items.map((n) => {
              const Icon = typeIcon[n.type] ?? Bell;
              return (
                <div
                  key={n.id}
                  className={`flex gap-3 border-b px-3 py-2.5 last:border-b-0 ${n.read ? "" : "bg-primary/5"}`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-snug">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
