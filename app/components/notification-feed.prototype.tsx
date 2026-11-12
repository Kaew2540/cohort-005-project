// PROTOTYPE (throwaway) for "What the in-app Notification feed looks like".
// Three variants of the in-app Notification feed in the real app shell,
// switchable via ?variant=A|B|C. Mock Notifications per role, in memory only.
// The real build would use Knock's feed (seen / read / archived states).
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Inbox,
  Newspaper,
  Smartphone,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

type Kind = "event" | "reminder" | "digest";

interface Notification {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  ago: string;
  today: boolean;
  to: string;
  cta: string;
  push: boolean;
  needsYou: boolean;
  seen: boolean;
  read: boolean;
}

type Seed = Omit<Notification, "seen" | "read"> & { read?: boolean };

function seedFor(role: UserRole, isTeamAdmin: boolean): Seed[] {
  if (role === UserRole.Admin) {
    return [
      { id: "a1", kind: "event", title: "New Refund Request from Maya Chen", detail: "Maya asked for a refund on “TypeScript Deep Dive” (bought 9 days ago, 12% watched).", ago: "4m", today: true, to: "/admin/refunds", cta: "Decide Refund Request", push: true, needsYou: true },
      { id: "a2", kind: "event", title: "Refund failed for Leo Martins", detail: "Stripe returned card_expired for “React Patterns”. The Refund Request is approved but no money moved.", ago: "1h", today: true, to: "/admin/refunds", cta: "Open Failed Refund", push: true, needsYou: true },
      { id: "a3", kind: "reminder", title: "A Refund Request has waited 48 hours", detail: "Sam Okafor's Refund Request on “Node Fundamentals” is still Open.", ago: "3h", today: true, to: "/admin/refunds", cta: "Decide Refund Request", push: true, needsYou: true },
      { id: "a4", kind: "event", title: "New Refund Request from Sam Okafor", detail: "Sam asked for a refund on “Node Fundamentals”.", ago: "2d", today: false, to: "/admin/refunds", cta: "Decide Refund Request", push: true, needsYou: false, read: true },
    ];
  }
  if (role === UserRole.Instructor) {
    return [
      { id: "i1", kind: "event", title: "New Lesson Question on “React Patterns”", detail: "Priya on Lesson 4 “Compound Components”: “Why does the context default to undefined here?”", ago: "12m", today: true, to: "/instructor/questions", cta: "Reply", push: true, needsYou: true },
      { id: "i2", kind: "event", title: "New Enrollment on “React Patterns”", detail: "Tom Reed claimed a Seat from Acme Corp's Team Licence.", ago: "40m", today: true, to: "/instructor", cta: "View course", push: false, needsYou: false },
      { id: "i3", kind: "digest", title: "Your week: 14 new Enrollments, 3 unanswered", detail: "React Patterns: 9 Enrollments, 2 Lesson Questions without a Reply.\nTypeScript Deep Dive: 5 Enrollments, 1 Lesson Question without a Reply.", ago: "Mon 08:00", today: false, to: "/instructor/questions", cta: "See Lesson Questions", push: false, needsYou: false },
      { id: "i4", kind: "event", title: "New Enrollment on “TypeScript Deep Dive”", detail: "Ana Silva bought it (Individual Purchase).", ago: "3d", today: false, to: "/instructor", cta: "View course", push: false, needsYou: false, read: true },
    ];
  }
  const student: Seed[] = [
    { id: "s1", kind: "event", title: "Your instructor replied to your Lesson Question", detail: "Kent on “useEffect cleanup order”: “Cleanup runs before the next effect, not on unmount only…”", ago: "20m", today: true, to: "/dashboard", cta: "Read the Reply", push: true, needsYou: false },
    { id: "s2", kind: "event", title: "Refund issued: $49 for “Node Fundamentals”", detail: "The money is on its way back to your card ending 4242 (5–10 days).", ago: "2h", today: true, to: "/dashboard", cta: "View purchase", push: true, needsYou: false },
    { id: "s3", kind: "reminder", title: "2 courses waiting for you", detail: "“React Patterns” (38%) and “TypeScript Deep Dive” (5%): nothing watched for 7 days.", ago: "Yesterday", today: false, to: "/dashboard", cta: "Continue watching", push: true, needsYou: false },
  ];
  if (isTeamAdmin) {
    student.splice(1, 0, { id: "t1", kind: "event", title: "Tom Reed claimed a Seat", detail: "Acme Corp · “React Patterns” Team Licence: 7 of 10 Seats claimed.", ago: "40m", today: true, to: "/team", cta: "View Team", push: false, needsYou: false });
    student.push({ id: "t2", kind: "reminder", title: "3 Seats still unclaimed after 14 days", detail: "Acme Corp · “React Patterns” Team Licence. Share the invite link again?", ago: "2d", today: false, to: "/team", cta: "View Team", push: false, needsYou: true, read: true });
  }
  return student;
}

function useFeed(role: UserRole, isTeamAdmin: boolean) {
  const [items, setItems] = useState<Notification[]>(() =>
    seedFor(role, isTeamAdmin).map((s) => ({ ...s, read: !!s.read, seen: !!s.read }))
  );
  useEffect(() => {
    setItems(seedFor(role, isTeamAdmin).map((s) => ({ ...s, read: !!s.read, seen: !!s.read })));
  }, [role, isTeamAdmin]);
  const patch = (fn: (n: Notification) => Partial<Notification>) =>
    setItems((xs) => xs.map((n) => ({ ...n, ...fn(n) })));
  return {
    items,
    markRead: (id: string) => patch((n) => (n.id === id ? { read: true, seen: true } : {})),
    toggleRead: (id: string) => patch((n) => (n.id === id ? { read: !n.read, seen: true } : {})),
    markAllRead: () => patch(() => ({ read: true, seen: true })),
    markAllSeen: () => patch(() => ({ seen: true })),
    reset: () =>
      setItems(seedFor(role, isTeamAdmin).map((s) => ({ ...s, read: !!s.read, seen: !!s.read }))),
  };
}

type Feed = ReturnType<typeof useFeed>;

function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  if (kind === "reminder") return <Clock className={cn("size-4 text-amber-500", className)} />;
  if (kind === "digest") return <Newspaper className={cn("size-4 text-sky-500", className)} />;
  return <Bell className={cn("size-4 text-muted-foreground", className)} />;
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span className={cn("flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white", className)}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [active, onOutside, ref]);
}

// ── Variant A: bell in the sidebar header, dropdown popover ─────────────────
// Unread = dot + bold + tint. Click = mark read + go there. "Mark all as read".
// Badge counts unread. No full page.
function VariantABell({ feed }: { feed: Feed }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false), open);
  const unread = feed.items.filter((n) => !n.read).length;
  const shown = tab === "unread" ? feed.items.filter((n) => !n.read) : feed.items;

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
      >
        <Bell className="size-5" />
        <Badge count={unread} className="absolute -right-0.5 -top-0.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button onClick={feed.markAllRead} disabled={unread === 0} className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">
              Mark all as read
            </button>
          </div>
          <div className="flex gap-4 border-b px-4 text-sm">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 py-2 capitalize", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground")}>
                {t}{t === "unread" && unread > 0 ? ` (${unread})` : ""}
              </button>
            ))}
          </div>
          <ul className="max-h-[28rem] overflow-y-auto">
            {shown.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">You're all caught up.</li>}
            {shown.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => { feed.markRead(n.id); setOpen(false); navigate(n.to); }}
                  className={cn("flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-accent", !n.read && "bg-primary/5")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", !n.read ? "font-semibold" : "text-muted-foreground")}>{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.detail}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{n.ago}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Variant B: "Notifications" nav item → right-hand drawer ─────────────────
// Badge counts UNSEEN; opening the drawer marks everything seen (badge clears)
// but each stays highlighted until clicked or ticked. Grouped Today / Earlier.
// Reminders and Digests carry their own chip. Push ones show a phone icon.
function VariantBNavItem({ feed, onOpen }: { feed: Feed; onOpen: () => void }) {
  const unseen = feed.items.filter((n) => !n.seen).length;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="size-4" />
      Notifications
      <Badge count={unseen} className="ml-auto" />
    </button>
  );
}

function VariantBDrawer({ feed, onClose }: { feed: Feed; onClose: () => void }) {
  const navigate = useNavigate();
  useEffect(() => { feed.markAllSeen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [
    { label: "Today", items: feed.items.filter((n) => n.today) },
    { label: "Earlier", items: feed.items.filter((n) => !n.today) },
  ].filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside className="flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-14 items-center justify-between border-b px-5">
          <span className="text-lg font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            <button onClick={feed.markAllRead} title="Mark all as read" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"><CheckCheck className="size-4" /></button>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.map((g) => (
            <section key={g.label}>
              <h3 className="sticky top-0 bg-background/95 px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h3>
              {g.items.map((n) => (
                <div key={n.id} className={cn("group relative mx-3 my-1 rounded-lg px-3 py-3", !n.read && "bg-accent/60")}>
                  {!n.read && <span className="absolute -left-1 top-4 size-2 rounded-full bg-primary" aria-label="Unread" />}
                  <button className="block w-full text-left" onClick={() => { feed.markRead(n.id); onClose(); navigate(n.to); }}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <KindIcon kind={n.kind} className="size-3.5" />
                      {n.kind !== "event" && <span className="font-medium capitalize">{n.kind}</span>}
                      <span>{n.ago}</span>
                      {n.push && <Smartphone className="size-3" aria-label="Also a Push Notification" />}
                    </div>
                    <div className={cn("mt-1 text-sm", !n.read && "font-semibold")}>{n.title}</div>
                    <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{n.detail}</div>
                  </button>
                  <button
                    onClick={() => feed.toggleRead(n.id)}
                    title={n.read ? "Mark as unread" : "Mark as read"}
                    className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:bg-background group-hover:block"
                  >
                    <Check className="size-3.5" />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ── Variant C: full-page inbox, two panes ───────────────────────────────────
// Nav item opens an inbox in the main area. Filter "Needs you" / "All".
// Selecting a Notification reads it and shows it whole, with one action button.
// Badge counts unread Notifications that need you only.
function VariantCNavItem({ feed, active, onOpen }: { feed: Feed; active: boolean; onOpen: () => void }) {
  const count = feed.items.filter((n) => !n.read && n.needsYou).length;
  const anyUnread = feed.items.some((n) => !n.read);
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Inbox className="size-4" />
      Inbox
      {count > 0 ? <Badge count={count} className="ml-auto" /> : anyUnread && <span className="ml-auto size-2 rounded-full bg-primary" />}
    </button>
  );
}

function VariantCInbox({ feed, onClose }: { feed: Feed; onClose: () => void }) {
  const [filter, setFilter] = useState<"needs" | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const shown = filter === "needs" ? feed.items.filter((n) => n.needsYou) : feed.items;
  const selected = feed.items.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <div className="flex w-[24rem] shrink-0 flex-col border-r">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h1 className="text-lg font-semibold">Inbox</h1>
          <button onClick={feed.markAllRead} className="text-xs text-primary hover:underline">Mark all as read</button>
        </div>
        <div className="flex gap-2 border-b p-3">
          {([["all", "All"], ["needs", "Needs you"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {label} ({(k === "needs" ? feed.items.filter((n) => n.needsYou) : feed.items).filter((n) => !n.read).length})
            </button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shown.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => { setSelectedId(n.id); feed.markRead(n.id); }}
                className={cn("flex w-full items-start gap-3 border-b px-4 py-3 text-left", selectedId === n.id ? "bg-accent" : "hover:bg-accent/50")}
              >
                <KindIcon kind={n.kind} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("flex-1 truncate text-sm", !n.read ? "font-semibold" : "text-muted-foreground")}>{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{n.ago}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{n.detail}</div>
                </div>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center justify-end border-b px-4">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:underline">Close inbox</button>
        </div>
        {selected ? (
          <div className="max-w-xl p-8">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <KindIcon kind={selected.kind} className="size-3.5" />
              <span className="capitalize">{selected.kind === "event" ? "Notification" : selected.kind}</span>·<span>{selected.ago}</span>
              {selected.needsYou && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Needs you</span>}
            </div>
            <h2 className="mt-2 text-xl font-semibold">{selected.title}</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{selected.detail}</p>
            <div className="mt-6 flex gap-2">
              <button onClick={() => { onClose(); navigate(selected.to); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{selected.cta}</button>
              <button onClick={() => feed.toggleRead(selected.id)} className="rounded-md border px-4 py-2 text-sm">{selected.read ? "Mark as unread" : "Mark as read"}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a Notification</div>
        )}
      </div>
    </div>
  );
}

// ── Wiring: the layout asks for slots ───────────────────────────────────────
export const PROTOTYPE_VARIANTS = [
  { key: "A", name: "Bell + dropdown" },
  { key: "B", name: "Nav item + drawer, seen vs read" },
  { key: "C", name: "Full-page inbox" },
];

export function useNotificationFeedPrototype(
  user: { role: UserRole } | null,
  isTeamAdmin: boolean
) {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";
  const feed = useFeed(user?.role ?? UserRole.Student, isTeamAdmin);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setInboxOpen(false); setDrawerOpen(false); }, [location.pathname, variant]);

  const switcher = (
    <>
      <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} />
      {!import.meta.env.PROD && (
        <button onClick={feed.reset} className="fixed bottom-4 left-[calc(50%+12rem)] z-[100] rounded-full bg-fuchsia-600 px-3 py-2 text-xs font-semibold text-white shadow-xl ring-2 ring-white">
          Reset Notifications
        </button>
      )}
    </>
  );

  if (!user) return { headerSlot: null, navSlot: null, main: null, overlay: switcher };

  return {
    headerSlot: variant === "A" ? <VariantABell feed={feed} /> : null,
    navSlot:
      variant === "B" ? <VariantBNavItem feed={feed} onOpen={() => setDrawerOpen(true)} />
      : variant === "C" ? <VariantCNavItem feed={feed} active={inboxOpen} onOpen={() => setInboxOpen(true)} />
      : null,
    main: variant === "C" && inboxOpen ? <VariantCInbox feed={feed} onClose={() => setInboxOpen(false)} /> : null,
    overlay: (
      <>
        {variant === "B" && drawerOpen && <VariantBDrawer feed={feed} onClose={() => setDrawerOpen(false)} />}
        {switcher}
      </>
    ),
  };
}
