/** Rooms for the guest site: active rooms from the database, each marked free / booked for tonight. */
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { config } from "@/config";
import { freeRooms } from "@/lib/engine";
import { toInstant } from "@/lib/dates";
import { addDays, todayISO } from "@/lib/pricing";
import type { RoomWithStatus } from "@/lib/room-status";

export type { RoomWithStatus } from "@/lib/room-status";
export { tonightLabel } from "@/lib/room-status";

export async function getRooms(): Promise<RoomWithStatus[]> {
  await connection(); // availability changes by the minute: always render on request
  const today = todayISO();
  const [rooms, free] = await Promise.all([
    prisma.room.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    freeRooms(toInstant(today, config.defaults.checkInTime), toInstant(addDays(today, 1), config.defaults.checkOutTime)),
  ]);
  const freeIds = new Set(free.map((r) => r.id));
  return rooms.map((r) => ({ ...r, status: freeIds.has(r.id) ? "available" : "occupied" }));
}
