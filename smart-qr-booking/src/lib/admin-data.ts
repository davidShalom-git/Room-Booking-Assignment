/** Read models for the admin console. */
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Payment } from "@/generated/prisma/client";
import { bookingRef, occupancy, roomStatusNow, seqFromRef, sweepHolds, withRoom, type BookingRow } from "@/lib/engine";
import { paymentView, toView } from "@/lib/bot/ports-prisma";
import type { BookingView, PaymentView } from "@/lib/bot/types";
import { OPEN, duplicateRefs } from "@/lib/payments";
import { toInstant } from "@/lib/dates";
import { addDays, todayISO } from "@/lib/pricing";

export type AdminBooking = BookingView & {
  seq: number;
  source: "WHATSAPP" | "ADMIN" | "WEB";
  createdAt: string;
  /** What this booking still owes, if anything (with the guest's UTR once they've sent it). */
  openPayment: { id: string; status: string; amount: number; utr: string | null } | null;
  /** For extensions / room moves: the stay it continues. */
  parent: { ref: string; roomId: string } | null;
};

type WithPayments = BookingRow & { payments?: Payment[] };

export const toAdmin = (b: WithPayments, parent: { ref: string; roomId: string } | null = null): AdminBooking => {
  const open = (b.payments ?? []).filter((p) => (OPEN as readonly string[]).includes(p.status)).at(-1);
  return {
    ...toView(b),
    seq: b.seq,
    source: b.source,
    createdAt: b.createdAt.toISOString(),
    openPayment: open ? { id: open.id, status: open.status, amount: open.amount, utr: open.utr } : null,
    parent,
  };
};

const withPayments = { room: true, payments: { orderBy: { createdAt: "asc" as const } } } as const;

/** Rows for display, each knowing what it owes and which stay it continues. */
async function adminRows(rows: WithPayments[]): Promise<AdminBooking[]> {
  const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  const parents = parentIds.length ? await prisma.booking.findMany({ where: { id: { in: parentIds } } }) : [];
  const byId = new Map(parents.map((p) => [p.id, { ref: bookingRef(p), roomId: p.roomId }]));
  return rows.map((r) => toAdmin(r, r.parentId ? (byId.get(r.parentId) ?? null) : null));
}

export type BookingFilter = { status?: string; source?: string; q?: string; when?: string };

export async function listBookings(f: BookingFilter, now: Date = new Date()): Promise<AdminBooking[]> {
  await sweepHolds(now);
  const where: Prisma.BookingWhereInput = {};
  const status = (f.status ?? "all").toUpperCase();
  if (status === "PENDING" || status === "CONFIRMED" || status === "CANCELLED") where.status = status;
  const source = (f.source ?? "all").toUpperCase();
  if (source === "WHATSAPP" || source === "ADMIN" || source === "WEB") where.source = source;

  const when = f.when ?? "upcoming";
  if (when === "upcoming") where.checkOutAt = { gte: now };
  if (when === "past") where.checkOutAt = { lt: now };

  const q = (f.q ?? "").trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const seq = seqFromRef(q) ?? (/^\d{1,6}$/.test(q) ? Number(q) : null);
    where.OR = [
      { guestName: { contains: q, mode: "insensitive" } },
      { roomId: q },
      ...(digits.length >= 3 ? [{ guestPhone: { contains: digits } }] : []),
      ...(seq ? [{ seq }] : []),
    ];
  }

  const rows = await prisma.booking.findMany({
    where,
    include: withPayments,
    orderBy: { checkInAt: when === "upcoming" ? "asc" : "desc" },
    take: 300,
  });
  return adminRows(rows);
}

export async function dashboardData(now: Date = new Date()) {
  await sweepHolds(now);
  const today = todayISO(now);
  const dayStart = toInstant(today, "00:00");
  const dayEnd = toInstant(addDays(today, 1), "00:00");
  const monthStart = toInstant(`${today.slice(0, 7)}-01`, "00:00");
  const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
  const monthEnd = toInstant(nextMonth.toISOString().slice(0, 10), "00:00");
  
  const [rooms, status, arrivals, departures, pendingHolds, recent, month, cells, claims] = await Promise.all([
    prisma.room.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    roomStatusNow(now),
    prisma.booking.findMany({
      where: { status: "CONFIRMED", checkInAt: { gte: dayStart, lt: dayEnd } },
      include: withRoom,
      orderBy: { checkInAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { status: "CONFIRMED", checkOutAt: { gte: dayStart, lt: dayEnd } },
      include: withRoom,
      orderBy: { checkOutAt: "asc" },
    }),
    prisma.booking.findMany({ where: { status: "PENDING" }, include: withPayments, orderBy: { holdExpiresAt: "asc" } }),
    prisma.booking.findMany({ include: withRoom, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.booking.aggregate({
      where: { status: "CONFIRMED", checkInAt: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true, advancePaid: true },
      _count: true,
    }),
    occupancy(today, 14, now),
    prisma.payment.findMany({
      where: { status: "CLAIMED" },
      include: { booking: { include: withRoom } },
      orderBy: { claimedAt: "asc" },
    }),
  ]);

  const counts = { available: 0, occupied: 0, pending: 0 };
  for (const r of rooms) counts[status[r.id] ?? "available"]++;
  const dups = await duplicateRefs(claims);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  return {
    today,
    rooms: { total: rooms.length, ...counts },
    arrivals: arrivals.map((b) => toAdmin(b)),
    departures: departures.map((b) => toAdmin(b)),
    pendingHolds: (await adminRows(pendingHolds)).filter((b) => b.openPayment?.status !== "CLAIMED"),
    claims: claims.map((p) => ({ ...paymentView(p), duplicateRef: dups.get(p.id) ?? null })),
    recent: recent.map((b) => toAdmin(b)),
    month: {
      label: new Date(`${today}T00:00:00Z`).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }),
      revenue: month._sum.total ?? 0,
      advance: month._sum.advancePaid ?? 0,
      bookings: month._count,
    },
    grid: {
      days,
      rows: rooms.map((r) => ({ id: r.id, name: r.name, cells: cells.filter((c) => c.roomId === r.id) })),
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;

// --- payments & customers ----------------------------------------------------------------

export type AdminPayment = PaymentView & {
  source: "WHATSAPP" | "ADMIN" | "WEB";
  createdAt: string;
  claimedAt: string | null;
  acknowledgedAt: string | null;
  /** Another booking this UTR was also sent for — worth a second look before acknowledging. */
  duplicateRef: string | null;
};

export async function listPayments(f: { status?: string; kind?: string; q?: string }): Promise<AdminPayment[]> {
  const where: Prisma.PaymentWhereInput = {};
  const status = (f.status ?? "all").toUpperCase();
  if (["AWAITING", "CLAIMED", "ACKNOWLEDGED", "REJECTED", "CANCELLED"].includes(status)) {
    where.status = status as Prisma.PaymentWhereInput["status"];
  }
  const kind = (f.kind ?? "all").toUpperCase();
  if (["ADVANCE", "EXTENSION", "BALANCE"].includes(kind)) where.kind = kind as Prisma.PaymentWhereInput["kind"];
  const q = (f.q ?? "").trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const seq = seqFromRef(q);
    where.OR = [
      ...(digits.length >= 4 ? [{ utr: { contains: digits } }, { booking: { guestPhone: { contains: digits } } }] : []),
      { booking: { guestName: { contains: q, mode: "insensitive" } } },
      ...(seq ? [{ booking: { seq } }] : []),
    ];
  }
  const rows = await prisma.payment.findMany({
    where,
    include: { booking: { include: withRoom } },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });
  const dups = await duplicateRefs(rows);
  return rows.map((p) => ({
    ...paymentView(p),
    duplicateRef: dups.get(p.id) ?? null,
    source: p.booking.source,
    createdAt: p.createdAt.toISOString(),
    claimedAt: p.claimedAt?.toISOString() ?? null,
    acknowledgedAt: p.acknowledgedAt?.toISOString() ?? null,
  }));
}

export type AdminCustomer = { id: string; name: string; phone: string; stays: number; paid: number; lastStay: string | null; since: string };

export async function listCustomers(q = ""): Promise<AdminCustomer[]> {
  const text = q.trim();
  const digits = text.replace(/\D/g, "");
  const customers = await prisma.customer.findMany({
    where: text
      ? { OR: [{ name: { contains: text, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }
      : {},
    include: { bookings: { select: { status: true, parentId: true, advancePaid: true, checkInAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return customers.map((c) => {
    const live = c.bookings.filter((b) => b.status !== "CANCELLED");
    const last = live.reduce<Date | null>((a, b) => (!a || b.checkInAt > a ? b.checkInAt : a), null);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      stays: live.filter((b) => b.parentId === null).length,
      paid: live.reduce((sum, b) => sum + b.advancePaid, 0),
      lastStay: last ? last.toISOString() : null,
      since: c.createdAt.toISOString(),
    };
  });
}
