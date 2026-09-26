import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { bookingRef, createBooking } from "../src/lib/engine";
import { istDate } from "../src/lib/dates";
import { claimPayment } from "../src/lib/payments";
import { addDays, todayISO } from "../src/lib/pricing";
import { acknowledgeAsAdmin, rejectAsAdmin, balanceReceived, importBookings } from "../src/lib/admin-ops";
import { listPayments, listCustomers, dashboardData, listBookings } from "../src/lib/admin-data";
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

/** A hold made in the website chat, with its UTR sent. */
async function claimed(roomId = "101") {
  const b = await createBooking({
    roomId, guestName: "Asha Nair", guestPhone: GUEST_PHONE, chatKey: GUEST, guests: 2, checkIn: inDays(10), checkOut: inDays(12),
    status: "PENDING", source: "WEB",
  });
  assert.ok(b.ok);
  const c = await claimPayment(b.value.id, "412345678901");
  assert.ok(c.ok);
  return { b: b.value, p: c.value };
}

describe("acknowledging payments from the console", () => {
  test("acknowledge confirms, records the money, and tells the guest in their chat", async () => {
    const { b, p } = await claimed();
    const r = await acknowledgeAsAdmin(p.id, "");
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "CONFIRMED");
    assert.match((await toGuest())[0]!.text, /Booking confirmed/);
  });

  test("acknowledging twice doesn't message the guest twice; a different amount can be recorded", async () => {
    const { b, p } = await claimed();
    assert.ok((await acknowledgeAsAdmin(p.id, "3600")).ok);
    const again = await acknowledgeAsAdmin(p.id, "");
    assert.ok(again.ok);
    assert.match(again.ok ? again.message ?? "" : "", /already/i);
    assert.equal((await toGuest()).length, 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).advancePaid, 3600);
    assert.equal((await acknowledgeAsAdmin("nope", "")).ok, false);
  });

  test("not received: the guest is asked to check, with the pay link", async () => {
    const { b, p } = await claimed();
    assert.ok((await rejectAsAdmin(p.id)).ok);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status, "REJECTED");
    const msg = (await toGuest())[0]!.text;
    assert.match(msg, /couldn't find/);
    assert.ok(msg.includes(`/pay/${b.id}`));
  });

  test("not received twice doesn't message the guest twice", async () => {
    const { p } = await claimed();
    assert.ok((await rejectAsAdmin(p.id)).ok);
    const again = await rejectAsAdmin(p.id);
    assert.ok(again.ok);
    assert.match(again.ok ? again.message ?? "" : "", /already/i);
    assert.equal((await toGuest()).length, 1);
  });

  test("balance received at check-in settles the booking", async () => {
    const { b, p } = await claimed();
    await acknowledgeAsAdmin(p.id, "");
    const r = await balanceReceived(b.id);
    assert.ok(r.ok);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).advancePaid, 3600);
    assert.equal((await balanceReceived(b.id)).ok, false);
  });
});

describe("console data", () => {
  test("payments list with filters; customers with stays and money paid; claims on the dashboard", async () => {
    const { p } = await claimed();
    await createBooking({
      roomId: "103", guestName: "Ravi Menon", guestPhone: "919000000002", guests: 2,
      checkIn: inDays(3), checkOut: inDays(4), status: "CONFIRMED", source: "ADMIN", advancePaid: 1000,
    });
    const all = await listPayments({});
    assert.equal(all.length, 2);
    assert.deepEqual((await listPayments({ status: "claimed" })).map((x) => x.id), [p.id]);
    assert.deepEqual((await listPayments({ q: "412345678901" })).map((x) => x.id), [p.id]);
    const customers = await listCustomers();
    const asha = customers.find((c) => c.phone === GUEST_PHONE)!;
    assert.equal(asha.stays, 1);
    assert.equal(asha.paid, 0);
    assert.equal(customers.find((c) => c.phone === "919000000002")!.paid, 1000);
    assert.deepEqual((await listCustomers("ravi")).map((c) => c.name), ["Ravi Menon"]);
    const d = await dashboardData();
    assert.deepEqual(d.claims.map((x) => x.id), [p.id]);
    const rows = await listBookings({ when: "all" });
    assert.equal(rows.find((r) => r.guestPhone === GUEST_PHONE)?.openPayment?.status, "CLAIMED");
  });
});

describe("a UTR used twice", () => {
  test("is flagged on the dashboard and the payments page, not only in the owner alert", async () => {
    const first = await claimed("101");
    const second = await claimed("102"); // same UTR
    const d = await dashboardData();
    const flag = (id: string) => d.claims.find((c) => c.id === id)?.duplicateRef;
    assert.equal(flag(second.p.id), bookingRef(first.b));
    assert.equal(flag(first.p.id), bookingRef(second.b));
    const rows = await listPayments({});
    assert.equal(rows.find((r) => r.id === second.p.id)?.duplicateRef, bookingRef(first.b));
  });
});

describe("importing existing bookings", () => {
  test("creates confirmed bookings, reports bad rows and clashes, and is safe to re-run", async () => {
    const csv = [
      "room,guest name,phone,check-in,check-out,guests,advance paid",
      `101,Meera Pillai,+91 98470 11111,${inDays(2)},${inDays(4)},2,1000`,
      `"102","Kumar, S.",9847022222,${inDays(2).split("-").reverse().join("/")},${inDays(3).split("-").reverse().join("/")},1,0`,
      `999,Ghost,9847033333,${inDays(2)},${inDays(3)},1,0`,
      `101,Clash Person,9847044444,${inDays(3)},${inDays(5)},1,0`,
      `103,No Dates,9847055555,soon,later,1,0`,
      ``,
    ].join("\n");
    const r = await importBookings(csv);
    assert.equal(r.created.length, 2);
    assert.deepEqual(r.errors.map((e) => e.line), [4, 5, 6]);
    assert.match(r.errors[1]!.error, /already booked/);
    const kumar = await prisma.booking.findFirstOrThrow({ where: { guestName: "Kumar, S." } });
    assert.equal(kumar.guestPhone, "919847022222");
    assert.equal(kumar.status, "CONFIRMED");
    const meera = await prisma.booking.findFirstOrThrow({ where: { guestName: "Meera Pillai" } });
    assert.equal(meera.advancePaid, 1000);
    const again = await importBookings(csv);
    assert.equal(again.created.length, 0, "the same rows clash with themselves the second time");
  });

  test("year-first and month-name dates import to the right year; a date that isn't really that year is refused", async () => {
    const r = await importBookings([
      "101,Slash Date,9847066666,2031/10/30,2031/11/02,1,0",
      "102,Month Name,9847077777,12-Oct-2031,14-Oct-2031,1,0",
      "103,Odd Date,9847088888,10/12 2031,11/12 2031,1,0",
    ].join("\n"));
    assert.deepEqual(r.errors.map((e) => e.line), [3]);
    const at = async (name: string) => {
      const b = await prisma.booking.findFirstOrThrow({ where: { guestName: name } });
      return [istDate(b.checkInAt), istDate(b.checkOutAt)];
    };
    assert.deepEqual(await at("Slash Date"), ["2031-10-30", "2031-11-02"]);
    assert.deepEqual(await at("Month Name"), ["2031-10-12", "2031-10-14"]);
  });
});
