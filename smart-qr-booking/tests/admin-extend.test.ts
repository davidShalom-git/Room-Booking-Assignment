import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking, createSegment, isFree } from "../src/lib/engine";
import { toInstant } from "../src/lib/dates";
import { addDays, todayISO } from "../src/lib/pricing";
import { extendAsAdmin } from "../src/lib/admin-ops";
import { chatMessages } from "../src/lib/web-chat";
import { resetDb, seedRooms } from "./helpers/db";
import { GUEST, GUEST_PHONE } from "./helpers/chat";

const inDays = (d: number) => addDays(todayISO(), d);

beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }, { id: "103", capacity: 4, price: 2200 }]);
});

/** A confirmed stay entered by the owner (no chat), or made in the website chat when `chatKey` is given. */
async function stay(o: { roomId?: string; from?: number; to?: number; guests?: number; chatKey?: string } = {}) {
  const r = await createBooking({
    roomId: o.roomId ?? "101", guestName: "Asha Nair", guestPhone: GUEST_PHONE, guests: o.guests ?? 2,
    checkIn: inDays(o.from ?? 2), checkOut: inDays(o.to ?? 4), status: "CONFIRMED",
    source: o.chatKey ? "WEB" : "ADMIN", advancePaid: 1800, chatKey: o.chatKey,
  });
  assert.ok(r.ok, !r.ok ? r.message : "");
  return r.value;
}
const other = (roomId: string, from: number, to: number) =>
  createBooking({
    roomId, guestName: "Ravi Menon", guestPhone: "919000000002", guests: 2, checkIn: inDays(from), checkOut: inDays(to),
    status: "CONFIRMED", source: "ADMIN",
  });
const extend = (id: string, roomId: string, to: number | string, amount = "") =>
  extendAsAdmin({ id, roomId, newCheckOut: typeof to === "number" ? inDays(to) : to, amount });
const segmentsOf = (rootId: string) => prisma.booking.findMany({ where: { parentId: rootId }, orderBy: { checkInAt: "asc" } });
const refused = (r: Awaited<ReturnType<typeof extendAsAdmin>>, re: RegExp) => {
  assert.ok(!r.ok, "expected a refusal");
  assert.match(r.error, re);
};

describe("extendAsAdmin", () => {
  test("extends in the same room: a confirmed segment, paid in full, the extra nights blocked", async () => {
    const root = await stay();
    const r = await extend(root.id, "101", 6);
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.match(r.message ?? "", /Extended HTL-\d{8}-\d+ in Room 101 .*₹3,600 received/);
    const [seg] = await segmentsOf(root.id);
    assert.ok(seg);
    assert.equal(seg.status, "CONFIRMED");
    assert.equal(seg.roomId, "101");
    assert.equal(seg.checkInAt.toISOString(), root.checkOutAt.toISOString());
    assert.equal(seg.total, 3600);
    assert.equal(seg.advancePaid, 3600);
    const pay = await prisma.payment.findFirstOrThrow({ where: { bookingId: seg.id } });
    assert.deepEqual([pay.kind, pay.status, pay.amount], ["EXTENSION", "ACKNOWLEDGED", 3600]);
    assert.equal(await isFree("101", root.checkOutAt, toInstant(inDays(6), "11:00")), false);
  });

  test("an amount of 0 confirms it with the whole extension still due", async () => {
    const root = await stay();
    const r = await extend(root.id, "101", 6, "0");
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.match(r.message ?? "", /₹3,600 still due/);
    const [seg] = await segmentsOf(root.id);
    assert.equal(seg?.status, "CONFIRMED");
    assert.equal(seg?.advancePaid, 0);
  });

  test("a part payment is recorded as given", async () => {
    const root = await stay();
    assert.ok((await extend(root.id, "101", 6, "1000")).ok);
    assert.equal((await segmentsOf(root.id))[0]?.advancePaid, 1000);
  });

  test("moves to another room when the same room is taken", async () => {
    const root = await stay();
    assert.ok((await other("101", 4, 7)).ok);
    const r = await extend(root.id, "102", 6);
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.match(r.message ?? "", /moves to Room 102 on/);
    const [seg] = await segmentsOf(root.id);
    assert.deepEqual([seg?.roomId, seg?.status, seg?.total], ["102", "CONFIRMED", 3000]);
  });

  test("the owner may move a guest even when the same room is free", async () => {
    const root = await stay();
    assert.ok((await extend(root.id, "103", 5)).ok);
    assert.equal((await segmentsOf(root.id))[0]?.roomId, "103");
  });

  test("a booking the owner entered (no chat) is extended without any chat message", async () => {
    const root = await stay();
    assert.ok((await extend(root.id, "101", 6)).ok);
    assert.equal(await prisma.chatMessage.count(), 0);
  });

  test("a guest who booked in the website chat gets the confirmation there", async () => {
    const root = await stay({ chatKey: GUEST });
    assert.ok((await extend(root.id, "102", 6)).ok);
    const sent = (await chatMessages(GUEST)).filter((m) => !m.fromGuest);
    assert.equal(sent.length, 1);
    assert.match(sent[0]!.text, /extended/i);
    assert.match(sent[0]!.text, /Room 102/);
  });

  test("extending twice continues from the latest end, from any part of the stay", async () => {
    const root = await stay();
    assert.ok((await extend(root.id, "101", 5)).ok);
    const [first] = await segmentsOf(root.id);
    assert.ok((await extend(first!.id, "102", 7)).ok);
    const segs = await segmentsOf(root.id);
    assert.equal(segs.length, 2);
    assert.equal(segs[1]!.checkInAt.toISOString(), segs[0]!.checkOutAt.toISOString());
    assert.equal(segs[1]!.parentId, root.id);
    assert.equal(segs[1]!.status, "CONFIRMED");
  });

  describe("refuses", () => {
    test("a stay that isn't confirmed", async () => {
      const h = await createBooking({
        roomId: "101", guestName: "Asha Nair", guestPhone: GUEST_PHONE, guests: 2, checkIn: inDays(2), checkOut: inDays(4),
        status: "PENDING", source: "WEB", chatKey: GUEST,
      });
      assert.ok(h.ok);
      refused(await extend(h.value.id, "101", 6), /confirmed/i);
    });

    test("a stay that has ended", async () => {
      const root = await stay({ from: -5, to: -2 });
      refused(await extend(root.id, "101", 3), /ended/i);
    });

    test("a date not after the current check-out", async () => {
      const root = await stay();
      refused(await extend(root.id, "101", 4), /after the current/i);
      refused(await extend(root.id, "101", 3), /after the current/i);
      refused(await extend(root.id, "101", "soon"), /after the current/i);
    });

    test("more than the maximum nights", async () => {
      const root = await stay();
      refused(await extend(root.id, "101", 40), /limited to 30 nights/i);
    });

    test("a room that isn't free for those nights", async () => {
      const root = await stay();
      assert.ok((await other("102", 5, 7)).ok);
      refused(await extend(root.id, "102", 6), /Room 102 is already booked .*Ravi Menon/);
      assert.equal((await segmentsOf(root.id)).length, 0);
    });

    test("a room too small for the party", async () => {
      const root = await stay({ roomId: "103", guests: 3 });
      refused(await extend(root.id, "102", 6), /sleeps 2/);
    });

    test("an invalid amount, and saves nothing", async () => {
      const root = await stay();
      for (const amount of ["abc", "-5", "3601", "12.5"]) refused(await extend(root.id, "101", 6, amount), /amount/i);
      assert.equal((await segmentsOf(root.id)).length, 0);
    });

    test("while an extension is already waiting for payment", async () => {
      const root = await stay({ chatKey: GUEST });
      assert.ok((await createSegment({ stayId: root.id, roomId: "101", newCheckOut: inDays(5) })).ok);
      refused(await extend(root.id, "101", 5), /already waiting/i);
      assert.equal((await segmentsOf(root.id))[0]?.status, "PENDING");
    });

    test("an unknown booking or room", async () => {
      const root = await stay();
      assert.ok(!(await extend("nope", "101", 6)).ok);
      assert.ok(!(await extend(root.id, "999", 6)).ok);
    });
  });
});
