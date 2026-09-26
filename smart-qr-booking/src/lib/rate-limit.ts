/** Fixed-window counters in Postgres (the RateLimit table), for public endpoints. */
import { prisma } from "@/lib/db";

/**
 * Count a hit on `key`: true while it has been hit at most `limit` times in the window.
 * One statement, so parallel requests can't slip past it.
 */
export async function hit(key: string, limit: number, windowMs: number, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= ${since} THEN EXCLUDED."windowStart" ELSE "RateLimit"."windowStart" END,
      "count" = CASE WHEN "RateLimit"."windowStart" <= ${since} THEN 1 ELSE "RateLimit"."count" + 1 END
    RETURNING "count"`;
  return Number(rows[0]?.count ?? limit + 1) <= limit;
}

/** How many hits `key` has in the current window (without counting one). */
export async function hits(key: string, windowMs: number, now: Date = new Date()): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  return row && row.windowStart > new Date(now.getTime() - windowMs) ? row.count : 0;
}
