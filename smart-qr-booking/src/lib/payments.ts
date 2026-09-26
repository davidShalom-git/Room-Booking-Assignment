/**
 * The payment ledger. Every amount owed is a Payment:
 *
 *   AWAITING ──guest gives UTR──► CLAIMED ──owner──► ACKNOWLEDGED   (booking / segment CONFIRMED)
 *                                   │
 *                                   └──owner: not received──► REJECTED ──guest re-claims──► CLAIMED …
 *
 * Money is recorded exactly once (Booking.advancePaid is the running total of acknowledged
 * payments), even when the owner taps twice or two requests race.
 */
import { prisma } from "@/lib/db";
import type { Payment } from "@/generated/prisma/client";
import { config } from "@/config";
import { bad, bookingRef, getBooking, good, reviveHold, withRoom, type BookingRow, type Result } from "@/lib/engine";

export type PaymentRow = Payment & { booking: BookingRow };

/** Still owed: waiting for money, claimed but not yet checked, or sent back to the guest. */
export const OPEN = ["AWAITING", "CLAIMED", "REJECTED"] as const;
const withBooking = { booking: { include: withRoom } } as const;
const UTR_RE = /^\d{12}$/;

export const paymentById = (id: string) => prisma.payment.findUnique({ where: { id }, include: withBooking });

/** What's still owed on this booking (or segment), if anything. */
export const openPayment = (bookingId: string) =>
  prisma.payment.findFirst({
    where: { bookingId, status: { in: [...OPEN] } },
    orderBy: { createdAt: "desc" },
    include: withBooking,
  });

/**
 * The guest says they've paid and gives the UPI reference (UTR). Allowed while the payment is
 * still owed — including after a hold lapsed, so a late payment can still be matched.
 */
export async function claimPayment(
  bookingId: string,
  utrRaw: string,
  now: Date = new Date(),
): Promise<Result<PaymentRow & { duplicateRef: string | null }>> {
  const utr = utrRaw.replace(/[\s-]+/g, "");
  if (!UTR_RE.test(utr)) {
    return bad("INVALID", "The UPI reference (UTR) is a 12-digit number — you'll find it in your UPI app under this payment.");
  }
  const p = await openPayment(bookingId);
  if (!p) {
    const b = await getBooking(bookingId);
    if (!b) return bad("NOT_FOUND", "Booking not found.");
    const done = await prisma.payment.findFirst({ where: { bookingId, status: "ACKNOWLEDGED" } });
    return bad("INVALID", done ? "That payment is already confirmed." : "There's nothing to pay on this booking.");
  }
  const r = await prisma.payment.updateMany({
    where: { id: p.id, status: { in: [...OPEN] } },
    data: { status: "CLAIMED", utr, claimedAt: now },
  });
  if (r.count === 0) return bad("INVALID", "That payment is already confirmed.");
  const claimed = (await paymentById(p.id))!;
  return good({ ...claimed, duplicateRef: (await duplicateRefs([claimed])).get(claimed.id) ?? null });
}

/** For each payment, another booking its UTR was also sent for (or accepted on), if any — possible reuse. */
export async function duplicateRefs(ps: { id: string; utr: string | null }[]): Promise<Map<string, string>> {
  const utrs = [...new Set(ps.map((p) => p.utr).filter((u): u is string => !!u))];
  const seen = utrs.length
    ? await prisma.payment.findMany({
        where: { utr: { in: utrs }, status: { in: ["CLAIMED", "ACKNOWLEDGED"] } },
        include: { booking: true },
      })
    : [];
  const out = new Map<string, string>();
  for (const p of ps) {
    const other = seen.find((s) => s.utr === p.utr && s.id !== p.id);
    if (other) out.set(p.id, bookingRef(other.booking));
  }
  return out;
}

/**
 * The owner confirms the money arrived: the booking (or extension) is confirmed — reviving a
 * lapsed hold if its nights are still free — and the amount is recorded once. `amount` lets the
 * owner record what actually arrived (e.g. the guest paid in full). Idempotent.
 */
export async function acknowledgePayment(
  paymentId: string,
  amount?: number,
  now: Date = new Date(),
): Promise<Result<PaymentRow & { already: boolean }>> {
  const p = await paymentById(paymentId);
  if (!p) return bad("NOT_FOUND", "Payment not found.");
  if (p.status === "ACKNOWLEDGED") return good({ ...p, already: true });
  if (p.status === "CANCELLED") return bad("INVALID", "That payment was cancelled.");

  const revived = await reviveHold(p.booking);
  if (!revived.ok) return revived;

  const amt = Math.max(0, Math.min(p.booking.total, Math.round(amount ?? p.amount)));
  const won = await prisma.$transaction(async (tx) => {
    const r = await tx.payment.updateMany({
      where: { id: p.id, status: { in: [...OPEN] } },
      data: { status: "ACKNOWLEDGED", amount: amt, acknowledgedAt: now },
    });
    if (r.count === 1) await tx.booking.update({ where: { id: p.bookingId }, data: { advancePaid: { increment: amt } } });
    return r.count === 1;
  });
  return good({ ...(await paymentById(p.id))!, already: !won });
}

/**
 * The owner couldn't find the money: the guest is asked to check and claim again. `already`: it
 * was marked before (a second tap, or two at once), so the guest shouldn't be asked twice.
 */
export async function rejectPayment(paymentId: string): Promise<Result<PaymentRow & { already: boolean }>> {
  const p = await paymentById(paymentId);
  if (!p) return bad("NOT_FOUND", "Payment not found.");
  const r = await prisma.payment.updateMany({ where: { id: p.id, status: { in: ["AWAITING", "CLAIMED"] } }, data: { status: "REJECTED" } });
  const now = (await paymentById(p.id))!;
  if (now.status === "ACKNOWLEDGED") return bad("INVALID", "That payment was already acknowledged.");
  if (now.status === "CANCELLED") return bad("INVALID", "That payment was cancelled.");
  return good({ ...now, already: r.count === 0 });
}

/**
 * "Advance received" from the console: acknowledge whatever this
 * booking owes, creating the payment record if there isn't one.
 */
export async function confirmBooking(id: string, amount?: number, now?: Date): Promise<Result<BookingRow>> {
  const b = await getBooking(id);
  if (!b) return bad("NOT_FOUND", "Booking not found.");
  if (b.status === "CONFIRMED") return good(b);
  let p = await openPayment(id);
  if (!p) {
    if (b.status === "CANCELLED" && b.holdExpiresAt === null) return bad("INVALID", "That booking was cancelled.");
    p = await prisma.payment.create({
      data: {
        bookingId: id,
        kind: b.parentId ? "EXTENSION" : "ADVANCE",
        amount: b.parentId ? b.total : Math.round(b.total * config.advanceRate),
        status: "AWAITING",
      },
      include: withBooking,
    });
  }
  const r = await acknowledgePayment(p.id, amount, now);
  if (!r.ok) return r;
  return good((await getBooking(id))!);
}

/** The rest paid at the property: settles the booking, once. */
export async function recordBalance(id: string, now: Date = new Date()): Promise<Result<PaymentRow>> {
  const b = await getBooking(id);
  if (!b) return bad("NOT_FOUND", "Booking not found.");
  if (b.status !== "CONFIRMED") return bad("INVALID", "Only a confirmed booking can be settled.");
  const due = b.total - b.advancePaid;
  if (due <= 0) return bad("INVALID", `Nothing left to pay on ${bookingRef(b)}.`);
  const created = await prisma.$transaction(async (tx) => {
    // Only the request that sees the same "paid so far" wins, so a double click records once.
    const r = await tx.booking.updateMany({ where: { id, advancePaid: b.advancePaid }, data: { advancePaid: b.total } });
    if (r.count === 0) return null;
    return tx.payment.create({
      data: { bookingId: id, kind: "BALANCE", amount: due, status: "ACKNOWLEDGED", acknowledgedAt: now, proof: "collected at the property" },
      include: withBooking,
    });
  });
  return created ? good(created) : bad("INVALID", `Nothing left to pay on ${bookingRef(b)}.`);
}
