/**
 * The website chat: the booking assistant on the lodge's own website.
 * A chat is identified by a random key ("web:<id>", kept in a cookie), not by a phone number,
 * because a number typed on a website is unverified.
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { prismaPorts } from "../src/lib/bot/ports-prisma";
import { deliver } from "../src/lib/deliver";
import { chatSend, chatMessages, newChatKey, webPorts } from "../src/lib/web-chat";
import { acknowledgeAsAdmin } from "../src/lib/admin-ops";
import { resetDb, seedRooms } from "./helpers/db";
import { OWNER_PUSH } from "../src/lib/bot/types";
import { world, qrText } from "./helpers/chat";

const WEB = "web:AAAAAAAAAAAAAAAAAAAAAA";
const WEB2 = "web:BBBBBBBBBBBBBBBBBBBBBB";
const TYPED = "919845021133";
const clock = { now: new Date("2026-10-01T10:00:00Z") };
let w: ReturnType<typeof world>;

before(() => {
  process.env["UPI_ID"] = "coral@upi";
});
beforeEach(async () => {
  clock.now = new Date("2026-10-01T10:00:00Z");
  await resetDb();
  await seedRooms([{ id: "101", price: 1800, name: "Deluxe Double Room" }, { id: "102", price: 1500 }]);
  w = world(webPorts(prismaPorts(clock), "1.2.3.4"));
});

const pending = () => prisma.booking.findMany({ where: { status: "PENDING" }, orderBy: { seq: "asc" } });

/** Book Room 101 12 -> 14 Oct from a website chat, up to the unpaid hold. */
async function webHold(chat = WEB, phone = "98450 21133") {
  await w.say(chat, qrText("101"));
  await w.tap(chat, "book");
  await w.say(chat, "Asha Nair");
  await w.say(chat, phone);
  await w.say(chat, "2");
  await w.say(chat, "12 oct");
  await w.say(chat, "14 oct");
  await w.tap(chat, "confirm");
  return (await pending()).find((b) => b.chatKey === chat)!;
}

describe("booking in the website chat", () => {
  test("asks for the guest's mobile number and books under it, tied to this chat", async () => {
    await w.say(WEB, qrText("101"));
    await w.tap(WEB, "book");
    await w.say(WEB, "Asha Nair");
    const ask = w.lastTo(WEB)!;
    assert.match(ask.text, /mobile number/i);
    assert.deepEqual(w.ids(ask), [], "no 'This number' button on the website");
    await w.say(WEB, "yes");
    assert.match(w.lastTo(WEB)!.text, /mobile number/i, "a number is required");
    await w.say(WEB, "98450 21133");
    await w.say(WEB, "2");
    await w.say(WEB, "12 oct");
    await w.say(WEB, "14 oct");
    assert.match(w.lastTo(WEB)!.text, /Phone: \+91 98450 21133/);
    await w.tap(WEB, "confirm");
    const b = (await pending())[0]!;
    assert.deepEqual([b.guestPhone, b.chatKey, b.source, b.contactPhone], [TYPED, WEB, "WEB", null]);
    assert.ok(w.lastTo(WEB)!.text.includes(`/pay/${b.id}`));
  });

  test("the owner app gets the payment to check, and acknowledging it puts the confirmation in the chat", async () => {
    const h = await webHold();
    await w.tap(WEB, `i_paid:${h.id}`);
    await w.say(WEB, "412345678901");
    const p = await prisma.payment.findFirstOrThrow({ where: { bookingId: h.id } });
    assert.deepEqual(w.ids(w.lastTo(OWNER_PUSH)), [`ack:${p.id}`, `nack:${p.id}`]);
    assert.ok((await acknowledgeAsAdmin(p.id, "")).ok);
    assert.match((await chatMessages(WEB)).at(-1)!.text, /Booking confirmed/);
  });

  test("another chat can't see or touch the booking", async () => {
    const h = await webHold();
    await w.say(WEB2, "what's my booking status?");
    assert.match(w.lastTo(WEB2)!.text, /couldn't find an upcoming booking/);
    await w.tap(WEB2, `cancel_hold:${h.id}`);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).status, "PENDING");
    await w.say(WEB, "what's my booking status?");
    assert.match(w.lastTo(WEB)!.text, /HTL-/, "its own chat still sees it");
  });

  test("a website visitor is never offered a name from someone else's account", async () => {
    await prisma.customer.create({ data: { phone: TYPED, name: "Someone Else" } });
    await w.say(WEB, qrText("101"));
    await w.tap(WEB, "book");
    assert.doesNotMatch(w.lastTo(WEB)!.text, /Someone/);
  });

  test("one network can hold at most 3 rooms an hour", async () => {
    const ports = webPorts(prismaPorts(clock), "5.6.7.8");
    const hold = (i: number) =>
      ports.createHold({
        roomId: i % 2 ? "101" : "102", guestName: "X", guestPhone: `9198450211${30 + i}`, guests: 1,
        checkIn: `2026-11-${10 + i}`, checkOut: `2026-11-${11 + i}`, chatKey: `web:CCCCCCCCCCCCCCCCCCCCC${i}`,
      });
    for (let i = 0; i < 3; i++) assert.equal((await hold(i)).ok, true, `hold ${i + 1}`);
    const fourth = await hold(3);
    assert.equal(fourth.ok, false);
    assert.match(!fourth.ok ? fourth.message : "", /too many/i);
  });
});

describe("the chat transcript", () => {
  test("what the guest says and the bot answers is stored in order; later messages can be fetched after an id", async () => {
    const key = newChatKey();
    assert.match(key, /^web:[A-Za-z0-9_-]{22}$/);
    assert.equal((await chatSend(key, { text: "hi" }, { ip: "1.2.3.4" })).ok, true);
    const all = await chatMessages(key);
    assert.deepEqual(all.map((m) => m.fromGuest), [true, false]);
    assert.equal(all[0]!.text, "hi");
    assert.ok(all[1]!.list && all[1]!.list.rows.length > 0, "the room list comes with the answer");
    assert.equal((await chatMessages(key, all[0]!.id)).length, 1);
  });

  test("a tapped button shows as its title", async () => {
    const key = newChatKey();
    await chatSend(key, { text: "hi" }, { ip: "1.2.3.4" });
    await chatSend(key, { button: "pick:101", title: "Room 101 · ₹1,800" }, { ip: "1.2.3.4" });
    const guest = (await chatMessages(key)).filter((m) => m.fromGuest).map((m) => m.text);
    assert.deepEqual(guest, ["hi", "Room 101 · ₹1,800"]);
  });

  test("the assistant's messages for a website chat are stored for it", async () => {
    await deliver([{ to: WEB, text: "Your booking is confirmed", buttons: [{ id: "x", title: "X" }] }]);
    const m = await chatMessages(WEB);
    assert.deepEqual(m.map((x) => [x.fromGuest, x.text]), [[false, "Your booking is confirmed"]]);
    assert.deepEqual(m[0]!.buttons, [{ id: "x", title: "X" }]);
  });

  test("the owner confirming from the console tells a website-chat guest in their chat", async () => {
    const h = await webHold();
    await w.tap(WEB, `i_paid:${h.id}`);
    await w.say(WEB, "412345678901");
    const p = await prisma.payment.findFirstOrThrow({ where: { bookingId: h.id } });
    assert.ok((await acknowledgeAsAdmin(p.id, "")).ok);
    assert.match((await chatMessages(WEB)).at(-1)!.text, /Booking confirmed/);
  });

  test("bad input is refused: unknown chat keys, empty or very long text, flooding", async () => {
    assert.equal((await chatSend("919812345678", { text: "hi" }, { ip: "1.2.3.4" })).ok, false);
    const key = newChatKey();
    assert.equal((await chatSend(key, { text: "   " }, { ip: "1.2.3.4" })).ok, false);
    assert.equal((await chatSend(key, { text: "x".repeat(1001) }, { ip: "1.2.3.4" })).ok, false);
    let refused = 0;
    for (let i = 0; i < 25; i++) if (!(await chatSend(key, { text: "menu" }, { ip: "9.9.9.9" })).ok) refused++;
    assert.ok(refused >= 5, `refused ${refused}`);
  });
});
