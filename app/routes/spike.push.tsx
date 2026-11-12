// SPIKE (throwaway, never merge): one page to turn on Push Notifications on a
// phone and send one through Knock's FCM channel. Everything it learns is shown
// on the page, because a phone has no console to read.
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/spike.push";
import {
  registerDevice,
  sendTestPush,
  spikeConfig,
} from "~/lib/spike-push.server";

export function meta() {
  return [
    { title: "Push spike — Cadence" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "mobile-web-app-capable", content: "yes" },
  ];
}

export function links() {
  return [
    { rel: "manifest", href: "/manifest.webmanifest" },
    { rel: "apple-touch-icon", href: "/favicon.svg" },
  ];
}

export function loader() {
  return spikeConfig();
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const recipient = String(form.get("recipient") || "spike-phone");
  if (intent === "register") {
    return { intent, results: await registerDevice(recipient, String(form.get("token"))) };
  }
  return { intent, results: await sendTestPush(recipient) };
}

function diagnostics() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true,
    secureContext: window.isSecureContext,
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notificationApi: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "n/a",
  };
}

export default function SpikePush() {
  const config = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [recipient, setRecipient] = useState("spike-android");
  const [token, setToken] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [diag, setDiag] = useState<ReturnType<typeof diagnostics> | null>(null);

  const say = (line: string) =>
    setLog((lines) => [`${new Date().toLocaleTimeString()} ${line}`, ...lines]);

  useEffect(() => {
    setDiag(diagnostics());
    if (/iPhone|iPad/.test(navigator.userAgent)) setRecipient("spike-iphone");
  }, []);

  async function turnOn() {
    try {
      const permission = await Notification.requestPermission();
      say(`permission: ${permission}`);
      setDiag(diagnostics());
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
        { scope: "/" }
      );
      await navigator.serviceWorker.ready;
      say("service worker ready");

      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging, getToken, isSupported, onMessage } = await import(
        "firebase/messaging"
      );
      const supported = await isSupported();
      say(`firebase messaging supported: ${supported}`);
      if (!supported) return;

      const app = getApps()[0] ?? initializeApp(config.firebase);
      const messaging = getMessaging(app);
      onMessage(messaging, (payload) => {
        say(`foreground message: ${JSON.stringify(payload.notification ?? payload.data)}`);
        registration.showNotification(payload.notification?.title ?? "Cadence", {
          body: payload.notification?.body ?? "",
        });
      });

      const fcmToken = await getToken(messaging, {
        vapidKey: config.vapidKey,
        serviceWorkerRegistration: registration,
      });
      setToken(fcmToken);
      say(`FCM token: ${fcmToken.slice(0, 24)}…`);
      fetcher.submit(
        { intent: "register", recipient, token: fcmToken },
        { method: "post" }
      );
    } catch (error) {
      say(`error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 text-sm">
      <h1 className="text-xl font-semibold">Push Notification spike</h1>

      {config.missing.length > 0 && (
        <p className="rounded bg-red-100 p-2 text-red-900">
          Missing env: {config.missing.join(", ")}
        </p>
      )}

      <label className="block">
        Knock recipient id
        <input
          className="mt-1 block w-full rounded border p-2"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
        />
      </label>

      <div className="flex gap-2">
        <button className="rounded bg-black px-3 py-2 text-white" onClick={turnOn}>
          1. Turn on Push Notifications
        </button>
        <button
          className="rounded border px-3 py-2"
          onClick={() => fetcher.submit({ intent: "send", recipient }, { method: "post" })}
        >
          2. Send one via Knock
        </button>
      </div>

      {diag && (
        <pre className="overflow-x-auto rounded bg-gray-100 p-2 whitespace-pre-wrap">
          {JSON.stringify(diag, null, 2)}
        </pre>
      )}

      {token && (
        <p className="break-all">
          token registered for <b>{recipient}</b>
        </p>
      )}

      {fetcher.data && (
        <pre className="overflow-x-auto rounded bg-gray-100 p-2 whitespace-pre-wrap">
          {JSON.stringify(fetcher.data, null, 2)}
        </pre>
      )}

      <ul className="space-y-1 font-mono text-xs">
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
