import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, SESSION_MAX_AGE } from "../src/lib/session";
import { cronAuthorized } from "../src/lib/secure";

const SECRET = "a-long-enough-session-secret-for-tests";

beforeEach(() => {
  process.env["SESSION_SECRET"] = SECRET;
  process.env["ADMIN_PASSWORD"] = "correct horse";
});

describe("session tokens", () => {
  test("a fresh token verifies", () => {
    assert.equal(verifySession(signSession()), true);
  });

  test("expires after the max age", () => {
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    const token = signSession(t0);
    assert.equal(verifySession(token, t0 + (SESSION_MAX_AGE - 60) * 1000), true);
    assert.equal(verifySession(token, t0 + (SESSION_MAX_AGE + 60) * 1000), false);
  });

  test("tampering with the expiry or signature is rejected", () => {
    const token = signSession();
    const [exp, nonce, sig] = token.split(".");
    assert.equal(verifySession(`${Number(exp) + 10_000_000}.${nonce}.${sig}`), false);
    assert.equal(verifySession(`${exp}.${nonce}.${sig!.slice(0, -2)}xx`), false);
    assert.equal(verifySession(`${exp}.${nonce}.`), false);
  });

  test("garbage never verifies and never throws", () => {
    for (const bad of [undefined, null, "", "abc", "a.b", "a.b.c", "....", "9999999999999.x.y"]) {
      assert.equal(verifySession(bad), false, String(bad));
    }
  });

  test("a token signed with another secret is rejected (rotating the secret logs everyone out)", () => {
    const token = signSession();
    process.env["SESSION_SECRET"] = "a-completely-different-secret-value";
    assert.equal(verifySession(token), false);
  });

  test("no (or too short) secret: nothing verifies and signing refuses", () => {
    const token = signSession();
    process.env["SESSION_SECRET"] = "short";
    assert.equal(verifySession(token), false);
    assert.throws(() => signSession());
    delete process.env["SESSION_SECRET"];
    assert.equal(verifySession(token), false);
  });
});

describe("cron calls", () => {
  test("need the exact CRON_SECRET as a bearer token; nothing passes when it isn't set", () => {
    const req = (auth?: string) => new Request("https://x.app/api/cron/x", auth ? { headers: { authorization: auth } } : {});
    process.env["CRON_SECRET"] = "cron-secret-value";
    assert.equal(cronAuthorized(req("Bearer cron-secret-value")), true);
    assert.equal(cronAuthorized(req("Bearer wrong")), false);
    assert.equal(cronAuthorized(req()), false);
    delete process.env["CRON_SECRET"];
    assert.equal(cronAuthorized(req("Bearer ")), false);
    assert.equal(cronAuthorized(req("Bearer undefined")), false);
  });
});
