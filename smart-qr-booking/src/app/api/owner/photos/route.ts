/**
 * Upload one photo from the owner console (components/admin/photo-picker.tsx sends it already
 * resized). Owner only. Returns the photo's URL for a room or the settings to use.
 */
import { isAdmin } from "@/lib/auth";
import { MAX_PHOTO_BYTES, savePhoto } from "@/lib/photos";

export async function POST(request: Request) {
  // Only from this site's own pages (the session cookie is SameSite=Lax as well).
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  if (!(await isAdmin())) return Response.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose a photo." }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return Response.json({ ok: false, error: "That photo is too big (3 MB at most)." }, { status: 413 });
  const r = await savePhoto(new Uint8Array(await file.arrayBuffer()));
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
