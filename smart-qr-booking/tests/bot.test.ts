/**
 * The booking assistant (the website chat), end to end on the real database: everything a guest
 * could send, everything the assistant sends back, and the owner acting from the owner app.
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking } from "../src/lib/engine";
import { prismaPorts } from "../src/lib/bot/ports-prisma";
import { OWNER_PUSH } from "../src/lib/bot/types";
import { enquiryMessage } from "../src/lib/enquiry";
import { acknowledgeAsAdmin, rejectAsAdmin } from "../src/lib/admin-ops";
import { resetDb, seedRooms } from "./helpers/db";
import { world, bookUpToReview, qrText, GUEST, OTHER, GUEST_PHONE } from "./helpers/chat";

const clock = { now: new Date("2026-10-01T10:00:00Z") };
let w: ReturnType<typeof world>;

before(() => {
  process.env["UPI_ID"] = "coral@upi";
});
beforeEach(async () => {
  clock.now = new Date("2026-10-01T10:00:00Z");
  await resetDb();
  await seedRooms([
    { id: "101", price: 1800, name: "Deluxe Double Room" },
    { id: "102", price: 1500, name: "Standard Double Room" },
    { id: "103", capacity: 4, price: 2200, name: "Family Room" },
    { id: "201", price: 2000, name: "Deluxe Balcony Room" },
  ]);
  w = world(prismaPorts(clock));
});

const advance = (minutes: number) => {
  clock.now = new Date(clock.now.getTime() + minutes * 60_000);
};
const byId = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });
const pending = () => prisma.booking.findMany({ where: { status: "PENDING" }, orderBy: { seq: "asc" } });
const paymentOf = (bookingId: string) => prisma.payment.findFirstOrThrow({ where: { bookingId }, orderBy: { createdAt: "desc" } });
const seed = (roomId: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) =>
  createBooking({
    roomId, guestName: "Ravi Menon", guestPhone: "919111111111", guests: 2, checkIn, checkOut,
    status: "CONFIRMED", source: "ADMIN", ...extra,
  });
/** The owner taps Acknowledge in the owner app. */
const ack = async (paymentId: string) => {
  const r = await acknowledgeAsAdmin(paymentId, "");
  assert.ok(r.ok, !r.ok ? r.error : "");
  return r;
};
/** The last message that reached the guest's chat from the owner's side. */
const lastInbox = async (chat = GUEST) => (await w.inbox(chat)).at(-1)?.text ?? "";

/** Book Room 101 12 -> 14 Oct up to the unpaid hold. */
async function hold() {
  await bookUpToReview(w);
  await w.tap(GUEST, "confirm");
  return (await pending())[0]!;
}
/** ...and send the UTR. */
async function holdAndClaim(utr = "412345678901") {
  const h = await hold();
  await w.tap(GUEST, `i_paid:${h.id}`);
  await w.say(GUEST, utr);
  return { h, p: await paymentOf(h.id) };
}
/** A confirmed stay: held, paid, acknowledged by the owner. Returns the booking id. */
async function confirmedStay() {
  const { h, p } = await holdAndClaim();
  await ack(p.id);
  return h.id;
}

describe("entry", () => {
  test("a room page's 'Book in chat' opens that room's intro with quick actions", async () => {
    await w.say(GUEST, qrText());
    const m = w.lastTo(GUEST)!;
    assert.match(m.text, /Room 101/);
    assert.match(m.text, /₹1,800/);
    assert.deepEqual(w.ids(m), ["info", "avail", "book"]);
    assert.equal(w.conv(GUEST).roomId, "101");
  });

  test("no room mentioned -> a list of rooms to choose from", async () => {
    await w.say(GUEST, "hi");
    assert.ok(w.ids(w.lastTo(GUEST)).includes("pick:101"));
    await w.tap(GUEST, "pick:103");
    assert.equal(w.conv(GUEST).roomId, "103");
    assert.match(w.lastTo(GUEST)!.text, /Family Room/);
    await w.say(GUEST, "Hi, I'm interested in Room 999");
    assert.ok(w.ids(w.lastTo(GUEST)).includes("pick:101"));
  });

  test("dates picked on the room page are answered straight away, and booking then skips the date questions", async () => {
    const msg = enquiryMessage({
      room: { id: "101", name: "Deluxe Double Room", pricePerNight: 1800 },
      checkIn: "2026-10-12", checkOut: "2026-10-14", guests: 2,
    });
    await w.say(GUEST, msg);
    assert.match(w.lastTo(GUEST)!.text, /free/i);
    assert.deepEqual(w.ids(w.lastTo(GUEST)), ["book", "change"]);
    await w.tap(GUEST, "book");
    await w.say(GUEST, "Asha Nair");
    await w.say(GUEST, "98123 45678");
    assert.equal(w.conv(GUEST).stage, "review");
    assert.match(w.lastTo(GUEST)!.text, /₹3,600/);
  });

  test("dates that are taken list the free rooms instead", async () => {
    await seed("101", "2026-10-12", "2026-10-14");
    await w.say(GUEST, enquiryMessage({
      room: { id: "101", name: "Deluxe Double Room", pricePerNight: 1800 },
      checkIn: "2026-10-12", checkOut: "2026-10-14", guests: 2,
    }));
    assert.deepEqual(w.ids(w.lastTo(GUEST)), ["pick:102", "pick:103", "pick:201", "change"]);
  });

  test("picking a free room there books it: name and number, then straight to the review", async () => {
    await seed("101", "2026-10-12", "2026-10-14");
    await w.say(GUEST, enquiryMessage({
      room: { id: "101", name: "Deluxe Double Room", pricePerNight: 1800 },
      checkIn: "2026-10-12", checkOut: "2026-10-14", guests: 2,
    }));
    await w.tap(GUEST, "pick:102");
    assert.match(w.lastTo(GUEST)!.text, /Let's book \*Room 102/);
    await w.say(GUEST, "Asha Nair");
    await w.say(GUEST, "98123 45678");
    assert.equal(w.conv(GUEST).stage, "review");
    assert.deepEqual(w.ids(w.lastTo(GUEST)), ["confirm", "change"]);
    assert.match(w.lastTo(GUEST)!.text, /₹3,000/);
  });
});

describe("questions", () => {
  beforeEach(async () => {
    await w.say(GUEST, qrText());
    w.clear();
  });

  test("about / price / breakfast / unknown", async () => {
    await w.tap(GUEST, "info");
    assert.match(w.lastTo(GUEST)!.text, /Queen Bed/);
    await w.say(GUEST, "how much is it?");
    assert.match(w.lastTo(GUEST)!.text, /₹1,800/);
    await w.say(GUEST, "is breakfast included?");
    assert.match(w.lastTo(GUEST)!.text, /breakfast/i);
    await w.say(GUEST, "asdf qwerty");
    assert.deepEqual(w.ids(w.lastTo(GUEST)), ["info", "avail", "book"]);
  });

  test("asking for the desk: the guest gets the number to call, the owner app hears about it", async () => {
    await w.say(GUEST, "can I talk to reception");
    assert.match(w.lastTo(GUEST)!.text, /call the front desk on \+91 86374 66746/);
    assert.match(w.lastTo(OWNER_PUSH)!.text, /website chat would like to talk to the front desk about Room 101/);
  });

  test("checking availability asks both dates and answers from real bookings", async () => {
    await w.tap(GUEST, "avail");
    await w.say(GUEST, "12 oct");
    assert.equal(w.conv(GUEST).stage, "need_checkout");
    await w.say(GUEST, "14 oct");
    assert.match(w.lastTo(GUEST)!.text, /free 12 Oct 2026 → 14 Oct 2026/);
  });
});

describe("booking questions", () => {
  test("name, mobile number, guests, check-in, check-out date -> review with totals", async () => {
    await bookUpToReview(w);
    const review = w.lastTo(GUEST)!;
    assert.equal(w.conv(GUEST).stage, "review");
    assert.match(review.text, /Name: Asha Nair/);
    assert.match(review.text, /Phone: \+91 98123 45678/);
    assert.match(review.text, /12 Oct 2026, 1:00 PM/);
    assert.match(review.text, /14 Oct 2026, 11:00 AM/);
    assert.match(review.text, /Total: ₹3,600 · 50% advance to confirm: ₹1,800/);
    assert.deepEqual(w.ids(review), ["confirm", "change"]);
  });

  test("the mobile number is required; nonsense is re-asked", async () => {
    await w.say(GUEST, qrText());
    await w.tap(GUEST, "book");
    await w.say(GUEST, "Asha Nair");
    assert.match(w.lastTo(GUEST)!.text, /mobile number/);
    for (const bad of ["123", "yes", "call me"]) {
      await w.say(GUEST, bad);
      assert.match(w.lastTo(GUEST)!.text, /type your mobile number/, bad);
    }
    await w.say(GUEST, "98450 21133");
    assert.equal(w.conv(GUEST).draft.phone, "919845021133");
    await w.say(GUEST, "2");
    await w.say(GUEST, "12 oct");
    await w.say(GUEST, "2");
    assert.match(w.lastTo(GUEST)!.text, /Phone: \+91 98450 21133/);
  });

  test("check-out as a date or a number of nights; impossible check-outs are re-asked", async () => {
    await w.say(GUEST, qrText());
    await w.tap(GUEST, "book");
    await w.say(GUEST, "Asha Nair");
    await w.say(GUEST, "98123 45678");
    await w.say(GUEST, "2");
    await w.say(GUEST, "12 oct");
    for (const bad of ["11 oct", "12 oct", "40", "whenever"]) {
      await w.say(GUEST, bad);
      assert.equal(w.conv(GUEST).stage, "need_checkout", bad);
    }
    await w.tap(GUEST, "n:3");
    assert.equal(w.conv(GUEST).draft.nights, 3);
    assert.equal(w.conv(GUEST).stage, "review");
  });

  test("bad names, guest counts and dates never break the flow", async () => {
    await w.say(GUEST, qrText());
    await w.tap(GUEST, "book");
    for (const bad of ["1234567", "?", "a"]) {
      await w.say(GUEST, bad);
      assert.equal(w.conv(GUEST).stage, "need_name", bad);
    }
    await w.say(GUEST, "my name is asha nair");
    assert.equal(w.conv(GUEST).draft.name, "Asha Nair");
    await w.say(GUEST, "98123 45678");
    for (const bad of ["0", "9", "abc"]) {
      await w.say(GUEST, bad);
      assert.match(w.lastTo(GUEST)!.text, /sleeps 2/);
    }
    await w.tap(GUEST, "g:2");
    await w.say(GUEST, "31/02");
    assert.match(w.lastTo(GUEST)!.text, /isn't a real date/);
    await w.say(GUEST, "1 jan 2020");
    assert.match(w.lastTo(GUEST)!.text, /already passed/);
    await w.say(GUEST, "whenever");
    assert.match(w.lastTo(GUEST)!.text, /couldn't read/);
    await w.say(GUEST, "menu");
    assert.equal(w.conv(GUEST).stage, "browsing");
  });

  test("room taken -> free rooms that fit; picking one carries on", async () => {
    await seed("101", "2026-10-12", "2026-10-14");
    await bookUpToReview(w);
    assert.equal(w.conv(GUEST).stage, "choose_room");
    await w.tap(GUEST, "pick:102");
    assert.equal(w.conv(GUEST).stage, "review");
    assert.match(w.lastTo(GUEST)!.text, /Room 102/);
  });

  test("someone else takes the room between review and confirm", async () => {
    await bookUpToReview(w);
    await seed("101", "2026-10-12", "2026-10-14");
    await w.tap(GUEST, "confirm");
    assert.equal((await pending()).length, 0);
    assert.match(w.to(GUEST).at(-2)!.text, /just taken/);
    assert.ok(w.ids(w.lastTo(GUEST)).includes("pick:102"));
  });
});

describe("paying", () => {
  test("confirm -> held room under the guest's number and this chat, 50% owed, pay link and buttons; the owner isn't bothered yet", async () => {
    const h = await hold();
    assert.deepEqual([h.guestPhone, h.chatKey, h.source], [GUEST_PHONE, GUEST, "WEB"]);
    const p = await paymentOf(h.id);
    assert.deepEqual([p.kind, p.amount, p.status], ["ADVANCE", 1800, "AWAITING"]);
    const m = w.lastTo(GUEST)!;
    assert.match(m.text, /Pay now: ₹1,800/);
    assert.match(m.text, /coral@upi/);
    assert.ok(m.text.includes(`/pay/${h.id}`));
    assert.deepEqual(w.ids(m), [`i_paid:${h.id}`, `cancel_hold:${h.id}`]);
    assert.equal(w.to(OWNER_PUSH).length, 0);
  });

  test("I've paid -> UTR -> the owner app gets who / what / room / UTR with Acknowledge and Not received", async () => {
    const h = await hold();
    await w.tap(GUEST, `i_paid:${h.id}`);
    assert.equal(w.conv(GUEST).stage, "need_utr");
    assert.match(w.lastTo(GUEST)!.text, /12-digit UPI reference/);
    await w.say(GUEST, "12345");
    assert.match(w.lastTo(GUEST)!.text, /doesn't look like a UTR/);
    await w.say(GUEST, "4123 4567 8901");
    const p = await paymentOf(h.id);
    assert.equal(p.status, "CLAIMED");
    assert.equal(p.utr, "412345678901");
    assert.match(w.lastTo(GUEST)!.text, /is with the front desk/);
    const alert = w.lastTo(OWNER_PUSH)!;
    assert.match(alert.text, /Payment to check\* — ₹1,800/);
    assert.match(alert.text, /Asha Nair · \+91 98123 45678/);
    assert.match(alert.text, /Room 101 · 12 Oct 2026 → 14 Oct 2026/);
    assert.match(alert.text, /UTR: \*412345678901\*/);
    assert.deepEqual(w.ids(alert), [`ack:${p.id}`, `nack:${p.id}`]);
  });

  test("a UTR in the same message as 'paid' is enough", async () => {
    const h = await hold();
    await w.say(GUEST, "paid! ref 412345678901");
    assert.equal((await paymentOf(h.id)).status, "CLAIMED");
  });

  test("Acknowledge confirms and tells the guest in their chat; a second tap changes nothing", async () => {
    const { h, p } = await holdAndClaim();
    await ack(p.id);
    const b = await byId(h.id);
    assert.equal(b.status, "CONFIRMED");
    assert.equal(b.advancePaid, 1800);
    const inbox = await w.inbox(GUEST);
    assert.equal(inbox.length, 1);
    assert.match(inbox[0]!.text, /Booking confirmed/);
    assert.match(inbox[0]!.text, /Paid: ₹1,800 {2}· {2}Due at check-in: ₹1,800/);
    assert.match((await ack(p.id)).message ?? "", /already acknowledged/);
    assert.equal((await w.inbox(GUEST)).length, 1);
    assert.equal((await byId(h.id)).advancePaid, 1800);
  });

  test("a guest can't acknowledge their own payment by sending the owner's button", async () => {
    const { h, p } = await holdAndClaim();
    await w.tap(GUEST, `ack:${p.id}`);
    assert.match(w.lastTo(GUEST)!.text, /out of date/);
    assert.equal((await byId(h.id)).status, "PENDING");
  });

  test("Not received -> the guest is asked to check and re-send; the second claim is acknowledged", async () => {
    const { h, p } = await holdAndClaim();
    assert.ok((await rejectAsAdmin(p.id)).ok);
    assert.equal((await paymentOf(h.id)).status, "REJECTED");
    const msg = (await w.inbox(GUEST)).at(-1)!;
    assert.match(msg.text, /couldn't find your ₹1,800 payment/);
    assert.deepEqual(msg.buttons?.map((b) => b.id), [`i_paid:${h.id}`, `cancel_hold:${h.id}`]);
    await w.tap(GUEST, `i_paid:${h.id}`);
    await w.say(GUEST, "999988887777");
    assert.equal((await paymentOf(h.id)).utr, "999988887777");
    await ack(p.id);
    assert.equal((await byId(h.id)).status, "CONFIRMED");
  });

  test("the owner is warned about a UTR that was already used", async () => {
    await holdAndClaim("412345678901");
    await bookUpToReview(w, { from: OTHER, room: "102", name: "Ravi", phone: "98111 22333" });
    await w.tap(OTHER, "confirm");
    const other = (await pending()).find((b) => b.chatKey === OTHER)!;
    await w.tap(OTHER, `i_paid:${other.id}`);
    await w.say(OTHER, "412345678901");
    assert.match(w.lastTo(OWNER_PUSH)!.text, /already used on HTL-20261012-/);
  });

  test("a phone number typed while paying isn't taken for a UTR", async () => {
    const h = await hold();
    await w.say(GUEST, "you can also call me on +91 98450 21133");
    await w.say(GUEST, GUEST_PHONE); // the number the booking is under
    assert.equal((await paymentOf(h.id)).status, "AWAITING");
    assert.equal(w.to(OWNER_PUSH).length, 0);
  });
});

describe("holds", () => {
  test("a repeated Confirm after a lost save resumes the same hold", async () => {
    await bookUpToReview(w);
    const before = w.conv(GUEST);
    await w.tap(GUEST, "confirm");
    const h = (await pending())[0]!;
    w.setConv(GUEST, before);
    w.clear();
    await w.tap(GUEST, "confirm");
    assert.equal((await pending()).length, 1);
    assert.equal(w.conv(GUEST).draft.bookingId, h.id);
    assert.doesNotMatch(w.to(GUEST).map((o) => o.text).join("\n"), /just taken/);
  });

  test("one unpaid hold per chat", async () => {
    const h = await hold();
    await w.tap(GUEST, "change");
    await w.say(GUEST, "20 oct");
    await w.say(GUEST, "22 oct");
    await w.tap(GUEST, "confirm");
    assert.equal((await pending()).length, 1);
    assert.match(w.lastTo(GUEST)!.text, /already have Room 101 on hold/);
    assert.equal(w.conv(GUEST).draft.bookingId, h.id);
  });

  test("cancel releases the hold; the owner only hears about it if a payment was sent", async () => {
    const h = await hold();
    await w.say(GUEST, "cancel");
    assert.equal((await byId(h.id)).status, "CANCELLED");
    assert.match(w.lastTo(GUEST)!.text, /is cancelled and the room is released/);
    assert.equal(w.to(OWNER_PUSH).length, 0);

    await bookUpToReview(w, { room: "102" });
    await w.tap(GUEST, "confirm");
    const h2 = (await pending())[0]!;
    await w.tap(GUEST, `i_paid:${h2.id}`);
    await w.say(GUEST, "412345678901");
    await w.tap(GUEST, `cancel_hold:${h2.id}`);
    assert.match(w.lastTo(OWNER_PUSH)!.text, /please refund them/);
  });

  test("'menu' while paying keeps the hold; 'paid' then asks for the UTR", async () => {
    const h = await hold();
    await w.say(GUEST, "menu");
    assert.equal(w.conv(GUEST).stage, "awaiting_payment");
    assert.deepEqual(w.ids(w.lastTo(GUEST)), [`i_paid:${h.id}`, `cancel_hold:${h.id}`]);
    await w.say(GUEST, "I have paid");
    assert.equal(w.conv(GUEST).stage, "need_utr");
  });

  test("a hold that lapses unpaid is released and the guest can start again", async () => {
    await hold();
    advance(180);
    await w.say(GUEST, "hello?");
    assert.match(w.lastTo(GUEST)!.text, /expired/);
    assert.deepEqual(w.ids(w.lastTo(GUEST)), ["restart"]);
  });

  test("a hold that lapses after the guest sent the UTR isn't 'expired' to them; the owner can still confirm", async () => {
    const { h, p } = await holdAndClaim();
    advance(180);
    await w.say(GUEST, "any update?");
    assert.match(w.lastTo(GUEST)!.text, /is with the front desk/);
    await ack(p.id);
    assert.equal((await byId(h.id)).status, "CONFIRMED");
    assert.match(await lastInbox(), /Booking confirmed/);
  });

  test("...and if the room was taken meanwhile, the owner is told to refund and the guest isn't confirmed", async () => {
    const { h, p } = await holdAndClaim();
    advance(180);
    await seed("101", "2026-10-12", "2026-10-14", { now: clock.now });
    const r = await acknowledgeAsAdmin(p.id, "");
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /please refund Asha Nair/);
    assert.equal((await byId(h.id)).status, "CANCELLED");
    assert.equal((await w.inbox(GUEST)).length, 0);
  });
});

describe("last day and extensions", () => {
  test("the last-day message goes to the chat of each stay that ends tomorrow, once per day", async () => {
    const id = await confirmedStay();
    await seed("102", "2026-10-12", "2026-10-14", { guestPhone: "919555555555" }); // booked at the desk: no chat
    await createBooking({
      roomId: "103", guestName: "Unpaid", guestPhone: "919666666666", guests: 2, chatKey: OTHER,
      checkIn: "2026-10-12", checkOut: "2026-10-14", status: "PENDING", source: "WEB", now: clock.now,
    });
    w.clear();
    const sent = await w.nudge("2026-10-14");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, GUEST);
    assert.deepEqual(w.ids(sent[0]), [`want_extend:${id}`, `want_out:${id}`]);
    assert.equal((await w.nudge("2026-10-14")).length, 0);
  });

  test("check out as planned tells the owner once", async () => {
    const id = await confirmedStay();
    w.clear();
    await w.tap(GUEST, `want_out:${id}`);
    await w.tap(GUEST, `want_out:${id}`);
    assert.equal(w.to(OWNER_PUSH).length, 1);
    assert.match(w.lastTo(OWNER_PUSH)!.text, /check-out/);
  });

  test("extend in the same room: held, paid in full, acknowledged, extended", async () => {
    const id = await confirmedStay();
    await w.tap(GUEST, `want_extend:${id}`);
    assert.equal(w.conv(GUEST).stage, "ext_need_date");
    await w.say(GUEST, "16 oct");
    const seg = (await pending())[0]!;
    assert.equal(seg.parentId, id);
    assert.equal(seg.roomId, "101");
    assert.equal(seg.chatKey, GUEST, "the extension belongs to the same chat");
    const p = await paymentOf(seg.id);
    assert.deepEqual([p.kind, p.amount], ["EXTENSION", 3600]);
    assert.match(w.lastTo(GUEST)!.text, /Room 101 is free until 16 Oct 2026/);
    assert.match(w.lastTo(GUEST)!.text, /Pay now: ₹3,600/);
    await w.tap(GUEST, `i_paid:${seg.id}`);
    await w.say(GUEST, "555566667777");
    assert.match(w.lastTo(OWNER_PUSH)!.text, /Extension: extends Room 101 by 2 nights \(to 16 Oct 2026\)/);
    await ack(p.id);
    assert.equal((await byId(seg.id)).status, "CONFIRMED");
    assert.match(await lastInbox(), /You're extended\* — Room 101 until 16 Oct 2026/);
  });

  test("extend when the room is taken: the guest picks a free room, pays, and moves", async () => {
    const id = await confirmedStay();
    await seed("101", "2026-10-15", "2026-10-17");
    await w.tap(GUEST, `want_extend:${id}`);
    await w.say(GUEST, "16 oct");
    assert.equal(w.conv(GUEST).stage, "ext_choose_room");
    assert.match(w.lastTo(GUEST)!.text, /booked by another guest/);
    assert.deepEqual(w.ids(w.lastTo(GUEST)), ["pick_ext:102", "pick_ext:103", "pick_ext:201", "ext_keep"]);
    await w.tap(GUEST, "pick_ext:201");
    const seg = (await pending())[0]!;
    assert.equal(seg.roomId, "201");
    assert.match(w.lastTo(GUEST)!.text, /Room 201 — Deluxe Balcony Room is yours from 14 Oct 2026/);
    await w.tap(GUEST, `i_paid:${seg.id}`);
    await w.say(GUEST, "555566667777");
    assert.match(w.lastTo(OWNER_PUSH)!.text, /moving Room 101 → 201/);
    await ack((await paymentOf(seg.id)).id);
    assert.match(await lastInbox(), /you'll be in \*Room 201/);
  });

  test("nothing free: the guest is told, and offered other dates or check-out", async () => {
    const id = await confirmedStay();
    for (const r of ["101", "102", "103", "201"]) await seed(r, "2026-10-14", "2026-10-17", { guestPhone: `91900000${r}0` });
    await w.tap(GUEST, `want_extend:${id}`);
    await w.say(GUEST, "16 oct");
    assert.match(w.lastTo(GUEST)!.text, /fully booked/);
    assert.deepEqual(w.ids(w.lastTo(GUEST)), [`want_extend:${id}`, `want_out:${id}`]);
  });

  test("'+2 nights' works; dates that aren't later are re-asked; 'keep' keeps the check-out", async () => {
    const id = await confirmedStay();
    await w.tap(GUEST, `want_extend:${id}`);
    await w.say(GUEST, "13 oct");
    assert.equal(w.conv(GUEST).stage, "ext_need_date");
    await w.say(GUEST, "+2 nights");
    assert.equal((await pending())[0]!.checkOutAt.toISOString(), "2026-10-16T05:30:00.000Z");

    const id2 = (await createBooking({
      roomId: "201", guestName: "Asha Nair", guestPhone: GUEST_PHONE, chatKey: GUEST, guests: 2, checkIn: "2026-11-01",
      checkOut: "2026-11-03", status: "CONFIRMED", source: "WEB",
    })) as { ok: true; value: { id: string } };
    await seed("201", "2026-11-03", "2026-11-05");
    await w.tap(GUEST, `want_extend:${id2.value.id}`);
    await w.say(GUEST, "5 nov");
    await w.tap(GUEST, "ext_keep");
    assert.match(w.lastTo(GUEST)!.text, /check-out is confirmed/);
  });

  test("asking to extend again while one is unpaid resumes that one", async () => {
    const id = await confirmedStay();
    await w.tap(GUEST, `want_extend:${id}`);
    await w.say(GUEST, "16 oct");
    await w.tap(GUEST, `want_extend:${id}`);
    assert.equal((await pending()).length, 1);
    assert.match(w.lastTo(GUEST)!.text, /Pay now: ₹3,600/);
  });

  test("typing 'extend' finds this chat's stay; another chat can't use its buttons", async () => {
    const id = await confirmedStay();
    await w.say(GUEST, "I want to extend my stay");
    assert.equal(w.conv(GUEST).stage, "ext_need_date");
    await w.tap(OTHER, `want_extend:${id}`);
    assert.match(w.lastTo(OTHER)!.text, /couldn't find that booking/);
    await w.say(OTHER, "extend");
    assert.match(w.lastTo(OTHER)!.text, /couldn't find a confirmed stay/);
  });

  test("an extension whose hold lapses while the desk checks the payment: no last-day message, no second extension", async () => {
    const id = await confirmedStay();
    await seed("101", "2026-10-14", "2026-10-17");
    await w.tap(GUEST, `want_extend:${id}`);
    await w.say(GUEST, "16 oct");
    await w.tap(GUEST, "pick_ext:102");
    const seg = (await pending())[0]!;
    await w.tap(GUEST, `i_paid:${seg.id}`);
    await w.say(GUEST, "555566667777");
    advance(180);
    await w.say(GUEST, "any news?");
    assert.equal((await byId(seg.id)).status, "CANCELLED", "the hold lapsed");
    assert.match(w.lastTo(GUEST)!.text, /is with the front desk/);
    assert.equal((await w.nudge("2026-10-14")).length, 0);
    await w.tap(GUEST, `want_extend:${id}`);
    assert.match(w.lastTo(GUEST)!.text, /is with the front desk/);
    assert.equal(await prisma.booking.count({ where: { parentId: id } }), 1);
    await ack((await paymentOf(seg.id)).id);
    assert.equal((await byId(seg.id)).status, "CONFIRMED");
    assert.match(await lastInbox(), /you'll be in \*Room 102/);
  });

  test("an old 'Extend' button after the stay has ended is refused", async () => {
    const id = await confirmedStay();
    clock.now = new Date("2026-10-20T05:00:00Z");
    await w.tap(GUEST, `want_extend:${id}`);
    assert.match(w.lastTo(GUEST)!.text, /ended on 14 Oct 2026/);
    assert.notEqual(w.conv(GUEST).stage, "ext_need_date");
    assert.equal(await prisma.booking.count({ where: { parentId: id } }), 0);
  });
});

describe("my booking", () => {
  test("shows this chat's bookings with their payment state; another chat sees none", async () => {
    const { p } = await holdAndClaim();
    await w.say(GUEST, "what's my booking status?");
    assert.match(w.lastTo(GUEST)!.text, /waiting for payment/);
    await ack(p.id);
    await w.say(GUEST, "my booking");
    assert.match(w.lastTo(GUEST)!.text, /confirmed · paid ₹1,800 · ₹1,800 due at check-in/);
    await w.say(OTHER, "check my reservation");
    assert.match(w.lastTo(OTHER)!.text, /couldn't find an upcoming booking/);
  });
});

describe("message shape", () => {
  test("every message stays compact: short text, at most 3 buttons, at most 10 list rows", async () => {
    const id = await confirmedStay();
    await seed("101", "2026-10-15", "2026-10-17");
    await w.nudge("2026-10-14");
    await w.tap(GUEST, `want_extend:${id}`);
    await w.say(GUEST, "16 oct");
    await w.tap(GUEST, "pick_ext:201");
    await w.say(GUEST, "hi");
    await w.say(OTHER, "hi");
    assert.ok(w.log.length > 15);
    for (const o of w.log) {
      assert.ok(o.text.length > 0 && o.text.length <= 1024, `body length ${o.text.length}`);
      assert.ok((o.buttons?.length ?? 0) <= 3);
      for (const b of o.buttons ?? []) assert.ok(b.title.length <= 20 && b.id.length <= 256, b.title);
      if (o.list) {
        assert.ok(o.list.rows.length >= 1 && o.list.rows.length <= 10);
        for (const r of o.list.rows) assert.ok(r.title.length <= 24 && (r.description ?? "").length <= 72, r.title);
      }
      assert.ok(!(o.buttons && o.list));
    }
  });
});
