import { prisma } from "../../src/db.ts";

export async function resetDb(): Promise<void> {
  await prisma.booking.deleteMany();
  await prisma.resource.deleteMany();
}

export async function seedResource(overrides: Partial<{ name: string; capacity: number }> = {}) {
  return prisma.resource.create({
    data: { name: overrides.name ?? "Room A", capacity: overrides.capacity ?? 4 },
  });
}
