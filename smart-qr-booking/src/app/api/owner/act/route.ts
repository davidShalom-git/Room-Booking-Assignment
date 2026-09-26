/**
 * Acknowledge / Not received, tapped on an owner-app notification (public/owner-sw.js).
 * Authorized by the notification's signed token for that one payment — no login at that moment.
 */
import { ownerAct } from "@/lib/owner-app";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { action?: unknown; token?: unknown } | null;
  const action = body?.action === "ack" || body?.action === "nack" ? body.action : null;
  if (!action || typeof body?.token !== "string") return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  const r = await ownerAct(body.token, action);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
