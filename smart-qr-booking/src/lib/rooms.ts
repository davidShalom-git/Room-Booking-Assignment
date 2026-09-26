/** Rooms for the guest site: active rooms from the database, each marked free / booked for tonight. */
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { freeRooms } from "@/lib/engine";
import { toInstant } from "@/lib/dates";
import { addDays, todayISO } from "@/lib/pricing";
import type { RoomWithStatus } from "@/lib/room-status";

export type { RoomWithStatus } from "@/lib/room-status";
export { tonightLabel } from "@/lib/room-status";

export async function getRooms(): Promise<RoomWithStatus[]> {
  await connection(); // availability changes by the minute: always render on request
  const today = todayISO();
  const { checkInTime, checkOutTime } = await getSettings();
  const [rooms, free] = await Promise.all([
    prisma.room.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    freeRooms(toInstant(today, checkInTime), toInstant(addDays(today, 1), checkOutTime)),
  ]);
  const freeIds = new Set(free.map((r) => r.id));
  return rooms.map((r) => ({ ...r, status: freeIds.has(r.id) ? "available" : "occupied" }));
}
