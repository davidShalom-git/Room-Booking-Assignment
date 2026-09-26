import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  nights,
  bookingTotal,
  formatINR,
  formatDate,
  formatTime,
  formatDateTime,
  makeBookingId,
  addDays,
  todayISO,
} from "../src/lib/pricing";

describe("pricing", () => {
  test("nights", () => {
    assert.equal(nights("2026-09-10", "2026-09-12"), 2);
    assert.equal(nights("2026-09-12", "2026-09-10"), 0);
    assert.equal(nights("garbage", "2026-09-12"), 0);
    assert.equal(nights("2026-03-28", "2026-04-02"), 5);
  });
  test("totals and formatting", () => {
    assert.equal(bookingTotal(1800, 2), 3600);
    assert.equal(bookingTotal(1800, -1), 0);
    assert.equal(formatINR(3600), "₹3,600");
    assert.equal(formatINR(1200000), "₹12,00,000");
    assert.equal(formatDate("2026-09-10"), "10 Sep 2026");
    assert.equal(formatTime("13:00"), "1:00 PM");
    assert.equal(formatTime("00:30"), "12:30 AM");
    assert.equal(formatDateTime("2026-09-10", "11:00"), "10 Sep 2026, 11:00 AM");
  });
  test("booking id and addDays", () => {
    assert.equal(makeBookingId("2026-09-10", 1), "HTL-20260910-001");
    assert.equal(makeBookingId("2026-09-10", 1234), "HTL-20260910-1234");
    assert.equal(addDays("2026-09-10", 2), "2026-09-12");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
  test("todayISO is the IST calendar day, not the server's", () => {
    assert.equal(todayISO(new Date("2026-10-12T19:00:00Z")), "2026-10-13");
    assert.equal(todayISO(new Date("2026-10-12T18:29:00Z")), "2026-10-12");
  });
});
