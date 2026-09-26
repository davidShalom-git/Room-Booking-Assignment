/**
 * Daily at 21:00 IST (vercel.json): the day in numbers, as a notification on the owner's phone.
 * Also clears old website-chat rate-limit counters and chats older than a year (privacy policy).
 */
import { prisma } from "@/lib/db";
import { cronAuthorized } from "@/lib/secure";
import { dailySummary } from "@/lib/owner-app";
import { OWNER_PUSH, sendOwnerPush } from "@/lib/push";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const text = await dailySummary(now);
  const sent = await sendOwnerPush({ to: OWNER_PUSH, text });
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
  await prisma.chatMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 365 * 86_400_000) } } });
  return Response.json({ sent, text });
}
