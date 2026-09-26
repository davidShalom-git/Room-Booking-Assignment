/** GET /api/availability?room=101&from=YYYY-MM-DD&to=YYYY-MM-DD[&guests=2] — used by the room page. */
import { prisma } from "@/lib/db";
import { config } from "@/config";
import { isFree } from "@/lib/engine";
import { toInstant } from "@/lib/dates";
import { nights, todayISO } from "@/lib/pricing";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const roomId = q.get("room") ?? "";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const guests = Math.max(1, Number(q.get("guests") ?? "1") || 1);

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return json({ error: "Pick check-in and check-out dates." }, 400);
  const n = nights(from, to);
  if (n < 1) return json({ error: "Check-out must be after check-in." }, 400);
  if (n > config.defaults.maxNights) return json({ error: `Stays are limited to ${config.defaults.maxNights} nights.` }, 400);
  if (from < todayISO()) return json({ error: "Check-in can't be in the past." }, 400);

  try {
    const room = await prisma.room.findFirst({ where: { id: roomId, active: true } });
    if (!room) return json({ error: "Room not found." }, 404);
    const available =
      guests <= room.capacity &&
      (await isFree(room.id, toInstant(from, config.defaults.checkInTime), toInstant(to, config.defaults.checkOutTime)));
    return json({ available, nights: n, total: room.pricePerNight * n, ratePerNight: room.pricePerNight });
  } catch (e) {
    console.error("[availability]", e);
    return json({ error: "Couldn't check availability right now." }, 500);
  }
}
