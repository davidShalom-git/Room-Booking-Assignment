"use client";

/**
 * Demo persistence: bookings made in the browser are kept in localStorage so
 * they survive a refresh and show up in the admin screens. No backend.
 */
import type { Booking } from "@/lib/data";
import { mockBookings } from "@/lib/data";
import { makeBookingId } from "@/lib/pricing";

const KEY = "ccd_bookings_v1";

function read(): Booking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch {
    return [];
  }
}

function write(list: Booking[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota — demo still works in-memory for this session */
  }
}

/** Local demo bookings only (newest first). */
export function localBookings(): Booking[] {
  return read().slice().reverse();
}

/** Local + seeded mock bookings, newest first, for the admin views. */
export function allBookings(): Booking[] {
  const seeded = [...mockBookings].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return [...localBookings(), ...seeded];
}

export type NewBooking = Omit<Booking, "id" | "nights" | "total" | "createdAt" | "status"> & {
  nights: number;
  total: number;
  status?: Booking["status"];
};

/**
 * Save a booking and return the stored record.
 * Pass `id` when the caller already showed one to the guest (e.g. mid-chat)
 * so the record on screen and the one in admin match exactly. If that id
 * already exists (e.g. a demo reset regenerated the same id) it's replaced
 * rather than duplicated.
 */
export function saveBooking(input: NewBooking, id?: string): Booking {
  const list = read();
  // Continue the global sequence after the seeded bookings (…-006 → …-007).
  const sequence = mockBookings.length + list.length + 1;
  const booking: Booking = {
    ...input,
    id: id ?? makeBookingId(input.checkIn, sequence),
    status: input.status ?? "confirmed",
    createdAt: new Date().toISOString(),
  };
  const i = list.findIndex((b) => b.id === booking.id);
  if (i === -1) write([...list, booking]);
  else write(list.map((b, idx) => (idx === i ? booking : b)));
  return booking;
}

/** Update fields on an already-saved booking (e.g. after an approved extension). */
export function updateBooking(id: string, patch: Partial<Booking>): void {
  const list = read();
  const i = list.findIndex((b) => b.id === id);
  if (i === -1) return; // seeded/mock bookings aren't in localStorage — nothing to patch
  list[i] = { ...list[i], ...patch };
  write(list);
}
