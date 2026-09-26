import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking, sweepHolds, cancelBooking, customerByPhone } from "../src/lib/engine";
import { claimPayment, acknowledgePayment, rejectPayment, openPayment, recordBalance } from "../src/lib/payments";
import { resetDb, seedRooms } from "./helpers/db";

const PHONE = "919812345678";
const T0 = new Date("2026-10-01T10:00:00Z");
const hold = (extra: Record<string, unknown> = {}) =>
  createBooking({
    roomId: "101", guestName: "Asha Nair", guestPhone: PHONE, guests: 2,
    checkIn: "2026-10-12", checkOut: "2026-10-14", status: "PENDING", source: "WEB", now: T0, ...extra,
  });

function ok<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`);
  return r.value;
}

beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }, { id: "103", capacity: 4, price: 2200 }]);
});

describe("customers", () => {
  test("the first booking creates the account, named after that booking; later ones reuse it", async () => {
    ok(await hold());
    ok(await createBooking({
      roomId: "102", guestName: "Ravi (friend)", guestPhone: "+91 98123 45678", guests: 1,
      checkIn: "2026-10-20", checkOut: "2026-10-21", status: "CONFIRMED", source: "ADMIN",
    }));
    const c = await customerByPhone(PHONE);
    assert.equal(c?.name, "Asha Nair");
    assert.equal(await prisma.customer.count(), 1);
    assert.ok((await prisma.booking.findMany()).every((b) => b.customerId === c!.id));
  });

  test("a different contact number is kept on the booking; the same one isn't duplicated", async () => {
    const a = ok(await hold({ contactPhone: "+91 99999 00000" }));
    assert.equal(a.contactPhone, "919999900000");
    const b = ok(await hold({ roomId: "102", contactPhone: PHONE }));
    assert.equal(b.contactPhone, null);
  });
});

describe("payment ledger", () => {
  test("a hold owes a 50% advance; a desk booking with an advance is already paid", async () => {
    const h = ok(await hold());
    const p = await openPayment(h.id);
    assert.equal(p?.kind, "ADVANCE");
    assert.equal(p?.amount, 1800);
    assert.equal(p?.status, "AWAITING");
    const walk = ok(await createBooking({
      roomId: "102", guestName: "Ravi", guestPhone: "919000000002", guests: 1, checkIn: "2026-10-12",
      checkOut: "2026-10-13", status: "CONFIRMED", source: "ADMIN", advancePaid: 500,
    }));
    const paid = await prisma.payment.findMany({ where: { bookingId: walk.id } });
    assert.deepEqual(paid.map((x) => [x.kind, x.amount, x.status]), [["ADVANCE", 500, "ACKNOWLEDGED"]]);
    const none = ok(await createBooking({
      roomId: "103", guestName: "Sam", guestPhone: "919000000003", guests: 1, checkIn: "2026-10-12",
      checkOut: "2026-10-13", status: "CONFIRMED", source: "ADMIN",
    }));
    assert.equal(await prisma.payment.count({ where: { bookingId: none.id } }), 0);
  });

  test("a claim needs a 12-digit UTR (spaces are fine)", async () => {
    const h = ok(await hold());
    for (const bad of ["12345", "abcd12345678", "1234567890123", ""]) {
      const r = await claimPayment(h.id, bad);
      assert.equal(r.ok, false, bad);
    }
    const c = ok(await claimPayment(h.id, "4123 4567 8901"));
    assert.equal(c.status, "CLAIMED");
    assert.equal(c.utr, "412345678901");
    assert.equal(c.duplicateRef, null);
  });

  test("claim -> acknowledge confirms the booking and records the money once", async () => {
    const h = ok(await hold());
    const c = ok(await claimPayment(h.id, "412345678901"));
    const a = ok(await acknowledgePayment(c.id));
    assert.equal(a.already, false);
    assert.equal(a.status, "ACKNOWLEDGED");
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: h.id } });
    assert.equal(b.status, "CONFIRMED");
    assert.equal(b.advancePaid, 1800);
    assert.equal(b.holdExpiresAt, null);
    const again = ok(await acknowledgePayment(c.id));
    assert.equal(again.already, true);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).advancePaid, 1800);
  });

  test("parallel acknowledgments record the money once", async () => {
    const h = ok(await hold());
    const c = ok(await claimPayment(h.id, "412345678901"));
    const rs = await Promise.all([acknowledgePayment(c.id), acknowledgePayment(c.id), acknowledgePayment(c.id)]);
    assert.ok(rs.every((r) => r.ok));
    assert.equal(rs.filter((r) => r.ok && !r.value.already).length, 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).advancePaid, 1800);
  });

  test("the owner can acknowledge with a different amount (e.g. the guest paid in full)", async () => {
    const h = ok(await hold());
    const c = ok(await claimPayment(h.id, "412345678901"));
    ok(await acknowledgePayment(c.id, 3600));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).advancePaid, 3600);
  });

  test("'not received' -> the guest can claim again with another UTR", async () => {
    const h = ok(await hold());
    const c = ok(await claimPayment(h.id, "412345678901"));
    const r = ok(await rejectPayment(c.id));
    assert.equal(r.status, "REJECTED");
    const again = ok(await claimPayment(h.id, "999988887777"));
    assert.equal(again.id, c.id);
    assert.equal(again.status, "CLAIMED");
    assert.equal(again.utr, "999988887777");
  });

  test("'not received' twice (or two taps at once) is reported once", async () => {
    const h = ok(await hold());
    const c = ok(await claimPayment(h.id, "412345678901"));
    const rs = await Promise.all([rejectPayment(c.id), rejectPayment(c.id)]);
    assert.deepEqual(rs.map((r) => r.ok && r.value.already).sort(), [false, true]);
    assert.equal(ok(await rejectPayment(c.id)).already, true);
  });

  test("a UTR already used on another booking is flagged", async () => {
    const a = ok(await hold());
    ok(await claimPayment(a.id, "412345678901"));
    const b = ok(await hold({ roomId: "102", guestPhone: "919000000009" }));
    const c = ok(await claimPayment(b.id, "412345678901"));
    assert.match(c.duplicateRef ?? "", /^HTL-20261012-/);
  });

  test("a lapsed hold: the claim still works, and acknowledging revives it while the room is free", async () => {
    const h = ok(await hold());
    await sweepHolds(new Date(T0.getTime() + 3 * 3_600_000));
    const c = ok(await claimPayment(h.id, "412345678901"));
    ok(await acknowledgePayment(c.id));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).status, "CONFIRMED");
  });

  test("...but if someone else took the room meanwhile it's a CONFLICT and nothing is recorded", async () => {
    const h = ok(await hold());
    const later = new Date(T0.getTime() + 3 * 3_600_000);
    ok(await hold({ guestPhone: "919000000009", now: later, status: "CONFIRMED", source: "ADMIN" }));
    const c = ok(await claimPayment(h.id, "412345678901"));
    const r = await acknowledgePayment(c.id);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, "CONFLICT");
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(p.status, "CLAIMED");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).advancePaid, 0);
  });

  test("cancelling a booking cancels what's still owed; claims are then refused", async () => {
    const h = ok(await hold());
    ok(await cancelBooking(h.id));
    assert.equal((await prisma.payment.findFirstOrThrow({ where: { bookingId: h.id } })).status, "CANCELLED");
    const r = await claimPayment(h.id, "412345678901");
    assert.equal(r.ok, false);
  });

  test("balance at check-in settles the booking, once", async () => {
    const h = ok(await hold());
    const c = ok(await claimPayment(h.id, "412345678901"));
    ok(await acknowledgePayment(c.id));
    const bal = ok(await recordBalance(h.id));
    assert.equal(bal.kind, "BALANCE");
    assert.equal(bal.amount, 1800);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).advancePaid, 3600);
    assert.equal((await recordBalance(h.id)).ok, false, "nothing left to pay");
    const rs = await Promise.all([recordBalance(h.id), recordBalance(h.id)]);
    assert.ok(rs.every((r) => !r.ok));
  });
});
