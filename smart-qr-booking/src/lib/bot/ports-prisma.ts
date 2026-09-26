/** The assistant's Ports, backed by the booking engine and payment ledger (Postgres). */
import { prisma } from "@/lib/db";
import { config } from "@/config";
import { env } from "@/lib/env";
import { istDate, istTime, toInstant } from "@/lib/dates";
import * as engine from "@/lib/engine";
import * as payments from "@/lib/payments";
import type { BookingRow, Result } from "@/lib/engine";
import type { PaymentRow } from "@/lib/payments";
import type { BookingView, PaymentView, PortResult, Ports, StayView } from "./types";

export function toView(b: BookingRow): BookingView {
  return {
    id: b.id,
    ref: engine.bookingRef(b),
    roomId: b.roomId,
    roomName: b.room.name,
    ratePerNight: b.ratePerNight,
    guestName: b.guestName,
    guestPhone: b.guestPhone,
    contactPhone: b.contactPhone,
    chat: b.chatKey,
    guests: b.guests,
    checkIn: istDate(b.checkInAt),
    checkInTime: istTime(b.checkInAt),
    checkOut: istDate(b.checkOutAt),
    checkOutTime: istTime(b.checkOutAt),
    nights: b.nights,
    total: b.total,
    advancePaid: b.advancePaid,
    status: b.status,
    holdExpiresAt: b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
    parentId: b.parentId,
  };
}

export const paymentView = (p: PaymentRow): PaymentView => ({
  id: p.id,
  bookingId: p.bookingId,
  kind: p.kind,
  amount: p.amount,
  status: p.status,
  utr: p.utr,
  booking: toView(p.booking),
});

export const stayView = (s: engine.Stay): StayView => ({
  root: toView(s.root),
  segments: s.segments.map(toView),
  end: toView(s.end),
  pending: s.pending ? toView(s.pending) : null,
});

function map<A, B>(r: Result<A>, f: (a: A) => B): PortResult<B> {
  return r.ok ? { ok: true, value: f(r.value) } : r;
}

/** `clock` lets tests control "now"; production omits it. */
export function prismaPorts(clock?: { now: Date }): Ports {
  const now = () => clock?.now ?? new Date();
  const range = (checkIn: string, checkOut: string) => ({
    from: toInstant(checkIn, config.defaults.checkInTime),
    to: toInstant(checkOut, config.defaults.checkOutTime),
  });

  return {
    settings: { upiId: env.upiId, upiName: env.upiPayeeName },
    now,
    rooms: () => prisma.room.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    room: (id) => prisma.room.findFirst({ where: { id, active: true } }),
    freeRooms: (checkIn, checkOut, minCapacity, excludeRoomId) => {
      const { from, to } = range(checkIn, checkOut);
      return engine.freeRooms(from, to, { minCapacity, excludeRoomId, now: now() });
    },
    createHold: async (i) => map(await engine.createBooking({ ...i, status: "PENDING", source: "WEB", now: now() }), toView),
    cancel: async (id) => map(await engine.cancelBooking(id), toView),
    booking: async (id) => {
      await engine.sweepHolds(now());
      const b = await engine.getBooking(id);
      return b ? toView(b) : null;
    },
    checkingOutOn: async (date) => (await engine.checkingOutOn(date)).map(toView),
    activeByChat: async (chat) => (await engine.activeByChat(chat, now())).map(toView),
    claimNudge: (id, date) => engine.claimNudge(id, date),

    openPayment: async (bookingId) => {
      const p = await payments.openPayment(bookingId);
      return p ? paymentView(p) : null;
    },
    claim: async (bookingId, utr) =>
      map(await payments.claimPayment(bookingId, utr, now()), (p) => ({ ...paymentView(p), duplicateRef: p.duplicateRef })),

    stay: async (id) => {
      const s = await engine.stayOf(id);
      return s ? stayView(s) : null;
    },
    extensionOptions: async (stayId, newCheckOut) =>
      map(await engine.extensionOptions(stayId, newCheckOut, now()), (o) => ({
        stay: stayView(o.stay),
        sameRoomFree: o.sameRoomFree,
        freeRooms: o.freeRooms,
      })),
    extend: async (stayId, roomId, newCheckOut) =>
      map(await engine.createSegment({ stayId, roomId, newCheckOut, now: now() }), toView),
  };
}
