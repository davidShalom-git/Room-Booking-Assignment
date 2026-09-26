import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { resetDb, seedRooms, rawBooking } from "./helpers/db";

// Instants are UTC; 11:00 IST = 05:30Z, 13:00 IST = 07:30Z.
const D10_IN = "2026-10-10T07:30:00Z";
const D12_OUT = "2026-10-12T05:30:00Z";

describe("booking_no_overlap constraint", () => {
  beforeEach(async () => {
    await resetDb();
    await seedRooms();
  });

  test("two CONFIRMED bookings overlapping on one room are rejected", async () => {
    await rawBooking("101", D10_IN, D12_OUT);
    await assert.rejects(
      rawBooking("101", "2026-10-11T07:30:00Z", "2026-10-13T05:30:00Z"),
      (e: unknown) => /booking_no_overlap|exclusion/i.test(JSON.stringify(e, Object.getOwnPropertyNames(e as object))),
    );
  });

  test("under the Prisma driver adapter the violation is P2039 with Postgres code 23P01", async () => {
    await rawBooking("101", D10_IN, D12_OUT);
    try {
      await rawBooking("101", D10_IN, D12_OUT);
      assert.fail("expected a rejection");
    } catch (e) {
      const err = e as { code?: string; meta?: { driverAdapterError?: { cause?: { code?: string; message?: string } } } };
      assert.equal(err.code, "P2039");
      assert.equal(err.meta?.driverAdapterError?.cause?.code, "23P01");
      assert.match(err.meta?.driverAdapterError?.cause?.message ?? "", /booking_no_overlap/);
    }
  });

  test("back-to-back same day is allowed (out 11:00, next in 13:00)", async () => {
    await rawBooking("101", D10_IN, D12_OUT);
    await rawBooking("101", "2026-10-12T07:30:00Z", "2026-10-14T05:30:00Z");
    assert.equal(await prisma.booking.count(), 2);
  });

  test("a PENDING hold blocks a CONFIRMED booking", async () => {
    await rawBooking("101", D10_IN, D12_OUT, "PENDING");
    await assert.rejects(rawBooking("101", D10_IN, D12_OUT, "CONFIRMED"));
  });

  test("CANCELLED rows never block", async () => {
    await rawBooking("101", D10_IN, D12_OUT, "CANCELLED");
    await rawBooking("101", D10_IN, D12_OUT, "CONFIRMED");
    assert.equal(await prisma.booking.count(), 2);
  });

  test("different rooms do not conflict", async () => {
    await rawBooking("101", D10_IN, D12_OUT);
    await rawBooking("102", D10_IN, D12_OUT);
    assert.equal(await prisma.booking.count(), 2);
  });
});
