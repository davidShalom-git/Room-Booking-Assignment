/**
 * Everything the assistant says, and the owner's notification texts. Plain functions; *bold* markup
 * only. Anything about the property itself (name, phone, times, advance, UPI) comes from `s`, the
 * owner's settings.
 */
import { config } from "@/config";
import { phonePretty } from "@/lib/phone";
import type { Settings } from "@/lib/settings";
import { istTime } from "@/lib/dates";
import { formatDate, formatDateTime, formatINR, formatTime } from "@/lib/pricing";
import type { BookingView, PaymentView, RoomInfo, StayView } from "./types";

export const firstName = (n: string) => n.trim().split(/\s+/)[0] || "there";
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const inAt = (b: BookingView) => formatDateTime(b.checkIn, b.checkInTime);
const outAt = (b: BookingView) => formatDateTime(b.checkOut, b.checkOutTime);
export const advanceOf = (total: number, s: Pick<Settings, "advancePercent">) => Math.round((total * s.advancePercent) / 100);
const holdUntil = (b: BookingView) => (b.holdExpiresAt ? formatTime(istTime(new Date(b.holdExpiresAt))) : "shortly");

export const roomTitle = (r: Pick<RoomInfo, "id" | "name">) => `*Room ${r.id} — ${r.name}*`;
const roomFacts = (r: RoomInfo) => `${formatINR(r.pricePerNight)}/night, sleeps ${r.capacity}, ${r.ac ? "AC" : "Non-AC"}`;

/** The pay page: UPI button (opens the guest's UPI app with the amount), QR code and UTR box. */
export const payUrl = (b: Pick<BookingView, "id">) => `${config.baseUrl}/pay/${b.id}`;

// --- guest: browsing ------------------------------------------------------

export const welcome = (s: Settings) =>
  `Hi! 👋 Welcome to ${s.name}. Which room would you like to know about or book?`;

export const intro = (s: Settings, r: RoomInfo) =>
  `Hi! 👋 Welcome to ${s.name}.\nYou're asking about ${roomTitle(r)} (${roomFacts(r)}).\nAsk me anything, or book right here.`;

export const details = (r: RoomInfo) =>
  [
    roomTitle(r),
    `${formatINR(r.pricePerNight)}/night · ${r.bed} · sleeps ${r.capacity} · ${r.ac ? "AC" : "Non-AC"} · ${r.size}`,
    ``,
    r.shortDescription,
    ``,
    `Amenities: ${r.amenities.slice(0, 6).join(", ")}…`,
  ].join("\n");

export const priceText = (r: RoomInfo) => `Room ${r.id} is ${formatINR(r.pricePerNight)} per night.`;

/** From the property's amenities, so it never promises what the place doesn't offer. */
export const breakfast = (s: Settings) => {
  const b = s.amenities.find((a) => /breakfast/i.test(a));
  return b
    ? `Yes — ${b.charAt(0).toLowerCase()}${b.slice(1)}. The front desk can tell you the timings.`
    : `Breakfast isn't included here, but the front desk (${phonePretty(s.phone)}) can point you to good places nearby.`;
};

export const menu = (r: RoomInfo) =>
  `I can tell you about Room ${r.id}, check availability, or take your booking. What would you like?`;

export const thanks = () => "You're welcome! See you soon 🌴";

export const handoff = (s: Settings) =>
  `You can call the front desk on ${phonePretty(s.phone)} — or leave your number here and they'll call you back.`;

export const ownerHandoff = (b: { room?: RoomInfo | null; phone?: string }) =>
  `💬 A guest in the website chat would like to talk to the front desk${b.room ? ` about Room ${b.room.id}` : ""}.\n${b.phone ? `Call them: ${phonePretty(b.phone)}` : "They haven't left a number yet."}`;

// --- guest: booking questions ----------------------------------------------

export const askName = (r: RoomInfo) => `Let's book ${roomTitle(r)}. What name should the booking be under?`;
export const askNameAgain = () => "Sorry, I didn't catch a name. What name should the booking be under?";
export const askPhone = () =>
  "What's your mobile number? We'll use it for this booking — with the country code if it isn't Indian, e.g. *+44 7700 900123*.";
export const askPhoneAgain = () => "Please type your mobile number, e.g. *98450 21133* (or *+44 7700 900123* from abroad).";
export const askGuests = () => "How many guests?";
export const askGuestsAgain = (r: RoomInfo) =>
  `Room ${r.id} sleeps ${r.capacity}. Please send a number from 1 to ${r.capacity}.`;
export const askCheckIn = () =>
  "What's your check-in date? Type it like *12 oct*, *12/10* or *tomorrow*.";
export const askCheckInAgain = (reason: "unreadable" | "past" | "invalid") =>
  reason === "past"
    ? "That date has already passed. Try *12 oct*, *12/10* or *tomorrow*."
    : reason === "invalid"
      ? "That isn't a real date. Try *12 oct*, *12/10* or *tomorrow*."
      : "I couldn't read that date. Try *12 oct*, *12/10* or *tomorrow*.";
export const askCheckOut = (checkIn: string) =>
  `Check-in ${formatDate(checkIn)} ✔️ And your check-out date? Type it like *14 oct*, or tap the number of nights.`;
export const askCheckOutAgain = (checkIn: string) =>
  `Check-out needs to be after ${formatDate(checkIn)}, within ${config.defaults.maxNights} nights — type a date like *14 oct*, or a number of nights like *2*.`;

// --- guest: availability + review -----------------------------------------

export const free = (r: RoomInfo, checkIn: string, checkOut: string, n: number) =>
  `✅ ${roomTitle(r)} is free ${formatDate(checkIn)} → ${formatDate(checkOut)} (${plural(n, "night")}).\nTotal: ${formatINR(r.pricePerNight * n)}.`;

export const taken = (r: RoomInfo, checkIn: string, checkOut: string) =>
  `Sorry — Room ${r.id} is booked for ${formatDate(checkIn)} → ${formatDate(checkOut)}.`;

export const alternatives = (r: RoomInfo, checkIn: string, checkOut: string) =>
  `${taken(r, checkIn, checkOut)} These rooms are free for your dates:`;

export const nothingFree = (r: RoomInfo, checkIn: string, checkOut: string) =>
  `${taken(r, checkIn, checkOut)} Nothing else is free for those dates. Would you like to try other dates?`;

export const justTaken = (r: RoomInfo) => `Oh no — Room ${r.id} was just taken by someone else.`;

export const review = (
  s: Settings,
  r: RoomInfo,
  d: { name: string; phone: string; checkIn: string; nights: number; checkOut: string; guests: number },
) =>
  [
    `Here's your booking:`,
    ``,
    roomTitle(r),
    `Name: ${d.name}`,
    `Phone: ${phonePretty(d.phone)}`,
    `Check-in: ${formatDateTime(d.checkIn, s.checkInTime)}`,
    `Check-out: ${formatDateTime(d.checkOut, s.checkOutTime)}`,
    `Duration: ${plural(d.nights, "night")}`,
    `Guests: ${d.guests}`,
    `Total: ${formatINR(r.pricePerNight * d.nights)} · ${s.advancePercent}% advance to confirm: ${formatINR(advanceOf(r.pricePerNight * d.nights, s))}`,
  ].join("\n");

// --- guest: paying ---------------------------------------------------------

export function paymentRequest(s: Settings, b: BookingView, amount: number): string {
  const isExtension = b.parentId !== null;
  return [
    isExtension
      ? `Room ${b.roomId} is held for your extra nights until ${holdUntil(b)}. Extensions are paid in full.`
      : `Almost there — Room ${b.roomId} is held for you until ${holdUntil(b)} with a ${s.advancePercent}% advance. Balance at check-in.`,
    ``,
    `Total: ${formatINR(b.total)}`,
    `Pay now: ${formatINR(amount)}`,
    ...(isExtension ? [] : [`Balance at check-in: ${formatINR(b.total - amount)}`]),
    ``,
    s.upiId
      ? `Pay by UPI to *${s.upiId}* (${s.upiName}). Tap to open your UPI app:\n${payUrl(b)}`
      : `The front desk will send you payment details here shortly.`,
    ``,
    `Once paid, tap *I've paid* and send the UPI reference (UTR). Ref: ${b.ref}`,
  ].join("\n");
}

export const paymentReminder = (b: BookingView, amount: number) =>
  `Your Room ${b.roomId} hold (${b.ref}) is waiting for ${formatINR(amount)} until ${holdUntil(b)}. Pay here: ${payUrl(b)}\nThen tap *I've paid* — or *Cancel booking* to release the room.`;

export const askUtr = (amount: number) =>
  `Great! Please send the 12-digit UPI reference (UTR) for your ${formatINR(amount)} payment — you'll find it in your UPI app under this transaction.`;
export const askUtrAgain = () =>
  "That doesn't look like a UTR. It's a 12-digit number from your UPI app, like *412345678901*.";
export const claimThanks = (p: PaymentView) =>
  `Thanks! Your ${formatINR(p.amount)} payment (UTR ${p.utr}) is with the front desk. You'll get your confirmation here as soon as they've checked it. 🙏`;
export const claimStillChecking = (p: PaymentView) =>
  `Your payment (UTR ${p.utr}) is with the front desk — you'll hear back here shortly. Paid again or sent the wrong UTR? Tap *I've paid* to send it again.`;
export const paymentNotReceived = (p: PaymentView) =>
  `The front desk couldn't find your ${formatINR(p.amount)} payment${p.utr ? ` (UTR ${p.utr})` : ""} yet. Please check the UTR in your UPI app and send it again, or tap *Cancel booking*.`;

export const holdCancelledByGuest = (b: BookingView) =>
  `Done — your hold on Room ${b.roomId} (${b.ref}) is cancelled and the room is released. Anything else I can help with?`;

export const alreadyHolding = (b: BookingView, amount: number) =>
  `You already have Room ${b.roomId} on hold (${b.ref}, ${formatDate(b.checkIn)} → ${formatDate(b.checkOut)}). Pay the ${formatINR(amount)} and tap *I've paid*, or tap *Cancel booking* to release it before booking another room.`;

export const holdExpired = (b: BookingView) =>
  `Your hold on Room ${b.roomId} expired before the payment came through, so the room has been released. Would you like to start again?`;

export const bookingConfirmed = (s: Settings, b: BookingView) =>
  [
    `✅ *Booking confirmed* — ${s.name}`,
    ``,
    `Booking ID: ${b.ref}`,
    `Room: ${b.roomName} — ${b.roomId}`,
    `Name: ${b.guestName}`,
    `Check-in: ${inAt(b)}`,
    `Check-out: ${outAt(b)}`,
    `Duration: ${plural(b.nights, "night")}`,
    `Guests: ${b.guests}`,
    `Total: ${formatINR(b.total)}  ·  Paid: ${formatINR(b.advancePaid)}  ·  Due at check-in: ${formatINR(b.total - b.advancePaid)}`,
    ``,
    `${s.address}. See you soon! 🌴`,
  ].join("\n");

export const holdCancelledByDesk = (b: BookingView) =>
  `Sorry — the front desk couldn't hold Room ${b.roomId} for ${formatDate(b.checkIn)} → ${formatDate(b.checkOut)}, so your request (${b.ref}) has been cancelled. Ask here for other dates.`;

export const bookingCancelledByDesk = (s: Settings, b: BookingView) =>
  `Your booking ${b.ref} (Room ${b.roomId}, ${formatDate(b.checkIn)} → ${formatDate(b.checkOut)}) has been cancelled by the front desk. If that's unexpected, reply here or call ${phonePretty(s.phone)}.`;

export const myBookings = (list: BookingView[]) =>
  [
    list.length === 1 ? "Here's your booking:" : "Here are your bookings:",
    ...list.map((b) => {
      const state =
        b.status === "PENDING"
          ? `⏳ waiting for payment (held until ${holdUntil(b)}) — pay here: ${payUrl(b)}`
          : `✅ confirmed · paid ${formatINR(b.advancePaid)}${b.total > b.advancePaid ? ` · ${formatINR(b.total - b.advancePaid)} due at check-in` : ""}`;
      const kind = b.parentId ? " (extension)" : "";
      return `\n*${b.ref}*${kind} — Room ${b.roomId}, ${b.roomName}\n${inAt(b)} → ${outAt(b)}\n${state}`;
    }),
  ].join("\n");

export const noBookings = () => "I couldn't find an upcoming booking in this chat. Would you like to book a room?";

// --- guest: last day / extension ----------------------------------------------

export const nudge = (b: BookingView) =>
  [
    `Hi ${firstName(b.guestName)} 👋`,
    `Tomorrow, ${formatDate(b.checkOut)}, is your last day with us. Check-out is ${formatTime(b.checkOutTime)}.`,
    ``,
    `Would you like to extend your stay, or check out as planned?`,
  ].join("\n");

export const checkoutAck = (b: BookingView) =>
  `All set — check-out is confirmed for ${outAt(b)}. Thanks for staying with us! 🌴`;

export const noStayToExtend = () => "I couldn't find a confirmed stay in this chat to extend.";
export const stayEnded = (end: BookingView) =>
  `Your stay in Room ${end.roomId} ended on ${formatDate(end.checkOut)}, so it can't be extended now. To stay with us again, type *menu* and book.`;

export const askExtendDate = (end: BookingView) =>
  `Sure! Your stay currently ends ${outAt(end)} (Room ${end.roomId}). Until which date would you like to stay? Type it like *16 oct*, or *+2 nights*.`;
export const askExtendDateAgain = (end: BookingView) =>
  `Please give a date after ${formatDate(end.checkOut)} (up to ${config.defaults.maxNights} nights in total) — like *16 oct* or *+2 nights*.`;

export const extensionSameRoom = (seg: BookingView) =>
  `Good news — Room ${seg.roomId} is free until ${formatDate(seg.checkOut)} ✅\n${plural(seg.nights, "extra night")}: ${formatINR(seg.total)}, paid in full to confirm.`;

export const extensionRoomTaken = (end: BookingView, to: string) =>
  `Room ${end.roomId} is booked by another guest after ${formatDate(end.checkOut)}, but these rooms are free until ${formatDate(to)} — pick one and you'll move after check-out time on ${formatDate(end.checkOut)}:`;

export const extensionMove = (seg: BookingView, fromRoomId: string) =>
  `Room ${seg.roomId} — ${seg.roomName} is yours from ${formatDate(seg.checkIn)} ✅ (moving from Room ${fromRoomId})\n${plural(seg.nights, "extra night")}: ${formatINR(seg.total)}, paid in full to confirm.`;

export const extensionNoRooms = (end: BookingView) =>
  `Sorry — we're fully booked for those nights, so we can't extend this time. Your check-out stays ${outAt(end)}.`;

export const extensionConfirmed = (seg: BookingView, fromRoomId: string | null) =>
  fromRoomId && fromRoomId !== seg.roomId
    ? `✅ *You're extended* to ${outAt(seg)}.\nFrom ${formatDate(seg.checkIn)} (after check-out time) you'll be in *Room ${seg.roomId} — ${seg.roomName}* — we'll help with your bags. Paid: ${formatINR(seg.advancePaid)}.`
    : `✅ *You're extended* — Room ${seg.roomId} until ${outAt(seg)}. Paid: ${formatINR(seg.advancePaid)}. Enjoy the extra nights! 🌴`;

/** What the guest hears when the owner acknowledges their payment. */
export function acknowledgedToGuest(s: Settings, p: PaymentView, stay: StayView | null): string {
  const b = p.booking;
  if (p.kind !== "EXTENSION") return bookingConfirmed(s, b);
  const prev = stay ? [stay.root, ...stay.segments].find((x) => x.id !== b.id && x.checkOut === b.checkIn) : null;
  return extensionConfirmed(b, prev?.roomId ?? null);
}

/**
 * The confirmation as a wa.me link: the owner taps it and sends it from their own WhatsApp — the
 * guest gets it where they'll see it, and no WhatsApp API or setup is involved.
 */
export const whatsappConfirmation = (s: Settings, b: BookingView) =>
  `https://wa.me/${b.guestPhone}?text=${encodeURIComponent(
    `Hi ${firstName(b.guestName)} 👋\n\n${b.parentId ? extensionConfirmed(b, null) : bookingConfirmed(s, b)}\n\nYour booking: ${payUrl(b)}`,
  )}`;

export const notYourBooking = () => "I couldn't find that booking in this chat.";
export const staleButton = () => "That option is out of date — pick one from the latest message, or type *menu*.";

// --- owner (notifications in the owner app) ------------------------------------

const stayLine = (b: BookingView) =>
  `Room ${b.roomId} · ${formatDate(b.checkIn)} → ${formatDate(b.checkOut)} (${plural(b.nights, "night")})`;

/** The alert the owner acts on: who paid what for which room, with the UTR to match. */
export function ownerPaymentClaim(p: PaymentView, stay: StayView | null, duplicateRef: string | null): string {
  const b = p.booking;
  const who = `${b.guestName} · ${phonePretty(b.guestPhone)}${b.contactPhone ? ` (contact ${phonePretty(b.contactPhone)})` : ""}`;
  let what: string;
  if (p.kind === "EXTENSION") {
    const before = stay ? [stay.root, ...stay.segments].find((x) => x.id !== b.id && x.checkOut === b.checkIn && x.status === "CONFIRMED") : null;
    what =
      before && before.roomId !== b.roomId
        ? `extends ${plural(b.nights, "night")} to ${formatDate(b.checkOut)}, *moving Room ${before.roomId} → ${b.roomId}* on ${formatDate(b.checkIn)}`
        : `extends Room ${b.roomId} by ${plural(b.nights, "night")} (to ${formatDate(b.checkOut)})`;
  } else {
    what = `advance for ${stayLine(b)} · ${plural(b.guests, "guest")}`;
  }
  return [
    `💰 *Payment to check* — ${formatINR(p.amount)}`,
    ``,
    `${who}`,
    `${p.kind === "EXTENSION" ? "Extension: " : ""}${what}`,
    `UTR: *${p.utr}*`,
    ...(duplicateRef ? [`⚠️ This UTR was already used on ${duplicateRef} — check before acknowledging.`] : []),
    `Ref: ${b.ref}`,
    ``,
    `Check your UPI app / bank SMS for this UTR, then acknowledge.`,
  ].join("\n");
}

export const ownerCheckout = (b: BookingView) =>
  `✅ ${firstName(b.guestName)} (Room ${b.roomId}) confirmed *check-out* — ${outAt(b)}. Room frees at ${formatTime(b.checkOutTime)}.`;
export const ownerClaimCancelledByGuest = (b: BookingView) =>
  `↩️ ${b.guestName} cancelled ${b.ref} (Room ${b.roomId}) after sending a payment reference — please refund them if the money arrived.`;
