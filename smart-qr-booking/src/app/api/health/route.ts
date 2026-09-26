import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness + DB reachability, for uptime checks and the deploy smoke test. */
export async function GET() {
  try {
    const rooms = await prisma.room.count({ where: { active: true } });
    return Response.json({ ok: true, rooms });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
