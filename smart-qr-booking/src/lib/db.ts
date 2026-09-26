import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

function client(): PrismaClient {
  if (!g.__prisma) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    g.__prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return g.__prisma;
}

/**
 * Lazy singleton: nothing connects (or throws for a missing DATABASE_URL) until the
 * first query, so `next build` and unit tests that never touch the DB work without one.
 * Cached on globalThis so dev hot-reload doesn't open a new pool per edit.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get: (_t, prop) => Reflect.get(client(), prop),
});
