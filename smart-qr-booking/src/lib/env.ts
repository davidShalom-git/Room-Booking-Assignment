/**
 * Server-side configuration from environment variables.
 * Read lazily (getters) so a missing variable only fails the feature that needs it —
 * e.g. the site builds and browses fine without push keys.
 */

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
const opt = (name: string): string => process.env[name] ?? "";

export const env = {
  get adminPassword() { return need("ADMIN_PASSWORD"); },
  get sessionSecret() { return need("SESSION_SECRET"); },

  get upiId() { return opt("UPI_ID"); },
  get upiPayeeName() { return opt("UPI_PAYEE_NAME") || "The Coral Courtyard"; },
  get holdMinutes(): number {
    const n = Number(opt("HOLD_MINUTES"));
    return Number.isFinite(n) && n > 0 ? n : 120;
  },
  get cronSecret() { return need("CRON_SECRET"); },

  /** Web Push (owner app notifications). Generate once: `npx web-push generate-vapid-keys`. */
  get vapidPublicKey() { return opt("NEXT_PUBLIC_VAPID_PUBLIC_KEY"); },
  get vapidPrivateKey() { return opt("VAPID_PRIVATE_KEY"); },
  /** Contact for the push services: the site URL (https) unless VAPID_SUBJECT says otherwise. */
  get vapidSubject() {
    const site = opt("NEXT_PUBLIC_BASE_URL");
    return opt("VAPID_SUBJECT") || (site.startsWith("https://") ? site : "mailto:owner@example.com");
  },
};
