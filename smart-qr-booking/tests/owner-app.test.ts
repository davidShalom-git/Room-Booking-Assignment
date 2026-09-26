/**
 * The owner app: the console installed on the owner's phone, with push notifications.
 * Payment alerts carry Acknowledge / Not received buttons that work straight from the
 * notification (a signed, per-payment action token — no login needed at that moment).
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking } from "../src/lib/engine";
import { claimPayment, rejectPayment, acknowledgePayment } from "../src/lib/payments";
import { signOwnerAction, verifyOwnerAction } from "../src/lib/session";
import { OWNER_PUSH, ownerPushPayload, sendOwnerPush, savePushSubscription, removePushSubscription } from "../src/lib/push";
import { ownerAct, ownerToday, dailySummary } from "../src/lib/owner-app";
import { ownerClaimAlerts } from "../src/lib/notify";
import { paymentView } from "../src/lib/bot/ports-prisma";
import { prismaPorts } from "../src/lib/bot/ports-prisma";
import { resetDb, seedRooms } from "./helpers/db";
import { chatMessages } from "../src/lib/web-chat";
import { world, bookUpToReview, GUEST, GUEST_PHONE } from "./helpers/chat";

const NOW = new Date("2026-10-12T06:30:00Z"); // 12:00 IST
before(() => {
  Object.assign(process.env, { SESSION_SECRET: "a-long-enough-session-secret-for-tests", UPI_ID: "coral@upi" });
});
beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }, { id: "103", capacity: 4, price: 2200 }]);
});

function ok<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`);
  return r.value;
}
const hold = (extra: Record<string, unknown> = {}) =>
  createBooking({
    roomId: "101", guestName: "Asha Nair", guestPhone: GUEST_PHONE, chatKey: GUEST, guests: 2, checkIn: "2026-10-20",
    checkOut: "2026-10-22", status: "PENDING", source: "WEB", now: NOW, ...extra,
  });

describe("action tokens", () => {
  test("a token names one payment, can't be altered, and expires after 14 days", () => {
    const t0 = NOW.getTime();
    const token = signOwnerAction("pay_123", t0);
    assert.equal(verifyOwnerAction(token, t0 + 1000), "pay_123");
    assert.equal(verifyOwnerAction(token, t0 + 15 * 86_400_000), null);
    assert.equal(verifyOwnerAction(token.replace("pay_123", "pay_999"), t0), null);
    for (const bad of [undefined, "", "a.b", "a.b.c.d"]) assert.equal(verifyOwnerAction(bad, t0), null);
  });
});

describe("push notifications", () => {
  test("a payment alert becomes a notification with Acknowledge / Not received and a token for that payment", () => {
    const n = ownerPushPayload({
      to: OWNER_PUSH,
      text: "💰 *Payment to check* — ₹1,800\nAsha Nair · +91 98123 45678\nUTR: *412345678901*",
      buttons: [{ id: "ack:pay_1", title: "Acknowledge" }, { id: "nack:pay_1", title: "Not received" }],
    });
    assert.equal(n.title, "💰 Payment to check — ₹1,800");
    assert.match(n.body, /Asha Nair/);
    assert.doesNotMatch(n.body, /\*/);
    assert.deepEqual(n.actions, [{ action: "ack", title: "Acknowledge" }, { action: "nack", title: "Not received" }]);
    assert.equal(verifyOwnerAction(n.token), "pay_1");
    const plain = ownerPushPayload({ to: OWNER_PUSH, text: "Guest wants to talk to the desk" });
    assert.deepEqual([plain.actions, plain.token], [[], undefined]);
  });

  test("goes to every subscribed phone; a phone that unsubscribed is forgotten", async () => {
    await prisma.pushSubscription.createMany({
      data: [
        { endpoint: "https://push.example/a", p256dh: "k", auth: "a" },
        { endpoint: "https://push.example/gone", p256dh: "k", auth: "a" },
      ],
    });
    const seen: string[] = [];
    const sent = await sendOwnerPush({ to: OWNER_PUSH, text: "hello" }, async (sub) => {
      seen.push(sub.endpoint);
      if (sub.endpoint.endsWith("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
    });
    assert.equal(sent, 1);
    assert.deepEqual(seen.sort(), ["https://push.example/a", "https://push.example/gone"]);
    assert.deepEqual((await prisma.pushSubscription.findMany()).map((s) => s.endpoint), ["https://push.example/a"]);
  });

  test("a phone's subscription is saved once (re-saving updates it); junk is refused", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BPk3", auth: "x9" } };
    assert.equal(await savePushSubscription(sub), true);
    assert.equal(await savePushSubscription({ ...sub, keys: { p256dh: "NEW", auth: "x9" } }), true);
    const rows = await prisma.pushSubscription.findMany();
    assert.deepEqual(rows.map((r) => [r.endpoint, r.p256dh]), [[sub.endpoint, "NEW"]]);
    for (const bad of [null, {}, { endpoint: "http://insecure.example/x", keys: sub.keys }, { endpoint: sub.endpoint, keys: {} }, { endpoint: sub.endpoint, keys: { p256dh: "x".repeat(600), auth: "y" } }]) {
      assert.equal(await savePushSubscription(bad), false, JSON.stringify(bad)?.slice(0, 60));
    }
    await removePushSubscription(sub.endpoint);
    assert.equal(await prisma.pushSubscription.count(), 0);
  });

  test("without push keys configured nothing breaks", async () => {
    await prisma.pushSubscription.create({ data: { endpoint: "https://push.example/a", p256dh: "k", auth: "a" } });
    assert.equal(await sendOwnerPush({ to: OWNER_PUSH, text: "hello" }), 0);
  });

  test("payment alerts go to the owner app, from the chat and from the pay page alike", async () => {
    const w = world(prismaPorts({ now: NOW }));
    await bookUpToReview(w, { checkIn: "20 oct", checkOut: "22 oct" });
    await w.tap(GUEST, "confirm");
    const b = await prisma.booking.findFirstOrThrow({ where: { status: "PENDING" } });
    await w.tap(GUEST, `i_paid:${b.id}`);
    await w.say(GUEST, "412345678901");
    const p = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });
    assert.deepEqual(w.ids(w.lastTo(OWNER_PUSH)), [`ack:${p.id}`, `nack:${p.id}`]);
    const alerts = ownerClaimAlerts(paymentView((await prisma.payment.findUniqueOrThrow({ where: { id: p.id }, include: { booking: { include: { room: true } } } }))), null, null);
    assert.ok(alerts.some((a) => a.to === OWNER_PUSH));
  });
});

describe("acting from the notification", () => {
  test("Acknowledge confirms the booking and tells the guest in their chat", async () => {
    const h = ok(await hold());
    const p = ok(await claimPayment(h.id, "412345678901", NOW));
    const r = await ownerAct(signOwnerAction(p.id), "ack");
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).status, "CONFIRMED");
    assert.match((await chatMessages(GUEST)).at(-1)!.text, /Booking confirmed/);
  });

  test("Acknowledge also offers the confirmation for the owner to send from their own WhatsApp", async () => {
    const h = ok(await hold());
    const p = ok(await claimPayment(h.id, "412345678901", NOW));
    const r = await ownerAct(signOwnerAction(p.id), "ack");
    assert.ok(r.ok && r.whatsapp);
    const url = new URL(r.whatsapp);
    assert.equal(`${url.origin}${url.pathname}`, `https://wa.me/${GUEST_PHONE}`);
    const text = url.searchParams.get("text")!;
    assert.match(text, /^Hi Asha 👋/);
    assert.match(text, /Booking confirmed\* — The Coral Courtyard/);
    assert.match(text, /Check-in: 20 Oct 2026, 1:00 PM/);
    assert.match(text, /Paid: ₹1,800/);
    assert.match(text, new RegExp(`/pay/${h.id}`));
    assert.equal((await ownerAct(signOwnerAction(p.id), "nack")).ok, false, "already acknowledged");
  });

  test("Not received sends it back to the guest; a forged or expired token does nothing", async () => {
    const h = ok(await hold());
    const p = ok(await claimPayment(h.id, "412345678901", NOW));
    assert.equal((await ownerAct("forged.123.abc", "ack")).ok, false);
    assert.equal((await ownerAct(signOwnerAction(p.id, Date.now() - 15 * 86_400_000), "ack")).ok, false);
    const r = await ownerAct(signOwnerAction(p.id), "nack");
    assert.ok(r.ok);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status, "REJECTED");
  });
});

describe("today at a glance", () => {
  test("rooms free tonight, bookings and money today, payments waiting, arrivals and departures", async () => {
    // In house tonight (paid), a new hold for tonight, a claim to check, a payment not received.
    const stay = ok(await createBooking({
      roomId: "101", guestName: "In House", guestPhone: "919000000001", guests: 1, checkIn: "2026-10-11", checkOut: "2026-10-13",
      status: "CONFIRMED", source: "ADMIN", now: NOW,
    }));
    void stay;
    const tonight = ok(await createBooking({
      roomId: "102", guestName: "Tonight", guestPhone: "919000000002", guests: 1, checkIn: "2026-10-12", checkOut: "2026-10-13",
      status: "PENDING", source: "WEB", now: NOW,
    }));
    const claimed = ok(await hold());
    ok(await claimPayment(claimed.id, "412345678901", NOW));
    const rejected = ok(await hold({ roomId: "103", guestPhone: "919000000003", checkIn: "2026-10-25", checkOut: "2026-10-26" }));
    const rp = ok(await claimPayment(rejected.id, "999988887777", NOW));
    ok(await rejectPayment(rp.id));
    const paid = ok(await hold({ roomId: "103", guestPhone: "919000000004", checkIn: "2026-10-12", checkOut: "2026-10-14" }));
    const pp = ok(await claimPayment(paid.id, "555566667777", NOW));
    ok(await acknowledgePayment(pp.id, undefined, NOW));

    const t = await ownerToday(NOW);
    assert.deepEqual(t.rooms, { total: 3, freeTonight: 0 });
    assert.equal(t.bookingsToday, 5);
    assert.deepEqual(t.receivedToday, { count: 1, amount: 2200 });
    assert.deepEqual(t.toCheck.map((p) => p.bookingId), [claimed.id]);
    assert.equal(t.notReceived, 1);
    assert.equal(t.waitingForPayment, 1, "the hold for tonight");
    assert.deepEqual([t.arrivals, t.departures], [1, 0], "confirmed arrivals: the paid 103; the unpaid hold isn't one yet");
    void tonight;
  });

  test("the 9 PM summary says it in one message", async () => {
    const h = ok(await hold());
    ok(await claimPayment(h.id, "412345678901", NOW));
    const text = await dailySummary(NOW);
    assert.match(text, /1 new booking\b/);
    assert.match(text, /1 payment to check/);
    assert.match(text, /3 of 3 rooms free/);
  });
});
