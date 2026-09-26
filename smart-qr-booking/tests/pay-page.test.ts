import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking } from "../src/lib/engine";
import { claimFromPayPage, payState } from "../src/lib/pay-page";
import { resetDb, seedRooms } from "./helpers/db";
import { GUEST, GUEST_PHONE } from "./helpers/chat";

const T0 = new Date("2026-10-01T10:00:00Z");

beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }]);
});

describe("the pay page", () => {
  test("offers UPI while the hold is live (or its payment is with the desk); a lapsed unpaid hold only takes a UTR", () => {
    const lapsed = { status: "CANCELLED" as const, holdExpiresAt: T0 };
    assert.equal(payState({ status: "PENDING", holdExpiresAt: T0 }, { status: "AWAITING" }), "pay");
    assert.equal(payState({ status: "PENDING", holdExpiresAt: T0 }, { status: "CLAIMED" }), "pay");
    assert.equal(payState(lapsed, { status: "CLAIMED" }), "pay");
    assert.equal(payState(lapsed, { status: "AWAITING" }), "expired");
    assert.equal(payState(lapsed, { status: "REJECTED" }), "expired");
    assert.equal(payState({ status: "CANCELLED", holdExpiresAt: null }, null), "none");
    assert.equal(payState({ status: "CONFIRMED", holdExpiresAt: null }, null), "none");
  });

  test("a UTR sent from the pay page claims the payment, like sending it in the chat", async () => {
    const h = await createBooking({
      roomId: "101", guestName: "Asha Nair", guestPhone: GUEST_PHONE, chatKey: GUEST, guests: 2,
      checkIn: "2026-10-12", checkOut: "2026-10-14", status: "PENDING", source: "WEB", now: T0,
    });
    assert.ok(h.ok);
    assert.equal((await claimFromPayPage(h.value.id, "123")).ok, false);
    const claim = await claimFromPayPage(h.value.id, "4123-4567-8901");
    assert.ok(claim.ok);
    const p = await prisma.payment.findFirstOrThrow({ where: { bookingId: h.value.id } });
    assert.deepEqual([p.status, p.utr], ["CLAIMED", "412345678901"]);
  });
});
