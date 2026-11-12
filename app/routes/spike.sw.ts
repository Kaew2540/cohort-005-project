// SPIKE (throwaway): serves /firebase-messaging-sw.js with the Firebase config
// injected from the environment, so no project keys are committed.
import firebasePackage from "firebase/package.json";
import { firebaseConfig } from "~/lib/spike-push.server";

export function loader() {
  const version = firebasePackage.version;
  const script = `
importScripts("https://www.gstatic.com/firebasejs/${version}/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/${version}/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig())});
const messaging = firebase.messaging();

// Safari revokes permission if a push arrives and nothing is shown.
// FCM shows "notification" payloads itself; show data-only ones here.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const data = payload.data || {};
  self.registration.showNotification(data.title || "Cadence", {
    body: data.body || JSON.stringify(data),
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/spike/push"));
});
`;
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-store",
    },
  });
}
