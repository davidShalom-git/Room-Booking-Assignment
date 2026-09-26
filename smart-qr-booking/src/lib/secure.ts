import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (secrets, passwords). False for empty `expected`. */
export function safeEqual(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Nothing passes while it's unset. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"] ?? "";
  if (!secret) console.error("[cron] CRON_SECRET is not set");
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`) && !!secret;
}
