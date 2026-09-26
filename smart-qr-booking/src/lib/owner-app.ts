/**
 * The owner app: what the owner's phone shows and does — the day at a glance, the 9 PM summary,
 * and Acknowledge / Not received straight from a notification.
 */
import { prisma } from "@/lib/db";
import { occupancy, sweepHolds } from "@/lib/engine";
import { duplicateRefs } from "@/lib/payments";
import { acknowledgeAsAdmin, rejectAsAdmin } from "@/lib/admin-ops";
import { paymentView } from "@/lib/bot/ports-prisma";
import * as C from "@/lib/bot/copy";
import { verifyOwnerAction } from "@/lib/session";
import { toInstant } from "@/lib/dates";
import { addDays, formatDate, formatINR, todayISO } from "@/lib/pricing";

export type ActResult = { ok: true; message: string } | { ok: false; error: string };

/** Acknowledge / Not received from a notification. The token names the payment (see session.ts). */
export async function ownerAct(token: string, action: "ack" | "nack"): Promise<ActResult> {
  const paymentId = verifyOwnerAction(token);
  if (!paymentId) return { ok: false, error: "This alert has expired. Open the app to check the payment." };
  const r = action === "ack" ? await acknowledgeAsAdmin(paymentId, "") : await rejectAsAdmin(paymentId);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: r.message ?? (action === "ack" ? "Acknowledged." : "Marked as not received.") };
}

export type OwnerToday = Awaited<ReturnType<typeof ownerToday>>;

/** The numbers on the owner app's home screen. */
export async function ownerToday(now: Date = new Date()) {
  await sweepHolds(now);
  const today = todayISO(now);
  const dayStart = toInstant(today, "00:00");
  const dayEnd = toInstant(addDays(today, 1), "00:00");
  const monthStart = toInstant(`${today.slice(0, 7)}-01`, "00:00");
  const withBooking = { booking: { include: { room: true } } } as const;

  const [tonight, bookingsToday, received, claims, waitingForPayment, notReceived, arrivals, departures, monthBookings, collected, upcoming] =
    await Promise.all([
      occupancy(today, 1, now),
      prisma.booking.count({ where: { parentId: null, createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.payment.aggregate({
        where: { status: "ACKNOWLEDGED", acknowledgedAt: { gte: dayStart, lt: dayEnd } },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.payment.findMany({ where: { status: "CLAIMED" }, include: withBooking, orderBy: { claimedAt: "asc" } }),
      prisma.payment.count({ where: { status: "AWAITING", booking: { status: "PENDING" } } }),
      prisma.payment.count({ where: { status: "REJECTED" } }),
      prisma.booking.count({ where: { status: "CONFIRMED", checkInAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.booking.count({ where: { status: "CONFIRMED", checkOutAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.booking.count({ where: { parentId: null, status: { not: "CANCELLED" }, createdAt: { gte: monthStart } } }),
      prisma.payment.aggregate({ where: { status: "ACKNOWLEDGED", acknowledgedAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.booking.findMany({ where: { status: "CONFIRMED", checkOutAt: { gte: now } }, select: { total: true, advancePaid: true } }),
    ]);

  const dups = await duplicateRefs(claims);
  return {
    date: today,
    rooms: { total: tonight.length, freeTonight: tonight.filter((c) => !c.bookingId).length },
    bookingsToday,
    receivedToday: { count: received._count, amount: received._sum.amount ?? 0 },
    toCheck: claims.map((p) => ({ ...paymentView(p), duplicateRef: dups.get(p.id) ?? null })),
    waitingForPayment,
    notReceived,
    arrivals,
    departures,
    month: { bookings: monthBookings, collected: collected._sum.amount ?? 0 },
    dueAtCheckIn: upcoming.reduce((s, b) => s + Math.max(0, b.total - b.advancePaid), 0),
  };
}

/** The 9 PM message: today in numbers, and what tomorrow brings. */
export async function dailySummary(now: Date = new Date()): Promise<string> {
  const t = await ownerToday(now);
  const tomorrow = addDays(t.date, 1);
  const arriving = await prisma.booking.count({
    where: { status: "CONFIRMED", checkInAt: { gte: toInstant(tomorrow, "00:00"), lt: toInstant(addDays(tomorrow, 1), "00:00") } },
  });
  return [
    `📊 Today, ${formatDate(t.date)}`,
    `${C.plural(t.bookingsToday, "new booking")} · ${formatINR(t.receivedToday.amount)} received`,
    `${C.plural(t.toCheck.length, "payment")} to check · ${C.plural(t.waitingForPayment, "hold")} waiting for payment`,
    `Tonight: ${t.rooms.freeTonight} of ${t.rooms.total} rooms free · Tomorrow: ${C.plural(arriving, "arrival")}`,
  ].join("\n");
}
