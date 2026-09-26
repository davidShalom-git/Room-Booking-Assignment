import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  toInstant,
  istDate,
  istTime,
  parseDateText,
  parseNights,
  parseEnquiry,
} from "../src/lib/dates";
import { enquiryMessage } from "../src/lib/enquiry";

describe("IST conversion", () => {
  test("toInstant treats date+time as +05:30", () => {
    assert.equal(toInstant("2026-10-12", "13:00").toISOString(), "2026-10-12T07:30:00.000Z");
  });
  test("istDate rolls to the next IST day after 18:30Z", () => {
    assert.equal(istDate(new Date("2026-10-12T19:00:00Z")), "2026-10-13");
    assert.equal(istDate(new Date("2026-10-12T18:29:59Z")), "2026-10-12");
  });
  test("istTime reads the wall clock in IST", () => {
    assert.equal(istTime(new Date("2026-10-12T19:00:00Z")), "00:30");
    assert.equal(istTime(new Date("2026-10-12T07:30:00Z")), "13:00");
  });
  test("round trip", () => {
    const d = toInstant("2026-12-31", "23:30");
    assert.equal(istDate(d), "2026-12-31");
    assert.equal(istTime(d), "23:30");
  });
});

describe("parseDateText", () => {
  const today = "2026-10-12";
  test("today / tomorrow", () => {
    assert.equal(parseDateText("today", today), "2026-10-12");
    assert.equal(parseDateText(" Tomorrow ", today), "2026-10-13");
  });
  test("numeric formats", () => {
    assert.equal(parseDateText("15/10", today), "2026-10-15");
    assert.equal(parseDateText("15-10-2026", today), "2026-10-15");
    assert.equal(parseDateText("15/10/26", today), "2026-10-15");
    assert.equal(parseDateText("2026-10-15", today), "2026-10-15");
  });
  test("month names, either order", () => {
    assert.equal(parseDateText("15 oct", today), "2026-10-15");
    assert.equal(parseDateText("oct 15", today), "2026-10-15");
    assert.equal(parseDateText("15th October 2026", today), "2026-10-15");
    assert.equal(parseDateText("Check-in: 10 Sep 2026", "2026-09-01"), "2026-09-10");
  });
  test("no year picks the next occurrence", () => {
    assert.equal(parseDateText("12/10", "2026-10-20"), "2027-10-12");
    assert.equal(parseDateText("12/10", "2026-10-12"), "2026-10-12");
  });
  test("past dates and garbage are rejected", () => {
    assert.equal(parseDateText("1 jan 2020", today), null);
    assert.equal(parseDateText("2026-10-11", today), null);
    assert.equal(parseDateText("next friday-ish", today), null);
    assert.equal(parseDateText("🙂", today), null);
    assert.equal(parseDateText("", today), null);
    assert.equal(parseDateText("31/02", today), null);
    assert.equal(parseDateText("32/10", today), null);
    assert.equal(parseDateText("0/10", today), null);
  });
});

describe("parseNights", () => {
  test("accepts 1..30", () => {
    assert.equal(parseNights("2"), 2);
    assert.equal(parseNights("2 nights"), 2);
    assert.equal(parseNights("for 3 nights"), 3);
    assert.equal(parseNights("1 night"), 1);
    assert.equal(parseNights("30"), 30);
  });
  test("rejects everything else", () => {
    for (const bad of ["0", "-3", "31", "1000", "abc", "", "2.5", "🙂"]) {
      assert.equal(parseNights(bad), null, bad);
    }
  });
});

describe("parseEnquiry", () => {
  test("reads the website's enquiry message", () => {
    const msg = enquiryMessage({
      room: { id: "101", name: "Deluxe Double Room", pricePerNight: 1800 },
      checkIn: "2026-09-10",
      checkOut: "2026-09-12",
      guests: 2,
    });
    assert.deepEqual(parseEnquiry(msg, "2026-09-01"), {
      roomId: "101",
      checkIn: "2026-09-10",
      checkOut: "2026-09-12",
      guests: 2,
    });
  });
  test("reads the QR message with a room URL", () => {
    const msg =
      "Hi! I'm interested in *Room 104 — Garden Twin Room* at The Coral Courtyard.\nCould you tell me about availability?\nhttps://x.vercel.app/rooms/104";
    assert.deepEqual(parseEnquiry(msg, "2026-09-01"), { roomId: "104" });
  });
  test("room only from a URL", () => {
    assert.deepEqual(parseEnquiry("see https://x.app/rooms/203 please", "2026-09-01"), { roomId: "203" });
  });
  test("nothing recognisable", () => {
    assert.deepEqual(parseEnquiry("hello there", "2026-09-01"), {});
  });
});
