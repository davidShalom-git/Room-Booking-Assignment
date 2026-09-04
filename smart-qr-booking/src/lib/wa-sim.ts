/**
 * Two-sided WhatsApp flow — SIMULATION.
 *
 * Models the whole journey the client wants, controlled entirely from chat:
 *
 *   Guest: scan → WhatsApp → ask about the room → book (name, phone, dates+times,
 *          guests) → confirmation.
 *   Owner: receives the booking on their WhatsApp. Later, the guest gets a
 *          "last day tomorrow — extend or check out?" nudge. Extend → the owner
 *          approves / declines; if the room is already re-booked, the owner moves
 *          the guest to a free room. Every step lands on both phones.
 *
 * Pure reducer. No React, no network. A real deployment swaps this for the
 * WhatsApp Business API + a booking backend; the messages and branching stay.
 */
import { rooms, getRoom, type Room } from "@/lib/data";
import { config } from "@/config";
import {
  nights,
  bookingTotal,
  formatINR,
  formatDate,
  formatTime,
  formatDateTime,
  addDays,
  todayISO,
} from "@/lib/pricing";

export type Side = "guest" | "owner";

export type Action = {
  label: string;
  event: string; // dispatched as { type: "action", id: event }
  kind?: "primary" | "default" | "danger";
};

export type Msg = {
  id: number;
  side: Side;
  from: "them" | "me" | "system";
  text?: string;
  chips?: string[]; // quick replies (guest side)
  actions?: Action[]; // inline buttons
  card?: "book-dates" | "extend-dates";
  ts: string;
};

export type Stage =
  | "browsing"
  | "need_name"
  | "need_phone"
  | "need_guests"
  | "need_dates"
  | "review"
  | "staying"
  | "ext_need_dates"
  | "ext_pending_owner"
  | "owner_choosing_room"
  | "guest_choosing_move"
  | "ended";

export type SimBooking = {
  id: string;
  roomId: string;
  roomName: string;
  guestName: string;
  guestPhone: string;
  guests: number;
  checkIn: string;
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
  nights: number;
  total: number;
  moveRoomId?: string;
  moveOn?: string;
};

export type SimState = {
  stage: Stage;
  roomId: string;
  guestThread: Msg[];
  ownerThread: Msg[];
  draft: {
    name?: string;
    phone?: string;
    guests?: number;
    checkIn?: string;
    checkInTime?: string;
    checkOut?: string;
    checkOutTime?: string;
    extendTo?: string;
    extendToTime?: string;
  };
  booking?: SimBooking;
  /** A later reservation on the same room — makes the extend conflict real. */
  followOn: { guest: string; from: string } | null;
  seq: number;
};

export type SimEvent =
  | { type: "guest_text"; text: string }
  | { type: "action"; id: string }
  | { type: "book_dates"; checkIn: string; checkInTime: string; checkOut: string; checkOutTime: string; guests: number }
  | { type: "extend_dates"; checkOut: string; checkOutTime: string }
  | { type: "director"; cmd: "lastday" | "reset" | "prefill" | "toggle_conflict" };

// --- helpers --------------------------------------------------------------

const now = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function push(
  s: SimState,
  side: Side,
  from: Msg["from"],
  text: string,
  extra: Partial<Msg> = {},
): void {
  const thread = side === "guest" ? s.guestThread : s.ownerThread;
  thread.push({ id: ++s.seq, side, from, text, ts: now(), ...extra });
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] || "there";

function freeRooms(state: SimState): Room[] {
  const b = state.booking;
  return rooms.filter(
    (r) =>
      r.id !== state.roomId &&
      r.status !== "occupied" &&
      r.capacity >= (b?.guests ?? 1),
  );
}

export function initialState(roomId = "101"): SimState {
  const s: SimState = {
    stage: "browsing",
    roomId,
    guestThread: [],
    ownerThread: [],
    draft: {},
    followOn: { guest: "Ananya Nair", from: addDays(todayISO(), 4) }, // conflict on by default
    seq: 0,
  };
  const r = getRoom(roomId)!;
  push(
    s,
    "guest",
    "system",
    `Simulated WhatsApp chat with ${config.property.name}. This is the demo — no real messages are sent.`,
  );
  push(
    s,
    "guest",
    "them",
    `Hi! 👋 You scanned the code for *Room ${r.id} — ${r.name}* (${formatINR(
      r.pricePerNight,
    )}/night, sleeps ${r.capacity}, ${r.ac ? "AC" : "Non-AC"}).\nAsk me anything, or book right here.`,
    { chips: ["Tell me about this room", "Is it available?", `Book Room ${r.id}`] },
  );
  push(
    s,
    "owner",
    "system",
    `${config.property.name} — front desk WhatsApp. Booking requests and guest messages arrive here.`,
  );
  return s;
}

// --- reducer ------------------------------------------------------------

export function reduce(prev: SimState, ev: SimEvent): SimState {
  // work on a shallow clone with fresh thread arrays we can push to
  const s: SimState = {
    ...prev,
    guestThread: [...prev.guestThread],
    ownerThread: [...prev.ownerThread],
    draft: { ...prev.draft },
  };
  const r = getRoom(s.roomId)!;

  if (ev.type === "director") return director(s, ev.cmd);

  if (ev.type === "guest_text") {
    push(s, "guest", "me", ev.text);
    return guestText(s, ev.text.trim().toLowerCase(), r);
  }

  if (ev.type === "action") return action(s, ev.id, r);

  if (ev.type === "book_dates") {
    push(
      s,
      "guest",
      "me",
      `${formatDateTime(ev.checkIn, ev.checkInTime)} → ${formatDateTime(
        ev.checkOut,
        ev.checkOutTime,
      )} · ${ev.guests} guest${ev.guests > 1 ? "s" : ""}`,
    );
    const n = nights(ev.checkIn, ev.checkOut);
    if (n <= 0) {
      push(s, "guest", "them", "Check-out needs to be after check-in — try again.", {
        card: "book-dates",
      });
      return s;
    }
    Object.assign(s.draft, {
      checkIn: ev.checkIn,
      checkInTime: ev.checkInTime,
      checkOut: ev.checkOut,
      checkOutTime: ev.checkOutTime,
      guests: ev.guests,
    });
    const total = bookingTotal(r.pricePerNight, n);
    push(
      s,
      "guest",
      "them",
      [
        `Here's your booking:`,
        ``,
        `*Room ${r.id} — ${r.name}*`,
        `Name: ${s.draft.name}`,
        `Phone: ${s.draft.phone}`,
        `Check-in: ${formatDateTime(ev.checkIn, ev.checkInTime)}`,
        `Check-out: ${formatDateTime(ev.checkOut, ev.checkOutTime)}`,
        `Duration: ${n} night${n > 1 ? "s" : ""}`,
        `Guests: ${ev.guests}`,
        `Total: ${formatINR(total)} — pay at the property`,
      ].join("\n"),
      { actions: [{ label: "Confirm booking", event: "confirm", kind: "primary" }, { label: "Change", event: "change_dates" }] },
    );
    s.stage = "review";
    return s;
  }

  if (ev.type === "extend_dates") {
    push(
      s,
      "guest",
      "me",
      `New check-out: ${formatDateTime(ev.checkOut, ev.checkOutTime)}`,
    );
    return extendDates(s, ev.checkOut, ev.checkOutTime, r);
  }

  return s;
}

// --- guest free text ---------------------------------------------------

function guestText(s: SimState, t: string, r: Room): SimState {
  // booking sub-flow
  if (s.stage === "need_name") {
    s.draft.name = t.replace(/^(my name is|it's|this is|i am|i'm)\s+/i, "").slice(0, 60) || "Guest";
    // re-capitalise words
    s.draft.name = s.draft.name.replace(/\b\w/g, (c) => c.toUpperCase());
    push(s, "guest", "them", `Thanks ${firstName(s.draft.name)}. What's the best phone number for the booking?`);
    s.stage = "need_phone";
    return s;
  }
  if (s.stage === "need_phone") {
    s.draft.phone = t.replace(/[^\d+ ]/g, "").trim() || "—";
    push(s, "guest", "them", "How many guests?", { chips: ["1", "2", "3", "4"] });
    s.stage = "need_guests";
    return s;
  }
  if (s.stage === "need_guests") {
    const g = Math.max(1, Math.min(r.capacity, parseInt(t, 10) || 1));
    s.draft.guests = g;
    push(
      s,
      "guest",
      "them",
      `Great — ${g} guest${g > 1 ? "s" : ""}. Now pick your dates and times.`,
      { card: "book-dates" },
    );
    s.stage = "need_dates";
    return s;
  }
  if (s.stage === "review" && /\b(confirm|yes|book it|go ahead)\b/.test(t)) {
    return confirmBooking(s, r);
  }
  if (s.stage === "review" && /\b(change|edit|different)\b/.test(t)) {
    push(s, "guest", "them", "No problem — pick again.", { card: "book-dates" });
    s.stage = "need_dates";
    return s;
  }

  // intents available while browsing / staying
  if (/\b(book|reserve|reservation)\b/.test(t) && s.stage === "browsing") {
    return startBooking(s, r);
  }
  if (/breakfast/.test(t)) {
    push(s, "guest", "them", "Complimentary breakfast is on the rooftop, 7:30–10:00 AM.");
    return s;
  }
  if (/avail|free|vacan/.test(t)) {
    push(
      s,
      "guest",
      "them",
      `Room ${r.id} is available right now. Want to book it?`,
      { chips: [`Book Room ${r.id}`, "Tell me about this room"] },
    );
    return s;
  }
  if (/tell me|about|detail|amenit|what.*(room|include)/.test(t)) {
    push(
      s,
      "guest",
      "them",
      [
        `*Room ${r.id} — ${r.name}*`,
        `${formatINR(r.pricePerNight)}/night · ${r.bed} · sleeps ${r.capacity} · ${r.ac ? "AC" : "Non-AC"} · ${r.size}`,
        ``,
        r.shortDescription,
        ``,
        `Amenities: ${r.amenities.slice(0, 6).join(", ")}…`,
      ].join("\n"),
      { chips: [`Book Room ${r.id}`, "Is it available?"] },
    );
    return s;
  }
  if (/price|cost|rate|how much/.test(t)) {
    push(s, "guest", "them", `Room ${r.id} is ${formatINR(r.pricePerNight)} per night. Breakfast and WiFi included.`);
    return s;
  }
  if (/staff|human|reception|call|desk/.test(t)) {
    push(s, "guest", "them", "I'll connect you with the front desk — someone will reply here shortly.");
    push(s, "owner", "them", `💬 Guest asking for a human on the Room ${r.id} chat.`);
    return s;
  }

  push(
    s,
    "guest",
    "them",
    `I can tell you about Room ${r.id}, check availability, or take your booking. Try "book this room".`,
    { chips: ["Tell me about this room", `Book Room ${r.id}`] },
  );
  return s;
}

// --- booking ----------------------------------------------------------

function startBooking(s: SimState, r: Room): SimState {
  push(s, "guest", "them", `Let's book *Room ${r.id} — ${r.name}*. What name should it be under?`);
  s.stage = "need_name";
  return s;
}

function confirmBooking(s: SimState, r: Room): SimState {
  const d = s.draft;
  const n = nights(d.checkIn!, d.checkOut!);
  const total = bookingTotal(r.pricePerNight, n);
  const id = `HTL-${d.checkIn!.replaceAll("-", "")}-${String(100 + (s.seq % 800)).padStart(3, "0")}`;
  s.booking = {
    id,
    roomId: r.id,
    roomName: r.name,
    guestName: d.name!,
    guestPhone: d.phone!,
    guests: d.guests!,
    checkIn: d.checkIn!,
    checkInTime: d.checkInTime!,
    checkOut: d.checkOut!,
    checkOutTime: d.checkOutTime!,
    nights: n,
    total,
  };
  push(
    s,
    "guest",
    "them",
    [
      `✅ *Booking confirmed* — ${config.property.name}`,
      ``,
      `Booking ID: ${id}`,
      `Room: ${r.name} — ${r.id}`,
      `Name: ${d.name}`,
      `Check-in: ${formatDateTime(d.checkIn!, d.checkInTime!)}`,
      `Check-out: ${formatDateTime(d.checkOut!, d.checkOutTime!)}`,
      `Duration: ${n} night${n > 1 ? "s" : ""}`,
      `Guests: ${d.guests}`,
      `Total: ${formatINR(total)} — pay at the property`,
      ``,
      `${config.property.address}. See you soon! 🌴`,
    ].join("\n"),
  );
  push(
    s,
    "owner",
    "them",
    [
      `🆕 *New booking* via WhatsApp`,
      ``,
      `${r.name} — Room ${r.id}`,
      `Guest: ${d.name}  ·  ${d.phone}`,
      `In:  ${formatDateTime(d.checkIn!, d.checkInTime!)}`,
      `Out: ${formatDateTime(d.checkOut!, d.checkOutTime!)}`,
      `${n} night${n > 1 ? "s" : ""}  ·  ${d.guests} guest${d.guests! > 1 ? "s" : ""}`,
      `Total: ${formatINR(total)} (pay at property)`,
      `Ref: ${id}`,
    ].join("\n"),
    { actions: [{ label: "Acknowledge", event: "ack_booking", kind: "primary" }] },
  );
  s.stage = "staying";
  return s;
}

// --- director (demo shortcuts) --------------------------------------

function director(
  s: SimState,
  cmd: "lastday" | "reset" | "prefill" | "toggle_conflict",
): SimState {
  if (cmd === "reset") return initialState(s.roomId);

  if (cmd === "toggle_conflict") {
    s.followOn = s.followOn
      ? null
      : { guest: "Ananya Nair", from: addDays(s.booking?.checkOut ?? todayISO(), 1) };
    push(
      s,
      "owner",
      "system",
      s.followOn
        ? `Demo: Room ${s.roomId} now has a follow-on booking (${s.followOn.guest}, from ${formatDate(s.followOn.from)}).`
        : `Demo: Room ${s.roomId} follow-on booking cleared — extensions will be free to approve.`,
    );
    return s;
  }

  if (cmd === "prefill") {
    if (s.stage === "need_name" || s.stage === "browsing") {
      Object.assign(s.draft, { name: "David Thomas", phone: "+91 98470 33321", guests: 2 });
      push(s, "guest", "system", "Demo: guest details pre-filled (David Thomas · +91 98470 33321 · 2 guests).");
    }
    return s;
  }

  if (cmd === "lastday") {
    if (s.stage !== "staying" || !s.booking) {
      push(s, "guest", "system", "Make a booking first, then run the last-day reminder.");
      return s;
    }
    const b = s.booking;
    push(
      s,
      "guest",
      "them",
      [
        `Hi ${firstName(b.guestName)} 👋`,
        `Tomorrow, ${formatDate(b.checkOut)}, is your last day with us. Check-out is ${formatDateTime(b.checkOut, b.checkOutTime).split(", ")[1]}.`,
        ``,
        `Would you like to extend your stay, or check out as planned?`,
      ].join("\n"),
      {
        actions: [
          { label: "Extend my stay", event: "want_extend", kind: "primary" },
          { label: "Check out as planned", event: "want_checkout" },
        ],
      },
    );
    push(s, "owner", "system", `Sent ${firstName(b.guestName)} the last-day reminder for Room ${b.roomId}.`);
    return s;
  }
  return s;
}

// --- actions (bubble buttons, either side) --------------------------

function action(s: SimState, id: string, r: Room): SimState {
  const b = s.booking;

  if (id === "start_booking") return startBooking(s, r);
  if (id === "ack_booking") {
    push(s, "owner", "me", "👍 Acknowledged");
    push(s, "guest", "them", "The property has your booking. Anything else?");
    return s;
  }
  if (id === "confirm") return confirmBooking(s, r);
  if (id === "change_dates") {
    push(s, "guest", "them", "Pick again:", { card: "book-dates" });
    s.stage = "need_dates";
    return s;
  }

  // guest chose from the last-day nudge
  if (id === "want_checkout" && b) {
    push(s, "guest", "me", "Check out as planned");
    push(
      s,
      "guest",
      "them",
      `All set — check-out is confirmed for ${formatDateTime(b.checkOut, b.checkOutTime)}. Thanks for staying with us! 🌴`,
    );
    push(
      s,
      "owner",
      "them",
      `✅ ${firstName(b.guestName)} (Room ${b.roomId}) confirmed *check-out* — ${formatDateTime(b.checkOut, b.checkOutTime)}. Room frees at ${formatTime(b.checkOutTime)}.`,
    );
    s.stage = "ended";
    return s;
  }
  if (id === "want_extend" && b) {
    push(s, "guest", "me", "Extend my stay");
    push(
      s,
      "guest",
      "them",
      `Sure! Your stay currently ends ${formatDateTime(b.checkOut, b.checkOutTime)}. Pick your new check-out date and time.`,
      { card: "extend-dates" },
    );
    s.stage = "ext_need_dates";
    return s;
  }

  // owner decisions on an extension
  if (id === "ext_approve" && b) {
    push(s, "owner", "me", "✅ Approve extension");
    const extraN = nights(b.checkOut, s.draft.extendTo!);
    const extra = bookingTotal(r.pricePerNight, extraN);
    b.checkOut = s.draft.extendTo!;
    b.checkOutTime = s.draft.extendToTime!;
    b.nights += extraN;
    b.total += extra;
    push(
      s,
      "guest",
      "them",
      [
        `Good news, ${firstName(b.guestName)}! 🎉`,
        `Your stay in Room ${b.roomId} is extended to ${formatDateTime(b.checkOut, b.checkOutTime)}.`,
        `+${extraN} night${extraN > 1 ? "s" : ""} · ${formatINR(extra)} — pay at the property.`,
      ].join("\n"),
    );
    s.stage = "staying";
    return s;
  }
  if (id === "ext_decline" && b) {
    push(s, "owner", "me", "❌ Decline extension");
    push(
      s,
      "guest",
      "them",
      [
        `Sorry ${firstName(b.guestName)} — we're fully booked after ${formatDate(b.checkOut)} and can't extend Room ${b.roomId}.`,
        `Check-out stays ${formatDateTime(b.checkOut, b.checkOutTime)}. Happy to suggest places nearby for your extra nights.`,
      ].join("\n"),
      { actions: [{ label: "Check out as planned", event: "want_checkout" }] },
    );
    s.stage = "staying";
    return s;
  }
  if (id === "ext_move" && b) {
    push(s, "owner", "me", "🔁 Move guest to a free room");
    const opts = freeRooms(s).slice(0, 4);
    push(
      s,
      "owner",
      "them",
      `Free for ${formatDate(b.checkOut)}–${formatDate(s.draft.extendTo!)}:`,
      {
        actions: opts.map((o) => ({
          label: `Room ${o.id} · ${o.name} · ${formatINR(o.pricePerNight)}`,
          event: `pick_${o.id}`,
        })),
      },
    );
    s.stage = "owner_choosing_room";
    return s;
  }
  if (id.startsWith("pick_") && b) {
    const newRoom = getRoom(id.slice(5));
    if (!newRoom) return s;
    push(s, "owner", "me", `Move to Room ${newRoom.id}`);
    const extraN = nights(b.checkOut, s.draft.extendTo!);
    const extra = bookingTotal(newRoom.pricePerNight, extraN);
    const diff = newRoom.pricePerNight - r.pricePerNight;
    b.moveRoomId = newRoom.id;
    b.moveOn = b.checkOut;
    b.checkOut = s.draft.extendTo!;
    b.checkOutTime = s.draft.extendToTime!;
    b.nights += extraN;
    b.total += extra;
    push(
      s,
      "owner",
      "them",
      `✅ Done. ${firstName(b.guestName)} moves to Room ${newRoom.id} on ${formatDate(b.moveOn!)}. Room ${r.id} is ready for ${s.followOn?.guest ?? "the next guest"}.`,
    );
    push(
      s,
      "guest",
      "them",
      [
        `You're extended to ${formatDateTime(b.checkOut, b.checkOutTime)} ✅`,
        ``,
        `One change: after check-out time on ${formatDate(b.moveOn!)} you'll switch to *Room ${newRoom.id} — ${newRoom.name}*${diff < 0 ? ` (and it's ${formatINR(-diff)}/night less)` : diff > 0 ? ` (+${formatINR(diff)}/night)` : " (same rate)"}. We'll help with your bags.`,
        `Extra ${extraN} night${extraN > 1 ? "s" : ""}: ${formatINR(extra)}.`,
      ].join("\n"),
      { actions: [{ label: "Sounds good", event: "accept_move", kind: "primary" }, { label: "Actually, I'll check out", event: "decline_move" }] },
    );
    s.stage = "guest_choosing_move";
    return s;
  }
  if (id === "accept_move" && b) {
    push(s, "guest", "me", "Sounds good 👍");
    push(s, "guest", "them", `Perfect. Everything's set — enjoy the rest of your stay!`);
    push(s, "owner", "them", `✅ ${firstName(b.guestName)} accepted the move to Room ${b.moveRoomId}.`);
    s.stage = "staying";
    return s;
  }
  if (id === "decline_move" && b) {
    push(s, "guest", "me", "I'll check out");
    b.moveRoomId = undefined;
    b.moveOn = undefined;
    push(s, "guest", "them", `No problem — check-out stays ${formatDateTime(b.checkOut, b.checkOutTime)}. Safe travels! 🌴`);
    push(s, "owner", "them", `↩️ ${firstName(b.guestName)} declined the move — checking out as planned.`);
    s.stage = "ended";
    return s;
  }

  return s;
}

function extendDates(s: SimState, checkOut: string, checkOutTime: string, r: Room): SimState {
  const b = s.booking;
  if (!b) return s;
  const extraN = nights(b.checkOut, checkOut);
  if (extraN <= 0) {
    push(s, "guest", "them", "That's not after your current check-out — pick a later date.", { card: "extend-dates" });
    return s;
  }
  s.draft.extendTo = checkOut;
  s.draft.extendToTime = checkOutTime;
  const extra = bookingTotal(r.pricePerNight, extraN);
  const conflict = s.followOn && s.followOn.from < checkOut;

  push(
    s,
    "guest",
    "them",
    `Thanks — checking with the property about extending Room ${b.roomId} to ${formatDateTime(checkOut, checkOutTime)} (+${extraN} night${extraN > 1 ? "s" : ""}, ${formatINR(extra)})…`,
  );

  if (conflict) {
    push(
      s,
      "owner",
      "them",
      [
        `🔁 *Extension request* — Room ${b.roomId}`,
        `${b.guestName} wants to stay to ${formatDateTime(checkOut, checkOutTime)} (+${extraN} night${extraN > 1 ? "s" : ""}, +${formatINR(extra)}).`,
        ``,
        `⚠️ Room ${b.roomId} is already booked from ${formatDate(s.followOn!.from)} (${s.followOn!.guest}).`,
      ].join("\n"),
      {
        actions: [
          { label: "Move guest to a free room", event: "ext_move", kind: "primary" },
          { label: "Decline extension", event: "ext_decline", kind: "danger" },
        ],
      },
    );
  } else {
    push(
      s,
      "owner",
      "them",
      [
        `🔁 *Extension request* — Room ${b.roomId}`,
        `${b.guestName} wants to stay to ${formatDateTime(checkOut, checkOutTime)} (+${extraN} night${extraN > 1 ? "s" : ""}, +${formatINR(extra)}).`,
        ``,
        `Room ${b.roomId} is FREE for those nights.`,
      ].join("\n"),
      {
        actions: [
          { label: "Approve", event: "ext_approve", kind: "primary" },
          { label: "Decline", event: "ext_decline", kind: "danger" },
        ],
      },
    );
  }
  s.stage = "ext_pending_owner";
  return s;
}

// --- self-check: `npx tsx src/lib/wa-sim.ts` ---------------------------
if (process.argv[1]?.endsWith("wa-sim.ts")) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
    console.log("ok  -", m);
  };
  const lastGuest = (s: SimState) => s.guestThread[s.guestThread.length - 1]?.text ?? "";
  const lastOwner = (s: SimState) => s.ownerThread[s.ownerThread.length - 1]?.text ?? "";

  let s = initialState("101");
  assert(s.guestThread.length >= 2 && s.ownerThread.length >= 1, "both threads seeded");

  s = reduce(s, { type: "guest_text", text: "book room 101" });
  assert(s.stage === "need_name", "book -> need_name");
  s = reduce(s, { type: "guest_text", text: "David Thomas" });
  assert(s.stage === "need_phone", "name -> need_phone");
  s = reduce(s, { type: "guest_text", text: "+91 98470 33321" });
  assert(s.stage === "need_guests", "phone -> need_guests");
  s = reduce(s, { type: "guest_text", text: "2" });
  assert(s.stage === "need_dates", "guests -> need_dates");
  s = reduce(s, {
    type: "book_dates",
    checkIn: "2026-09-10",
    checkInTime: "13:00",
    checkOut: "2026-09-12",
    checkOutTime: "11:00",
    guests: 2,
  });
  assert(s.stage === "review" && /₹3,600/.test(lastGuest(s)), "dates -> review w/ ₹3,600");
  s = reduce(s, { type: "action", id: "confirm" });
  assert(s.stage === "staying" && !!s.booking, "confirmed -> staying");
  assert(/New booking/.test(lastOwner(s)) && /\+91 98470 33321/.test(lastOwner(s)), "owner got booking w/ phone");
  assert(/David Thomas/.test(s.ownerThread.map((m) => m.text).join("\n")), "owner has name");

  // last-day reminder
  s = reduce(s, { type: "director", cmd: "lastday" });
  assert(/last day/i.test(lastGuest(s)), "last-day reminder sent");

  // extend into a conflict -> move
  s = reduce(s, { type: "action", id: "want_extend" });
  assert(s.stage === "ext_need_dates", "want_extend -> ext_need_dates");
  s = reduce(s, { type: "extend_dates", checkOut: "2026-09-15", checkOutTime: "11:00" });
  assert(s.stage === "ext_pending_owner" && /already booked/.test(lastOwner(s)), "extend conflict shown to owner");
  s = reduce(s, { type: "action", id: "ext_move" });
  assert(s.stage === "owner_choosing_room" && (s.ownerThread.at(-1)!.actions?.length ?? 0) > 0, "owner sees free rooms");
  const pick = s.ownerThread.at(-1)!.actions![0].event;
  s = reduce(s, { type: "action", id: pick });
  assert(s.stage === "guest_choosing_move" && /switch to/i.test(lastGuest(s)), "guest offered the move");
  s = reduce(s, { type: "action", id: "accept_move" });
  assert(s.stage === "staying" && !!s.booking!.moveRoomId, "move accepted, booking has moveRoomId");

  // clean approve path
  let s2 = initialState("102");
  s2.followOn = null;
  s2 = reduce(s2, { type: "guest_text", text: "book room 102" });
  s2 = reduce(s2, { type: "guest_text", text: "Meera" });
  s2 = reduce(s2, { type: "guest_text", text: "9000000000" });
  s2 = reduce(s2, { type: "guest_text", text: "2" });
  s2 = reduce(s2, { type: "book_dates", checkIn: "2026-10-01", checkInTime: "14:00", checkOut: "2026-10-03", checkOutTime: "11:00", guests: 2 });
  s2 = reduce(s2, { type: "action", id: "confirm" });
  s2 = reduce(s2, { type: "director", cmd: "lastday" });
  s2 = reduce(s2, { type: "action", id: "want_extend" });
  s2 = reduce(s2, { type: "extend_dates", checkOut: "2026-10-05", checkOutTime: "11:00" });
  assert(/FREE/.test(lastOwner(s2)), "no-conflict -> owner sees FREE");
  s2 = reduce(s2, { type: "action", id: "ext_approve" });
  assert(s2.stage === "staying" && s2.booking!.checkOut === "2026-10-05", "approve -> checkout moved");

  // checkout path
  let s3 = initialState("103");
  s3 = reduce(s3, { type: "guest_text", text: "book room 103" });
  s3 = reduce(s3, { type: "guest_text", text: "Sam" });
  s3 = reduce(s3, { type: "guest_text", text: "9111111111" });
  s3 = reduce(s3, { type: "guest_text", text: "2" });
  s3 = reduce(s3, { type: "book_dates", checkIn: "2026-10-01", checkInTime: "13:00", checkOut: "2026-10-04", checkOutTime: "11:00", guests: 2 });
  s3 = reduce(s3, { type: "action", id: "confirm" });
  s3 = reduce(s3, { type: "director", cmd: "lastday" });
  s3 = reduce(s3, { type: "action", id: "want_checkout" });
  assert(s3.stage === "ended" && /check-out/i.test(lastOwner(s3)), "checkout -> owner notified, ended");

  console.log("\nall wa-sim checks passed");
}
