/** Pure booking maths + formatting. No React, no side effects. */
import { istDate } from "@/lib/dates";

export const MS_PER_DAY = 86_400_000;

/** Whole nights between two YYYY-MM-DD dates. 0 if invalid or non-positive. */
export function nights(checkIn: string, checkOut: string): number {
  const a = Date.parse(checkIn);
  const b = Date.parse(checkOut);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

export function bookingTotal(ratePerNight: number, n: number): number {
  return ratePerNight * Math.max(0, n);
}

/** "₹3,600" — Indian digit grouping, no decimals. */
export function formatINR(amount: number): string {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10 Sep 2026" from a YYYY-MM-DD string. Locale-independent by design. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  const month = MONTHS[Number(mm) - 1];
  if (!month) return iso;
  return `${Number(dd)} ${month} ${y}`;
}

/** "13:00" -> "1:00 PM". */
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

/** "10 Sep 2026, 1:00 PM". */
export function formatDateTime(iso: string, hhmm: string): string {
  return `${formatDate(iso)}, ${formatTime(hhmm)}`;
}

/**
 * Booking reference: HTL-YYYYMMDD-NNN — check-in date plus the booking's sequence number
 * (Booking.seq, unique across all bookings). See engine.bookingRef().
 */
export function makeBookingId(checkIn: string, sequence: number): string {
  const compact = checkIn.replaceAll("-", "");
  return `HTL-${compact}-${String(sequence).padStart(3, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today as YYYY-MM-DD in property time (IST) — never the server's or browser's zone. */
export function todayISO(now: Date = new Date()): string {
  return istDate(now);
}

/** Add days to a YYYY-MM-DD string, returning YYYY-MM-DD (local, no UTC shift). */
export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return toISO(d);
}
