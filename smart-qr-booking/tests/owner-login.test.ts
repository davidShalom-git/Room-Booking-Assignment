/**
 * The owner's own password, changeable in the app, and a recovery code for a forgotten one —
 * so a handed-over lodge never needs a developer to get back in.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { signSession } from "../src/lib/session";
import {
  attemptLogin,
  changePassword,
  newRecoveryCode,
  ownerSessionValid,
  recoverWithCode,
  setOwnerLogin,
} from "../src/lib/owner-login";
import { resetDb } from "./helpers/db";

const T0 = new Date("2026-10-01T10:00:00Z");
const later = (min: number) => new Date(T0.getTime() + min * 60_000);
const env = { ADMIN_PASSWORD: process.env["ADMIN_PASSWORD"], SESSION_SECRET: process.env["SESSION_SECRET"] };

beforeEach(async () => {
  await resetDb();
  process.env["ADMIN_PASSWORD"] = "env-password-1";
  process.env["SESSION_SECRET"] = "test-session-secret-0123456789";
});
afterEach(() => {
  process.env["ADMIN_PASSWORD"] = env.ADMIN_PASSWORD;
  process.env["SESSION_SECRET"] = env.SESSION_SECRET;
});

describe("signing in", () => {
  test("until the owner sets their own, ADMIN_PASSWORD from the environment works", async () => {
    assert.equal(await attemptLogin("env-password-1", "1.1.1.1", T0), "ok");
    assert.equal(await attemptLogin("wrong", "1.1.1.1", T0), "wrong");
  });

  test("only the exact password passes; an unset ADMIN_PASSWORD never lets anyone in", async () => {
    for (const pw of ["env-password-1 ", "Env-password-1", ""]) assert.equal(await attemptLogin(pw, "1.1.1.1", T0), "wrong");
    await resetDb();
    delete process.env["ADMIN_PASSWORD"];
    for (const pw of ["", "anything"]) assert.equal(await attemptLogin(pw, "1.1.1.1", T0), "wrong");
  });

  test("once set, only the owner's own password works — not the environment's", async () => {
    await setOwnerLogin("my-own-pass", T0);
    assert.equal(await attemptLogin("my-own-pass", "1.1.1.1", T0), "ok");
    assert.equal(await attemptLogin("env-password-1", "1.1.1.1", T0), "wrong");
    const row = await prisma.ownerLogin.findUniqueOrThrow({ where: { id: 1 } });
    assert.ok(!row.passwordHash.includes("my-own-pass"), "stored hashed");
  });

  test("10 wrong passwords from one network in 15 minutes lock it out, even with the right one", async () => {
    for (let i = 0; i < 10; i++) assert.equal(await attemptLogin("wrong", "2.2.2.2", T0), "wrong");
    assert.equal(await attemptLogin("env-password-1", "2.2.2.2", T0), "limited");
    assert.equal(await attemptLogin("env-password-1", "3.3.3.3", T0), "ok", "other networks unaffected");
    assert.equal(await attemptLogin("env-password-1", "2.2.2.2", later(16)), "ok", "the lock lifts");
  });
});

describe("changing the password", () => {
  test("needs the current password, 8+ characters, and the same new password twice", async () => {
    assert.deepEqual(await changePassword({ current: "nope", next: "brand-new-pass", confirm: "brand-new-pass" }, T0), {
      ok: false, error: "Your current password isn't right.", field: "current",
    });
    assert.equal((await changePassword({ current: "env-password-1", next: "short", confirm: "short" }, T0)).ok, false);
    assert.equal((await changePassword({ current: "env-password-1", next: "brand-new-pass", confirm: "brand-new-typo" }, T0)).ok, false);
    assert.equal((await changePassword({ current: "env-password-1", next: "brand-new-pass", confirm: "brand-new-pass" }, T0)).ok, true);
    assert.equal(await attemptLogin("brand-new-pass", "1.1.1.1", T0), "ok");
    assert.equal(await attemptLogin("env-password-1", "1.1.1.1", T0), "wrong");
  });

  test("signs out every other phone and browser (sessions from before the change stop working)", async () => {
    const before = signSession(later(-5).getTime());
    assert.equal(await ownerSessionValid(before, later(0)), true);
    await changePassword({ current: "env-password-1", next: "brand-new-pass", confirm: "brand-new-pass" }, T0);
    assert.equal(await ownerSessionValid(before, later(1)), false);
    assert.equal(await ownerSessionValid(signSession(later(1).getTime()), later(2)), true, "a new sign-in works");
  });

  test("keeps an existing recovery code working", async () => {
    const { code } = await newRecoveryCode();
    await changePassword({ current: "env-password-1", next: "brand-new-pass", confirm: "brand-new-pass" }, later(1));
    assert.equal((await recoverWithCode({ code, next: "after-recovery", confirm: "after-recovery" }, "1.1.1.1", later(2))).ok, true);
  });
});

describe("forgotten password: the recovery code", () => {
  test("sets a new password and replaces the code (each code works once)", async () => {
    const { code } = await newRecoveryCode();
    assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const r = await recoverWithCode({ code: code.toLowerCase().replace(/-/g, " "), next: "fresh-password", confirm: "fresh-password" }, "1.1.1.1", later(1));
    assert.ok(r.ok, JSON.stringify(r));
    assert.notEqual(r.ok && r.code, code);
    assert.equal(await attemptLogin("fresh-password", "1.1.1.1", later(2)), "ok");
    assert.equal((await recoverWithCode({ code, next: "again-password", confirm: "again-password" }, "1.1.1.1", later(3))).ok, false, "old code used up");
    assert.equal((await recoverWithCode({ code: r.ok ? r.code : "", next: "again-password", confirm: "again-password" }, "1.1.1.1", later(4))).ok, true, "the new one works");
  });

  test("with no code set up, recovery explains who to ask", async () => {
    const r = await recoverWithCode({ code: "ABCD-EFGH-JKLM-NPQR", next: "fresh-password", confirm: "fresh-password" }, "1.1.1.1", T0);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /recovery code/i);
  });

  test("a wrong code changes nothing, and 5 tries an hour from one network is the limit", async () => {
    const { code } = await newRecoveryCode();
    for (let i = 0; i < 5; i++) {
      assert.equal((await recoverWithCode({ code: "WRNG-WRNG-WRNG-WRNG", next: "fresh-password", confirm: "fresh-password" }, "4.4.4.4", T0)).ok, false);
    }
    const blocked = await recoverWithCode({ code, next: "fresh-password", confirm: "fresh-password" }, "4.4.4.4", T0);
    assert.equal(blocked.ok, false);
    assert.equal(await attemptLogin("env-password-1", "1.1.1.1", T0), "ok", "password unchanged");
  });

  test("making a new code keeps the password and doesn't sign anyone out", async () => {
    await setOwnerLogin("my-own-pass", T0);
    const session = signSession(later(1).getTime());
    await newRecoveryCode();
    assert.equal(await attemptLogin("my-own-pass", "1.1.1.1", later(3)), "ok");
    assert.equal(await ownerSessionValid(session, later(3)), true);
  });
});
