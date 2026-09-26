/**
 * Owner console sessions: a signed cookie `<expiry ms>.<nonce>.<HMAC-SHA256>` keyed with SESSION_SECRET.
 * Stateless — changing SESSION_SECRET signs everyone out. No Next.js imports, so proxy.ts can use it.
 */
import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/secure";

export const SESSION_COOKIE = "cc_admin";
/** Seconds. */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // the owner app stays signed in for a month

function key(): string | null {
  const s = process.env["SESSION_SECRET"] ?? "";
  return s.length >= 16 ? s : null;
}

const mac = (payload: string, k: string) => createHmac("sha256", k).update(payload).digest("base64url");

export function sessionConfigured(): boolean {
  return key() !== null && (process.env["ADMIN_PASSWORD"] ?? "") !== "";
}

export function signSession(now: number = Date.now()): string {
  const k = key();
  if (!k) throw new Error("SESSION_SECRET must be set (at least 16 characters)");
  const payload = `${now + SESSION_MAX_AGE * 1000}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${mac(payload, k)}`;
}

export function verifySession(token: string | null | undefined, now: number = Date.now()): boolean {
  const k = key();
  if (!k || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts as [string, string, string];
  if (!/^\d{10,16}$/.test(exp) || !nonce || !sig) return false;
  if (!safeEqual(sig, mac(`${exp}.${nonce}`, k))) return false;
  return Number(exp) > now;
}

/** Constant-time; an unset ADMIN_PASSWORD never matches anything. */
export function checkPassword(input: string): boolean {
  return safeEqual(input, process.env["ADMIN_PASSWORD"] ?? "");
}

// --- owner-app actions (Acknowledge / Not received from a notification) ---------------

const OWNER_ACTION_MS = 14 * 24 * 60 * 60 * 1000;

/** `<paymentId>.<expiry ms>.<HMAC>`: lets a notification act on that one payment, no login needed. */
export function signOwnerAction(paymentId: string, now: number = Date.now()): string {
  const k = key();
  if (!k) throw new Error("SESSION_SECRET must be set (at least 16 characters)");
  const payload = `${paymentId}.${now + OWNER_ACTION_MS}`;
  return `${payload}.${mac(`owner-act:${payload}`, k)}`;
}

/** The payment id a notification's token acts on, or null (forged, altered or expired). */
export function verifyOwnerAction(token: string | null | undefined, now: number = Date.now()): string | null {
  const k = key();
  if (!k || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^\d{10,16}$/.test(exp) || !sig) return null;
  if (!safeEqual(sig, mac(`owner-act:${id}.${exp}`, k))) return null;
  return Number(exp) > now ? id : null;
}
