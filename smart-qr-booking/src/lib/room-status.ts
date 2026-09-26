/** Client-safe room types and labels (no database imports — used by client components). */
import type { Room } from "@/generated/prisma/browser";

export type RoomWithStatus = Room & { status: "available" | "occupied" };

export const tonightLabel = (s: RoomWithStatus["status"]) => (s === "available" ? "Free tonight" : "Booked tonight");
