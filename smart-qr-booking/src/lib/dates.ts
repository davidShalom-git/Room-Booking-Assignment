/**
 * Property-local time (IST) and the forgiving text parsers the booking assistant uses.
 * Pure — no React, no I/O. The server (Vercel) runs in UTC, so nothing here may
 * depend on the machine's timezone.
 */

/** India has no DST, so a fixed offset is exact. */
export const TZ_OFFSET = "+05:30";
const OFFSET_MS = 5.5 * 3_600_000;

/** "2026-10-12" + "13:00" (property time) -> the real instant. Invalid input -> Invalid Date. */
export function toInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${TZ_OFFSET}`);
}

/** Calendar date of an instant in property time, YYYY-MM-DD. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Wall-clock time of an instant in property time, HH:mm. */
export function istTime(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "oct" / "sept" / "october" -> 1..12, else null. Rejects look-alikes ("marvelous"). */
function monthFromName(word: string): number | null {
  const w = word.toLowerCase();
  if (w === "sept") return 9;
  if (w.length < 3) return null;
  const i = MONTHS.findIndex((m) => m.startsWith(w));
  return i === -1 ? null : i + 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A real calendar date, or null (rejects 31/02, 0/10, 32/10, year outside 2000-2099). */
function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Read a date a guest typed. Returns YYYY-MM-DD, never in the past relative to
 * `today` (YYYY-MM-DD, property time). Day comes before month (India): 12/10 = 12 Oct.
 * With no year, picks the next occurrence on or after today.
 */
export function parseDateText(text: string, today: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  let y: number | undefined;
  let m: number;
  let d: number;
  let hit: RegExpExecArray | null;

  if (/\btoday\b/.test(t)) return today;
  if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) return addDaysISO(today, 1);

  if ((hit = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t))) {
    y = Number(hit[1]); m = Number(hit[2]); d = Number(hit[3]);
  } else if ((hit = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/.exec(t))) {
    d = Number(hit[1]); m = Number(hit[2]);
    if (hit[3]) y = hit[3].length === 2 ? 2000 + Number(hit[3]) : Number(hit[3]);
  } else if ((hit = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/.exec(t))) {
    const mm = monthFromName(hit[2]!);
    if (mm === null) return null;
    d = Number(hit[1]); m = mm;
    if (hit[3]) y = Number(hit[3]);
  } else if ((hit = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(t))) {
    const mm = monthFromName(hit[1]!);
    if (mm === null) return null;
    d = Number(hit[2]); m = mm;
    if (hit[3]) y = Number(hit[3]);
  } else {
    return null;
  }

  if (y !== undefined) {
    const iso = validDate(y, m, d);
    return iso && iso >= today ? iso : null;
  }
  const thisYear = Number(today.slice(0, 4));
  const first = validDate(thisYear, m, d);
  if (first && first >= today) return first;
  const next = validDate(thisYear + 1, m, d);
  return next && next >= today ? next : null;
}

/** "2", "2 nights", "for 3 nights" -> 1..30, else null. */
export function parseNights(text: string): number | null {
  const hit = /^\s*(?:for\s+)?(\d{1,4})\s*(?:nights?)?\s*$/i.exec(text);
  if (!hit) return null;
  const n = Number(hit[1]);
  return n >= 1 && n <= 30 ? n : null;
}

export type Enquiry = { roomId?: string; checkIn?: string; checkOut?: string; guests?: number };

/**
 * Pull the room, dates and guest count out of the message the website / QR code
 * pre-fills (see lib/enquiry.ts). Anything not recognised is simply absent.
 */
export function parseEnquiry(text: string, today: string): Enquiry {
  const out: Enquiry = {};
  const url = /\/rooms\/([A-Za-z0-9-]{1,8})\b/.exec(text);
  const named = /\broom\s+#?(\d[A-Za-z0-9-]{0,7})\b/i.exec(text);
  const roomId = url?.[1] ?? named?.[1];
  if (roomId) out.roomId = roomId;

  const inHit = /check-?in:?\s*([^\n]+)/i.exec(text);
  const checkIn = inHit ? parseDateText(inHit[1]!, today) : null;
  if (checkIn) out.checkIn = checkIn;

  const outHit = /check-?out:?\s*([^\n]+)/i.exec(text);
  const checkOut = outHit ? parseDateText(outHit[1]!, today) : null;
  if (checkOut) out.checkOut = checkOut;

  const g = /\bguests?:?\s*(\d{1,2})\b/i.exec(text);
  if (g) out.guests = Number(g[1]);
  return out;
}
