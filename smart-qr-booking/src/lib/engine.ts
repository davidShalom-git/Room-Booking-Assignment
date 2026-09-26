/**
 * Booking engine — the only place that writes bookings (payments: lib/payments.ts).
 *
 * Overlap safety is a Postgres EXCLUDE constraint (migration `booking_no_overlap`); the
 * pre-checks here only make the common case return a friendly result. Under a race the
 * loser is rejected by the database and mapped to the same CONFLICT result.
 *
 * A *stay* is a root booking plus *segments* (bookings with parentId = root): paid extensions
 * in the same room or a move to another room. Segments are real bookings, so while unpaid they
 * hold their nights under the same constraint.
 *
 * Every function returns a Result instead of throwing for expected outcomes
 * (conflict, not found, bad input). Unexpected errors (DB down) still throw.
 */
import { prisma } from "@/lib/db";
import type { Booking, Customer, Prisma, Room } from "@/generated/prisma/client";
import { config } from "@/config";
import { env } from "@/lib/env";
import { toInstant, istDate, istTime } from "@/lib/dates";
import { nights as nightsBetween, makeBookingId, addDays } from "@/lib/pricing";

/** SUPERSEDED: a lapsed extension can't come back — the stay has since been extended another way. */
export type FailCode = "CONFLICT" | "NOT_FOUND" | "INVALID" | "CAPACITY" | "INACTIVE" | "SUPERSEDED";
export type Fail = {
  ok: false;
  code: FailCode;
  message: string;
  /** For CONFLICT: the booking that is in the way (when it could be found). */
  conflict?: { ref: string; checkIn: string; checkOut: string; guestName: string };
};
export type Ok<T> = { ok: true; value: T };
export type Result<T> = Ok<T> | Fail;
export type BookingRow = Booking & { room: Room };
export type Source = "WHATSAPP" | "ADMIN" | "WEB";

export const ACTIVE = ["PENDING", "CONFIRMED"] as const;
/**
 * A hold that lapsed while its payment was already with the desk (UTR sent). Until the owner
 * decides, it still counts as being paid for: no second extension, no "last day" message.
 */
const LAPSED_CLAIMED = {
  status: "CANCELLED",
  holdExpiresAt: { not: null },
  payments: { some: { status: "CLAIMED" } },
} satisfies Prisma.BookingWhereInput;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const good = <T>(value: T): Ok<T> => ({ ok: true, value });
export const bad = (code: FailCode, message: string, conflict?: Fail["conflict"]): Fail => ({
  ok: false,
  code,
  message,
  ...(conflict ? { conflict } : {}),
});

// --- references -----------------------------------------------------------

/** Display reference, e.g. HTL-20261012-007 (IST check-in date + global sequence). */
export function bookingRef(b: Pick<Booking, "seq" | "checkInAt">): string {
  return makeBookingId(istDate(b.checkInAt), b.seq);
}

export function seqFromRef(ref: string): number | null {
  const m = /^HTL-\d{8}-(\d+)$/i.exec(ref.trim());
  return m ? Number(m[1]) : null;
}

// --- helpers ---------------------------------------------------------------

/**
 * Prisma (driver adapter) surfaces Postgres's 23P01 exclusion violation as
 * PrismaClientKnownRequestError P2039 with meta.driverAdapterError.cause.code.
 */
export function isExclusionViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { meta?: { driverAdapterError?: { cause?: { code?: unknown } } }; message?: unknown };
  if (e.meta?.driverAdapterError?.cause?.code === "23P01") return true;
  return typeof e.message === "string" && e.message.includes("booking_no_overlap");
}

/**
 * A write that lost a race for a room. Postgres reports the loser as the exclusion violation
 * above or — when several writers collide on the constraint's index — as a deadlock (40P01) /
 * serialization failure (40001), which Prisma raises as P2034. See tests/concurrency.test.ts.
 */
export function isLostRace(err: unknown): boolean {
  if (isExclusionViolation(err)) return true;
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; meta?: { driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } } } };
  const c = e.meta?.driverAdapterError?.cause;
  return e.code === "P2034" || [c?.code, c?.originalCode].some((x) => x === "40P01" || x === "40001");
}

/**
 * Run a write the no-overlap constraint may reject. A constraint violation is a CONFLICT; a
 * deadlock abort is retried (the other writer usually just won, so the retry sees a CONFLICT).
 */
export async function writeOrConflict<T>(write: () => Promise<T>, conflict: () => Promise<Fail>): Promise<Result<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return good(await write());
    } catch (e) {
      if (!isLostRace(e)) throw e;
      if (isExclusionViolation(e) || attempt >= 4) return conflict();
    }
  }
}

export const withRoom = { room: true } as const;

export async function clashWith(roomId: string, from: Date, to: Date, excludeId?: string) {
  return prisma.booking.findFirst({
    where: {
      roomId,
      status: { in: [...ACTIVE] },
      checkInAt: { lt: to },
      checkOutAt: { gt: from },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { checkInAt: "asc" },
  });
}

export function conflictFail(clash: Booking | null, message = "That room is already booked for those dates."): Fail {
  return bad(
    "CONFLICT",
    message,
    clash
      ? {
          ref: bookingRef(clash),
          checkIn: istDate(clash.checkInAt),
          checkOut: istDate(clash.checkOutAt),
          guestName: clash.guestName,
        }
      : undefined,
  );
}

export const getBooking = (id: string) => prisma.booking.findUnique({ where: { id }, include: withRoom });

// --- customers ---------------------------------------------------------------

const digits = (s: string) => s.replace(/\D/g, "");

export const customerByPhone = (phone: string) => prisma.customer.findUnique({ where: { phone: digits(phone) } });

/** The account for a phone number, created on first use. A blank name is filled in when we learn it. */
export async function ensureCustomer(phone: string, name = ""): Promise<Customer> {
  const p = digits(phone);
  const clean = name.trim().slice(0, 80);
  let c: Customer;
  try {
    c = await prisma.customer.upsert({ where: { phone: p }, create: { phone: p, name: clean }, update: {} });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // created by a parallel request
    c = await prisma.customer.findUniqueOrThrow({ where: { phone: p } });
  }
  if (!c.name && clean) c = await prisma.customer.update({ where: { id: c.id }, data: { name: clean } });
  return c;
}

// --- holds ---------------------------------------------------------------

/**
 * Release unpaid holds whose time is up. Keeps `holdExpiresAt` on the cancelled row: that
 * marks it as "expired" (revivable when a late payment is acknowledged) as opposed to
 * "cancelled". The payment stays owed, so a late payment can still be claimed.
 * Called at the start of every availability read and write, so no cron is needed.
 */
export async function sweepHolds(now: Date = new Date()): Promise<number> {
  const r = await prisma.booking.updateMany({
    where: { status: "PENDING", holdExpiresAt: { lt: now } },
    data: { status: "CANCELLED" },
  });
  return r.count;
}

/**
 * Make a booking CONFIRMED: an unpaid hold, or one that lapsed (only if its nights are still
 * free). One that was cancelled on purpose stays cancelled. Idempotent.
 */
export async function reviveHold(b: Booking): Promise<Result<true>> {
  if (b.status === "CONFIRMED") return good(true);
  if (b.status === "CANCELLED" && b.holdExpiresAt === null) return bad("INVALID", "That booking was cancelled.");
  if (b.status === "CANCELLED" && b.parentId) {
    // Another room's nights don't trip the no-overlap constraint, so check the stay itself.
    const overlap = await prisma.booking.findFirst({
      where: {
        id: { not: b.id },
        OR: [{ id: b.parentId }, { parentId: b.parentId }],
        status: { in: [...ACTIVE] },
        checkInAt: { lt: b.checkOutAt },
        checkOutAt: { gt: b.checkInAt },
      },
    });
    if (overlap) {
      return bad(
        "SUPERSEDED",
        `The extension hold ${bookingRef(b)} expired and the stay was extended with ${bookingRef(overlap)} (Room ${overlap.roomId}) instead.`,
      );
    }
  }
  const r = await writeOrConflict(
    () =>
      prisma.booking.updateMany({
        where: { id: b.id, OR: [{ status: "PENDING" }, { status: "CANCELLED", holdExpiresAt: { not: null } }] },
        data: { status: "CONFIRMED", holdExpiresAt: null },
      }),
    async () =>
      conflictFail(
        await clashWith(b.roomId, b.checkInAt, b.checkOutAt, b.id),
        "The hold expired and the room has been booked by someone else.",
      ),
  );
  if (!r.ok) return r;
  if (r.value.count === 0) {
    // Someone confirmed it a moment ago, or it was cancelled meanwhile.
    const cur = await prisma.booking.findUnique({ where: { id: b.id }, select: { status: true } });
    return cur?.status === "CONFIRMED" ? good(true) : bad("INVALID", "That booking was cancelled.");
  }
  return good(true);
}

// --- availability ---------------------------------------------------------

export async function isFree(
  roomId: string,
  from: Date,
  to: Date,
  excludeId?: string,
  now?: Date,
): Promise<boolean> {
  await sweepHolds(now);
  return (await clashWith(roomId, from, to, excludeId)) === null;
}

/** Active rooms free for [from, to) that sleep at least `minCapacity`. */
export async function freeRooms(
  from: Date,
  to: Date,
  opts: { minCapacity?: number; excludeRoomId?: string; now?: Date } = {},
): Promise<Room[]> {
  await sweepHolds(opts.now);
  return prisma.room.findMany({
    where: {
      active: true,
      capacity: { gte: opts.minCapacity ?? 1 },
      ...(opts.excludeRoomId ? { id: { not: opts.excludeRoomId } } : {}),
      bookings: {
        none: { status: { in: [...ACTIVE] }, checkInAt: { lt: to }, checkOutAt: { gt: from } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

// --- writes ---------------------------------------------------------------

export type CreateInput = {
  roomId: string;
  guestName: string;
  /** The guest's mobile number (their customer account). */
  guestPhone: string;
  /** Another number to reach them on for this stay, if they gave one. */
  contactPhone?: string;
  guests: number;
  /** YYYY-MM-DD, property time. */
  checkIn: string;
  checkOut: string;
  /** HH:mm, property time. Defaults from config. */
  checkInTime?: string;
  checkOutTime?: string;
  status: "PENDING" | "CONFIRMED";
  source: Source;
  /** CONFIRMED only: money already received (recorded as an acknowledged payment). */
  advancePaid?: number;
  parentId?: string;
  /** The website chat making this booking ("web:<id>"); its messages go there. */
  chatKey?: string;
  now?: Date;
};

/**
 * Create a booking (and the account, and what's owed). A PENDING hold owes its advance (50% of
 * a new stay, 100% of an extension segment); a CONFIRMED desk booking records any advance paid.
 */
export async function createBooking(i: CreateInput): Promise<Result<BookingRow>> {
  const now = i.now ?? new Date();

  const name = i.guestName.trim().slice(0, 80);
  if (!name) return bad("INVALID", "Guest name is required.");
  const phone = digits(i.guestPhone);
  if (phone.length < 7 || phone.length > 15) return bad("INVALID", "That phone number doesn't look right.");
  const contact = i.contactPhone ? digits(i.contactPhone) : "";
  if (contact && (contact.length < 7 || contact.length > 15)) return bad("INVALID", "That contact number doesn't look right.");
  if (!Number.isInteger(i.guests) || i.guests < 1) return bad("INVALID", "At least one guest is needed.");

  if (!DATE_RE.test(i.checkIn) || !DATE_RE.test(i.checkOut)) return bad("INVALID", "Those dates don't look right.");
  const inAt = toInstant(i.checkIn, i.checkInTime ?? config.defaults.checkInTime);
  const outAt = toInstant(i.checkOut, i.checkOutTime ?? config.defaults.checkOutTime);
  if (
    Number.isNaN(inAt.getTime()) ||
    Number.isNaN(outAt.getTime()) ||
    istDate(inAt) !== i.checkIn ||
    istDate(outAt) !== i.checkOut
  ) {
    return bad("INVALID", "Those dates don't look right.");
  }
  const n = nightsBetween(i.checkIn, i.checkOut);
  if (n < 1 || outAt <= inAt) return bad("INVALID", "Check-out must be after check-in.");
  if (n > config.defaults.maxNights) return bad("INVALID", `Stays are limited to ${config.defaults.maxNights} nights.`);

  const room = await prisma.room.findUnique({ where: { id: i.roomId } });
  if (!room) return bad("NOT_FOUND", "That room doesn't exist.");
  if (!room.active) return bad("INACTIVE", `Room ${room.id} isn't available for booking.`);
  if (i.guests > room.capacity) return bad("CAPACITY", `Room ${room.id} sleeps ${room.capacity}.`);

  await sweepHolds(now);
  const clash = await clashWith(room.id, inAt, outAt);
  if (clash) return conflictFail(clash);

  const customer = await ensureCustomer(phone, i.parentId ? "" : name);
  const total = room.pricePerNight * n;
  const paid = i.status === "CONFIRMED" ? Math.max(0, Math.min(total, Math.round(i.advancePaid ?? 0))) : 0;
  const owed = i.parentId ? total : Math.round(total * config.advanceRate);
  const payment =
    i.status === "PENDING"
      ? { kind: i.parentId ? ("EXTENSION" as const) : ("ADVANCE" as const), amount: owed, status: "AWAITING" as const }
      : paid > 0
        ? { kind: "ADVANCE" as const, amount: paid, status: "ACKNOWLEDGED" as const, acknowledgedAt: now, proof: "recorded by the front desk" }
        : null;

  return writeOrConflict(
    () =>
      prisma.booking.create({
        data: {
          roomId: room.id,
          customerId: customer.id,
          guestName: name,
          guestPhone: phone,
          contactPhone: contact && contact !== phone ? contact : null,
          guests: i.guests,
          checkInAt: inAt,
          checkOutAt: outAt,
          ratePerNight: room.pricePerNight,
          nights: n,
          total,
          advancePaid: paid,
          status: i.status,
          source: i.source,
          holdExpiresAt: i.status === "PENDING" ? new Date(now.getTime() + env.holdMinutes * 60_000) : null,
          parentId: i.parentId ?? null,
          chatKey: i.chatKey ?? null,
          createdAt: now,
          ...(payment ? { payments: { create: payment } } : {}),
        },
        include: withRoom,
      }),
    async () => conflictFail(await clashWith(room.id, inAt, outAt)),
  );
}

/** Cancel a booking — and, for a stay, its segments — and whatever they still owed. */
export async function cancelBooking(id: string): Promise<Result<BookingRow>> {
  const b = await getBooking(id);
  if (!b) return bad("NOT_FOUND", "Booking not found.");
  if (b.status === "CANCELLED" && b.holdExpiresAt === null) return good(b);
  const [row] = await prisma.$transaction([
    prisma.booking.update({ where: { id }, data: { status: "CANCELLED", holdExpiresAt: null }, include: withRoom }),
    prisma.booking.updateMany({ where: { parentId: id }, data: { status: "CANCELLED", holdExpiresAt: null } }),
    prisma.payment.updateMany({
      where: { status: { in: ["AWAITING", "CLAIMED", "REJECTED"] }, OR: [{ bookingId: id }, { booking: { parentId: id } }] },
      data: { status: "CANCELLED" },
    }),
  ]);
  return good(row);
}

/** Record that a booking's last-day nudge went out for `date`. True only the first time (cron-safe). */
export async function claimNudge(id: string, date: string): Promise<boolean> {
  const r = await prisma.booking.updateMany({
    where: { id, OR: [{ lastDayNudgeFor: null }, { lastDayNudgeFor: { not: date } }] },
    data: { lastDayNudgeFor: date },
  });
  return r.count === 1;
}

// --- stays & segments ----------------------------------------------------------

export type Stay = {
  root: BookingRow;
  /** Live segments (extensions / moves) and one still being paid for, in order. */
  segments: BookingRow[];
  /** The last confirmed part of the stay: where the next extension starts. */
  end: BookingRow;
  /** An extension waiting for payment, if any — held, or lapsed with its payment at the desk. */
  pending: BookingRow | null;
};

/** The whole stay a booking belongs to (from the root or any segment). */
export async function stayOf(id: string): Promise<Stay | null> {
  const b = await getBooking(id);
  if (!b) return null;
  const root = b.parentId ? await getBooking(b.parentId) : b;
  if (!root) return null;
  const segments = await prisma.booking.findMany({
    where: { parentId: root.id, OR: [{ status: { in: [...ACTIVE] } }, LAPSED_CLAIMED] },
    include: withRoom,
    orderBy: { checkInAt: "asc" },
  });
  const confirmed = [root, ...segments].filter((x) => x.status === "CONFIRMED");
  const end = confirmed.reduce((a, x) => (x.checkOutAt > a.checkOutAt ? x : a), confirmed[0] ?? root);
  return { root, segments, end, pending: segments.find((s) => s.status !== "CONFIRMED") ?? null };
}

/** A stay can be extended until the end of its last day (late the same day is fine). */
const endedBefore = (stay: Stay, now = new Date()) => istDate(stay.end.checkOutAt) < istDate(now);

/** Where a stay can go on to `newCheckOut`: its own room, or which other rooms are free. */
export async function extensionOptions(
  stayId: string,
  newCheckOut: string,
  now?: Date,
): Promise<Result<{ stay: Stay; sameRoomFree: boolean; freeRooms: Room[] }>> {
  const stay = await stayOf(stayId);
  if (!stay || stay.root.status !== "CONFIRMED") return bad("INVALID", "Only a confirmed stay can be extended.");
  if (endedBefore(stay, now)) return bad("INVALID", "That stay has already ended.");
  if (!DATE_RE.test(newCheckOut) || newCheckOut <= istDate(stay.end.checkOutAt)) {
    return bad("INVALID", "The new check-out must be after the current one.");
  }
  if (nightsBetween(istDate(stay.root.checkInAt), newCheckOut) > config.defaults.maxNights) {
    return bad("INVALID", `Stays are limited to ${config.defaults.maxNights} nights.`);
  }
  const free = await freeRooms(stay.end.checkOutAt, toInstant(newCheckOut, config.defaults.checkOutTime), {
    minCapacity: stay.root.guests,
    now,
  });
  return good({
    stay,
    sameRoomFree: free.some((r) => r.id === stay.end.roomId),
    freeRooms: free.filter((r) => r.id !== stay.end.roomId),
  });
}

/**
 * Hold the extra nights of an extension — in the same room, or another one (a move) — from
 * the stay's current end to `newCheckOut`. Paid in full; confirmed when that payment is
 * acknowledged. One open extension per stay; asking again for the same one returns it.
 */
export async function createSegment(i: { stayId: string; roomId: string; newCheckOut: string; now?: Date }): Promise<Result<BookingRow>> {
  const stay = await stayOf(i.stayId);
  if (!stay || stay.root.status !== "CONFIRMED") return bad("INVALID", "Only a confirmed stay can be extended.");
  const same = (s: BookingRow) => s.status === "PENDING" && s.roomId === i.roomId && istDate(s.checkOutAt) === i.newCheckOut;
  if (stay.pending) {
    if (same(stay.pending)) return good(stay.pending);
    return bad(
      "INVALID",
      stay.pending.status === "PENDING"
        ? `An extension (${bookingRef(stay.pending)}) is already waiting for payment.`
        : `The payment for an extension (${bookingRef(stay.pending)}) is with the front desk.`,
    );
  }
  if (endedBefore(stay, i.now)) return bad("INVALID", "That stay has already ended.");
  const { root, end } = stay;
  if (!DATE_RE.test(i.newCheckOut) || i.newCheckOut <= istDate(end.checkOutAt)) {
    return bad("INVALID", "The new check-out must be after the current one.");
  }
  if (nightsBetween(istDate(root.checkInAt), i.newCheckOut) > config.defaults.maxNights) {
    return bad("INVALID", `Stays are limited to ${config.defaults.maxNights} nights.`);
  }
  const r = await createBooking({
    roomId: i.roomId,
    guestName: root.guestName,
    guestPhone: root.guestPhone,
    contactPhone: root.contactPhone ?? undefined,
    guests: root.guests,
    checkIn: istDate(end.checkOutAt),
    checkInTime: istTime(end.checkOutAt),
    checkOut: i.newCheckOut,
    status: "PENDING",
    source: root.source,
    parentId: root.id,
    chatKey: root.chatKey ?? undefined,
    now: i.now,
  });
  if (!r.ok && r.code === "CONFLICT") {
    const again = await stayOf(root.id); // a parallel request may have created this very segment
    if (again?.pending && same(again.pending)) return good(again.pending);
  }
  return r;
}

// --- views ---------------------------------------------------------------

export type OccupancyCell = {
  roomId: string;
  day: string;
  bookingId: string | null;
  status: "PENDING" | "CONFIRMED" | null;
  ref: string | null;
  guestName: string | null;
};

/** One cell per active room per night, starting `fromDate` for `days` nights. */
export async function occupancy(fromDate: string, days: number, now?: Date): Promise<OccupancyCell[]> {
  await sweepHolds(now);
  const rooms = await prisma.room.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const start = toInstant(fromDate, "00:00");
  const end = toInstant(addDays(fromDate, days), "00:00");
  const bookings = await prisma.booking.findMany({
    where: { status: { in: [...ACTIVE] }, checkInAt: { lt: end }, checkOutAt: { gt: start } },
  });
  const nightsOf = bookings.map((b) => ({ b, from: istDate(b.checkInAt), to: istDate(b.checkOutAt) }));

  const cells: OccupancyCell[] = [];
  for (const room of rooms) {
    for (let d = 0; d < days; d++) {
      const day = addDays(fromDate, d);
      const hit = nightsOf.find((x) => x.b.roomId === room.id && x.from <= day && day < x.to);
      cells.push({
        roomId: room.id,
        day,
        bookingId: hit?.b.id ?? null,
        status: hit ? (hit.b.status as "PENDING" | "CONFIRMED") : null,
        ref: hit ? bookingRef(hit.b) : null,
        guestName: hit?.b.guestName ?? null,
      });
    }
  }
  return cells;
}

export type RoomStatus = "available" | "occupied" | "pending";

/** Badge for "right now": occupied (confirmed stay in progress), pending (unpaid hold), else available. */
export async function roomStatusNow(now: Date = new Date()): Promise<Record<string, RoomStatus>> {
  await sweepHolds(now);
  const rooms = await prisma.room.findMany({ where: { active: true }, select: { id: true } });
  const current = await prisma.booking.findMany({
    where: { status: { in: [...ACTIVE] }, checkInAt: { lte: now }, checkOutAt: { gt: now } },
    select: { roomId: true, status: true },
  });
  const out: Record<string, RoomStatus> = {};
  for (const r of rooms) out[r.id] = "available";
  for (const c of current) {
    if (c.status === "CONFIRMED") out[c.roomId] = "occupied";
    else if (out[c.roomId] !== "occupied") out[c.roomId] = "pending";
  }
  return out;
}

// --- queries used by the bot ----------------------------------------------------

/**
 * CONFIRMED bookings whose check-out falls on this property-local date and that really end a
 * stay: not ones followed by an extension or move (confirmed, held, or lapsed with its UTR at the desk).
 */
export async function checkingOutOn(date: string): Promise<BookingRow[]> {
  if (!DATE_RE.test(date)) return [];
  const rows = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      checkOutAt: { gte: toInstant(date, "00:00"), lt: toInstant(addDays(date, 1), "00:00") },
    },
    include: withRoom,
    orderBy: { checkOutAt: "asc" },
  });
  if (rows.length === 0) return rows;
  const roots = [...new Set(rows.map((r) => r.parentId ?? r.id))];
  const parts = await prisma.booking.findMany({
    where: {
      AND: [
        { OR: [{ id: { in: roots } }, { parentId: { in: roots } }] },
        { OR: [{ status: { in: [...ACTIVE] } }, LAPSED_CLAIMED] },
      ],
    },
    select: { id: true, parentId: true, checkInAt: true },
  });
  return rows.filter((r) => {
    const root = r.parentId ?? r.id;
    return !parts.some(
      (p) => p.id !== r.id && (p.id === root || p.parentId === root) && p.checkInAt.getTime() >= r.checkOutAt.getTime(),
    );
  });
}

/**
 * A website chat's PENDING/CONFIRMED bookings that haven't ended yet, soonest first — only the
 * ones it made: a number typed on a website proves nothing.
 */
export async function activeByChat(chat: string, now: Date = new Date()): Promise<BookingRow[]> {
  await sweepHolds(now);
  return prisma.booking.findMany({
    where: { chatKey: chat, status: { in: [...ACTIVE] }, checkOutAt: { gt: now } },
    include: withRoom,
    orderBy: { checkInAt: "asc" },
  });
}
