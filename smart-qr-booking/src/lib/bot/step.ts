/**
 * The booking assistant in the website chat:
 *
 *   step(conversation, event, ports) -> { conversation, messages }
 *
 * Ask about a room → book (name, mobile number, guests, check-in, check-out) → hold + pay link →
 * "I've paid" + UTR → the owner acknowledges in the owner app → confirmed, in this chat. Near the
 * end of the stay: extend (same room if free, otherwise the guest picks a free room), paid in full,
 * acknowledged the same way.
 *
 * A chat is identified by its key ("web:<id>"), never by a phone number: a number typed on a
 * website proves nothing, so a chat only ever sees and acts on the bookings it made. Button ids
 * carry their own state, so any tap is self-contained and safe to repeat.
 *
 * All I/O goes through `ports` (the database, via ports-prisma.ts).
 */
import { config } from "@/config";
import { istDate, parseDateText, parseEnquiry, parseNights } from "@/lib/dates";
import { addDays, formatINR, nights as nightsBetween } from "@/lib/pricing";
import { normalizePhone, validPhone } from "@/lib/phone";
import * as C from "./copy";
import { OWNER_PUSH, type BookingView, type ConvState, type InEvent, type Out, type PaymentView, type Ports, type RoomInfo, type StayView, type StepResult } from "./types";

type Ctx = { conv: ConvState; ports: Ports; out: Out[]; today: string };
type Buttons = NonNullable<Out["buttons"]>;

const MAX_NIGHTS = config.defaults.maxNights;

// --- entry points --------------------------------------------------------------

export async function step(prev: ConvState, ev: InEvent, ports: Ports): Promise<StepResult> {
  const c: Ctx = {
    conv: { ...prev, draft: { ...prev.draft } },
    ports,
    out: [],
    today: istDate(ports.now()),
  };
  if (ev.kind === "button" && ev.id === "restart") {
    resetFlow(c);
    await intro(c);
  } else if (!(await syncHold(c))) {
    if (ev.kind === "button") await onButton(c, ev.id);
    else await onText(c, ev.text);
  }
  return { conv: c.conv, out: c.out };
}

/**
 * Cron: the "last day tomorrow — extend or check out?" message, once per booking per date, into
 * the chat the stay was booked from. The claim is recorded on the booking.
 */
export async function lastDayNudges(ports: Ports, tomorrow: string): Promise<Out[]> {
  const out: Out[] = [];
  for (const b of await ports.checkingOutOn(tomorrow)) {
    if (!b.chat || !(await ports.claimNudge(b.id, tomorrow))) continue;
    out.push({
      to: b.chat,
      text: C.nudge(b),
      buttons: [
        { id: `want_extend:${b.id}`, title: "Extend my stay" },
        { id: `want_out:${b.id}`, title: "Check out" },
      ],
    });
  }
  return out;
}

// --- small helpers ------------------------------------------------------------

const say = (c: Ctx, text: string, extra: Partial<Out> = {}) => void c.out.push({ to: c.conv.chat, text, ...extra });
/** A notification in the owner app. */
const alertOwner = (c: Ctx, text: string, buttons?: Buttons) =>
  void c.out.push({ to: OWNER_PUSH, text, ...(buttons ? { buttons } : {}) });

const MENU: Buttons = [
  { id: "info", title: "About this room" },
  { id: "avail", title: "Check availability" },
  { id: "book", title: "Book this room" },
];
const payButtons = (b: Pick<BookingView, "id">): Buttons => [
  { id: `i_paid:${b.id}`, title: "I've paid" },
  { id: `cancel_hold:${b.id}`, title: "Cancel booking" },
];

function resetFlow(c: Ctx) {
  const { checkoutAcked } = c.conv.draft;
  c.conv.stage = "browsing";
  c.conv.draft = checkoutAcked ? { checkoutAcked } : {};
}

const roomOf = async (c: Ctx) => (c.conv.roomId ? c.ports.room(c.conv.roomId) : null);

function cleanName(raw: string): string | null {
  let n = raw
    .trim()
    .replace(/^(my name is|name is|it's|its|this is|i am|i'm|im|book it under|under)\s+/i, "")
    .replace(/[.!,;:]+$/, "")
    .trim();
  if (n.length < 2 || n.length > 60) return null;
  if (!/\p{L}/u.test(n) || /\d{3,}/.test(n)) return null;
  if (n === n.toLowerCase() || n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return n;
}

/**
 * A 12-digit UPI reference anywhere in the text ("paid, UTR 4123 4567 8901") — but not a phone
 * number: one written with a "+" ("+91 98450 21133"), or the number given for this booking.
 */
function findUtr(text: string, ownPhone: string | undefined): string | null {
  const joined = text.replace(/(\d)[\s-]+(?=\d)/g, "$1");
  for (const m of joined.matchAll(/(?:^|[^\d+])(\d{12})(?!\d)/g)) if (m[1] !== ownPhone) return m[1]!;
  return null;
}

/**
 * While paying, keep the chat in step with the booking: the owner may have acknowledged it
 * (carry on normally), or an unpaid hold may have lapsed (tell the guest, once). A lapsed hold
 * whose payment is already with the desk isn't "expired" for the guest — the desk decides.
 * Returns true when a message was sent and the event is fully handled.
 */
async function syncHold(c: Ctx): Promise<boolean> {
  if (c.conv.stage !== "awaiting_payment" && c.conv.stage !== "need_utr") return false;
  const b = c.conv.draft.bookingId ? await c.ports.booking(c.conv.draft.bookingId) : null;
  if (b?.status === "PENDING") return false;
  if (b && b.status === "CANCELLED" && b.holdExpiresAt !== null) {
    if ((await c.ports.openPayment(b.id))?.status === "CLAIMED") return false;
    resetFlow(c);
    say(c, C.holdExpired(b), { buttons: [{ id: "restart", title: "Start again" }] });
    return true;
  }
  resetFlow(c);
  return false;
}

type Hold = { b: BookingView; p: PaymentView | null };

/** The unpaid hold (stay or extension) this chat is paying for — or `id`'s, if this chat made it. */
async function currentHold(c: Ctx, id?: string): Promise<Hold | null> {
  const bookingId = id || c.conv.draft.bookingId;
  if (!bookingId) return null;
  const b = await c.ports.booking(bookingId);
  if (!b || b.chat !== c.conv.chat) return null;
  const p = await c.ports.openPayment(b.id);
  const lapsedButClaimed = b.status === "CANCELLED" && b.holdExpiresAt !== null && p?.status === "CLAIMED";
  if (b.status !== "PENDING" && !lapsedButClaimed) return null;
  c.conv.draft.bookingId = b.id;
  return { b, p };
}
const owed = (h: Hold) => h.p?.amount ?? (h.b.parentId ? h.b.total : C.advanceOf(h.b.total));

async function intro(c: Ctx) {
  const room = await roomOf(c);
  if (!room) return welcome(c);
  say(c, C.intro(room), { buttons: MENU });
}

async function welcome(c: Ctx) {
  c.conv.roomId = null;
  const rooms = (await c.ports.rooms()).slice(0, 10);
  say(c, C.welcome(), {
    list: {
      button: "Choose a room",
      rows: rooms.map((r) => ({ id: `pick:${r.id}`, title: `Room ${r.id} · ${formatINR(r.pricePerNight)}`, description: r.name })),
    },
  });
}

async function menu(c: Ctx) {
  const room = await roomOf(c);
  if (!room) return welcome(c);
  say(c, C.menu(room), { buttons: MENU });
}

const MY_BOOKING = /\b(my|status|check)\b.*\b(booking|bookings|reservation)\b|\bbooking (status|details|id)\b/;
const EXTEND = /\b(extend|extension|stay longer|more nights?|extra nights?)\b/;

async function onText(c: Ctx, raw: string) {
  const t = raw.trim();
  const low = t.toLowerCase();
  if (!t) return menu(c);

  const paying = c.conv.stage === "awaiting_payment" || c.conv.stage === "need_utr";
  if (paying) {
    // Don't lose track of an unpaid hold: "cancel" releases it, "menu" reminds the guest of it.
    if (/^(cancel|stop|cancel (it|booking|hold|my booking|the booking))$/.test(low)) return cancelHoldByGuest(c);
    if (/^(menu|start over|restart|reset)$/.test(low)) return remindPayment(c);
  } else if (/^(menu|start over|restart|reset|cancel|stop)$/.test(low)) {
    resetFlow(c);
    return intro(c);
  }

  if (MY_BOOKING.test(low)) return showMyBookings(c);
  if (!paying && c.conv.stage !== "ext_need_date" && EXTEND.test(low)) return startExtension(c);

  switch (c.conv.stage) {
    case "need_name": return onName(c, t);
    case "need_contact": return onPhone(c, t);
    case "need_guests": return onGuests(c, t);
    case "need_checkin": return onCheckIn(c, t);
    case "need_checkout": return onCheckOut(c, t);
    case "choose_room": return onChooseRoom(c, low);
    case "review": return onReviewText(c, low);
    case "awaiting_payment": return onPaymentText(c, t, low);
    case "need_utr": return onUtr(c, t);
    case "ext_need_date": return onExtendDate(c, t);
    case "ext_choose_room": return onExtChooseText(c, low);
    default: return onBrowsingText(c, t, low);
  }
}

async function showMyBookings(c: Ctx) {
  const list = await c.ports.activeByChat(c.conv.chat);
  if (list.length > 0) return say(c, C.myBookings(list));
  const room = await roomOf(c);
  say(c, C.noBookings(), room ? { buttons: MENU } : {});
}

async function onBrowsingText(c: Ctx, t: string, low: string) {
  if (/^(hi+|hello|hey|namaste|hola)\W*$/.test(low)) return intro(c);
  if (await absorbEntry(c, t)) return;

  const room = await roomOf(c);
  if (/\b(thanks|thank you|thx|ok thanks)\b/.test(low)) return say(c, C.thanks());
  if (/\b(staff|human|reception|desk|call me|talk to)\b/.test(low)) {
    say(c, C.handoff());
    return alertOwner(c, C.ownerHandoff({ room, phone: c.conv.draft.phone }));
  }
  if (!room) return welcome(c);
  if (/\b(book|reserve|reservation)\b/.test(low)) return startBooking(c);
  if (/breakfast/.test(low)) return say(c, C.breakfast());
  if (/price|cost|rate|how much|tariff/.test(low)) return say(c, C.priceText(room));
  if (/avail|vacan|\bfree\b/.test(low)) return startAvailability(c);
  if (/tell me|about|detail|amenit|what.*(room|include)|info/.test(low)) {
    return say(c, C.details(room), { buttons: [{ id: "book", title: "Book this room" }, { id: "avail", title: "Check availability" }] });
  }
  return menu(c);
}

/**
 * A message from the room page / QR code ("Room 101 …", optionally with dates): set the room,
 * and if it carries dates answer availability straight away. Returns true if it handled the text.
 */
async function absorbEntry(c: Ctx, text: string): Promise<boolean> {
  const enq = parseEnquiry(text, c.today);
  if (!enq.roomId) return false;
  const room = await c.ports.room(enq.roomId);
  if (!room) {
    await welcome(c);
    return true;
  }
  c.conv.roomId = room.id;
  if (enq.guests && enq.guests >= 1 && enq.guests <= room.capacity) c.conv.draft.guests = enq.guests;
  if (enq.checkIn && enq.checkOut) {
    const n = nightsBetween(enq.checkIn, enq.checkOut);
    if (n >= 1 && n <= MAX_NIGHTS) {
      c.conv.draft.checkIn = enq.checkIn;
      c.conv.draft.nights = n;
      c.conv.draft.intent = "avail";
      await afterDates(c);
      return true;
    }
  }
  await intro(c);
  return true;
}

// --- booking questions ----------------------------------------------------------

async function startBooking(c: Ctx) {
  c.conv.draft.intent = "book";
  return nextBookingQuestion(c);
}

async function startAvailability(c: Ctx) {
  c.conv.draft.intent = "avail";
  if (c.conv.draft.checkIn && c.conv.draft.nights) return afterDates(c);
  return askCheckIn(c);
}

async function nextBookingQuestion(c: Ctx) {
  const room = await roomOf(c);
  if (!room) return welcome(c);
  const d = c.conv.draft;
  if (!d.name) {
    c.conv.stage = "need_name";
    return say(c, C.askName(room));
  }
  if (!d.phone) {
    c.conv.stage = "need_contact";
    return say(c, C.askPhone());
  }
  if (!d.guests) {
    c.conv.stage = "need_guests";
    const max = Math.min(room.capacity, 3);
    return say(c, C.askGuests(), {
      buttons: Array.from({ length: max }, (_, i) => ({ id: `g:${i + 1}`, title: i === 0 ? "1 guest" : `${i + 1} guests` })),
    });
  }
  if (!d.checkIn) return askCheckIn(c);
  if (!d.nights) return askCheckOut(c);
  return afterDates(c);
}

function askCheckIn(c: Ctx, again?: "unreadable" | "past" | "invalid") {
  c.conv.stage = "need_checkin";
  say(c, again ? C.askCheckInAgain(again) : C.askCheckIn(), {
    buttons: [{ id: "d:today", title: "Today" }, { id: "d:tomorrow", title: "Tomorrow" }],
  });
}

function askCheckOut(c: Ctx) {
  c.conv.stage = "need_checkout";
  say(c, C.askCheckOut(c.conv.draft.checkIn!), {
    buttons: [{ id: "n:1", title: "1 night" }, { id: "n:2", title: "2 nights" }, { id: "n:3", title: "3 nights" }],
  });
}

async function onName(c: Ctx, t: string) {
  const name = cleanName(t);
  if (!name) return say(c, C.askNameAgain());
  c.conv.draft.name = name;
  return nextBookingQuestion(c);
}

/** The number the booking is made under — required: the owner calls it if anything comes up. */
async function onPhone(c: Ctx, t: string) {
  const n = normalizePhone(t);
  if (!validPhone(n)) return say(c, C.askPhoneAgain());
  c.conv.draft.phone = n;
  return nextBookingQuestion(c);
}

async function onGuests(c: Ctx, t: string) {
  const room = await roomOf(c);
  if (!room) return welcome(c);
  const m = /^\s*(\d{1,2})\s*(?:guests?|people|persons?|pax|adults?)?\s*$/i.exec(t);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > room.capacity) return say(c, C.askGuestsAgain(room));
  c.conv.draft.guests = n;
  return nextBookingQuestion(c);
}

async function onCheckIn(c: Ctx, t: string) {
  const date = parseDateText(t, c.today);
  if (!date) {
    const realButPast = parseDateText(t, "2000-01-01") !== null;
    const looksLikeDate = /\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(t);
    return askCheckIn(c, realButPast ? "past" : looksLikeDate ? "invalid" : "unreadable");
  }
  c.conv.draft.checkIn = date;
  delete c.conv.draft.nights;
  return askCheckOut(c);
}

/** A check-out date ("14 oct") or a number of nights ("2"). */
async function onCheckOut(c: Ctx, t: string) {
  const d = c.conv.draft;
  if (!d.checkIn) return askCheckIn(c);
  let n = parseNights(t);
  if (!n) {
    const date = parseDateText(t, c.today);
    if (date) n = nightsBetween(d.checkIn, date);
  }
  if (!n || n < 1 || n > MAX_NIGHTS) return say(c, C.askCheckOutAgain(d.checkIn));
  d.nights = n;
  return afterDates(c);
}

/** Dates are known: answer availability, or move on to the review screen. */
async function afterDates(c: Ctx) {
  const room = await roomOf(c);
  const d = c.conv.draft;
  if (!room || !d.checkIn || !d.nights) return menu(c);
  const checkOut = addDays(d.checkIn, d.nights);
  const free = await c.ports.freeRooms(d.checkIn, checkOut, d.guests ?? 1);
  if (!free.some((r) => r.id === room.id)) return offerAlternatives(c, room, d.checkIn, checkOut, free);
  if (d.intent === "book" && d.name && d.phone && d.guests) return showReview(c, room);
  c.conv.stage = "browsing";
  say(c, C.free(room, d.checkIn, checkOut, d.nights), {
    buttons: [{ id: "book", title: "Book these dates" }, { id: "change", title: "Other dates" }],
  });
}

async function offerAlternatives(c: Ctx, room: RoomInfo, checkIn: string, checkOut: string, free: RoomInfo[]) {
  c.conv.stage = "choose_room";
  const others = free.filter((r) => r.id !== room.id).slice(0, 9);
  if (others.length === 0) {
    return say(c, C.nothingFree(room, checkIn, checkOut), { buttons: [{ id: "change", title: "Try other dates" }] });
  }
  say(c, C.alternatives(room, checkIn, checkOut), {
    list: {
      button: "See free rooms",
      rows: [
        ...others.map((r) => ({ id: `pick:${r.id}`, title: `Room ${r.id} · ${formatINR(r.pricePerNight)}`, description: r.name })),
        { id: "change", title: "Try other dates" },
      ],
    },
  });
}

function showReview(c: Ctx, room: RoomInfo) {
  const d = c.conv.draft;
  c.conv.stage = "review";
  say(
    c,
    C.review(room, {
      name: d.name!,
      phone: d.phone!,
      checkIn: d.checkIn!,
      nights: d.nights!,
      checkOut: addDays(d.checkIn!, d.nights!),
      guests: d.guests!,
    }),
    { buttons: [{ id: "confirm", title: "Confirm booking" }, { id: "change", title: "Change dates" }] },
  );
}

async function onChooseRoom(c: Ctx, low: string) {
  if (/change|other|different|date/.test(low)) return changeDates(c);
  const m = /\b(\d{2,4}[a-z]?)\b/.exec(low);
  if (m) return pickRoom(c, m[1]!);
  say(c, "Tap a room from the list above, or type *change* to try other dates.");
}

async function pickRoom(c: Ctx, id: string) {
  const room = await c.ports.room(id);
  if (!room) return menu(c);
  c.conv.roomId = room.id;
  const d = c.conv.draft;
  if (d.guests && d.guests > room.capacity) delete d.guests;
  // Picked from "these rooms are free for your dates": that's a booking, not another availability question.
  if (d.checkIn && d.nights) return startBooking(c);
  return intro(c);
}

function changeDates(c: Ctx) {
  delete c.conv.draft.checkIn;
  delete c.conv.draft.nights;
  return askCheckIn(c);
}

async function onReviewText(c: Ctx, low: string) {
  if (/\b(confirm|yes|book it|go ahead|ok|okay|proceed)\b/.test(low)) return onConfirm(c);
  if (/\b(change|edit|different|other)\b/.test(low)) return changeDates(c);
  const room = await roomOf(c);
  if (room) return showReview(c, room);
  return menu(c);
}

/** "Confirm booking": create the unpaid hold and ask for the advance. */
async function onConfirm(c: Ctx) {
  const d = c.conv.draft;
  if (c.conv.stage === "awaiting_payment" || c.conv.stage === "need_utr") return resendPayment(c);
  const room = await roomOf(c);
  if (c.conv.stage !== "review" || !room || !d.name || !d.phone || !d.guests || !d.checkIn || !d.nights) return say(c, C.staleButton());
  const checkOut = addDays(d.checkIn, d.nights);
  const sameStay = (b: BookingView) =>
    b.status === "PENDING" && b.parentId === null && b.roomId === room.id && b.checkIn === d.checkIn && b.checkOut === checkOut;

  // This chat already holds a room: the same stay (a re-delivered or double tap) carries on;
  // any other hold must be paid or released first — one unpaid hold per chat.
  const held = (await c.ports.activeByChat(c.conv.chat)).filter((b) => b.status === "PENDING");
  const mine = held.find(sameStay);
  if (mine) return startPayment(c, mine);
  if (held[0]) {
    c.conv.stage = "awaiting_payment";
    c.conv.draft.bookingId = held[0].id;
    const p = await c.ports.openPayment(held[0].id);
    return say(c, C.alreadyHolding(held[0], p?.amount ?? C.advanceOf(held[0].total)), { buttons: payButtons(held[0]) });
  }

  const r = await c.ports.createHold({
    roomId: room.id,
    guestName: d.name,
    guestPhone: d.phone,
    guests: d.guests,
    checkIn: d.checkIn,
    checkOut,
    chatKey: c.conv.chat,
  });
  if (!r.ok) {
    if (r.code === "CONFLICT") {
      const raced = (await c.ports.activeByChat(c.conv.chat)).find(sameStay);
      if (raced) return startPayment(c, raced); // lost only to our own simultaneous tap
      say(c, C.justTaken(room));
      const free = await c.ports.freeRooms(d.checkIn, checkOut, d.guests);
      return offerAlternatives(c, room, d.checkIn, checkOut, free);
    }
    if (r.code === "LIMIT") return say(c, r.message); // keep the review: they can confirm later
    say(c, r.message);
    return changeDates(c);
  }
  return startPayment(c, r.value);
}

/** Ask for the money for a hold (a new stay, or an extension), with the pay link and buttons. */
async function startPayment(c: Ctx, b: BookingView, lead?: string) {
  c.conv.stage = "awaiting_payment";
  c.conv.draft.bookingId = b.id;
  const p = await c.ports.openPayment(b.id);
  const amount = p?.amount ?? (b.parentId ? b.total : C.advanceOf(b.total));
  say(c, `${lead ? `${lead}\n\n` : ""}${C.paymentRequest(b, c.ports.settings, amount)}`, { buttons: payButtons(b) });
}

async function resendPayment(c: Ctx) {
  const h = await currentHold(c);
  if (h) say(c, C.paymentRequest(h.b, c.ports.settings, owed(h)), { buttons: payButtons(h.b) });
}

async function remindPayment(c: Ctx) {
  const h = await currentHold(c);
  if (!h) {
    resetFlow(c);
    return intro(c);
  }
  if (h.p?.status === "CLAIMED") return say(c, C.claimStillChecking(h.p), { buttons: payButtons(h.b) });
  return say(c, C.paymentReminder(h.b, owed(h)), { buttons: payButtons(h.b) });
}

async function askForUtr(c: Ctx, id?: string) {
  const h = await currentHold(c, id);
  if (!h) return say(c, C.staleButton());
  c.conv.stage = "need_utr";
  say(c, C.askUtr(owed(h)));
}

async function onPaymentText(c: Ctx, t: string, low: string) {
  const utr = findUtr(t, c.conv.draft.phone);
  if (utr) return claimWith(c, utr);
  if (/\b(pay|paid|done|sent|payment|utr|transaction|transferred|completed)\b/.test(low)) return askForUtr(c);
  if (/breakfast|price|how much/.test(low)) return onBrowsingText(c, low, low);
  return remindPayment(c);
}

async function onUtr(c: Ctx, t: string) {
  const utr = findUtr(t, c.conv.draft.phone);
  if (utr) return claimWith(c, utr);
  say(c, C.askUtrAgain());
}

/** The guest's UTR goes on the payment, and the owner app gets it to check and acknowledge. */
async function claimWith(c: Ctx, utr: string) {
  const h = await currentHold(c);
  if (!h) {
    resetFlow(c);
    return say(c, C.staleButton());
  }
  const r = await c.ports.claim(h.b.id, utr);
  if (!r.ok) return say(c, r.message);
  c.conv.stage = "awaiting_payment";
  say(c, C.claimThanks(r.value));
  const stay = r.value.kind === "EXTENSION" ? await c.ports.stay(h.b.id) : null;
  alertOwner(c, C.ownerPaymentClaim(r.value, stay, r.value.duplicateRef), [
    { id: `ack:${r.value.id}`, title: "Acknowledge" },
    { id: `nack:${r.value.id}`, title: "Not received" },
  ]);
}

async function cancelHoldByGuest(c: Ctx, id?: string) {
  const h = await currentHold(c, id);
  resetFlow(c);
  if (!h) return say(c, C.staleButton());
  await c.ports.cancel(h.b.id);
  const room = await roomOf(c);
  say(c, C.holdCancelledByGuest(h.b), room ? { buttons: MENU } : {});
  if (h.p?.status === "CLAIMED") alertOwner(c, C.ownerClaimCancelledByGuest(h.b));
}

// --- buttons ----------------------------------------------------------------------

async function onButton(c: Ctx, id: string) {
  const [action, ...rest] = id.split(":");
  const arg = rest.join(":");
  switch (action) {
    case "info": {
      const room = await roomOf(c);
      if (!room) return welcome(c);
      return say(c, C.details(room), { buttons: [{ id: "book", title: "Book this room" }, { id: "avail", title: "Check availability" }] });
    }
    case "avail": return startAvailability(c);
    case "book": return startBooking(c);
    case "change": return changeDates(c);
    case "confirm": return onConfirm(c);
    case "pick": return pickRoom(c, arg);
    case "g": return c.conv.stage === "need_guests" ? onGuests(c, arg) : say(c, C.staleButton());
    case "n": return c.conv.stage === "need_checkout" ? onCheckOut(c, arg) : say(c, C.staleButton());
    case "d": return c.conv.stage === "need_checkin" ? onCheckIn(c, arg) : say(c, C.staleButton());
    case "i_paid": return askForUtr(c, arg);
    case "cancel_hold": return cancelHoldByGuest(c, arg);
    case "want_out": return onWantOut(c, arg);
    case "want_extend": return startExtension(c, arg);
    case "pick_ext": return onPickExtensionRoom(c, arg);
    case "ext_keep": return keepCheckout(c);
    default: return say(c, C.staleButton());
  }
}

/** A booking this chat made, or null (after telling the guest). */
async function ownBooking(c: Ctx, id: string): Promise<BookingView | null> {
  const b = await c.ports.booking(id);
  if (!b || b.chat !== c.conv.chat) {
    say(c, C.notYourBooking());
    return null;
  }
  return b;
}

async function onWantOut(c: Ctx, id: string) {
  const b = await ownBooking(c, id);
  if (!b) return;
  say(c, C.checkoutAck(b));
  if (c.conv.draft.checkoutAcked === b.id) return;
  c.conv.draft.checkoutAcked = b.id;
  alertOwner(c, C.ownerCheckout(b));
}

// --- extensions (self-service, paid in full) ------------------------------------------

/** From the last-day button (a booking id), or from typing "extend" (this chat's current stay). */
async function startExtension(c: Ctx, bookingId?: string) {
  let stay: StayView | null = null;
  if (bookingId) {
    const own = await ownBooking(c, bookingId);
    if (!own) return;
    stay = await c.ports.stay(own.id);
  } else {
    const confirmed = (await c.ports.activeByChat(c.conv.chat)).find((b) => b.status === "CONFIRMED");
    if (confirmed) stay = await c.ports.stay(confirmed.id);
  }
  if (!stay || stay.root.status !== "CONFIRMED") return say(c, C.noStayToExtend());
  if (stay.pending) return resumeExtension(c, stay.pending);
  if (stay.end.checkOut < c.today) return say(c, C.stayEnded(stay.end));
  c.conv.stage = "ext_need_date";
  c.conv.draft.extendStayId = stay.root.id;
  say(c, C.askExtendDate(stay.end));
}

/** An extension is already waiting: its payment is with the desk (even if the hold lapsed), or still to pay. */
async function resumeExtension(c: Ctx, seg: BookingView) {
  const p = await c.ports.openPayment(seg.id);
  if (p?.status !== "CLAIMED") return startPayment(c, seg);
  c.conv.stage = "awaiting_payment";
  c.conv.draft.bookingId = seg.id;
  say(c, C.claimStillChecking(p), { buttons: payButtons(seg) });
}

/** The stay this chat is extending — if this chat booked it, it's confirmed, and it isn't over yet. */
async function extendingStay(c: Ctx): Promise<StayView | null> {
  const stay = c.conv.draft.extendStayId ? await c.ports.stay(c.conv.draft.extendStayId) : null;
  const ok = stay && stay.root.chat === c.conv.chat && stay.root.status === "CONFIRMED" && stay.end.checkOut >= c.today;
  return ok ? stay : null;
}

async function onExtendDate(c: Ctx, t: string) {
  const stay = await extendingStay(c);
  if (!stay) {
    resetFlow(c);
    return say(c, C.noStayToExtend());
  }
  const plus = /^\s*\+?\s*(\d{1,2})\s*(?:more\s+|extra\s+)?nights?\s*$/i.exec(t);
  const to = plus ? addDays(stay.end.checkOut, Number(plus[1])) : parseDateText(t, c.today);
  if (!to || to <= stay.end.checkOut) return say(c, C.askExtendDateAgain(stay.end));
  return offerExtension(c, stay, to);
}

/** Same room free → hold it; taken → let the guest pick a free room; nothing free → say so. */
async function offerExtension(c: Ctx, stay: StayView, to: string) {
  const opts = await c.ports.extensionOptions(stay.root.id, to);
  if (!opts.ok) return say(c, C.askExtendDateAgain(stay.end));
  if (opts.value.sameRoomFree) return holdExtension(c, stay, stay.end.roomId, to);
  const rooms = opts.value.freeRooms;
  if (rooms.length === 0) {
    resetFlow(c);
    return say(c, C.extensionNoRooms(stay.end), {
      buttons: [
        { id: `want_extend:${stay.end.id}`, title: "Other dates" },
        { id: `want_out:${stay.end.id}`, title: "Check out" },
      ],
    });
  }
  c.conv.stage = "ext_choose_room";
  c.conv.draft.extendTo = to;
  const n = nightsBetween(stay.end.checkOut, to);
  say(c, C.extensionRoomTaken(stay.end, to), {
    list: {
      button: "Choose a room",
      rows: [
        ...rooms.slice(0, 9).map((r) => ({
          id: `pick_ext:${r.id}`,
          title: `Room ${r.id} · ${formatINR(r.pricePerNight)}`,
          description: `${r.name} · ${formatINR(r.pricePerNight * n)} for ${C.plural(n, "night")}`,
        })),
        { id: "ext_keep", title: "Keep my check-out" },
      ],
    },
  });
}

async function holdExtension(c: Ctx, stay: StayView, roomId: string, to: string): Promise<void> {
  const r = await c.ports.extend(stay.root.id, roomId, to);
  if (!r.ok) {
    if (r.code === "CONFLICT") {
      say(c, "That room was just taken — here's what's still free.");
      const fresh = await c.ports.stay(stay.root.id);
      return fresh ? offerExtension(c, fresh, to) : undefined;
    }
    resetFlow(c);
    return say(c, r.message);
  }
  const seg = r.value;
  delete c.conv.draft.extendTo;
  const lead = seg.roomId === stay.end.roomId ? C.extensionSameRoom(seg) : C.extensionMove(seg, stay.end.roomId);
  return startPayment(c, seg, lead);
}

async function onPickExtensionRoom(c: Ctx, roomId: string) {
  const to = c.conv.draft.extendTo;
  if (c.conv.stage !== "ext_choose_room" || !to) return say(c, C.staleButton());
  const stay = await extendingStay(c);
  if (!stay) {
    resetFlow(c);
    return say(c, C.noStayToExtend());
  }
  return holdExtension(c, stay, roomId, to);
}

async function onExtChooseText(c: Ctx, low: string) {
  if (/\b(keep|no|none|cancel|check ?out)\b/.test(low)) return keepCheckout(c);
  const m = /\b(\d{2,4}[a-z]?)\b/.exec(low);
  if (m) return onPickExtensionRoom(c, m[1]!);
  say(c, "Tap a room from the list above, or type *keep* to keep your check-out.");
}

async function keepCheckout(c: Ctx) {
  const stay = await extendingStay(c);
  resetFlow(c);
  if (!stay) return say(c, C.staleButton());
  say(c, C.checkoutAck(stay.end));
}
