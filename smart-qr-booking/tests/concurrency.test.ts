import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking, isLostRace } from "../src/lib/engine";
import { confirmBooking } from "../src/lib/payments";
import { resetDb, seedRooms } from "./helpers/db";

const stay = (guestName: string, extra: Record<string, unknown> = {}) => ({
  roomId: "101",
  guestName,
  guestPhone: "919845021133",
  guests: 2,
  checkIn: "2026-10-12",
  checkOut: "2026-10-14",
  status: "CONFIRMED" as const,
  source: "WEB" as const,
  ...extra,
});

describe("concurrency safety", () => {
  beforeEach(async () => {
    await resetDb();
    await seedRooms();
  });

  test("8 simultaneous requests for one slot: exactly one wins, the rest get CONFLICT, none throw", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createBooking(stay(`Guest ${i}`))));
    assert.equal(results.filter((r) => r.ok).length, 1);
    const losers = results.filter((r) => !r.ok);
    assert.equal(losers.length, 7);
    assert.ok(losers.every((r) => !r.ok && r.code === "CONFLICT"));
    assert.equal(await prisma.booking.count({ where: { status: "CONFIRMED" } }), 1);
  });

  test("overlapping-but-not-identical ranges race the same way", async () => {
    const results = await Promise.all([
      createBooking(stay("A", { checkIn: "2026-10-12", checkOut: "2026-10-14" })),
      createBooking(stay("B", { checkIn: "2026-10-13", checkOut: "2026-10-15" })),
      createBooking(stay("C", { checkIn: "2026-10-13", checkOut: "2026-10-14" })), // all three mutually overlap
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
  });

  test("parallel confirms of one hold: both succeed, advance recorded once", async () => {
    const held = await createBooking(stay("Held", { status: "PENDING" }));
    assert.ok(held.ok);
    const [a, b] = await Promise.all([confirmBooking(held.value.id), confirmBooking(held.value.id)]);
    assert.ok(a.ok && b.ok);
    const row = await prisma.booking.findUnique({ where: { id: held.value.id } });
    assert.equal(row?.status, "CONFIRMED");
    assert.equal(row?.advancePaid, 1000); // 50% of 2 nights x ₹1,000
  });
});

describe("races that Postgres resolves as a deadlock", () => {
  beforeEach(async () => {
    await resetDb();
    await seedRooms();
  });

  test("a deadlock is recognised as a lost race", () => {
    const deadlock = {
      code: "P2034",
      meta: { driverAdapterError: { cause: { originalCode: "40P01", kind: "TransactionWriteConflict" } } },
    };
    assert.equal(isLostRace(deadlock), true);
    assert.equal(isLostRace({ code: "P2039", meta: { driverAdapterError: { cause: { code: "23P01" } } } }), true);
    assert.equal(isLostRace({ code: "P2002" }), false);
    assert.equal(isLostRace(new Error("boom")), false);
  });

  test("30 rounds of 8 simultaneous requests: never a throw, always exactly one winner", async () => {
    for (let round = 0; round < 30; round++) {
      await prisma.booking.deleteMany();
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createBooking(stay(`R${round}G${i}`))));
      assert.equal(results.filter((r) => r.ok).length, 1, `round ${round}`);
      assert.ok(results.every((r) => r.ok || r.code === "CONFLICT"), `round ${round}`);
    }
  });
});
