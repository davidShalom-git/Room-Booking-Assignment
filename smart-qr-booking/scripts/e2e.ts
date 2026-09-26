/**
 * End-to-end check of the production build: real HTTP against `next start`, the way a browser and
 * the owner's phone use it.
 *
 *   npm run build && npm run e2e
 *
 * Starts `next start` against a scratch database (E2E_DATABASE_URL, default coral_e2e on the
 * local Docker Postgres), then drives real journeys: guests book in the website chat (/api/chat,
 * with the chat cookie), the owner acknowledges payments the way a notification does
 * (/api/owner/act with a signed token), and the crons run. Asserts on the database and on
 * every message that reaches each chat.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { addDays, formatDate, todayISO } from "../src/lib/pricing";
import { signOwnerAction } from "../src/lib/session";

const DB = process.env["E2E_DATABASE_URL"] ?? "postgresql://coral:coral@localhost:55432/coral_e2e";
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const SESSION = "e2e-session-secret-e2e-session-secret";
const CRON = "e2e-cron";

const step = (s: string) => console.log(`ok  - ${s}`);

type Msg = { id: number; fromGuest: boolean; text: string; buttons: { id: string }[] | null; list: { rows: { id: string }[] } | null };

/** One visitor's chat window: its cookie, its network, and everything the assistant sent it. */
function visitor(ip: string) {
  let cookie = "";
  const request = async (init: RequestInit = {}) => {
    const r = await fetch(`${BASE}/api/chat${init.method === "POST" ? "" : "?after=0"}`, {
      ...init,
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return (await r.json()) as { ok?: boolean; error?: string; messages: Msg[] };
  };
  const send = async (body: Record<string, unknown>) => {
    const j = await request({ method: "POST", body: JSON.stringify(body) });
    assert.ok(j.ok, j.error);
  };
  const v = {
    say: (text: string) => send({ text }),
    tap: (button: string) => send({ button, title: button }),
    /** Everything the assistant (or the owner, through it) has said in this chat, oldest first. */
    replies: async () => (await request()).messages.filter((m) => !m.fromGuest),
    last: async () => (await v.replies()).at(-1)!,
    ids: (m: Msg) => [...(m.buttons ?? []).map((b) => b.id), ...(m.list?.rows ?? []).map((r) => r.id)],
  };
  return v;
}

async function main() {
  // Fresh scratch database.
  const name = /\/([^/?]+)(\?|$)/.exec(DB)![1];
  execSync(`docker compose exec -T db psql -U coral -d postgres -c "DROP DATABASE IF EXISTS ${name} WITH (FORCE)" -c "CREATE DATABASE ${name}"`, { stdio: "ignore" });
  const dbEnv = { ...process.env, DATABASE_URL: DB };
  execSync("npx prisma migrate deploy", { env: dbEnv, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env: dbEnv, stdio: "ignore" });
  process.env["DATABASE_URL"] = DB;
  process.env["SESSION_SECRET"] = SESSION;
  const { prisma } = await import("../src/lib/db");
  step("scratch database migrated and seeded");

  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      DATABASE_URL: DB,
      UPI_ID: "coral@upi",
      CRON_SECRET: CRON,
      ADMIN_PASSWORD: "e2e-password",
      SESSION_SECRET: SESSION,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });

  try {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok && (await r.json()).ok) break;
      } catch {}
      if (i > 60) throw new Error("server did not start");
      await new Promise((r) => setTimeout(r, 500));
    }
    step("production server up, /api/health ok");

    /** The owner taps Acknowledge on the notification for this payment. */
    const acknowledge = async (paymentId: string) => {
      const r = await fetch(`${BASE}/api/owner/act`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ack", token: signOwnerAction(paymentId) }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      assert.ok(j.ok, j.error);
    };
    const claimOf = (bookingId: string) => prisma.payment.findFirstOrThrow({ where: { bookingId, status: "CLAIMED" } });

    // --- a guest books room 101 from the room page ("Book in chat")
    const asha = visitor("10.0.0.1");
    const checkIn = addDays(todayISO(), 10);
    await asha.say("Hi, I'm interested in Room 101 — Deluxe Double Room.\n\nCould you let me know about availability?");
    assert.ok(asha.ids(await asha.last()).includes("book"));
    await asha.tap("book");
    await asha.say("Asha Nair");
    await asha.say("98123 45678");
    await asha.tap("g:2");
    await asha.say(formatDate(checkIn));
    await asha.say(formatDate(addDays(checkIn, 2)));
    assert.match((await asha.last()).text, /₹3,600/);
    await asha.tap("confirm");
    const held = await prisma.booking.findFirstOrThrow({ where: { guestName: "Asha Nair" } });
    assert.equal(held.status, "PENDING");
    assert.equal(held.source, "WEB");
    assert.equal(held.guestPhone, "919812345678");
    assert.ok(held.chatKey?.startsWith("web:"), "the booking remembers its chat");
    const payMsg = await asha.last();
    assert.ok(payMsg.text.includes(`/pay/${held.id}`), "chat links to the pay page");
    assert.deepEqual(asha.ids(payMsg), [`i_paid:${held.id}`, `cancel_hold:${held.id}`]);
    const payPage = await (await fetch(`${BASE}/pay/${held.id}`)).text();
    assert.ok(payPage.includes("upi://pay?pa=coral@upi&amp;pn=The%20Coral%20Courtyard&amp;am=1800.00"), "UPI deep link");
    assert.ok(payPage.includes("<svg"), "UPI QR code");
    step("guest: room page -> chat -> name, phone, guests, dates -> hold; pay page with UPI link + QR");

    // --- a double tap on Confirm (both at once) must not break anything
    await Promise.all([asha.tap("confirm"), asha.tap("confirm")]);
    assert.equal(await prisma.booking.count({ where: { guestName: "Asha Nair", status: "PENDING" } }), 1);
    assert.ok(!(await asha.replies()).some((m) => /just taken/i.test(m.text)));
    step("double tap on Confirm: still exactly one hold, no false 'just taken'");

    // --- the guest sends the UTR; the owner acknowledges from the notification
    await asha.tap(`i_paid:${held.id}`);
    await asha.say("412345678901");
    assert.match((await asha.last()).text, /with the front desk/);
    const claim = await claimOf(held.id);
    assert.equal(claim.utr, "412345678901");
    await acknowledge(claim.id);
    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: held.id } });
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(confirmed.advancePaid, 1800);
    assert.match((await asha.last()).text, /Booking confirmed/);
    assert.ok((await (await fetch(`${BASE}/pay/${held.id}`)).text()).includes("Booking confirmed"));
    const forged = await fetch(`${BASE}/api/owner/act`, { method: "POST", body: JSON.stringify({ action: "ack", token: "x.1.y" }) });
    assert.equal(forged.status, 400);
    step("UTR in the chat -> owner acknowledges -> confirmed, ₹1,800 recorded, confirmation in the chat and on the pay page; forged token refused");

    // --- same dates from another visitor: offered other rooms
    const ravi = visitor("10.0.0.2");
    await ravi.say("Hi, I'm interested in Room 101 — Deluxe Double Room.\n\nCould you let me know about availability?");
    await ravi.tap("book");
    await ravi.say("Ravi Menon");
    await ravi.say("97000 00002");
    await ravi.say("2");
    await ravi.say(formatDate(checkIn));
    await ravi.say("2");
    assert.ok(ravi.ids(await ravi.last()).includes("pick:102"), "alternatives offered");
    step("second guest, same dates: room 101 is taken, free rooms offered");

    // --- a stay that ends tomorrow: booked, paid, acknowledged, then nudged by the cron
    await ravi.tap("change");
    await ravi.tap("d:today");
    await ravi.tap("n:1");
    await ravi.tap("confirm");
    const stay2 = await prisma.booking.findFirstOrThrow({ where: { guestName: "Ravi Menon", status: "PENDING" } });
    await ravi.tap(`i_paid:${stay2.id}`);
    await ravi.say("555566667777");
    await acknowledge((await claimOf(stay2.id)).id);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: stay2.id } })).status, "CONFIRMED");
    const cron = await fetch(`${BASE}/api/cron/last-day`, { headers: { authorization: `Bearer ${CRON}` } });
    assert.equal((await cron.json()).sent, 1);
    assert.deepEqual(ravi.ids(await ravi.last()), [`want_extend:${stay2.id}`, `want_out:${stay2.id}`]);
    assert.equal((await fetch(`${BASE}/api/cron/last-day`)).status, 401);
    step("cron: last-day nudge lands in the guest's chat once (and is refused without the secret)");

    // --- extension: same room free -> held, paid in full, acknowledged
    await ravi.tap(`want_extend:${stay2.id}`);
    await ravi.say("+2 nights");
    const seg = await prisma.booking.findFirstOrThrow({ where: { parentId: stay2.id, status: "PENDING" } });
    assert.match((await ravi.last()).text, /is free until/);
    await ravi.tap(`i_paid:${seg.id}`);
    await ravi.say("999988887777");
    await acknowledge((await claimOf(seg.id)).id);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: seg.id } })).status, "CONFIRMED");
    assert.match((await ravi.last()).text, /You're extended/);
    step("extension: guest asks, pays the extra nights in full, owner acknowledges, guest told");

    // --- the 9 PM summary
    const summary = await fetch(`${BASE}/api/cron/daily-summary`, { headers: { authorization: `Bearer ${CRON}` } });
    assert.match(((await summary.json()) as { text: string }).text, /Today/);
    assert.equal((await fetch(`${BASE}/api/cron/daily-summary`)).status, 401);
    step("cron: daily summary built (and refused without the secret)");

    // --- availability API + guest pages + what's gone
    const av = await (await fetch(`${BASE}/api/availability?room=101&from=${checkIn}&to=${addDays(checkIn, 1)}`)).json();
    assert.equal(av.available, false);
    for (const path of ["/", "/rooms", "/rooms/101", "/qr", "/about", "/contact", "/privacy"]) {
      const r = await fetch(BASE + path);
      assert.equal(r.status, 200, path);
      assert.ok(!/whatsapp|wa\.me/i.test(await r.text()), `${path} has no WhatsApp left`);
    }
    for (const path of ["/owner.webmanifest", "/owner-icon/192", "/owner-sw.js"]) assert.equal((await fetch(BASE + path)).status, 200, path);
    for (const path of ["/rooms/nope", "/signin", "/account", "/book", "/whatsapp", "/api/whatsapp"]) {
      assert.equal((await fetch(BASE + path, { redirect: "manual" })).status, 404, path);
    }
    const guard = await fetch(`${BASE}/admin/bookings`, { redirect: "manual" });
    assert.ok([302, 307].includes(guard.status) && guard.headers.get("location")?.includes("/admin/login"));
    step("availability API, guest pages render without WhatsApp, old sign-in/booking pages gone, /admin requires sign-in");

    console.log(`\nE2E passed — ${await prisma.chatMessage.count()} chat messages, ${await prisma.booking.count()} bookings.`);
    await prisma.$disconnect();
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
