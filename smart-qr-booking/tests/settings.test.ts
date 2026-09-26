/**
 * The property's details — name, contact, times, advance, UPI, photos — edited by the owner at
 * /admin/settings instead of in code, so a lodge can be handed over and run without a developer.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../src/lib/settings";
import { resetDb } from "./helpers/db";

/** A complete, valid settings form, as the owner would submit it. */
const form = (over: Record<string, string> = {}): Record<string, string> => ({
  name: "Green Valley Homestay",
  tagline: "A quiet farm stay in the hills",
  city: "Munnar, Kerala",
  address: "Chithirapuram, Munnar, Kerala 685565",
  phone: "94470 12345",
  email: "hello@greenvalley.example",
  about: "Four rooms on a working cardamom farm, twenty minutes above Munnar town.",
  directions: "Munnar bus stand is 9 km; we can pick you up.",
  amenities: "Free WiFi\nHome-cooked meals\nPlantation walk",
  rating: "4.6",
  reviews: "58",
  checkInTime: "12:00",
  checkOutTime: "10:30",
  advancePercent: "30",
  upiId: "greenvalley@okaxis",
  upiName: "Green Valley Homestay",
  photos: "/photos/abc123\nhttps://images.example.com/farm.jpg",
  ...over,
});

const saved = process.env["UPI_ID"];
beforeEach(async () => {
  await resetDb();
  process.env["UPI_ID"] = "env-upi@okicici";
});
afterEach(() => {
  process.env["UPI_ID"] = saved;
});

describe("settings", () => {
  test("with nothing saved, the demo property's details are used, with the UPI ID from the environment", async () => {
    const s = await getSettings();
    assert.equal(s.name, DEFAULT_SETTINGS.name);
    assert.equal(s.advancePercent, 50);
    assert.equal(s.checkInTime, "13:00");
    assert.equal(s.upiId, "env-upi@okicici");
  });

  test("saved details replace the defaults and the environment's UPI ID", async () => {
    assert.deepEqual(await saveSettings(form()), { ok: true, message: "Saved." });
    const s = await getSettings();
    assert.equal(s.name, "Green Valley Homestay");
    assert.equal(s.upiId, "greenvalley@okaxis");
    assert.equal(s.advancePercent, 30);
    assert.equal(s.checkOutTime, "10:30");
    assert.equal(s.rating, 4.6);
    assert.equal(s.reviews, 58);
    assert.deepEqual(s.amenities, ["Free WiFi", "Home-cooked meals", "Plantation walk"]);
    assert.deepEqual(s.photos, ["/photos/abc123", "https://images.example.com/farm.jpg"]);
  });

  test("the front-desk phone is stored as digits with the country code", async () => {
    await saveSettings(form({ phone: "94470 12345" }));
    assert.equal((await getSettings()).phone, "919447012345");
  });

  test("rating, reviews, email and directions are optional", async () => {
    assert.equal((await saveSettings(form({ rating: "", reviews: "", email: "", directions: "" }))).ok, true);
    const s = await getSettings();
    assert.equal(s.rating, null);
    assert.equal(s.reviews, null);
    assert.equal(s.email, "");
    assert.equal(s.directions, "");
  });

  test("each field is checked, and the result says which one is wrong", async () => {
    const bad: [Record<string, string>, string][] = [
      [{ name: "" }, "name"],
      [{ tagline: "x".repeat(121) }, "tagline"],
      [{ city: "" }, "city"],
      [{ address: "" }, "address"],
      [{ phone: "12345" }, "phone"],
      [{ email: "not-an-email" }, "email"],
      [{ about: "" }, "about"],
      [{ amenities: Array.from({ length: 13 }, (_, i) => `Thing ${i}`).join("\n") }, "amenities"],
      [{ rating: "6" }, "rating"],
      [{ reviews: "-3" }, "reviews"],
      [{ checkInTime: "25:00" }, "checkInTime"],
      [{ checkOutTime: "14:00", checkInTime: "12:00" }, "checkOutTime"], // no same-day turnover
      [{ advancePercent: "5" }, "advancePercent"],
      [{ advancePercent: "abc" }, "advancePercent"],
      [{ upiId: "not a upi" }, "upiId"],
      [{ upiName: "" }, "upiName"],
      [{ photos: "http://insecure.example.com/a.jpg" }, "photos"],
      [{ photos: Array.from({ length: 7 }, (_, i) => `/photos/p${i}`).join("\n") }, "photos"],
    ];
    for (const [over, field] of bad) {
      const r = await saveSettings(form(over));
      assert.equal(r.ok, false, JSON.stringify(over));
      assert.equal(!r.ok && r.field, field, JSON.stringify(over));
    }
    assert.equal(await prisma.settings.count(), 0, "nothing invalid was saved");
  });

  test("a saved row from before a field existed still gets that field's default", async () => {
    await prisma.settings.create({ data: { id: 1, data: { name: "Old Save" } } });
    const s = await getSettings();
    assert.equal(s.name, "Old Save");
    assert.equal(s.checkOutTime, DEFAULT_SETTINGS.checkOutTime);
    assert.equal(s.upiId, "env-upi@okicici");
  });
});

describe("the chat and bookings follow the saved settings", () => {
  test("name, front-desk phone, check-in time, advance and UPI ID", async () => {
    const { prismaPorts } = await import("../src/lib/bot/ports-prisma");
    const { world, bookUpToReview, GUEST } = await import("./helpers/chat");
    const { seedRooms } = await import("./helpers/db");
    await seedRooms([{ id: "101", price: 2000, name: "Deluxe Double Room" }]);
    await saveSettings(form());
    const w = world(prismaPorts({ now: new Date("2026-10-01T10:00:00Z") }));

    await w.say(GUEST, "hi");
    assert.match(w.lastTo(GUEST)!.text, /Welcome to Green Valley Homestay/);
    await w.say(GUEST, "can I talk to the desk");
    assert.match(w.lastTo(GUEST)!.text, /call the front desk on \+91 94470 12345/);

    await bookUpToReview(w, { checkIn: "12 oct", checkOut: "14 oct" });
    assert.match(w.lastTo(GUEST)!.text, /Check-in: 12 Oct 2026, 12:00 PM/);
    assert.match(w.lastTo(GUEST)!.text, /30% advance to confirm: ₹1,200/);
    await w.tap(GUEST, "confirm");
    assert.match(w.lastTo(GUEST)!.text, /greenvalley@okaxis/);

    const b = await prisma.booking.findFirstOrThrow({ include: { payments: true } });
    assert.equal(b.payments[0]!.amount, 1200, "30% of ₹4,000");
    assert.equal(b.checkOutAt.toISOString(), "2026-10-14T05:00:00.000Z", "10:30 IST");
  });
});
