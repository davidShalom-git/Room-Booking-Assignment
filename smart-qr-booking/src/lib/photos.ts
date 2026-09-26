/**
 * Photos the owner uploads from their phone. The browser resizes each one first
 * (components/admin/photo-picker.tsx); the bytes live in Postgres and are served at
 * /photos/<id>, so a lodge needs no separate file storage account.
 */
import { prisma } from "@/lib/db";

/** After resizing on the phone a photo is a few hundred KB; this leaves room for a big PNG. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/** A photo reference rooms and settings accept: an uploaded photo, or any https:// image URL. */
export function isPhotoUrl(s: string): boolean {
  if (/^\/photos\/[A-Za-z0-9_-]{1,40}$/.test(s)) return true;
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

/** The image type from the file's own first bytes — never from what the upload claims. */
function imageType(b: Uint8Array): string | null {
  const at = (i: number, bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

export type SavePhotoResult = { ok: true; url: string } | { ok: false; error: string };

export async function savePhoto(bytes: Uint8Array): Promise<SavePhotoResult> {
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too big (3 MB at most)." };
  const type = imageType(bytes);
  if (!type) return { ok: false, error: "Please choose a JPEG, PNG or WebP photo." };
  const p = await prisma.photo.create({ data: { type, data: new Uint8Array(bytes) }, select: { id: true } });
  return { ok: true, url: `/photos/${p.id}` };
}

export async function readPhoto(id: string): Promise<{ type: string; data: Uint8Array } | null> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  return prisma.photo.findUnique({ where: { id }, select: { type: true, data: true } });
}

/**
 * Delete uploads no room and no setting uses, once they're a day old (a photo uploaded but not
 * yet saved in a form is younger than that). Returns how many were deleted.
 */
export async function cleanupPhotos(now: Date = new Date()): Promise<number> {
  const [rooms, settings] = await Promise.all([
    prisma.room.findMany({ select: { images: true } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);
  const saved = (settings?.data ?? {}) as { photos?: unknown };
  const urls = [...rooms.flatMap((r) => r.images), ...(Array.isArray(saved.photos) ? saved.photos.map(String) : [])];
  const used = urls.filter((u) => u.startsWith("/photos/")).map((u) => u.slice("/photos/".length));
  const r = await prisma.photo.deleteMany({
    where: { id: { notIn: used }, createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
  });
  return r.count;
}
