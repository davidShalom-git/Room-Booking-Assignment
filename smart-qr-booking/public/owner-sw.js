/**
 * Owner app service worker (scope /admin/): shows push notifications, and handles
 * Acknowledge / Not received right from the notification (POST /api/owner/act with the
 * notification's signed token); the guest is told in their chat. After Acknowledge, the "Done"
 * notification opens WhatsApp with the confirmation ready to send from the owner's own number.
 */
const ICON = "/owner-icon/192";
const HOME = "/admin/today";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let n = { title: "Update", body: "", url: HOME, actions: [] };
  try {
    if (event.data) n = { ...n, ...event.data.json() };
  } catch {
    if (event.data) n.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(n.title || "Update", {
      body: n.body,
      icon: ICON,
      badge: "/owner-icon/96",
      tag: n.tag,
      renotify: Boolean(n.tag),
      requireInteraction: Boolean(n.token),
      actions: n.actions || [],
      data: { url: n.url || HOME, token: n.token },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  if ((event.action === "ack" || event.action === "nack") && data.token) {
    event.waitUntil(act(event.action, data.token));
  } else {
    event.waitUntil(open(data.url || HOME));
  }
});

async function act(action, token) {
  let r;
  try {
    const res = await fetch("/api/owner/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, token }),
    });
    r = await res.json();
  } catch {
    r = { ok: false, error: "No internet connection — open the app to try again." };
  }
  const wa = r.ok && typeof r.whatsapp === "string" && r.whatsapp.startsWith("https://wa.me/") ? r.whatsapp : null;
  return self.registration.showNotification(r.ok ? "✅ Done" : "⚠️ Couldn't do that", {
    body: r.ok ? (wa ? `${r.message}\nTap to send the guest the confirmation on WhatsApp.` : r.message) : r.error,
    icon: ICON,
    actions: wa ? [{ action: "wa", title: "Send on WhatsApp" }] : [],
    data: { url: wa || HOME },
  });
}

async function open(url) {
  if (!url.startsWith("/")) return self.clients.openWindow(url); // WhatsApp: leave the app window alone
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const w of windows) {
    if (new URL(w.url).pathname.startsWith("/admin")) {
      await w.focus();
      return w.navigate(url);
    }
  }
  return self.clients.openWindow(url);
}
