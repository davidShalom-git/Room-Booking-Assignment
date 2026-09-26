"use client";

/**
 * "Alerts on this phone": installs the owner app's service worker, turns Web Push on or off, and
 * offers "Install app" where the browser supports it (iPhone: Add to Home Screen first — Apple
 * only allows notifications for web apps opened from the home screen).
 */
import { useEffect, useState } from "react";
import { removePushAction, savePushAction, testPushAction } from "@/app/admin/actions";
import { Icon } from "@/components/icons";

type State = "loading" | "unsupported" | "ios-install" | "no-keys" | "denied" | "off" | "on";
type InstallPrompt = Event & { prompt: () => Promise<void> };

/** VAPID public keys are base64url; the Push API wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const TEXT: Record<State, string> = {
  loading: "Checking this phone…",
  unsupported: "This browser can't show notifications. On Android use Chrome; on iPhone use Safari.",
  "ios-install": "On iPhone: tap Share, then Add to Home Screen. Open Owner from your home screen and turn alerts on there.",
  "no-keys": "Notifications aren't set up on the server yet (VAPID keys missing).",
  denied: "Notifications are blocked for this site. Allow them in the browser's site settings, then reload.",
  off: "Get payments to acknowledge, new bookings and a 9 PM summary as notifications on this phone.",
  on: "This phone gets payments to acknowledge, new bookings and the 9 PM summary.",
};

export function OwnerAlerts({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [install, setInstall] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const check = async (): Promise<State> => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return ios && !standalone ? "ios-install" : "unsupported";
      }
      if (!vapidKey) return "no-keys";
      const reg = await navigator.serviceWorker.register("/owner-sw.js", { scope: "/admin/" });
      if (Notification.permission === "denied") return "denied";
      return (await reg.pushManager.getSubscription()) ? "on" : "off";
    };
    check().then(setState, () => setState("unsupported"));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [vapidKey]);

  async function turnOn() {
    setBusy(true);
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      if (!(await savePushAction(sub.toJSON()))) throw new Error("not saved");
      setState("on");
      setNote((await testPushAction()) > 0 ? "Sent a test notification to this phone." : "");
    } catch {
      setNote("Couldn't turn notifications on. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote("");
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await removePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const n = await testPushAction().catch(() => 0);
    setNote(n > 0 ? `Sent to ${n === 1 ? "this phone" : `${n} devices`}.` : "Nothing was sent — turn alerts off and on again.");
    setBusy(false);
  }

  const btn = "rounded-full px-4 py-2 text-[13px] font-medium transition-transform active:scale-[0.98] disabled:opacity-60";
  return (
    <section className="rounded-[1.5rem] border border-hairline bg-paper p-1.5">
      <div className="rounded-[1.15rem] bg-sand/30 p-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${state === "on" ? "bg-sage-soft text-sage" : "bg-clay-soft text-clay"}`}
          >
            <Icon.bell width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">{state === "on" ? "Alerts are on" : "Alerts on this phone"}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{TEXT[state]}</p>
            {note && (
              <p role="status" className="mt-1 text-[12.5px] text-sage">
                {note}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {state === "off" && (
                <button type="button" onClick={turnOn} disabled={busy} className={`${btn} bg-ink text-cream`}>
                  {busy ? "Turning on…" : "Turn on alerts"}
                </button>
              )}
              {state === "on" && (
                <>
                  <button type="button" onClick={test} disabled={busy} className={`${btn} border border-hairline text-ink`}>
                    Send a test
                  </button>
                  <button type="button" onClick={turnOff} disabled={busy} className={`${btn} text-muted hover:text-clay`}>
                    Turn off
                  </button>
                </>
              )}
              {install && (
                <button
                  type="button"
                  onClick={() => install.prompt().finally(() => setInstall(null))}
                  className={`${btn} bg-clay text-white`}
                >
                  Install the app
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
