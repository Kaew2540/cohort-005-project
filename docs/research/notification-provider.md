# Research: choosing the Notification provider

Resolves research ticket #10, under map #9 "Notifications in Cadence". Researched 2026-11-12 from vendor docs, vendor pricing pages and the WebKit blog. Prices and limits change, so check them again before signing up.

Terms follow `GLOSSARY.md`. A **Notification** is kept in Cadence and can be looked back on in the in-app feed. A **Push Notification** is the same Notification popping up on the phone.

## Recommendation

**Use Knock.** It is the only candidate that covers all three needs on its free tier:

- a persistent in-app feed with prebuilt React components and headless hooks;
- delays of up to 365 days that can be cancelled by key, plus timezone-aware recurring schedules (the 7-day "not watched" nudge and the weekly progress Notification);
- a first-class Node SDK.

Push Notifications reach the browser through Knock's Firebase Cloud Messaging (FCM) channel. Knock has no direct VAPID/Web Push channel of its own, so Cadence will need a Firebase project.

Novu comes closest. On its free tier, though, a delay can last at most **1 day**, so the 7-day nudge would need the Team plan. MagicBell has native VAPID web push, but its free tier is small (1,000 deliveries) and its delay/cancel story is thin. OneSignal is strong at push but keeps no per-user Notification history, so it can't power the feed. Courier's Inbox is comparable, but its docs show no browser Web Push path.

## Comparison

| | Knock | Novu | OneSignal | MagicBell | Courier |
|---|---|---|---|---|---|
| In-app feed from React | `@knocklabs/react`: `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`, plus hooks for headless use | `@novu/react` `<Inbox>`, `Bell`, plus headless hooks | No persistent per-user feed; you store history yourself | React components available | `@trycourier/courier-react` `<CourierInbox>` |
| Web Push route | FCM channel (Firebase web SDK, `firebase-messaging-sw.js`, VAPID key from Firebase). Also a OneSignal channel | FCM (web integration); also OneSignal, Pushpad, Push Webhook | Native web push, `OneSignalSDKWorker.js` | Native VAPID keys, its script imported into your `/sw.js` | No browser Web Push path found in docs (APNs/FCM mobile) |
| Delay + cancel | Delay up to 365 days; cancel with `cancellation_key` | Delay capped by plan: **1 day Free**, 7 days Pro, 30 days Team; cancel with `transactionId` | Not a workflow engine | Workflow `wait`/`abort`; no clear per-run cancel API | Journeys (not examined in depth) |
| Recurring / timezone | Schedules: recipient-timezone-aware cron, create/delete via API | Scheduled delay in subscriber timezone | n/a | n/a | n/a |
| Free tier | 10,000 messages/mo; Starter $250/mo | 10,000 workflow runs/mo, 24h activity retention; Pro from $30/mo | Free; 10k web push per send; Growth from $19/mo | 1,000 deliveries/mo; Startup $249/mo | 10,000 sends/mo; then $0.005/send |
| Node SDK | `@knocklabs/node` (trigger, cancel, schedules, `signUserToken`) | `@novu/api` | REST API | JS client | Node SDK |

How messages are counted matters. Knock bills "a single message delivered to a single user on a single channel", so one Notification shown in the feed and also sent as a Push Notification counts as **2** messages. A message suppressed by preferences costs nothing. MagicBell counts deliveries per channel in the same way.

## Findings per candidate

### Knock

- **In-app feed.** `@knocklabs/react` ships `NotificationFeedPopover`, `NotificationFeed` and a `NotificationIconButton` bell. It also has "a complete set of React hooks that you can use to build your own UI on top of", so a shadcn-styled headless feed is possible. Source: https://docs.knock.app/in-app-ui/react/overview
- **Feed auth.** In enhanced security mode, Cadence's server signs an RS256 JWT with `sub` set to the user id, using `signUserToken` from `@knocklabs/node`. The client passes that token to `authenticate`. This fits React Router loaders. Source: https://docs.knock.app/in-app-ui/security-and-authentication
- **Push providers.** Knock lists APNs, FCM, Expo, Amazon SNS and OneSignal. Its push overview does not mention Web Push or VAPID. Source: https://docs.knock.app/integrations/push/overview
- **Web Push via FCM.** Knock's tutorial covers the setup:
  - install the `firebase` package;
  - add `public/firebase-messaging-sw.js` at scope `/`;
  - call `getToken` with the Firebase **public VAPID key**;
  - store the token as the user's FCM channel data in Knock;
  - clear that channel data when the user opts out.

  The sample subscribe button blocks iPhone users until the app is installed ("In iPhone you must install the app first"). Source: https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm
- **Delays.** There are four delay types (fixed, dynamic, relative timestamp, time window). The limit is "at most 365 days". Source: https://docs.knock.app/designing-workflows/delay-function
- **Cancelling.** Pass a `cancellation_key` when triggering, then call the cancel workflow API with that key (optionally for a subset of recipients). The API returns 204 once the cancellation is enqueued. Knock advises against cancelling within 5 seconds of the trigger. For Cadence, a "watched a Lesson" event cancels the pending 7-day nudge with key `nudge:<studentId>`. Source: https://docs.knock.app/send-notifications/canceling-workflows
- **Schedules.** A schedule is "a managed, recipient-timezone-aware cron job". It takes `repeats` (weekly, daily and so on) and up to 100 recipients per call. Deleting a schedule cancels its enqueued runs. This fits weekly progress Notifications and the open "quiet hours / timezone" question on the map. Source: https://docs.knock.app/concepts/schedules
- **Pricing.**
  - Free: $0, 10,000 messages/mo, unlimited feeds, prebuilt components.
  - Starter: $250/mo with 50,000 messages, then $0.005 each.
  - There is no hard cap on Free: Knock contacts you about billing.
  - The pricing page doesn't name push specifically under Free ("Unlimited" delivery channels).

  Source: https://knock.app/pricing

### Novu

- **Inbox.** `@novu/react` provides `<Inbox>`, `Bell`, `Notifications` and `Preferences`, plus headless hooks. It needs React 18 or later. Source: https://docs.novu.co/platform/inbox/overview
- **Push.** Supported providers are FCM (including a "web app" integration), APNs, Expo, OneSignal, Pushpad, Pusher Beams and Push Webhook. Source: https://docs.novu.co/platform/integrations/push
- **Delay limit.** The delay "follows your plan limit": **1 day on Free**, 7 days on Pro, 30 days on Team. That rules out a 7-day nudge below Team ($250/mo). Source: https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/delay
- **Cancelling.** `DELETE /v1/events/trigger/{transactionId}` cancels pending delays and digests. Source: https://docs.novu.co/api-reference/events/cancel-triggered-event
- **Pricing.** Free: 10,000 runs/mo, 5 workflows, 24h activity retention. Pro from $30/mo. Team from $250/mo. Source: https://novu.co/pricing

### OneSignal

- **Push.** Strong web push, including iOS: it needs a manifest, `OneSignalSDKWorker.js` at the root, and a subscribe tap inside the installed app. Source: https://documentation.onesignal.com/docs/en/web-push-for-ios
- **No feed.** OneSignal "does not currently store the history of messages sent to each individual user". Its message history API covers 7 days. Cadence would have to build the feed itself. Source: https://documentation.onesignal.com/docs/en/create-an-activity-feed
- **Pricing.** Free tier available; Growth from $19/mo. Source: https://onesignal.com/pricing
- **Verdict.** OneSignal could at most be a push leg underneath Knock (Knock has a OneSignal channel), not the whole provider.

### MagicBell

- **Web push.** Native web push with your own VAPID key pair, configured in the dashboard or with `PUT /v2/integrations/web_push`. Source: https://www.magicbell.com/docs/channels/web_push
- **Service worker.** Your `/sw.js` must `importScripts` MagicBell's worker. Source: https://www.magicbell.com/docs/libraries/magicbell-react
- **Workflows.** Workflows have `wait`, `pause` and `abort` steps. I found no documented API to cancel one pending run from code. Source: https://www.magicbell.com/workflows
- **Pricing.** Builder (free) has 1,000 deliveries/mo. Startup is $249/mo. Source: https://www.magicbell.com/pricing

### Courier

- **Inbox.** `@trycourier/courier-react` `<CourierInbox>` with a backend-minted JWT. Source: https://docs.courier.com/docs/courier-push
- **Pricing.** Developer (free) has 10,000 sends/mo, then $0.005/send. Source: https://www.courier.com/pricing
- **Web push.** I found no first-party docs for browser Web Push (service worker / Push API). Its push docs are about APNs/FCM on mobile.

## Push Notifications on phones: what Cadence must ship

This applies whatever the provider.

- **HTTPS.** Required. FCM: "supported only in pages served over HTTPS". Source: https://firebase.google.com/docs/cloud-messaging/js/client
- **A service worker at the site root.**
  - With Knock+FCM: `public/firebase-messaging-sw.js`.
  - It must always show a notification when a push arrives. Safari revokes the permission if a push arrives and nothing is shown. Source: https://documentation.onesignal.com/docs/en/web-push-for-ios
- **A web app manifest.**
  - `display: "standalone"` (or `fullscreen`).
  - Name, `start_url`, and 192×192 and 512×512 PNG icons.
  - One `<link rel="manifest">` in the root layout.
- **A subscribe control.** Permission is asked from a tap ("in response to direct user interaction"), never on page load.
- **Token handling.** On grant, get the token and save it to Knock's FCM channel data for the user. Clear it on opt-out.

### Android

Chrome on Android supports Web Push from a normal browser tab. Installing the app is not required.

### iPhone (the big caveat)

- **Only for installed apps.** Web Push works only for **Home Screen web apps on iOS/iPadOS 16.4+**. "A web app that has been added to the Home Screen can request permission to receive push notifications." The manifest must set `display` to `standalone` or `fullscreen`. It uses the standard Push API, Notifications API and Service Workers. **No Apple Developer Program membership is needed.** The Badging API is also available. Source: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- **No prompt from a tab.** "A tab in Safari, Chrome, Edge, or Firefox cannot request permission". The person must use Share → Add to Home Screen, open the icon, then tap subscribe. Source: https://documentation.onesignal.com/docs/en/web-push-for-ios
- **Install guidance in the UI.** Cadence therefore needs an "Install Cadence to get Push Notifications on iPhone" flow. Detect iOS plus "not standalone" and show instructions. Without that, iPhone users get only the in-app feed.
- **EU uncertainty.** A MagicBell blog claims Home Screen web app push is unavailable in the EU on iOS 17+. I could not confirm this against an Apple primary source. Verify it if Cadence has EU Students.

## Caveats and open items for the spec

1. **FCM on iOS is not shown in Knock's docs.** Knock's push docs list FCM only "for Android". Its web-push tutorial does handle the iPhone/installed case, but neither Knock nor Firebase docs explicitly state that FCM web tokens work on iOS Safari Home Screen apps. Run a short spike before committing: install a test page on an iPhone and send through Knock's FCM channel. The fallback is Knock's **OneSignal channel**, since OneSignal documents iOS web push explicitly.
2. **Billing doubles per channel.** Each Notification sent to the feed and as a Push Notification counts as 2 Knock messages. At 10k/mo free, that is about 5,000 Notifications/mo. Starter jumps to $250/mo.
3. **Knock's free plan keeps Knock branding** in components.
4. **Local dev and tests without a token** (an open map item). Knock has no `.outbox/`-style local mode. Cadence will want a thin `notifier.server.ts` seam, like `mailer.server.ts`, that records Notifications locally when `KNOCK_API_KEY` is absent.
5. **Enhanced security mode** should be on in production. It needs `KNOCK_SIGNING_KEY` on the server, with a token minted in the root loader for the signed-in user.
