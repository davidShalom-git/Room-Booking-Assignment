/**
 * What the owner can do from the admin console. Plain async functions (no Next.js APIs) so they
 * can be tested directly; app/admin/actions.ts wraps each one with the session check.
 * Guests who booked in the website chat hear about changes the owner makes here, in that chat.
 */
import { prisma } from "@/lib/db";
import * as engine from "@/lib/engine";
import * as payments from "@/lib/payments";
import { normalizePhone, validPhone } from "@/lib/phone";
import { paymentView, stayView, toView } from "@/lib/bot/ports-prisma";
import * as C from "@/lib/bot/copy";
import type { Out } from "@/lib/bot/types";
import { deliver } from "@/lib/deliver";
import { parseDateText } from "@/lib/dates";
import { formatDate, formatINR, nights as nightsBetween } from "@/lib/pricing";

export type OpResult = { ok: true; message?: string } | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string): OpResult => ({ ok: false, error, ...(field ? { field } : {}) });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (input: Record<string, string | undefined>, k: string) => String(input[k] ?? "").trim();


// --- bookings ---------------------------------------------------------------------

/** Guests who booked in the website chat hear about what the desk does, in that chat. */
const tellGuest = (b: { chatKey: string | null }, text: string, extra: Partial<Out> = {}) =>
  b.chatKey ? deliver([{ to: b.chatKey, text, ...extra }]) : Promise.resolve();

function parseAmount(raw: string | undefined, max: number): number | undefined | null {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  return /^\d+$/.test(s) && Number(s) <= max ? Number(s) : null;
}

/**
 * Acknowledge a payment (the money arrived): the booking or extension is confirmed and the guest
 * is told. `amountRaw` records a different amount than was asked for (blank = as asked).
 */
export async function acknowledgeAsAdmin(paymentId: string, amountRaw?: string): Promise<OpResult> {
  const before = await payments.paymentById(paymentId);
  if (!before) return fail("Payment not found.");
  const ref = engine.bookingRef(before.booking);
  const amount = parseAmount(amountRaw, before.booking.total);
  if (amount === null) return fail(`Enter an amount between ₹0 and ${formatINR(before.booking.total)}.`, "amount");
  const r = await payments.acknowledgePayment(paymentId, amount);
  if (!r.ok) {
    if (r.code === "CONFLICT") {
      const who = r.conflict ? ` by ${r.conflict.guestName} (${r.conflict.ref})` : "";
      return fail(`The hold on ${ref} expired and Room ${before.booking.roomId} has since been booked${who}. Nothing was confirmed — please refund ${before.booking.guestName}.`);
    }
    if (r.code === "SUPERSEDED") return fail(`${r.message} Nothing was confirmed — please refund ${before.booking.guestName}.`);
    return fail(r.message);
  }
  if (r.value.already) return { ok: true, message: `${ref} is already acknowledged.` };
  const stay = r.value.kind === "EXTENSION" ? await engine.stayOf(r.value.bookingId) : null;
  await tellGuest(r.value.booking, C.acknowledgedToGuest(paymentView(r.value), stay ? stayView(stay) : null));
  return { ok: true, message: `Acknowledged ${formatINR(r.value.amount)} for ${ref}. The booking is confirmed.` };
}

/** "Not received": the guest is asked to check the payment and send the UTR again. */
export async function rejectAsAdmin(paymentId: string): Promise<OpResult> {
  const r = await payments.rejectPayment(paymentId);
  if (!r.ok) return fail(r.message);
  if (r.value.already) return { ok: true, message: `${engine.bookingRef(r.value.booking)} is already marked as not received.` };
  const v = paymentView(r.value);
  await tellGuest(r.value.booking, `${C.paymentNotReceived(v)}\n${C.payUrl(v.booking)}`, {
    buttons: [
      { id: `i_paid:${v.bookingId}`, title: "I've paid" },
      { id: `cancel_hold:${v.bookingId}`, title: "Cancel booking" },
    ],
  });
  return { ok: true, message: `Marked ${engine.bookingRef(r.value.booking)} as not received. ${r.value.booking.guestName} has been asked to check.` };
}

/** "Advance received" on a booking: acknowledges whatever it owes (or confirms it if nothing is on record). */
export async function confirmAdvance(id: string, amountRaw?: string): Promise<OpResult> {
  const before = await engine.getBooking(id);
  if (!before) return fail("Booking not found.");
  const ref = engine.bookingRef(before);
  if (before.status === "CONFIRMED") return { ok: true, message: `${ref} is already confirmed.` };
  const owed = await payments.openPayment(id);
  if (owed) return acknowledgeAsAdmin(owed.id, amountRaw);

  const amount = parseAmount(amountRaw, before.total);
  if (amount === null) return fail(`Enter an advance between ₹0 and ${formatINR(before.total)}.`, "amount");
  const r = await payments.confirmBooking(id, amount);
  if (!r.ok) {
    if (r.code === "CONFLICT") {
      const who = r.conflict ? ` by ${r.conflict.guestName} (${r.conflict.ref})` : "";
      return fail(`The hold on ${ref} expired and Room ${before.roomId} has since been booked${who}. Nothing was confirmed.`);
    }
    if (r.code === "SUPERSEDED") return fail(`${r.message} Nothing was confirmed — refund ${before.guestName} if their money arrived.`);
    return fail(r.message);
  }
  await tellGuest(r.value, C.bookingConfirmed(toView(r.value)));
  return { ok: true, message: `Confirmed ${ref} — ${formatINR(r.value.advancePaid)} recorded.` };
}

/** The rest paid at the property. */
export async function balanceReceived(id: string): Promise<OpResult> {
  const r = await payments.recordBalance(id);
  if (!r.ok) return fail(r.message);
  return { ok: true, message: `Balance ${formatINR(r.value.amount)} recorded for ${engine.bookingRef(r.value.booking)} — fully paid.` };
}

export async function cancelAsAdmin(id: string): Promise<OpResult> {
  const b = await engine.getBooking(id);
  if (!b) return fail("Booking not found.");
  const ref = engine.bookingRef(b);
  if (b.status === "CANCELLED" && b.holdExpiresAt === null) return { ok: true, message: `${ref} is already cancelled.` };
  const wasActive = b.status !== "CANCELLED";
  const r = await engine.cancelBooking(id);
  if (!r.ok) return fail(r.message);
  if (wasActive) {
    const v = toView(r.value);
    await tellGuest(b, b.status === "CONFIRMED" ? C.bookingCancelledByDesk(v) : C.holdCancelledByDesk(v));
  }
  return { ok: true, message: `Cancelled ${ref}. Room ${b.roomId} is free for those dates again.` };
}

/** A booking taken by phone / at the desk. Confirmed straight away. */
export async function createWalkIn(input: Record<string, string | undefined>): Promise<OpResult> {
  const room = await prisma.room.findUnique({ where: { id: text(input, "roomId") } });
  if (!room) return fail("Pick a room.", "roomId");
  if (!room.active) return fail(`Room ${room.id} is hidden. Show it on the Rooms page first.`, "roomId");

  const guestName = text(input, "guestName");
  if (guestName.length < 2 || guestName.length > 80) return fail("Enter the guest's name.", "guestName");
  const guestPhone = normalizePhone(text(input, "guestPhone"));
  if (guestPhone.length < 11 || guestPhone.length > 15) {
    return fail("Enter the guest's phone with country code, e.g. +91 98450 21133.", "guestPhone");
  }
  const guestsRaw = text(input, "guests");
  if (!/^\d{1,2}$/.test(guestsRaw) || Number(guestsRaw) < 1) return fail("Enter the number of guests.", "guests");
  const guests = Number(guestsRaw);
  if (guests > room.capacity) return fail(`Room ${room.id} sleeps ${room.capacity}.`, "guests");

  const checkIn = text(input, "checkIn");
  const checkOut = text(input, "checkOut");
  if (!DATE_RE.test(checkIn)) return fail("Pick a check-in date.", "checkIn");
  if (!DATE_RE.test(checkOut) || checkOut <= checkIn) return fail("Check-out must be after check-in.", "checkOut");
  const checkInTime = text(input, "checkInTime") || "13:00";
  const checkOutTime = text(input, "checkOutTime") || "11:00";
  if (!TIME_RE.test(checkInTime)) return fail("Check-in time must look like 13:00.", "checkInTime");
  if (!TIME_RE.test(checkOutTime)) return fail("Check-out time must look like 11:00.", "checkOutTime");

  const total = room.pricePerNight * nightsBetween(checkIn, checkOut);
  const advRaw = text(input, "advancePaid") || "0";
  if (!/^\d+$/.test(advRaw) || Number(advRaw) > total) {
    return fail(`Advance must be between ₹0 and the total, ${formatINR(total)}.`, "advancePaid");
  }

  const r = await engine.createBooking({
    roomId: room.id,
    guestName,
    guestPhone,
    guests,
    checkIn,
    checkOut,
    checkInTime,
    checkOutTime,
    status: "CONFIRMED",
    source: "ADMIN",
    advancePaid: Number(advRaw),
  });
  if (!r.ok) {
    if (r.code === "CONFLICT") {
      const c = r.conflict;
      return fail(
        c
          ? `Room ${room.id} is already booked ${formatDate(c.checkIn)} → ${formatDate(c.checkOut)} by ${c.guestName} (${c.ref}).`
          : `Room ${room.id} is already booked for those dates.`,
        "roomId",
      );
    }
    return fail(r.message, r.code === "CAPACITY" ? "guests" : "checkOut");
  }
  return {
    ok: true,
    message: `Booked ${engine.bookingRef(r.value)} — Room ${room.id}, ${formatDate(checkIn)} → ${formatDate(checkOut)}, ${formatINR(r.value.total)}.`,
  };
}

// --- rooms ------------------------------------------------------------------------

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

function httpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

/** Create (no existingId) or edit a room. Price changes never touch existing bookings. */
export async function saveRoom(input: Record<string, string | undefined>, existingId?: string): Promise<OpResult> {
  const id = existingId ?? text(input, "id");
  if (existingId) {
    if (!(await prisma.room.findUnique({ where: { id } }))) return fail("Room not found.");
  } else {
    if (!/^[A-Za-z0-9-]{1,8}$/.test(id) || id.toLowerCase() === "new") {
      return fail("Room number: up to 8 letters, digits or dashes (e.g. 105).", "id");
    }
    if (await prisma.room.findUnique({ where: { id } })) return fail(`Room ${id} already exists.`, "id");
  }

  const name = text(input, "name");
  if (name.length < 2 || name.length > 80) return fail("Give the room a name.", "name");
  const type = text(input, "type") || name;
  if (type.length > 60) return fail("Keep the type under 60 characters.", "type");
  const price = text(input, "pricePerNight");
  if (!/^\d{1,7}$/.test(price) || Number(price) < 1) return fail("Price per night must be a whole number of rupees.", "pricePerNight");
  const capacity = text(input, "capacity");
  if (!/^\d{1,2}$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 20) {
    return fail("Sleeps must be between 1 and 20.", "capacity");
  }
  const bed = text(input, "bed");
  if (!bed || bed.length > 60) return fail("Describe the beds, e.g. King Bed.", "bed");
  const size = text(input, "size");
  if (size.length > 30) return fail("Keep the size short, e.g. 24 m².", "size");
  const floor = text(input, "floor") || "0";
  if (!/^-?\d{1,3}$/.test(floor)) return fail("Floor must be a number.", "floor");
  const shortDescription = text(input, "shortDescription");
  if (!shortDescription || shortDescription.length > 200) return fail("Add a one-line description (up to 200 characters).", "shortDescription");
  const description = text(input, "description");
  if (!description || description.length > 4000) return fail("Add a description.", "description");

  const amenities = String(input["amenities"] ?? "").split(/[\n,]/).map((a) => a.trim()).filter(Boolean);
  if (amenities.length > 40 || amenities.some((a) => a.length > 40)) return fail("Up to 40 amenities, each under 40 characters.", "amenities");
  const images = lines(String(input["images"] ?? ""));
  if (images.length === 0) return fail("Add at least one photo URL.", "images");
  if (images.length > 12) return fail("Up to 12 photos.", "images");
  if (!images.every(httpsUrl)) return fail("Photo URLs must start with https://", "images");

  const data = {
    name,
    type,
    pricePerNight: Number(price),
    capacity: Number(capacity),
    bed,
    ac: input["ac"] === "on" || input["ac"] === "true",
    size,
    floor: Number(floor),
    shortDescription,
    description,
    amenities,
    images,
    active: input["active"] === "on" || input["active"] === "true",
  };
  if (existingId) {
    await prisma.room.update({ where: { id }, data });
    return { ok: true, message: `Saved Room ${id}.` };
  }
  const max = await prisma.room.aggregate({ _max: { sortOrder: true } });
  await prisma.room.create({ data: { id, ...data, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  return { ok: true, message: `Added Room ${id}.` };
}

export async function setRoomActive(id: string, active: boolean): Promise<OpResult> {
  const r = await prisma.room.updateMany({ where: { id }, data: { active } });
  if (r.count === 0) return fail("Room not found.");
  return {
    ok: true,
    message: active ? `Room ${id} is bookable again.` : `Room ${id} is hidden from the site and the chat. Existing bookings are kept.`,
  };
}

// --- import ------------------------------------------------------------------------

/** Minimal CSV: commas, "quoted, fields" and "" escapes. */
export function parseCsv(textIn: string): string[][] {
  const rows: string[][] = [];
  for (const line of textIn.replace(/\r/g, "").split("\n")) {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

/**
 * A date with its year written out, in any common form: 2026-10-12, 2026/10/12, 12/10/2026,
 * 12-10-2026, 12 Oct 2026, 12-Oct-2026. The year read must be the one in the cell.
 */
function importDate(v: string): string | null {
  const year = /\b(\d{4})\b/.exec(v)?.[1];
  if (!year) return null;
  const s = v
    .trim()
    .replace(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/, "$1-$2-$3")
    .replace(/(\d)[-/.]([a-z]{3,9})\.?[-/.](\d{4})/i, "$1 $2 $3");
  const iso = parseDateText(s, "2000-01-01");
  return iso?.startsWith(`${year}-`) ? iso : null;
}

export type ImportResult = { created: string[]; errors: { line: number; error: string }[] };

/**
 * Existing bookings from a spreadsheet: `room,guest name,phone,check-in,check-out,guests,advance paid`.
 * Each row becomes a confirmed desk booking through the engine, so clashes are reported, not saved.
 */
export async function importBookings(csv: string): Promise<ImportResult> {
  const out: ImportResult = { created: [], errors: [] };
  const rows = parseCsv(csv);
  for (let i = 0; i < rows.length; i++) {
    const line = i + 1;
    const r = rows[i]!;
    if (r.every((c) => !c)) continue;
    if (i === 0 && /^room$/i.test(r[0] ?? "")) continue; // header
    const [roomId = "", name = "", phoneRaw = "", inRaw = "", outRaw = "", guestsRaw = "1", paidRaw = "0"] = r;
    const checkIn = importDate(inRaw);
    const checkOut = importDate(outRaw);
    const phone = normalizePhone(phoneRaw);
    const guests = Number(guestsRaw || "1");
    const paid = Number((paidRaw || "0").replace(/[₹,\s]/g, ""));
    const problem = !roomId
      ? "no room"
      : !name
        ? "no guest name"
        : !validPhone(phone)
          ? "phone needs a country code (or a 10-digit Indian mobile)"
          : !checkIn || !checkOut
            ? "dates must include the year, e.g. 12/10/2026"
            : !Number.isInteger(guests) || guests < 1
              ? "guests must be a number"
              : !Number.isFinite(paid) || paid < 0
                ? "advance paid must be a number"
                : null;
    if (problem) {
      out.errors.push({ line, error: problem });
      continue;
    }
    const b = await engine.createBooking({
      roomId, guestName: name, guestPhone: phone, guests, checkIn: checkIn!, checkOut: checkOut!,
      status: "CONFIRMED", source: "ADMIN", advancePaid: paid,
    });
    if (b.ok) out.created.push(engine.bookingRef(b.value));
    else if (b.code === "CONFLICT" && b.conflict) {
      out.errors.push({ line, error: `Room ${roomId} is already booked ${formatDate(b.conflict.checkIn)} → ${formatDate(b.conflict.checkOut)} (${b.conflict.guestName}, ${b.conflict.ref})` });
    } else out.errors.push({ line, error: b.message });
  }
  return out;
}
