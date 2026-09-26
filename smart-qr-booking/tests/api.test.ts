import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking } from "../src/lib/engine";
import { addDays, todayISO } from "../src/lib/pricing";
import { GET as cron } from "../src/app/api/cron/last-day/route";
import { GET as summary } from "../src/app/api/cron/daily-summary/route";
import { chatMessages } from "../src/lib/web-chat";
import { GET as availability } from "../src/app/api/availability/route";
import { resetDb, seedRooms } from "./helpers/db";
import { GUEST, GUEST_PHONE } from "./helpers/chat";

const today = () => todayISO();
const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://x${path}`, { headers });

before(() => {
  process.env["CRON_SECRET"] = "cron-secret";
});
beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102" }, { id: "103", capacity: 4 }]);
});

const stay = (roomId: string, checkIn: string, checkOut: string, status: "PENDING" | "CONFIRMED" = "CONFIRMED") =>
  createBooking({ roomId, guestName: "Asha Nair", guestPhone: GUEST_PHONE, chatKey: GUEST, guests: 2, checkIn, checkOut, status, source: "WEB" });

describe("cron: last-day nudge", () => {
  test("refuses without the cron secret", async () => {
    assert.equal((await cron(req("/api/cron/last-day"))).status, 401);
    assert.equal((await cron(req("/api/cron/last-day", { authorization: "Bearer wrong" }))).status, 401);
  });

  test("asks confirmed stays ending tomorrow, in their chat, once per day", async () => {
    const tomorrow = addDays(today(), 1);
    const b = await stay("101", today(), tomorrow);
    assert.ok(b.ok);
    await stay("102", today(), tomorrow, "PENDING");
    await stay("103", today(), addDays(today(), 2));

    const res = await cron(req("/api/cron/last-day", { authorization: "Bearer cron-secret" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sent: 1, for: tomorrow });
    const sent = await chatMessages(GUEST);
    assert.equal(sent.length, 1);
    assert.match(sent[0]!.text, /Tomorrow, .* is your last day with us/);
    assert.equal(sent[0]!.buttons?.[0]?.id, `want_extend:${b.ok && b.value.id}`);

    const again = await cron(req("/api/cron/last-day", { authorization: "Bearer cron-secret" }));
    assert.equal((await again.json()).sent, 0);
    assert.equal((await chatMessages(GUEST)).length, 1);
  });

  test("never rewrites the guest's conversation (it may have moved on meanwhile)", async () => {
    const tomorrow = addDays(today(), 1);
    assert.ok((await stay("101", today(), tomorrow)).ok);
    const draft = { name: "Asha", intent: "book", checkIn: addDays(today(), 20) };
    await prisma.conversation.create({ data: { chat: GUEST, stage: "need_nights", draft } });
    const res = await cron(req("/api/cron/last-day", { authorization: "Bearer cron-secret" }));
    assert.equal((await res.json()).sent, 1);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { chat: GUEST } });
    assert.equal(conv.stage, "need_nights");
    assert.deepEqual(conv.draft, draft);
  });

});

describe("cron: 9 PM summary", () => {
  test("refuses without the cron secret; with it, sums up the day and clears old rate-limit counters", async () => {
    assert.equal((await summary(req("/api/cron/daily-summary"))).status, 401);
    await prisma.rateLimit.create({ data: { key: "chat:old", windowStart: new Date(Date.now() - 2 * 86_400_000), count: 1 } });
    await prisma.rateLimit.create({ data: { key: "chat:new", windowStart: new Date(), count: 1 } });
    const res = await summary(req("/api/cron/daily-summary", { authorization: "Bearer cron-secret" }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sent: number; text: string };
    assert.match(body.text, /rooms free/);
    assert.deepEqual((await prisma.rateLimit.findMany()).map((r) => r.key), ["chat:new"]);
  });

  test("also deletes uploaded photos nothing uses, once they're a day old", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await prisma.photo.create({ data: { type: "image/jpeg", data: jpeg, createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    await prisma.photo.create({ data: { type: "image/jpeg", data: jpeg } });
    await summary(req("/api/cron/daily-summary", { authorization: "Bearer cron-secret" }));
    assert.equal(await prisma.photo.count(), 1);
  });
});

describe("availability API", () => {
  const url = (q: string) => req(`/api/availability?${q}`);
  const inDays = (d: number) => addDays(today(), d);

  test("free room: available with nights and total", async () => {
    const res = await availability(url(`room=101&from=${inDays(3)}&to=${inDays(5)}`));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { available: true, nights: 2, total: 3600, ratePerNight: 1800 });
  });

  test("booked room: not available", async () => {
    await stay("101", inDays(4), inDays(6));
    const res = await availability(url(`room=101&from=${inDays(3)}&to=${inDays(5)}`));
    assert.equal((await res.json()).available, false);
  });

  test("too many guests for the room: not available", async () => {
    const res = await availability(url(`room=101&from=${inDays(3)}&to=${inDays(5)}&guests=3`));
    assert.equal((await res.json()).available, false);
  });

  test("bad input", async () => {
    for (const q of [
      `room=101&from=nope&to=${inDays(5)}`,
      `room=101&from=${inDays(5)}&to=${inDays(5)}`,
      `room=101&from=${inDays(5)}&to=${inDays(3)}`,
      `room=101&from=${inDays(1)}&to=${inDays(40)}`,
      `room=101&from=${inDays(-3)}&to=${inDays(1)}`,
    ]) {
      const res = await availability(url(q));
      assert.equal(res.status, 400, q);
      assert.ok((await res.json()).error);
    }
    assert.equal((await availability(url(`room=999&from=${inDays(3)}&to=${inDays(5)}`))).status, 404);
  });
});
