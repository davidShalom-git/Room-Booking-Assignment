import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import {
  createBooking,
  cancelBooking,
  isFree,
  freeRooms,
  sweepHolds,
  bookingRef,
  seqFromRef,
  occupancy,
  roomStatusNow,
  isExclusionViolation,
} from "../src/lib/engine";
import { confirmBooking } from "../src/lib/payments";
import { toInstant } from "../src/lib/dates";
import { resetDb, seedRooms } from "./helpers/db";

const base = {
  guestName: "Asha Nair",
  guestPhone: "+91 98450 21133",
  guests: 2,
  status: "CONFIRMED" as const,
  source: "ADMIN" as const,
};
const stay = (roomId: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) => ({
  ...base,
  roomId,
  checkIn,
  checkOut,
  ...extra,
});

function ok<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`);
  return r.value;
}
function fail(r: { ok: boolean; code?: string }, code: string) {
  assert.equal(r.ok, false, "expected a failure");
  assert.equal(r.code, code);
}

const T0 = new Date("2026-10-01T10:00:00Z");
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

describe("engine", () => {
  beforeEach(async () => {
    await resetDb();
    await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }, { id: "103", capacity: 4, price: 2200 }]);
  });

  describe("createBooking", () => {
    test("creates a confirmed booking with snapshot pricing and a display ref", async () => {
      const b = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      assert.equal(b.status, "CONFIRMED");
      assert.equal(b.nights, 2);
      assert.equal(b.ratePerNight, 1800);
      assert.equal(b.total, 3600);
      assert.equal(b.guestPhone, "919845021133");
      assert.equal(b.checkInAt.toISOString(), "2026-10-12T07:30:00.000Z"); // 13:00 IST
      assert.equal(b.checkOutAt.toISOString(), "2026-10-14T05:30:00.000Z"); // 11:00 IST
      assert.equal(bookingRef(b), "HTL-20261012-001");
      assert.equal(seqFromRef(bookingRef(b)), b.seq);
    });

    test("overlap on the same room is a CONFLICT that names the clashing booking", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      const r = await createBooking(stay("101", "2026-10-13", "2026-10-15"));
      fail(r, "CONFLICT");
      assert.ok(!r.ok && r.conflict?.ref.startsWith("HTL-20261012"));
    });

    test("same-day hand-over is allowed (out 11:00, in 13:00)", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      ok(await createBooking(stay("101", "2026-10-14", "2026-10-16")));
    });

    test("another room is unaffected", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      ok(await createBooking(stay("102", "2026-10-12", "2026-10-14")));
    });

    test("a PENDING hold blocks the room and expires after 120 minutes", async () => {
      const held = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { status: "PENDING", now: T0 })));
      assert.equal(held.holdExpiresAt?.toISOString(), plus(T0, 120).toISOString());
      fail(await createBooking(stay("101", "2026-10-12", "2026-10-14", { now: plus(T0, 60) })), "CONFLICT");
      // 3h later the hold has lapsed: the room is free again and the row is CANCELLED.
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { now: plus(T0, 180) })));
      const row = await prisma.booking.findUnique({ where: { id: held.id } });
      assert.equal(row?.status, "CANCELLED");
    });

    test("a cancelled booking frees the slot", async () => {
      const b = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      ok(await cancelBooking(b.id));
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
    });

    test("validation", async () => {
      fail(await createBooking(stay("101", "2026-10-12", "2026-10-12")), "INVALID"); // 0 nights
      fail(await createBooking(stay("101", "2026-10-14", "2026-10-12")), "INVALID"); // reversed
      fail(await createBooking(stay("101", "2026-10-12", "2026-11-12")), "INVALID"); // 31 nights
      fail(await createBooking(stay("101", "not-a-date", "2026-10-12")), "INVALID");
      fail(await createBooking(stay("101", "2026-10-12", "2026-10-14", { guestName: "   " })), "INVALID");
      fail(await createBooking(stay("101", "2026-10-12", "2026-10-14", { guestPhone: "12" })), "INVALID");
      fail(await createBooking(stay("101", "2026-10-12", "2026-10-14", { guests: 0 })), "INVALID");
      fail(await createBooking(stay("999", "2026-10-12", "2026-10-14")), "NOT_FOUND");
      fail(await createBooking(stay("101", "2026-10-12", "2026-10-14", { guests: 3 })), "CAPACITY");
      await prisma.room.update({ where: { id: "102" }, data: { active: false } });
      fail(await createBooking(stay("102", "2026-10-12", "2026-10-14")), "INACTIVE");
    });

    test("30 nights is allowed", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-11-11")));
    });
  });

  describe("confirmBooking", () => {
    test("PENDING -> CONFIRMED with a 50% advance by default; a second call is a no-op", async () => {
      const held = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { status: "PENDING", now: T0 })));
      const c = ok(await confirmBooking(held.id));
      assert.equal(c.status, "CONFIRMED");
      assert.equal(c.advancePaid, 1800);
      assert.equal(c.holdExpiresAt, null);
      const again = ok(await confirmBooking(held.id, 999));
      assert.equal(again.advancePaid, 1800, "idempotent: a repeat tap changes nothing");
    });

    test("custom advance amount", async () => {
      const held = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { status: "PENDING", now: T0 })));
      assert.equal(ok(await confirmBooking(held.id, 500)).advancePaid, 500);
    });

    test("after the hold lapsed it revives if the room is still free", async () => {
      const held = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { status: "PENDING", now: T0 })));
      await sweepHolds(plus(T0, 180));
      const c = ok(await confirmBooking(held.id));
      assert.equal(c.status, "CONFIRMED");
    });

    test("after the hold lapsed and someone else booked, it is a CONFLICT", async () => {
      const held = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { status: "PENDING", now: T0 })));
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { now: plus(T0, 180) })));
      fail(await confirmBooking(held.id), "CONFLICT");
    });

    test("a booking the owner cancelled is not revived by a stale tap", async () => {
      const held = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14", { status: "PENDING", now: T0 })));
      ok(await cancelBooking(held.id));
      fail(await confirmBooking(held.id), "INVALID");
    });

    test("unknown id", async () => {
      fail(await confirmBooking("nope"), "NOT_FOUND");
    });
  });

  describe("cancelBooking", () => {
    test("is idempotent and reports unknown ids", async () => {
      const b = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      assert.equal(ok(await cancelBooking(b.id)).status, "CANCELLED");
      assert.equal(ok(await cancelBooking(b.id)).status, "CANCELLED");
      fail(await cancelBooking("nope"), "NOT_FOUND");
    });
  });

  describe("availability", () => {
    test("isFree / freeRooms honour bookings, capacity and exclusions", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      const from = toInstant("2026-10-13", "13:00");
      const to = toInstant("2026-10-15", "11:00");
      assert.equal(await isFree("101", from, to), false);
      assert.equal(await isFree("102", from, to), true);
      const free = await freeRooms(from, to);
      assert.deepEqual(free.map((r) => r.id), ["102", "103"]);
      assert.deepEqual((await freeRooms(from, to, { minCapacity: 3 })).map((r) => r.id), ["103"]);
      assert.deepEqual((await freeRooms(from, to, { excludeRoomId: "102" })).map((r) => r.id), ["103"]);
    });

    test("isFree can ignore a booking (used when re-checking itself)", async () => {
      const b = ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      assert.equal(await isFree("101", b.checkInAt, b.checkOutAt, b.id), true);
    });

    test("an inactive room is never offered", async () => {
      await prisma.room.update({ where: { id: "102" }, data: { active: false } });
      const free = await freeRooms(toInstant("2026-10-13", "13:00"), toInstant("2026-10-15", "11:00"));
      assert.deepEqual(free.map((r) => r.id), ["101", "103"]);
    });
  });

  describe("views", () => {
    test("occupancy marks the nights a stay covers", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      const cells = await occupancy("2026-10-11", 5);
      const at = (room: string, day: string) => cells.find((c) => c.roomId === room && c.day === day);
      assert.equal(at("101", "2026-10-11")?.bookingId, null);
      assert.ok(at("101", "2026-10-12")?.bookingId);
      assert.ok(at("101", "2026-10-13")?.bookingId);
      assert.equal(at("101", "2026-10-14")?.bookingId, null, "check-out day is not a night");
      assert.equal(at("102", "2026-10-12")?.bookingId, null);
      assert.equal(cells.length, 3 * 5);
    });

    test("roomStatusNow: occupied / pending / available", async () => {
      ok(await createBooking(stay("101", "2026-10-12", "2026-10-14")));
      ok(await createBooking(stay("102", "2026-10-12", "2026-10-14", { status: "PENDING", now: new Date("2026-10-13T05:00:00Z") })));
      const s = await roomStatusNow(new Date("2026-10-13T06:00:00Z"));
      assert.equal(s["101"], "occupied");
      assert.equal(s["102"], "pending");
      assert.equal(s["103"], "available");
      const before = await roomStatusNow(new Date("2026-10-10T06:00:00Z"));
      assert.equal(before["101"], "available");
    });
  });

  test("isExclusionViolation recognises the driver-adapter shape and rejects others", () => {
    assert.equal(isExclusionViolation({ code: "P2039", meta: { driverAdapterError: { cause: { code: "23P01" } } } }), true);
    assert.equal(isExclusionViolation(new Error('conflicting key value violates exclusion constraint "booking_no_overlap"')), true);
    assert.equal(isExclusionViolation({ code: "P2002" }), false);
    assert.equal(isExclusionViolation(null), false);
    assert.equal(isExclusionViolation(new Error("boom")), false);
  });
});
