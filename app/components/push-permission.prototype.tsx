// PROTOTYPE (throwaway, never merge).
// Answers "Asking permission for Push Notifications" (#14): when and how Cadence asks a
// person to allow Push Notifications, with what explanation, and how iPhone users are
// guided through Add to Home Screen first.
//
// Three variants, switchable via ?variant=A|B|C in the app shell:
//   A  "At the moment it matters": no ask on arrival; a bottom sheet appears right after
//      an action where a Push Notification would help (asked a Lesson Question, sent a
//      Refund Request, opened Refund Requests...).
//   B  "From the bell": never interrupts; the Notification feed dropdown carries a
//      "Get these on your phone" banner the person opens when they choose.
//   C  "Setup page + one-time nudge": a one-time banner leads to a full-page step-by-step
//      setup (open on phone via QR, Add to Home Screen, allow, send a test).
//
// The browser/phone is SIMULATED: pick the device and permission state in the pink
// panel (top right). Nothing is stored; reload resets everything.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Bell,
  BellRing,
  Check,
  Plus,
  Share,
  Smartphone,
  X,
  QrCode,
  ShieldAlert,
} from "lucide-react";
import { UserRole } from "~/db/schema";
import { Button } from "~/components/ui/button";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

type Device = "android" | "iphone-safari" | "iphone-home" | "desktop";
type Perm = "default" | "granted" | "denied";
type Who = "student" | "team-admin" | "instructor" | "admin";

const DEVICES: { key: Device; label: string }[] = [
  { key: "android", label: "Android, Chrome" },
  { key: "iphone-safari", label: "iPhone, Safari tab" },
  { key: "iphone-home", label: "iPhone, Home Screen app" },
  { key: "desktop", label: "Desktop browser" },
];

const VARIANTS = [
  { key: "A", name: "At the moment it matters" },
  { key: "B", name: "From the bell" },
  { key: "C", name: "Setup page + one-time nudge" },
];

// What each role would get as Push Notifications (from #11 and #12).
const PUSH_LIST: Record<Who, string[]> = {
  student: [
    "Someone Replies to your Lesson Question",
    "Your Refund Request is approved, declined or refunded",
    "A nudge when a course has gone quiet for a week",
  ],
  "team-admin": [
    "Your Refund Request is approved, declined or refunded",
    "Someone Replies to your Lesson Question",
  ],
  instructor: ["A Student asks a new Lesson Question on your course"],
  admin: [
    "A new Open Refund Request",
    "A Refund that failed",
    "An Open Refund Request still undecided after 48 hours",
  ],
};

type Moment = { key: string; label: string; title: string; body: string };

// Variant A: the moments right after which we ask.
const MOMENTS: Record<Who, Moment[]> = {
  student: [
    {
      key: "lesson-question",
      label: "Just asked a Lesson Question",
      title: "Get a ping when someone Replies?",
      body: "We'll pop up on your phone as soon as the instructor or a classmate Replies, so you don't have to keep checking.",
    },
    {
      key: "refund-request",
      label: "Just sent a Refund Request",
      title: "Hear the decision on your phone?",
      body: "We'll let you know the moment your Refund Request is decided, and again when the money is on its way.",
    },
  ],
  "team-admin": [
    {
      key: "refund-request",
      label: "Just sent a Refund Request",
      title: "Hear the decision on your phone?",
      body: "We'll let you know the moment your Refund Request is decided, and again when the money is on its way.",
    },
  ],
  instructor: [
    {
      key: "unanswered",
      label: "Opened Unanswered Questions",
      title: "Students are waiting on you",
      body: "Get a Push Notification when a Student asks a new Lesson Question, so they hear back sooner.",
    },
  ],
  admin: [
    {
      key: "refunds-page",
      label: "Opened Refund Requests",
      title: "Buyers are waiting on a decision",
      body: "Get a Push Notification for every new Open Refund Request and any Refund that fails.",
    },
  ],
};

const SAMPLE_PUSH: Record<Who, string> = {
  student: "Sarah Replied to your Lesson Question in “Hooks in depth”",
  "team-admin": "Your Refund Request for Acme Team Licence was approved",
  instructor: "New Lesson Question on “React Foundations” from Sam",
  admin: "New Open Refund Request: $49.00 from Alex Kim",
};

type Sim = {
  device: Device;
  perm: Perm;
  a2hsStarted: boolean; // the iPhone guide was shown; next Home Screen open picks up
  notNow: number; // times the person said Not now
  askedMoments: string[]; // variant A: moments already asked about
  bannerDismissed: boolean; // B and C
  testPush: string | null;
};

const INITIAL: Sim = {
  device: "android",
  perm: "default",
  a2hsStarted: false,
  notNow: 0,
  askedMoments: [],
  bannerDismissed: false,
  testPush: null,
};

type CurrentUser = { id: number; name: string; role: UserRole } | null;

function whoFor(user: CurrentUser, isTeamAdmin: boolean): Who {
  if (!user) return "student";
  if (user.role === UserRole.Admin) return "admin";
  if (user.role === UserRole.Instructor) return "instructor";
  return isTeamAdmin ? "team-admin" : "student";
}

// ───────────────────────── shared bits ─────────────────────────

function NativePrompt({
  device,
  onAllow,
  onBlock,
}: {
  device: Device;
  onAllow: () => void;
  onBlock: () => void;
}) {
  const tag = (
    <div className="mb-2 text-[10px] font-bold uppercase text-fuchsia-600">
      Simulated browser prompt
    </div>
  );
  if (device === "iphone-home") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
        <div className="w-72 rounded-2xl bg-white/95 text-center text-black shadow-2xl">
          <div className="p-4">
            {tag}
            <div className="font-semibold">
              “Cadence” Would Like to Send You Notifications
            </div>
            <div className="mt-1 text-xs">
              Notifications may include alerts, sounds and icon badges.
            </div>
          </div>
          <div className="grid grid-cols-2 border-t text-blue-600">
            <button className="border-r p-3" onClick={onBlock}>
              Don’t Allow
            </button>
            <button className="p-3 font-semibold" onClick={onAllow}>
              Allow
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (device === "android") {
    return (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40">
        <div className="w-full max-w-md rounded-t-2xl bg-white p-5 text-black shadow-2xl">
          {tag}
          <div className="flex items-center gap-3">
            <Bell className="size-5" />
            <div>Allow cadence.app to send you notifications?</div>
          </div>
          <div className="mt-4 flex justify-end gap-6 font-medium text-blue-700">
            <button onClick={onBlock}>Don’t allow</button>
            <button onClick={onAllow}>Allow</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed left-60 top-2 z-[90] w-80 rounded-lg border bg-white p-4 text-black shadow-2xl">
      {tag}
      <div className="text-sm">
        <b>cadence.app</b> wants to
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <Bell className="size-4" /> Show notifications
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onBlock}>
          Block
        </Button>
        <Button size="sm" onClick={onAllow}>
          Allow
        </Button>
      </div>
    </div>
  );
}

function FakePush({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed left-1/2 top-3 z-[95] w-80 -translate-x-1/2 rounded-2xl bg-zinc-800/95 p-3 text-white shadow-2xl">
      <div className="flex items-center gap-2 text-[11px] text-white/60">
        <div className="size-4 rounded bg-indigo-500" /> CADENCE · now
        <span className="ml-auto text-fuchsia-300">simulated push</span>
      </div>
      <div className="mt-1 text-sm">{text}</div>
    </div>
  );
}

function PushList({ who }: { who: Who }) {
  return (
    <ul className="space-y-1 text-sm">
      {PUSH_LIST[who].map((p) => (
        <li key={p} className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          {p}
        </li>
      ))}
    </ul>
  );
}

function HomeScreenSteps({ compact }: { compact?: boolean }) {
  const steps = [
    {
      icon: <Share className="size-4" />,
      text: "Tap the Share button at the bottom of Safari",
    },
    {
      icon: <Plus className="size-4" />,
      text: "Scroll down and tap “Add to Home Screen”, then “Add”",
    },
    {
      icon: <Smartphone className="size-4" />,
      text: "Open Cadence from its new Home Screen icon. We’ll ask there.",
    },
  ];
  return (
    <div>
      {!compact && (
        <p className="mb-3 text-sm text-muted-foreground">
          On iPhone, Safari can only send Push Notifications once Cadence is on
          your Home Screen. It takes about 20 seconds.
        </p>
      )}
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
              {i + 1}
            </span>
            <span className="flex items-center gap-2 pt-0.5">
              {s.icon}
              {s.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DeniedHelp({ device }: { device: Device }) {
  const how: Record<Device, string> = {
    android:
      "Tap the lock icon next to the address, then Permissions → Notifications → Allow.",
    "iphone-safari":
      "Open Settings → Notifications → Cadence and turn on Allow Notifications.",
    "iphone-home":
      "Open Settings → Notifications → Cadence and turn on Allow Notifications.",
    desktop:
      "Click the icon left of the address bar, then set Notifications to Allow.",
  };
  return (
    <div className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <ShieldAlert className="size-4 shrink-0" />
      <div>
        <b>Push Notifications are blocked on this device.</b> Cadence can’t ask
        again; only you can turn them back on. {how[device]} You’ll still see
        everything in the bell.
      </div>
    </div>
  );
}

// The step every variant runs when the person says yes.
function useAsk(sim: Sim, setSim: (f: (s: Sim) => Sim) => void, who: Who) {
  const [prompting, setPrompting] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  function ask() {
    if (sim.device === "iphone-safari") {
      setShowSteps(true);
      setSim((s) => ({ ...s, a2hsStarted: true }));
      return;
    }
    setPrompting(true);
  }
  const prompt = prompting ? (
    <NativePrompt
      device={sim.device}
      onAllow={() => {
        setPrompting(false);
        setSim((s) => ({ ...s, perm: "granted", testPush: SAMPLE_PUSH[who] }));
      }}
      onBlock={() => {
        setPrompting(false);
        setSim((s) => ({ ...s, perm: "denied" }));
      }}
    />
  ) : null;
  return { ask, prompt, showSteps, setShowSteps };
}

// ───────────────────────── Variant A ─────────────────────────

function VariantA({
  sim,
  setSim,
  who,
  moment,
  clearMoment,
}: {
  sim: Sim;
  setSim: (f: (s: Sim) => Sim) => void;
  who: Who;
  moment: Moment | null;
  clearMoment: () => void;
}) {
  const { ask, prompt, showSteps, setShowSteps } = useAsk(sim, setSim, who);

  // iPhone: first open from the Home Screen after the guide picks up where we left off.
  const resume =
    sim.device === "iphone-home" && sim.a2hsStarted && sim.perm === "default";

  const open = (moment || resume) && sim.perm === "default" && sim.notNow < 2;
  if (!open && !prompt) return null;

  function notNow() {
    setSim((s) => ({ ...s, notNow: s.notNow + 1, a2hsStarted: false }));
    setShowSteps(false);
    clearMoment();
  }

  return (
    <>
      {open && !prompt && (
        <div className="fixed inset-x-0 bottom-0 z-[80] flex justify-center p-3 sm:bottom-20">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-indigo-100 p-2 text-indigo-700">
                <BellRing className="size-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">
                  {resume ? "You’re on the Home Screen app" : moment!.title}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resume
                    ? "One last step: allow Push Notifications so Cadence can reach you."
                    : moment!.body}
                </p>
              </div>
            </div>
            {showSteps ? (
              <div className="mt-4">
                <HomeScreenSteps />
              </div>
            ) : (
              <div className="mt-4 rounded-md bg-muted/50 p-3">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  You’ll only get pushed for
                </div>
                <PushList who={who} />
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={notNow}>
                Not now
              </Button>
              {showSteps && (
                <Button
                  onClick={() => {
                    setShowSteps(false);
                    clearMoment();
                  }}
                >
                  Got it
                </Button>
              )}
              {!showSteps && (
                <Button onClick={ask}>
                  {sim.device === "iphone-safari" ? "Show me how" : "Turn on"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {prompt}
    </>
  );
}

// ───────────────────────── Variant B ─────────────────────────

function BellB({
  sim,
  setSim,
  who,
}: {
  sim: Sim;
  setSim: (f: (s: Sim) => Sim) => void;
  who: Who;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { ask, prompt, showSteps } = useAsk(sim, setSim, who);
  const needsSetup = sim.perm === "default" && !sim.bannerDismissed;

  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1.5 hover:bg-sidebar-accent"
      >
        <Bell className="size-5" />
        {needsSetup && (
          <span className="absolute right-1 top-1 size-2 rounded-full bg-indigo-500" />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-[70] w-80 rounded-lg border bg-background text-foreground shadow-xl">
          <div className="border-b px-4 py-2 font-semibold">Notifications</div>

          {sim.perm === "default" && !sim.bannerDismissed && (
            <div className="border-b bg-indigo-50 p-3 dark:bg-indigo-950">
              <div className="flex items-start gap-2">
                <Smartphone className="mt-0.5 size-4 text-indigo-600" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">Get these on your phone</div>
                  {!expanded && (
                    <div className="text-muted-foreground">
                      Only the ones that need you.{" "}
                      <button
                        className="underline"
                        onClick={() => setExpanded(true)}
                      >
                        Which?
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() =>
                    setSim((s) => ({ ...s, bannerDismissed: true }))
                  }
                  className="text-muted-foreground"
                  title="Hide (stays reachable from Settings)"
                >
                  <X className="size-4" />
                </button>
              </div>
              {expanded && (
                <div className="mt-2">
                  <PushList who={who} />
                </div>
              )}
              {showSteps ? (
                <div className="mt-3">
                  <HomeScreenSteps compact />
                </div>
              ) : (
                <Button size="sm" className="mt-3 w-full" onClick={ask}>
                  {sim.device === "iphone-safari"
                    ? "Add to Home Screen first"
                    : "Turn on Push Notifications"}
                </Button>
              )}
            </div>
          )}
          {sim.perm === "granted" && (
            <div className="border-b px-4 py-2 text-xs text-emerald-700">
              ✓ Push Notifications on for this device
            </div>
          )}
          {sim.perm === "denied" && (
            <div className="border-b p-3">
              <DeniedHelp device={sim.device} />
            </div>
          )}

          <div className="divide-y text-sm">
            <div className="px-4 py-3">
              <div className="text-xs text-muted-foreground">Today</div>
              {SAMPLE_PUSH[who]}
            </div>
            <div className="px-4 py-3 text-muted-foreground">
              Older Notifications…
            </div>
          </div>
        </div>
      )}
      {prompt}
    </div>
  );
}

// ───────────────────────── Variant C ─────────────────────────

function NudgeC({ sim, setSim }: { sim: Sim; setSim: (f: (s: Sim) => Sim) => void }) {
  const [params, setParams] = useSearchParams();
  if (sim.perm !== "default" || sim.bannerDismissed || params.get("pushsetup"))
    return null;
  return (
    <div className="flex items-center gap-3 border-b bg-indigo-600 px-6 py-2 text-sm text-white">
      <BellRing className="size-4" />
      <span className="flex-1">
        Get Cadence Notifications on your phone, so nothing that needs you waits.
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const p = new URLSearchParams(params);
          p.set("pushsetup", "1");
          setParams(p);
        }}
      >
        Set up
      </Button>
      <button
        onClick={() => setSim((s) => ({ ...s, bannerDismissed: true }))}
        title="Dismiss for good"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function SetupPageC({
  sim,
  setSim,
  who,
}: {
  sim: Sim;
  setSim: (f: (s: Sim) => Sim) => void;
  who: Who;
}) {
  const [params, setParams] = useSearchParams();
  const { ask, prompt } = useAsk(sim, setSim, who);
  const close = () => {
    const p = new URLSearchParams(params);
    p.delete("pushsetup");
    setParams(p);
  };

  const steps = ["On your phone", "What you’ll get", "Allow", "Test"];
  let step = 0;
  if (sim.device === "android" || sim.device === "iphone-home") step = 1;
  if (sim.perm !== "default") step = 3;

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Notifications on your phone</h1>
      <p className="mt-1 text-muted-foreground">
        Everything still shows in the bell. This adds a pop-up on your phone for
        the few that need you.
      </p>

      <ol className="my-6 flex gap-2 text-xs">
        {steps.map((s, i) => (
          <li
            key={s}
            className={
              "flex-1 rounded-full px-3 py-1 text-center " +
              (i <= step ? "bg-indigo-600 text-white" : "bg-muted")
            }
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border p-6">
        {step === 0 && sim.device === "desktop" && (
          <div className="flex gap-6">
            <div className="flex size-32 shrink-0 items-center justify-center rounded-lg border-2 border-dashed">
              <QrCode className="size-20" />
            </div>
            <div className="text-sm">
              <div className="font-semibold">Scan with your phone’s camera</div>
              <p className="mt-1 text-muted-foreground">
                It opens this page on your phone, already signed in, and picks up
                from here. Push Notifications go to the phone that turns them on.
              </p>
              <button className="mt-3 text-xs underline" onClick={ask}>
                Or turn them on for this computer instead
              </button>
            </div>
          </div>
        )}
        {step === 0 && sim.device === "iphone-safari" && (
          <>
            <div className="mb-3 font-semibold">First, add Cadence to your Home Screen</div>
            <HomeScreenSteps />
            <div className="mt-4 text-xs text-muted-foreground">
              (Prototype: switch the device to “iPhone, Home Screen app” to continue.)
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="mb-3 font-semibold">You’ll only get pushed for</div>
            <PushList who={who} />
            <p className="mt-3 text-sm text-muted-foreground">
              Everything else (new Enrollments, Claimed Seats, the Monday Digest)
              stays in the bell only.
            </p>
            <Button className="mt-5" onClick={ask}>
              Allow Push Notifications
            </Button>
          </>
        )}
        {step === 3 && sim.perm === "granted" && (
          <>
            <div className="font-semibold text-emerald-700">✓ All set on this device</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Didn’t see the test pop up? Check your phone’s Focus / Do Not Disturb.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSim((s) => ({ ...s, testPush: SAMPLE_PUSH[who] }))}
              >
                Send another test
              </Button>
              <Button onClick={close}>Done</Button>
            </div>
          </>
        )}
        {step === 3 && sim.perm === "denied" && <DeniedHelp device={sim.device} />}
      </div>
      <button className="mt-4 text-sm underline" onClick={close}>
        Back
      </button>
      {prompt}
    </div>
  );
}

// ───────────────────────── Sim panel + wiring ─────────────────────────

function SimPanel({
  sim,
  setSim,
  who,
  variant,
  onMoment,
}: {
  sim: Sim;
  setSim: (f: (s: Sim) => Sim) => void;
  who: Who;
  variant: string;
  onMoment: (m: Moment) => void;
}) {
  const [min, setMin] = useState(false);
  if (min)
    return (
      <button
        onClick={() => setMin(false)}
        className="fixed right-3 top-3 z-[100] rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-bold text-white"
      >
        PROTOTYPE sim
      </button>
    );
  return (
    <div className="fixed right-3 top-3 z-[100] w-64 rounded-lg border-2 border-dashed border-fuchsia-500 bg-background/95 p-3 text-xs shadow-xl">
      <div className="mb-2 flex items-center font-bold text-fuchsia-600">
        PROTOTYPE · simulated phone
        <button className="ml-auto" onClick={() => setMin(true)}>
          –
        </button>
      </div>
      <label className="block">
        Device
        <select
          className="mt-1 w-full rounded border bg-background p-1"
          value={sim.device}
          onChange={(e) => setSim((s) => ({ ...s, device: e.target.value as Device }))}
        >
          {DEVICES.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2">
        Permission:{" "}
        {(["default", "granted", "denied"] as Perm[]).map((p) => (
          <button
            key={p}
            onClick={() => setSim((s) => ({ ...s, perm: p }))}
            className={
              "mr-1 rounded px-1.5 py-0.5 " +
              (sim.perm === p ? "bg-fuchsia-600 text-white" : "bg-muted")
            }
          >
            {p}
          </button>
        ))}
      </div>
      {variant === "A" && (
        <div className="mt-2 space-y-1">
          <div className="font-semibold">Simulate a moment</div>
          {MOMENTS[who].map((m) => (
            <button
              key={m.key}
              disabled={sim.askedMoments.includes(m.key)}
              onClick={() => onMoment(m)}
              className="block w-full rounded bg-muted px-2 py-1 text-left disabled:opacity-40"
            >
              {m.label}
              {sim.askedMoments.includes(m.key) && " (already asked)"}
            </button>
          ))}
        </div>
      )}
      <pre className="mt-2 rounded bg-muted p-2 text-[10px] leading-tight">
        {JSON.stringify({ role: who, ...sim, testPush: undefined }, null, 1)}
      </pre>
      <button className="mt-1 underline" onClick={() => setSim(() => INITIAL)}>
        Reset
      </button>
    </div>
  );
}

export function usePushPermissionPrototype(
  currentUser: CurrentUser,
  isTeamAdmin: boolean
) {
  const [params] = useSearchParams();
  const variant = params.get("variant") ?? "A";
  const [sim, setSimState] = useState<Sim>(INITIAL);
  const setSim = (f: (s: Sim) => Sim) => setSimState(f);
  const [moment, setMoment] = useState<Moment | null>(null);
  const who = whoFor(currentUser, isTeamAdmin);

  const overlay = (
    <>
      {variant === "A" && (
        <VariantA
          sim={sim}
          setSim={setSim}
          who={who}
          moment={moment}
          clearMoment={() => setMoment(null)}
        />
      )}
      {sim.testPush && (
        <FakePush
          text={sim.testPush}
          onDone={() => setSimState((s) => ({ ...s, testPush: null }))}
        />
      )}
      <SimPanel
        sim={sim}
        setSim={setSim}
        who={who}
        variant={variant}
        onMoment={(m) => {
          setMoment(m);
          setSim((s) => ({ ...s, askedMoments: [...s.askedMoments, m.key] }));
        }}
      />
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );

  return {
    headerSlot:
      variant === "B" ? <BellB sim={sim} setSim={setSim} who={who} /> : null,
    banner: variant === "C" ? <NudgeC sim={sim} setSim={setSim} /> : null,
    main:
      variant === "C" && params.get("pushsetup") ? (
        <SetupPageC sim={sim} setSim={setSim} who={who} />
      ) : null,
    overlay,
  };
}
