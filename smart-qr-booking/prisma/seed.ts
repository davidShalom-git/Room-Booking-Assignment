// `npm run db:seed` — insert the initial rooms. Safe to re-run: existing rooms are left as
// the owner edited them (only missing rooms are created).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedRooms } from "./seed-data";

async function main() {
  let created = 0;
  for (const [i, r] of seedRooms.entries()) {
    const exists = await prisma.room.findUnique({ where: { id: r.id }, select: { id: true } });
    if (exists) continue;
    await prisma.room.create({ data: { ...r, sortOrder: i } });
    created++;
  }
  console.log(`seed: ${created} room(s) created, ${seedRooms.length - created} already present`);
}

main().finally(() => prisma.$disconnect());
