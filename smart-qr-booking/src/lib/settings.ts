/**
 * The property's details — everything that makes the site "this" lodge. The owner edits them at
 * /admin/settings; they're stored as one JSON row and merged over DEFAULT_SETTINGS, so a field
 * added later simply starts at its default. The defaults are the demo property.
 */
import { prisma } from "@/lib/db";
import { normalizePhone, validPhone } from "@/lib/phone";
import { isPhotoUrl } from "@/lib/photos";

export type Settings = {
  name: string;
  tagline: string;
  /** Shown as the location, e.g. "Fort Kochi, Kerala". */
  city: string;
  address: string;
  /** Front-desk phone: digits with country code (display with phonePretty). */
  phone: string;
  /** "" = none. */
  email: string;
  /** A short paragraph about the place, on the home and about pages. */
  about: string;
  /** "" = none. How to get here, on the about page. */
  directions: string;
  amenities: string[];
  /** null = don't show a rating. */
  rating: number | null;
  reviews: number | null;
  /** HH:mm, property time. Check-out is never later than check-in (same-day turnover). */
  checkInTime: string;
  checkOutTime: string;
  /** Share of the total paid up front to hold a booking, 10–100. */
  advancePercent: number;
  upiId: string;
  upiName: string;
  /** Property photos, the first is the cover. Empty = use room photos. */
  photos: string[];
};

const U = (id: string, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const DEFAULT_SETTINGS: Settings = {
  name: "The Coral Courtyard",
  tagline: "A boutique stay in the heart of the old town",
  city: "Fort Kochi, Kerala",
  address: "12 Bastion Street, Fort Kochi, Kerala 682001",
  phone: "918637466746",
  email: "stay@coralcourtyard.example",
  about:
    "A restored merchant's house in the old town — high ceilings, lime-washed walls, a central courtyard, and a rooftop where breakfast runs slow. Family-run, and a two-minute walk to the water.",
  directions: "Kochi airport (COK) is ~40 km. Airport pickup ₹1,600 one way.",
  amenities: ["Free WiFi", "Complimentary breakfast", "Airport pickup", "Rooftop cafe", "24×7 front desk", "Travel desk"],
  rating: 4.8,
  reviews: 214,
  checkInTime: "13:00",
  checkOutTime: "11:00",
  advancePercent: 50,
  upiId: "",
  upiName: "",
  photos: [U("1611892440504-42a792e24d32", 2000), U("1560448204-e02f11c3d0e2", 1600), U("1618773928121-c32242e63f39", 1600)],
};

/** The property's photos, or the rooms' when the owner hasn't added any. */
export const propertyPhotos = (s: Settings, rooms: { images: string[] }[]) =>
  s.photos.length > 0 ? s.photos : rooms.flatMap((r) => r.images);

/** The saved details over the defaults. UPI falls back to UPI_ID / UPI_PAYEE_NAME (older installs). */
export async function getSettings(): Promise<Settings> {
  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  const saved = (row?.data ?? {}) as Partial<Settings>;
  const s = { ...DEFAULT_SETTINGS, ...saved };
  return {
    ...s,
    upiId: saved.upiId || process.env["UPI_ID"] || "",
    upiName: saved.upiName || process.env["UPI_PAYEE_NAME"] || s.name,
  };
}

export type SaveResult = { ok: true; message: string } | { ok: false; error: string; field: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const UPI_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/;

/** Check a settings form; returns the settings to store, or the first field that is wrong. */
export function parseSettings(input: Record<string, string | undefined>): { ok: true; data: Settings } | { ok: false; error: string; field: string } {
  const t = (k: string) => String(input[k] ?? "").trim();
  const list = (k: string) => String(input[k] ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const fail = (field: string, error: string) => ({ ok: false as const, error, field });

  const name = t("name");
  if (name.length < 2 || name.length > 80) return fail("name", "Enter the property's name.");
  const tagline = t("tagline");
  if (tagline.length < 2 || tagline.length > 120) return fail("tagline", "Add a short tagline (up to 120 characters).");
  const city = t("city");
  if (city.length < 2 || city.length > 60) return fail("city", "Enter the town and state, e.g. Munnar, Kerala.");
  const address = t("address");
  if (address.length < 5 || address.length > 200) return fail("address", "Enter the full address.");
  const phone = normalizePhone(t("phone"));
  if (!validPhone(phone)) return fail("phone", "Enter the front-desk mobile number, e.g. 98450 21133.");
  const email = t("email");
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) return fail("email", "That email address doesn't look right.");
  const about = t("about");
  if (about.length < 10 || about.length > 600) return fail("about", "Write a few lines about the place (up to 600 characters).");
  const directions = t("directions");
  if (directions.length > 300) return fail("directions", "Keep directions under 300 characters.");
  const amenities = list("amenities");
  if (amenities.length > 12 || amenities.some((a) => a.length > 40)) return fail("amenities", "Up to 12 amenities, each under 40 characters.");

  const ratingRaw = t("rating");
  const rating = ratingRaw ? Number(ratingRaw) : null;
  if (rating !== null && !(/^\d(\.\d)?$/.test(ratingRaw) && rating >= 1 && rating <= 5)) {
    return fail("rating", "Rating is a number from 1 to 5, like 4.6 — or leave it empty.");
  }
  const reviewsRaw = t("reviews");
  const reviews = reviewsRaw ? Number(reviewsRaw) : null;
  if (reviews !== null && !(/^\d{1,7}$/.test(reviewsRaw))) return fail("reviews", "Number of reviews is a whole number — or leave it empty.");

  const checkInTime = t("checkInTime");
  if (!TIME_RE.test(checkInTime)) return fail("checkInTime", "Enter the check-in time, e.g. 13:00.");
  const checkOutTime = t("checkOutTime");
  if (!TIME_RE.test(checkOutTime)) return fail("checkOutTime", "Enter the check-out time, e.g. 11:00.");
  if (checkOutTime > checkInTime) {
    return fail("checkOutTime", "Check-out must be at or before the check-in time, so a room can be turned over the same day.");
  }
  const advanceRaw = t("advancePercent");
  const advancePercent = Number(advanceRaw);
  if (!/^\d{1,3}$/.test(advanceRaw) || advancePercent < 10 || advancePercent > 100) {
    return fail("advancePercent", "The advance is a whole percentage from 10 to 100.");
  }

  const upiId = t("upiId");
  if (!UPI_RE.test(upiId)) return fail("upiId", "Enter the UPI ID guests pay to, e.g. yourname@oksbi.");
  const upiName = t("upiName");
  if (upiName.length < 2 || upiName.length > 60) return fail("upiName", "Enter the name on the UPI account.");
  const photos = list("photos");
  if (photos.length > 6) return fail("photos", "Up to 6 property photos.");
  if (!photos.every(isPhotoUrl)) return fail("photos", "Photos must be uploaded here or be https:// links.");

  const data: Settings = {
    name, tagline, city, address, phone, email, about, directions, amenities, rating, reviews,
    checkInTime, checkOutTime, advancePercent, upiId, upiName, photos,
  };
  return { ok: true, data };
}

/** Check the settings form and save it. Nothing is saved unless every field is valid. */
export async function saveSettings(input: Record<string, string | undefined>): Promise<SaveResult> {
  const r = parseSettings(input);
  if (!r.ok) return r;
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, data: r.data }, update: { data: r.data } });
  return { ok: true, message: "Saved." };
}
