/**
 * Set up a lodge's database from one description (scripts/new-lodge.ts reads it from a JSON
 * file): its details, its rooms, and the owner's sign-in. Everything is checked before anything
 * is written. Safe to run again for the same lodge: details and the listed rooms are updated, the
 * owner's password is kept unless `resetPassword`. A database that belongs to another lodge is
 * refused unless `force`.
 */
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { isPhotoUrl } from "@/lib/photos";
import { newRecoveryCode, setOwnerLogin } from "@/lib/owner-login";

export type RoomInput = {
  id: string;
  name: string;
  type?: string;
  pricePerNight: number;
  capacity: number;
  bed: string;
  ac?: boolean;
  size?: string;
  floor?: number;
  shortDescription: string;
  description?: string;
  amenities?: string[];
  images?: string[];
};

export type LodgeInput = {
  /** The Settings fields; lists (amenities, photos) as arrays, and null for "none". */
  settings: Record<string, string | number | string[] | null | undefined>;
  rooms: RoomInput[];
};

export type SetupResult =
  | { ok: true; password: string | null; recoveryCode: string | null; rooms: number }
  | { ok: false; error: string };

function checkRoom(r: RoomInput): string | null {
  const who = `Room ${r.id || "?"}`;
  if (!/^[A-Za-z0-9-]{1,8}$/.test(r.id ?? "") || r.id.toLowerCase() === "new") return `${who}: the room number must be up to 8 letters, digits or dashes.`;
  if (!r.name || r.name.length > 80) return `${who}: give it a name.`;
  if (!Number.isInteger(r.pricePerNight) || r.pricePerNight < 1) return `${who}: price per night must be a whole number of rupees.`;
  if (!Number.isInteger(r.capacity) || r.capacity < 1 || r.capacity > 20) return `${who}: sleeps must be 1 to 20.`;
  if (!r.bed) return `${who}: describe the beds, e.g. Queen Bed.`;
  if (!r.shortDescription || r.shortDescription.length > 200) return `${who}: add a one-line description (up to 200 characters).`;
  if ((r.images ?? []).length > 12 || !(r.images ?? []).every(isPhotoUrl)) return `${who}: up to 12 photos, as https:// links.`;
  return null;
}

/** Easy to read out and type on a phone: three groups of four, no look-alike characters. */
const readablePassword = () =>
  Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(31)]).join("")).join("-");

export async function setupLodge(input: LodgeInput, opts: { resetPassword?: boolean; force?: boolean } = {}): Promise<SetupResult> {
  const form = Object.fromEntries(
    Object.entries(input.settings ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join("\n") : v == null ? "" : String(v)]),
  );
  const settings = parseSettings(form);
  if (!settings.ok) return { ok: false, error: `Settings, ${settings.field}: ${settings.error}` };

  const rooms = input.rooms ?? [];
  if (rooms.length === 0) return { ok: false, error: "Add at least one room." };
  const ids = rooms.map((r) => r.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) return { ok: false, error: `Room ${twice} is listed twice.` };
  for (const r of rooms) {
    const bad = checkRoom(r);
    if (bad) return { ok: false, error: bad };
  }

  // One database per lodge: never overwrite another lodge by pointing at the wrong database.
  if (!opts.force) {
    const saved = (await prisma.settings.findUnique({ where: { id: 1 } }))?.data as { name?: string } | undefined;
    if (saved?.name && saved.name !== settings.data.name) {
      return { ok: false, error: `This database already belongs to ${saved.name}. Use a new database for each lodge (or --force).` };
    }
    if (!saved && (await prisma.room.count()) > 0) {
      return { ok: false, error: "This database already has rooms from another setup. Use a new database for each lodge (or --force)." };
    }
  }

  await prisma.$transaction([
    prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, data: settings.data }, update: { data: settings.data } }),
    ...rooms.map((r, i) => {
      const data = {
        name: r.name,
        type: r.type || r.name,
        pricePerNight: r.pricePerNight,
        capacity: r.capacity,
        bed: r.bed,
        ac: r.ac ?? false,
        size: r.size ?? "",
        floor: r.floor ?? 0,
        shortDescription: r.shortDescription,
        description: r.description || r.shortDescription,
        amenities: r.amenities ?? [],
        images: r.images ?? [],
      };
      return prisma.room.upsert({ where: { id: r.id }, create: { id: r.id, ...data, sortOrder: i }, update: data });
    }),
  ]);

  const hasLogin = !!(await prisma.ownerLogin.findUnique({ where: { id: 1 } }));
  if (hasLogin && !opts.resetPassword) return { ok: true, password: null, recoveryCode: null, rooms: rooms.length };
  const password = readablePassword();
  await setOwnerLogin(password);
  const { code } = await newRecoveryCode();
  return { ok: true, password, recoveryCode: code, rooms: rooms.length };
}
