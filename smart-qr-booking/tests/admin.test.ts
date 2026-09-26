import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createBooking, freeRooms, sweepHolds, createSegment } from "../src/lib/engine";
import { toInstant } from "../src/lib/dates";
import { addDays, todayISO } from "../src/lib/pricing";
import { confirmAdvance, cancelAsAdmin, createWalkIn, saveRoom, setRoomActive } from "../src/lib/admin-ops";
import { listBookings, dashboardData } from "../src/lib/admin-data";
import { resetDb, seedRooms } from "./helpers/db";
import { chatMessages } from "../src/lib/web-chat";
import { GUEST, GUEST_PHONE } from "./helpers/chat";

const inDays = (d: number) => addDays(todayISO(), d);
/** What the guest's chat received from the desk. */
const toGuest = async () => (await chatMessages(GUEST)).filter((m) => !m.fromGuest);

beforeEach(async () => {
  await resetDb();
  await seedRooms([{ id: "101", price: 1800 }, { id: "102", price: 1500 }, { id: "103", capacity: 4, price: 2200 }]);
});

/** A hold made in the website chat. */
const hold = (roomId = "101", from = inDays(10), to = inDays(12)) =>
  createBooking({
    roomId, guestName: "Asha Nair", guestPhone: GUEST_PHONE, chatKey: GUEST, guests: 2, checkIn: from, checkOut: to,
    status: "PENDING", source: "WEB",
  });

const walkIn = (over: Record<string, string> = {}) =>
  createWalkIn({
    roomId: "101",
    guestName: "Ravi Menon",
    guestPhone: "+91 99620 88410",
    guests: "2",
    checkIn: inDays(3),
    checkOut: inDays(5),
    checkInTime: "13:00",
    checkOutTime: "11:00",
    advancePaid: "0",
    ...over,
  });

describe("confirmAdvance", () => {
  test("defaults to 50%, confirms, and sends the guest their confirmation in the chat", async () => {
    const h = await hold();
    assert.ok(h.ok);
    const r = await confirmAdvance(h.value.id, "");
    assert.ok(r.ok, !r.ok ? r.error : "");
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: h.value.id } });
    assert.equal(row.status, "CONFIRMED");
    assert.equal(row.advancePaid, 1800);
    const sent = await toGuest();
    assert.equal(sent.length, 1);
    assert.match(sent[0]!.text, /Booking confirmed/);
  });

  test("a custom amount is recorded; out-of-range amounts are refused", async () => {
    const h = await hold();
    assert.ok(h.ok);
    const bad = await confirmAdvance(h.value.id, "99999");
    assert.ok(!bad.ok);
    assert.ok(!(await confirmAdvance(h.value.id, "-5")).ok);
    assert.ok(!(await confirmAdvance(h.value.id, "abc")).ok);
    assert.ok((await confirmAdvance(h.value.id, "1000")).ok);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.value.id } })).advancePaid, 1000);
  });

  test("confirming twice doesn't message the guest twice", async () => {
    const h = await hold();
    assert.ok(h.ok);
    await confirmAdvance(h.value.id, "");
    const again = await confirmAdvance(h.value.id, "");
    assert.ok(again.ok);
    assert.match(again.message ?? "", /already/i);
    assert.equal((await toGuest()).length, 1);
  });

  test("a lapsed hold whose room was taken is reported, not confirmed", async () => {
    const h = await hold();
    assert.ok(h.ok);
    await sweepHolds(new Date(Date.now() + 3 * 3_600_000));
    assert.ok((await walkIn({ checkIn: inDays(10), checkOut: inDays(12) })).ok);
    const r = await confirmAdvance(h.value.id, "");
    assert.ok(!r.ok);
    assert.match(r.error, /taken|booked/i);
  });
});

describe("cancelAsAdmin", () => {
  test("cancels a hold and tells the guest in the chat", async () => {
    const h = await hold();
    assert.ok(h.ok);
    assert.ok((await cancelAsAdmin(h.value.id)).ok);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.value.id } })).status, "CANCELLED");
    assert.match((await toGuest())[0]!.text, /cancel/i);
  });

  test("cancels a confirmed booking and tells the guest in the chat", async () => {
    const h = await hold();
    assert.ok(h.ok);
    await confirmAdvance(h.value.id, "");
    assert.ok((await cancelAsAdmin(h.value.id)).ok);
    assert.match((await toGuest()).at(-1)!.text, /cancelled/i);
  });

  test("cancelling a stay also cancels its room-move continuation", async () => {
    const w = await walkIn();
    assert.ok(w.ok);
    const parent = await prisma.booking.findFirstOrThrow();
    const leg = await createSegment({ stayId: parent.id, roomId: "103", newCheckOut: inDays(7) });
    assert.ok(leg.ok);
    assert.ok((await cancelAsAdmin(parent.id)).ok);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: leg.value.id } })).status, "CANCELLED");
  });

  test("an expired hold can be confirmed from the console while the room is still free", async () => {
    const h = await hold();
    assert.ok(h.ok);
    await sweepHolds(new Date(Date.now() + 3 * 3_600_000));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.value.id } })).status, "CANCELLED");
    const r = await confirmAdvance(h.value.id, "");
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.value.id } })).status, "CONFIRMED");
  });

  test("desk bookings (no chat) are cancelled quietly; unknown ids are an error", async () => {
    const w = await walkIn();
    assert.ok(w.ok);
    const row = await prisma.booking.findFirstOrThrow();
    assert.ok((await cancelAsAdmin(row.id)).ok);
    assert.equal(await prisma.chatMessage.count(), 0);
    assert.ok(!(await cancelAsAdmin("nope")).ok);
  });
});

describe("createWalkIn", () => {
  test("creates a confirmed admin booking with the advance recorded", async () => {
    const r = await walkIn({ advancePaid: "500" });
    assert.ok(r.ok, !r.ok ? r.error : "");
    const row = await prisma.booking.findFirstOrThrow();
    assert.equal(row.status, "CONFIRMED");
    assert.equal(row.source, "ADMIN");
    assert.equal(row.advancePaid, 500);
    assert.equal(row.guestPhone, "919962088410");
    assert.match(r.message ?? "", /HTL-/);
  });

  test("a clash names the booking in the way", async () => {
    const h = await hold("101", inDays(4), inDays(6));
    assert.ok(h.ok);
    const r = await walkIn();
    assert.ok(!r.ok);
    assert.match(r.error, /Asha Nair/);
    assert.match(r.error, /HTL-/);
  });

  test("bad input points at the field", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ guestName: "" }, "guestName"],
      [{ guestPhone: "12" }, "guestPhone"],
      [{ guests: "0" }, "guests"],
      [{ guests: "abc" }, "guests"],
      [{ guests: "3" }, "guests"],
      [{ checkIn: "" }, "checkIn"],
      [{ checkOut: inDays(3) }, "checkOut"],
      [{ checkInTime: "25:00" }, "checkInTime"],
      [{ advancePaid: "-1" }, "advancePaid"],
      [{ advancePaid: "999999" }, "advancePaid"],
      [{ roomId: "999" }, "roomId"],
    ];
    for (const [over, field] of cases) {
      const r = await walkIn(over);
      assert.ok(!r.ok, JSON.stringify(over));
      assert.equal(r.field, field, JSON.stringify(over));
    }
    assert.equal(await prisma.booking.count(), 0);
  });
});

describe("rooms", () => {
  const room = (over: Record<string, string> = {}) => ({
    id: "301",
    name: "Garden Suite",
    type: "Suite",
    pricePerNight: "3200",
    capacity: "3",
    bed: "King Bed",
    ac: "on",
    size: "40 m²",
    floor: "3",
    shortDescription: "Big and bright.",
    description: "A long description.",
    amenities: "Free WiFi, TV\nBathtub",
    images: "https://images.unsplash.com/photo-1?w=1400\nhttps://example.com/b.jpg",
    active: "on",
    ...over,
  });

  test("create, then edit", async () => {
    assert.ok((await saveRoom(room())).ok);
    const created = await prisma.room.findUniqueOrThrow({ where: { id: "301" } });
    assert.deepEqual(created.amenities, ["Free WiFi", "TV", "Bathtub"]);
    assert.equal(created.images.length, 2);
    assert.equal(created.ac, true);
    assert.equal(created.sortOrder, 3);

    assert.ok((await saveRoom(room({ pricePerNight: "3500", ac: "" }), "301")).ok);
    const edited = await prisma.room.findUniqueOrThrow({ where: { id: "301" } });
    assert.equal(edited.pricePerNight, 3500);
    assert.equal(edited.ac, false);
  });

  test("validation", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ id: "bad id!" }, "id"],
      [{ id: "new" }, "id"],
      [{ id: "101" }, "id"], // already exists
      [{ name: "" }, "name"],
      [{ pricePerNight: "0" }, "pricePerNight"],
      [{ pricePerNight: "12.5" }, "pricePerNight"],
      [{ capacity: "0" }, "capacity"],
      [{ images: "" }, "images"],
      [{ images: "http://insecure.example/a.jpg" }, "images"],
      [{ images: "not a url" }, "images"],
    ];
    for (const [over, field] of cases) {
      const r = await saveRoom(room(over));
      assert.ok(!r.ok, JSON.stringify(over));
      assert.equal(r.field, field, JSON.stringify(over));
    }
  });

  test("editing a room that doesn't exist fails; editing doesn't change existing bookings' price", async () => {
    assert.ok(!(await saveRoom(room(), "999")).ok);
    const w = await walkIn();
    assert.ok(w.ok);
    const current = await prisma.room.findUniqueOrThrow({ where: { id: "101" } });
    assert.ok(
      (await saveRoom({ ...room(), id: "101", name: current.name, pricePerNight: "5000", images: "https://example.com/x.jpg" }, "101")).ok,
    );
    assert.equal((await prisma.booking.findFirstOrThrow()).total, 3600);
  });

  test("hiding a room takes it out of availability", async () => {
    const from = toInstant(inDays(3), "13:00");
    const to = toInstant(inDays(5), "11:00");
    assert.ok((await setRoomActive("102", false)).ok);
    assert.deepEqual((await freeRooms(from, to)).map((r) => r.id), ["101", "103"]);
    assert.ok((await setRoomActive("102", true)).ok);
    assert.ok(!(await setRoomActive("999", true)).ok);
  });
});

describe("admin data", () => {
  test("listBookings filters by status, source, text and time", async () => {
    assert.ok((await walkIn()).ok);
    const h = await hold("102");
    assert.ok(h.ok);
    await createBooking({
      roomId: "103", guestName: "Old Stay", guestPhone: "919111111111", guests: 2,
      checkIn: inDays(-10), checkOut: inDays(-8), status: "CONFIRMED", source: "ADMIN",
    });

    const upcoming = await listBookings({});
    assert.deepEqual(upcoming.map((b) => b.guestName), ["Ravi Menon", "Asha Nair"]);
    assert.deepEqual((await listBookings({ when: "past" })).map((b) => b.guestName), ["Old Stay"]);
    assert.equal((await listBookings({ when: "all" })).length, 3);
    assert.deepEqual((await listBookings({ status: "pending" })).map((b) => b.guestName), ["Asha Nair"]);
    assert.deepEqual((await listBookings({ source: "web" })).map((b) => b.guestName), ["Asha Nair"]);
    assert.deepEqual((await listBookings({ q: "ravi" })).map((b) => b.guestName), ["Ravi Menon"]);
    assert.deepEqual((await listBookings({ q: "98123" })).map((b) => b.guestName), ["Asha Nair"]);
    assert.deepEqual((await listBookings({ q: h.ok ? h.value.seq.toString().padStart(3, "0") : "", when: "all" })).map((b) => b.guestName), ["Asha Nair"]);
  });

  test("dashboard numbers", async () => {
    await createBooking({
      roomId: "101", guestName: "In House", guestPhone: "919111111111", guests: 1,
      checkIn: inDays(-1), checkOut: todayISO(), status: "CONFIRMED", source: "ADMIN", advancePaid: 900,
    });
    await createBooking({
      roomId: "102", guestName: "Arriving", guestPhone: "919222222222", guests: 1,
      checkIn: todayISO(), checkOut: inDays(2), status: "CONFIRMED", source: "ADMIN",
    });
    const h = await hold("103", inDays(5), inDays(6));
    assert.ok(h.ok);
    const d = await dashboardData();
    assert.equal(d.rooms.total, 3);
    assert.deepEqual(d.arrivals.map((b) => b.guestName), ["Arriving"]);
    assert.deepEqual(d.departures.map((b) => b.guestName), ["In House"]);
    assert.deepEqual(d.pendingHolds.map((b) => b.guestName), ["Asha Nair"]);
    assert.equal(d.grid.days.length, 14);
    assert.equal(d.grid.rows.length, 3);
    assert.equal(d.grid.rows[1]!.cells[0]!.status, "CONFIRMED");
    assert.equal(d.recent.length, 3);
  });
});
