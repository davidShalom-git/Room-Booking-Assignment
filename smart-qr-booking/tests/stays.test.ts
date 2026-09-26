import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { acknowledgePayment, claimPayment, confirmBooking, openPayment } from "../src/lib/payments";
import {
  createBooking,
  cancelBooking,
  createSegment,
  extensionOptions,
  stayOf,
  checkingOutOn,
  sweepHolds,
} from "../src/lib/engine";

import { resetDb, seedRooms } from "./helpers/db";

/** A fixed "now" before the stays below, so the tests don't depend on the real date. */
const T0 = new Date("2026-10-01T10:00:00Z");
/** Past any hold created at T0. */
const LATER = new Date(T0.getTime() + 3 * 3_600_000);

function ok<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`);
  return r.value;
}
function fail(r: { ok: boolean; code?: string }, code: string) {
  assert.equal(r.ok, false);
  assert.equal(r.code, code);
}

const stay = (roomId = "101", checkIn = "2026-10-12", checkOut = "2026-10-14", extra: Record<string, unknown> = {}) =>
  createBooking({
    roomId, guestName: "Asha Nair", guestPhone: "919812345678", guests: 2, checkIn, checkOut,
    status: "CONFIRMED", source: "WEB", advancePaid: 1800, now: T0, ...extra,
  });
const other = (roomId: string, checkIn: string, checkOut: string, status: "PENDING" | "CONFIRMED" = "CONFIRMED") =>
  createBooking({
    roomId, guestName: "Ravi Menon", guestPhone: "919000000002", guests: 2, checkIn, checkOut, status, source: "ADMIN", now: T0,
  });
const extend = (stayId: string, roomId: string, newCheckOut: string, now = T0) => createSegment({ stayId, roomId, newCheckOut, now });
const byId = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }, { id: "103", capacity: 4, price: 2200 }]);
});

describe("stays and segments", () => {
  test("extend in the same room: a held segment from the stay's end, paid in full", async () => {
    const root = ok(await stay());
    const seg = ok(await extend(root.id, "101", "2026-10-16"));
    assert.equal(seg.status, "PENDING");
    assert.equal(seg.parentId, root.id);
    assert.equal(seg.roomId, "101");
    assert.equal(seg.checkInAt.toISOString(), root.checkOutAt.toISOString());
    assert.equal(seg.checkOutAt.toISOString(), "2026-10-16T05:30:00.000Z");
    assert.equal(seg.total, 3600);
    const p = await openPayment(seg.id);
    assert.deepEqual([p?.kind, p?.amount, p?.status], ["EXTENSION", 3600, "AWAITING"]);
  });

  test("the held nights can't be booked by anyone else while unpaid", async () => {
    const root = ok(await stay());
    ok(await extend(root.id, "101", "2026-10-16"));
    fail(await other("101", "2026-10-15", "2026-10-17"), "CONFLICT");
  });

  test("one open extension at a time; asking again for the same thing returns it", async () => {
    const root = ok(await stay());
    const a = ok(await extend(root.id, "101", "2026-10-16"));
    const b = ok(await extend(root.id, "101", "2026-10-16"));
    assert.equal(a.id, b.id);
    fail(await extend(root.id, "101", "2026-10-18"), "INVALID");
  });

  test("a second extension starts where the first (paid) one ended", async () => {
    const root = ok(await stay());
    const first = ok(await extend(root.id, "101", "2026-10-16"));
    ok(await confirmBooking(first.id, undefined, T0));
    const second = ok(await extend(first.id, "101", "2026-10-18"));
    assert.equal(second.parentId, root.id, "segments always hang off the root");
    assert.equal(second.checkInAt.toISOString(), first.checkOutAt.toISOString());
    const s = await stayOf(second.id);
    assert.equal(s?.root.id, root.id);
    assert.deepEqual(s?.segments.map((x) => x.id), [first.id, second.id]);
    assert.equal(s?.end.id, first.id, "the end is the last *confirmed* part");
    assert.equal(s?.pending?.id, second.id);
  });

  test("extensionOptions: same room free, or taken with the free rooms that fit the party", async () => {
    const root = ok(await stay());
    const free = ok(await extensionOptions(root.id, "2026-10-16", T0));
    assert.equal(free.sameRoomFree, true);
    ok(await other("101", "2026-10-15", "2026-10-17"));
    const taken = ok(await extensionOptions(root.id, "2026-10-16", T0));
    assert.equal(taken.sameRoomFree, false);
    assert.deepEqual(taken.freeRooms.map((r) => r.id), ["102", "103"]);
    fail(await extensionOptions(root.id, "2026-10-13", T0), "INVALID");
  });

  test("moving to another room when the current one is taken", async () => {
    const root = ok(await stay());
    ok(await other("101", "2026-10-15", "2026-10-17"));
    fail(await extend(root.id, "101", "2026-10-16"), "CONFLICT");
    const seg = ok(await extend(root.id, "103", "2026-10-16"));
    assert.equal(seg.roomId, "103");
    assert.equal(seg.total, 4400);
  });

  test("validation: not after the current end, too long, stay not confirmed, room too small", async () => {
    const root = ok(await stay());
    fail(await extend(root.id, "101", "2026-10-14"), "INVALID");
    fail(await extend(root.id, "101", "2026-11-12"), "INVALID");
    const unpaid = ok(await createBooking({
      roomId: "102", guestName: "X", guestPhone: "919000000003", guests: 1, checkIn: "2026-10-20",
      checkOut: "2026-10-21", status: "PENDING", source: "WEB", now: T0,
    }));
    fail(await extend(unpaid.id, "102", "2026-10-22"), "INVALID");
    const big = ok(await stay("103", "2026-10-20", "2026-10-22", { guests: 4 }));
    fail(await extend(big.id, "102", "2026-10-24"), "CAPACITY");
  });

  test("a stay that has already ended can't be extended; later the same day (after check-out) it still can", async () => {
    const root = ok(await stay());
    const weekLater = new Date("2026-10-20T05:00:00Z");
    fail(await extensionOptions(root.id, "2026-10-22", weekLater), "INVALID");
    fail(await extend(root.id, "101", "2026-10-22", weekLater), "INVALID");
    assert.equal(await prisma.booking.count({ where: { parentId: root.id } }), 0);
    const sameDayLate = new Date("2026-10-14T09:00:00Z"); // 14:30 IST, after the 11:00 check-out
    ok(await extensionOptions(root.id, "2026-10-16", sameDayLate));
    ok(await extend(root.id, "101", "2026-10-16", sameDayLate));
  });

  test("cancelling the stay cancels its segments and what they still owe", async () => {
    const root = ok(await stay());
    const seg = ok(await extend(root.id, "101", "2026-10-16"));
    ok(await cancelBooking(root.id));
    assert.equal((await byId(seg.id)).status, "CANCELLED");
    assert.equal((await prisma.payment.findFirstOrThrow({ where: { bookingId: seg.id } })).status, "CANCELLED");
  });

  test("cancelling the stay also retires an extension whose hold had lapsed (a late 'confirm' can't bring it back)", async () => {
    const root = ok(await stay());
    const seg = ok(await extend(root.id, "101", "2026-10-16"));
    await sweepHolds(LATER);
    ok(await cancelBooking(root.id));
    assert.equal((await confirmBooking(seg.id, undefined, LATER)).ok, false);
    assert.equal((await byId(seg.id)).status, "CANCELLED");
  });

  test("checkingOutOn lists only the end of each stay, and not a stay that's being extended", async () => {
    const root = ok(await stay());
    const plain = ok(await stay("102", "2026-10-12", "2026-10-14", { guestPhone: "919000000005" }));
    assert.deepEqual((await checkingOutOn("2026-10-14")).map((b) => b.id).sort(), [root.id, plain.id].sort());
    const seg = ok(await extend(root.id, "103", "2026-10-16"));
    assert.deepEqual((await checkingOutOn("2026-10-14")).map((b) => b.id), [plain.id], "extension being paid");
    ok(await confirmBooking(seg.id, undefined, T0));
    assert.deepEqual((await checkingOutOn("2026-10-14")).map((b) => b.id), [plain.id]);
    assert.deepEqual((await checkingOutOn("2026-10-16")).map((b) => b.id), [seg.id]);
  });
});

describe("an extension whose hold lapsed while its payment was with the desk", () => {
  test("still counts as the stay's open extension: no second one, no last-day nudge; acknowledging confirms it", async () => {
    const root = ok(await stay());
    const seg = ok(await extend(root.id, "102", "2026-10-16"));
    ok(await claimPayment(seg.id, "412345678901", T0));
    await sweepHolds(LATER);
    assert.equal((await byId(seg.id)).status, "CANCELLED");
    assert.equal((await stayOf(root.id))?.pending?.id, seg.id);
    fail(await extend(root.id, "103", "2026-10-16", LATER), "INVALID");
    assert.deepEqual((await checkingOutOn("2026-10-14")).map((b) => b.id), []);
    ok(await acknowledgePayment((await openPayment(seg.id))!.id, undefined, LATER));
    assert.equal((await byId(seg.id)).status, "CONFIRMED");
  });

  test("an unpaid lapsed one doesn't — and paying it late, after extending another way, is refused for a refund", async () => {
    const root = ok(await stay());
    const first = ok(await extend(root.id, "102", "2026-10-16"));
    await sweepHolds(LATER);
    assert.equal((await stayOf(root.id))?.pending, null);
    const second = ok(await extend(root.id, "103", "2026-10-16", LATER));
    ok(await confirmBooking(second.id, undefined, LATER));
    const late = ok(await claimPayment(first.id, "412345678901", LATER));
    fail(await acknowledgePayment(late.id, undefined, LATER), "SUPERSEDED");
    const b = await byId(first.id);
    assert.deepEqual([b.status, b.advancePaid], ["CANCELLED", 0]);
    assert.equal((await byId(second.id)).status, "CONFIRMED");
  });
});
