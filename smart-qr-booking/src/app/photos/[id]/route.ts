/** An uploaded photo (see lib/photos.ts). Ids are never reused, so browsers and the CDN keep it for good. */
import { readPhoto } from "@/lib/photos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const photo = await readPhoto((await params).id);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
