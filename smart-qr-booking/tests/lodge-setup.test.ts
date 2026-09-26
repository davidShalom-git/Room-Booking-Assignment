/**
 * Setting up a new lodge (scripts/new-lodge.ts): its details, rooms and owner sign-in written to
 * a fresh database in one go, from one JSON file — no code changes per lodge.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { getSettings } from "../src/lib/settings";
import { attemptLogin, recoverWithCode } from "../src/lib/owner-login";
import { setupLodge, type LodgeInput } from "../src/lib/lodge-setup";
import { resetDb } from "./helpers/db";

const lodge = (over: Partial<LodgeInput> = {}): LodgeInput => ({
  settings: {
    name: "Green Valley Homestay",
    tagline: "A quiet farm stay in the hills",
    city: "Munnar, Kerala",
    address: "Chithirapuram, Munnar, Kerala 685565",
    phone: "94470 12345",
    about: "Four rooms on a working cardamom farm, twenty minutes above Munnar town.",
    amenities: ["Free WiFi", "Home-cooked breakfast"],
    rating: null,
    checkInTime: "12:00",
    checkOutTime: "10:00",
    advancePercent: 30,
    upiId: "greenvalley@okaxis",
    upiName: "Green Valley Homestay",
  },
  rooms: [
    { id: "1", name: "Garden Room", pricePerNight: 2200, capacity: 2, bed: "Queen Bed", shortDescription: "Opens onto the garden." },
    { id: "2", name: "Family Room", pricePerNight: 3200, capacity: 4, bed: "King + 2 Singles", ac: true, shortDescription: "Room for four." },
  ],
  ...over,
});

beforeEach(resetDb);

describe("setting up a new lodge", () => {
  test("writes the details and rooms, and creates the owner's password and recovery code", async () => {
    const r = await setupLodge(lodge());
    assert.ok(r.ok, JSON.stringify(r));
    const s = await getSettings();
    assert.equal(s.name, "Green Valley Homestay");
    assert.equal(s.advancePercent, 30);
    assert.equal(s.rating, null);
    assert.deepEqual(s.amenities, ["Free WiFi", "Home-cooked breakfast"]);
    const rooms = await prisma.room.findMany({ orderBy: { sortOrder: "asc" } });
    assert.deepEqual(rooms.map((x) => [x.id, x.pricePerNight, x.capacity, x.active, x.images.length]), [["1", 2200, 2, true, 0], ["2", 3200, 4, true, 0]]);
    assert.equal(rooms[0]!.description, "Opens onto the garden.", "description defaults to the one-liner");

    assert.ok(r.password && r.recoveryCode);
    assert.equal(await attemptLogin(r.password, "1.1.1.1"), "ok");
    assert.equal((await recoverWithCode({ code: r.recoveryCode, next: "owner-chosen", confirm: "owner-chosen" }, "1.1.1.1")).ok, true);
  });

  test("nothing is written if any detail or room is wrong — and the result says what", async () => {
    const badRoom = await setupLodge(lodge({ rooms: [{ id: "1", name: "Garden Room", pricePerNight: 0, capacity: 2, bed: "Queen", shortDescription: "x" }] }));
    assert.equal(badRoom.ok, false);
    assert.match(!badRoom.ok ? badRoom.error : "", /Room 1: price/i);
    const badSettings = await setupLodge(lodge({ settings: { ...lodge().settings, upiId: "nope" } }));
    assert.equal(badSettings.ok, false);
    assert.match(!badSettings.ok ? badSettings.error : "", /upiId/);
    const dupes = await setupLodge(lodge({ rooms: [lodge().rooms[0]!, lodge().rooms[0]!] }));
    assert.match(!dupes.ok ? dupes.error : "", /twice/);
    assert.equal(await prisma.room.count(), 0);
    assert.equal(await prisma.settings.count(), 0);
    assert.equal(await prisma.ownerLogin.count(), 0);
  });

  test("refuses a database that already belongs to another lodge, unless forced", async () => {
    assert.ok((await setupLodge(lodge())).ok);
    const other = await setupLodge(lodge({ settings: { ...lodge().settings, name: "Hill View Rooms" } }));
    assert.equal(other.ok, false);
    assert.match(!other.ok ? other.error : "", /already belongs to Green Valley Homestay/);
    assert.equal((await getSettings()).name, "Green Valley Homestay", "untouched");
    assert.ok((await setupLodge(lodge({ settings: { ...lodge().settings, name: "Hill View Rooms" } }), { force: true })).ok);

    // An older install: rooms, but no saved settings yet.
    await resetDb();
    await prisma.room.create({
      data: { id: "101", name: "Old", type: "Old", pricePerNight: 1000, capacity: 2, bed: "Queen", ac: false, size: "", floor: 1, shortDescription: "x", description: "x", amenities: [], images: [] },
    });
    const legacy = await setupLodge(lodge());
    assert.match(!legacy.ok ? legacy.error : "", /already has rooms/);
  });

  test("running it again updates the lodge and keeps the owner's password unless asked to reset it", async () => {
    const first = await setupLodge(lodge());
    assert.ok(first.ok);
    const again = await setupLodge(lodge({ rooms: [{ ...lodge().rooms[0]!, pricePerNight: 2500 }] }));
    assert.ok(again.ok);
    assert.equal(again.password, null, "password kept");
    assert.equal(await attemptLogin(first.password!, "1.1.1.1"), "ok");
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { id: "1" } })).pricePerNight, 2500);
    assert.equal(await prisma.room.count(), 2, "rooms not in the file are left alone");

    const reset = await setupLodge(lodge(), { resetPassword: true });
    assert.ok(reset.ok && reset.password);
    assert.equal(await attemptLogin(first.password!, "1.1.1.1"), "wrong");
    assert.equal(await attemptLogin(reset.password, "1.1.1.1"), "ok");
  });
});
