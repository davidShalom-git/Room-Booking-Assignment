/**
 * Daily at 17:00 IST (vercel.json): ask guests who check out tomorrow, in the chat they booked
 * from, whether they'd like to extend. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
import { cronAuthorized } from "@/lib/secure";
import { lastDayNudges } from "@/lib/bot/step";
import { prismaPorts } from "@/lib/bot/ports-prisma";
import { deliver } from "@/lib/deliver";
import { addDays, todayISO } from "@/lib/pricing";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const tomorrow = addDays(todayISO(now), 1);
  // Each nudge is claimed on its booking before it is sent, so a rerun never repeats one.
  const nudges = await lastDayNudges(prismaPorts(), tomorrow);
  await deliver(nudges);
  return Response.json({ sent: nudges.length, for: tomorrow });
}
