/**
 * The owner's sign-in: their own password (changeable in the app) and a one-time recovery code
 * for a forgotten one, both stored hashed (the OwnerLogin row). Until the owner sets a password,
 * ADMIN_PASSWORD from the environment works. Changing the password signs out every other device.
 */
import { createHash, randomInt, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { hit, hits } from "@/lib/rate-limit";
import { SESSION_MAX_AGE, verifySession } from "@/lib/session";
import { safeEqual } from "@/lib/secure";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scryptAsync(pw, salt, 32)).toString("hex")}`;
}

async function passwordMatches(pw: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !/^[0-9a-f]{64}$/.test(hash)) return false;
  const got = await scryptAsync(pw, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(got, Buffer.from(hash, "hex"));
}

/** No 0/O or 1/I, so it reads back off paper without mistakes. */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeDigest = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

const row = () => prisma.ownerLogin.findUnique({ where: { id: 1 } });

/** Sign-in works: a session key, and a password (the owner's own, or ADMIN_PASSWORD). */
export async function loginConfigured(): Promise<boolean> {
  if ((process.env["SESSION_SECRET"] ?? "").length < 16) return false;
  return !!(process.env["ADMIN_PASSWORD"] ?? "") || !!(await row());
}

async function passwordOk(pw: string): Promise<boolean> {
  const r = await row();
  return r ? passwordMatches(pw, r.passwordHash) : safeEqual(pw, process.env["ADMIN_PASSWORD"] ?? "");
}

const LOGIN_WINDOW = 15 * 60_000;
const LOGIN_TRIES = 10;

/** Check a sign-in. After 10 wrong passwords from one network in 15 minutes, that network waits. */
export async function attemptLogin(pw: string, ip: string, now: Date = new Date()): Promise<"ok" | "wrong" | "limited"> {
  const key = `login:${ip}`;
  if ((await hits(key, LOGIN_WINDOW, now)) >= LOGIN_TRIES) return "limited";
  if (pw && (await passwordOk(pw))) return "ok";
  await hit(key, LOGIN_TRIES, LOGIN_WINDOW, now);
  return "wrong";
}

/** A session is valid if it's signed, unexpired, and issued after the last password change. */
export async function ownerSessionValid(token: string | null | undefined, now: Date = new Date()): Promise<boolean> {
  if (!verifySession(token, now.getTime())) return false;
  const r = await row();
  if (!r) return true;
  const issuedAt = Number(token!.split(".")[0]) - SESSION_MAX_AGE * 1000;
  return issuedAt >= r.changedAt.getTime();
}

/** Set the owner's password; sessions issued before `now` stop working. Keeps the recovery code. */
export async function setOwnerLogin(password: string, now: Date = new Date()): Promise<void> {
  const passwordHash = await hashPassword(password);
  await prisma.ownerLogin.upsert({
    where: { id: 1 },
    create: { id: 1, passwordHash, changedAt: now },
    update: { passwordHash, changedAt: now },
  });
}

export type LoginResult = { ok: true } | { ok: false; error: string; field: string };

function checkNew(next: string, confirm: string): LoginResult {
  if (next.length < 8) return { ok: false, error: "Use at least 8 characters for the new password.", field: "next" };
  if (next.length > 200) return { ok: false, error: "That password is too long.", field: "next" };
  if (next !== confirm) return { ok: false, error: "The two new passwords don't match.", field: "confirm" };
  return { ok: true };
}

export async function changePassword(i: { current: string; next: string; confirm: string }, now: Date = new Date()): Promise<LoginResult> {
  if (!(await passwordOk(i.current))) return { ok: false, error: "Your current password isn't right.", field: "current" };
  const bad = checkNew(i.next, i.confirm);
  if (!bad.ok) return bad;
  await setOwnerLogin(i.next, now);
  return { ok: true };
}

/**
 * A new recovery code (shown once — only its hash is kept); the previous one stops working.
 * Keeps the current password, including ADMIN_PASSWORD if the owner hasn't set their own.
 */
export async function newRecoveryCode(): Promise<{ code: string }> {
  const raw = Array.from({ length: 16 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  const code = raw.match(/.{4}/g)!.join("-");
  const r = await row();
  if (r) {
    await prisma.ownerLogin.update({ where: { id: 1 }, data: { recoveryHash: codeDigest(code) } });
  } else {
    // No stored password yet: keep ADMIN_PASSWORD working, and don't sign anyone out.
    const passwordHash = await hashPassword(process.env["ADMIN_PASSWORD"] ?? randomBytes(24).toString("hex"));
    await prisma.ownerLogin.create({ data: { id: 1, passwordHash, recoveryHash: codeDigest(code), changedAt: new Date(0) } });
  }
  return { code };
}

export type RecoverResult = { ok: true; code: string } | { ok: false; error: string; field: string };

/** Forgotten password: the recovery code sets a new one. The code is used up and replaced. */
export async function recoverWithCode(
  i: { code: string; next: string; confirm: string },
  ip: string,
  now: Date = new Date(),
): Promise<RecoverResult> {
  if (!(await hit(`recover:${ip}`, 5, 3_600_000, now))) {
    return { ok: false, error: "Too many tries — please wait an hour and try again.", field: "code" };
  }
  const r = await row();
  if (!r?.recoveryHash) {
    return { ok: false, error: "No recovery code is set up for this site. Ask whoever set up your website to reset the password.", field: "code" };
  }
  if (!safeEqual(codeDigest(i.code), r.recoveryHash)) return { ok: false, error: "That recovery code isn't right.", field: "code" };
  const bad = checkNew(i.next, i.confirm);
  if (!bad.ok) return bad;
  await setOwnerLogin(i.next, now);
  return { ok: true, code: (await newRecoveryCode()).code };
}
