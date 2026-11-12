// SPIKE (throwaway, never merge): just enough to send one real Push Notification
// through Knock's FCM channel. Answers "Send one real Push Notification to a phone".

try {
  process.loadEnvFile();
} catch {
  // no .env: fall back to the shell's environment
}

const KNOCK_API = "https://api.knock.app/v1";

function env(name: string) {
  return process.env[name] ?? "";
}

export function firebaseConfig() {
  return {
    apiKey: env("FIREBASE_API_KEY"),
    authDomain: env("FIREBASE_AUTH_DOMAIN"),
    projectId: env("FIREBASE_PROJECT_ID"),
    messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("FIREBASE_APP_ID"),
  };
}

export function spikeConfig() {
  const config = {
    firebase: firebaseConfig(),
    vapidKey: env("FIREBASE_VAPID_KEY"),
  };
  const missing = [
    "KNOCK_SECRET_API_KEY",
    "KNOCK_FCM_CHANNEL_ID",
    "FIREBASE_API_KEY",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
    "FIREBASE_VAPID_KEY",
  ].filter((name) => !env(name));
  return { ...config, missing };
}

async function knock(method: string, path: string, body: unknown) {
  const response = await fetch(`${KNOCK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("KNOCK_SECRET_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { path, status: response.status, body: text.slice(0, 600) };
}

export async function registerDevice(recipient: string, token: string) {
  const identify = await knock("PUT", `/users/${recipient}`, {
    name: recipient,
  });
  const channelData = await knock(
    "PUT",
    `/users/${recipient}/channel_data/${env("KNOCK_FCM_CHANNEL_ID")}`,
    { data: { tokens: [token] } }
  );
  return [identify, channelData];
}

export async function sendTestPush(recipient: string) {
  const workflow = env("KNOCK_WORKFLOW_KEY") || "spike-push";
  const trigger = await knock("POST", `/workflows/${workflow}/trigger`, {
    recipients: [recipient],
    data: { sent_at: new Date().toISOString() },
  });
  return [trigger];
}
