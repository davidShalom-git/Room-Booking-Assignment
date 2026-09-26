/**
 * Owner app notifications (Web Push). Every owner alert the bot, the website or the console
 * raises is also addressed to OWNER_PUSH; deliver() hands those here, and each phone where the
 * owner turned notifications on gets one. Payment alerts carry Acknowledge / Not received
 * actions with a signed token for that payment (public/owner-sw.js posts it to /api/owner/act).
 */
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { signOwnerAction } from "@/lib/session";
import type { Out } from "@/lib/bot/types";

export { OWNER_PUSH } from "@/lib/bot/types";

type Subscription = { endpoint: string; p256dh: string; auth: string };
/** Sends one payload to one subscription; throws (with `statusCode`) when the push service refuses. */
export type PushSender = (sub: Subscription, payload: string) => Promise<unknown>;

export type OwnerNotification = {
  title: string;
  body: string;
  /** Opened when the notification itself is tapped. */
  url: string;
  /** Same tag = replaces the earlier notification (a repeated alert for one payment). */
  tag?: string;
  actions: { action: string; title: string }[];
  /** For payment alerts: authorizes Acknowledge / Not received on that payment. */
  token?: string;
};

/** Chat formatting (*bold*, _italic_, ~strike~) means nothing in a notification. */
const plain = (s: string) => s.replace(/[*_~]/g, "").trim();

export function ownerPushPayload(out: Out, now: number = Date.now()): OwnerNotification {
  const [first = "", ...rest] = out.text.split("\n");
  const acts = (out.buttons ?? []).flatMap((b) => {
    const [action, id] = b.id.split(":");
    return (action === "ack" || action === "nack") && id ? [{ action, id, title: b.title }] : [];
  });
  const paymentId = acts[0]?.id;
  return {
    title: plain(first).slice(0, 80),
    body: plain(rest.join("\n")).slice(0, 300),
    url: "/admin/today",
    ...(paymentId ? { tag: `pay-${paymentId}`, token: signOwnerAction(paymentId, now) } : {}),
    actions: acts.map(({ action, title }) => ({ action, title })),
  };
}

/** Remember a phone the owner turned notifications on for. False for anything that isn't a real subscription. */
export async function savePushSubscription(raw: unknown): Promise<boolean> {
  const s = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "";
  const auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  const ok = (v: string, max: number) => v.length > 0 && v.length <= max;
  if (!/^https:\/\/[^\s]+$/.test(endpoint) || !ok(endpoint, 1000) || !ok(p256dh, 200) || !ok(auth, 100)) return false;
  await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, p256dh, auth }, update: { p256dh, auth } });
  return true;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

function vapidSender(): PushSender | null {
  const publicKey = env.vapidPublicKey;
  const privateKey = env.vapidPrivateKey;
  if (!publicKey || !privateKey) return null;
  return (sub, payload) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      TTL: 24 * 3600,
      urgency: "high",
      vapidDetails: { subject: env.vapidSubject, publicKey, privateKey },
    });
}

/** Notify every subscribed owner device. Returns how many accepted it. Never throws. */
export async function sendOwnerPush(out: Out, send?: PushSender): Promise<number> {
  const sender = send ?? vapidSender();
  if (!sender) {
    console.warn("[push] VAPID keys not set — owner notification skipped:", out.text.split("\n")[0]);
    return 0;
  }
  const subs = await prisma.pushSubscription.findMany();
  const payload = JSON.stringify(ownerPushPayload(out));
  let sent = 0;
  for (const sub of subs) {
    try {
      await sender(sub, payload);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404 / 410: the browser dropped this subscription (app removed, permission revoked).
      if (code === 404 || code === 410) await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
      else console.error("[push] send failed", code ?? e);
    }
  }
  return sent;
}
