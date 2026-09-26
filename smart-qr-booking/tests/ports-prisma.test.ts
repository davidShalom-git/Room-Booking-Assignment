import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking, activeByChat } from "../src/lib/engine";
import { toView } from "../src/lib/bot/ports-prisma";
import { loadConv, saveConv } from "../src/lib/bot/conversation";
import { resetDb, seedRooms } from "./helpers/db";

const stay = (roomId: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) => ({
  roomId, guestName: "Ravi Menon", guestPhone: "919333333333", guests: 2, checkIn, checkOut,
  status: "CONFIRMED" as const, source: "ADMIN" as const, ...extra,
});

beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800, name: "Deluxe Double Room" }, { id: "102" }, { id: "103", capacity: 4 }, { id: "201" }]);
});

describe("toView", () => {
  test("renders IST dates/times, even for a late-evening check-in (server is UTC)", async () => {
    const r = await createBooking(stay("101", "2026-10-12", "2026-10-13", { checkInTime: "23:30", checkOutTime: "10:00" }));
    assert.ok(r.ok);
    const v = toView(r.value);
    assert.equal(v.checkIn, "2026-10-12");
    assert.equal(v.checkInTime, "23:30");
    assert.equal(v.checkOut, "2026-10-13");
    assert.equal(v.checkOutTime, "10:00");
    assert.equal(v.ref, "HTL-20261012-001");
    assert.equal(v.roomName, "Deluxe Double Room");
  });
});

describe("activeByChat", () => {
  test("this chat's pending/confirmed bookings, not yet ended, soonest first — never another chat's, even with the same number", async () => {
    const chat = "web:CHATaaaaaaaaaaaaaaaaaa";
    await createBooking(stay("101", "2026-10-20", "2026-10-22", { chatKey: chat }));
    await createBooking(stay("102", "2026-10-12", "2026-10-14", { chatKey: chat }));
    await createBooking(stay("103", "2026-10-12", "2026-10-14", { chatKey: chat, status: "PENDING", now: new Date("2026-10-01T09:00:00Z") }));
    await createBooking(stay("201", "2026-09-01", "2026-09-03", { chatKey: chat }));
    await createBooking(stay("201", "2026-10-20", "2026-10-22", { chatKey: "web:OTHERaaaaaaaaaaaaaaaaa" }));
    await createBooking(stay("103", "2026-10-20", "2026-10-22"));
    const list = await activeByChat(chat, new Date("2026-10-01T10:00:00Z"));
    assert.deepEqual(list.map((b) => b.roomId), ["102", "103", "101"]);
  });
});

describe("conversation persistence", () => {
  test("defaults, round trip and overwrite", async () => {
    const chat = "web:CHATaaaaaaaaaaaaaaaaaa";
    assert.deepEqual(await loadConv(chat), { chat, roomId: null, stage: "browsing", draft: {} });
    await saveConv({ chat, roomId: "101", stage: "need_checkout", draft: { name: "Asha", checkIn: "2026-10-12", intent: "book" } });
    const back = await loadConv(chat);
    assert.equal(back.stage, "need_checkout");
    assert.deepEqual(back.draft, { name: "Asha", checkIn: "2026-10-12", intent: "book" });
    await saveConv({ ...back, stage: "browsing", draft: {} });
    assert.deepEqual((await loadConv(chat)).draft, {});
    assert.equal(await prisma.conversation.count(), 1);
  });
});
