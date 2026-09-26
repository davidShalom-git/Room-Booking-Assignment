import { prisma } from "../../src/lib/db";

/** Empty every table (and restart the booking sequence) between tests. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "Payment", "Booking", "Customer", "Conversation", "ChatMessage", "PushSubscription", "RateLimit", "Room" RESTART IDENTITY CASCADE`,
  );
}

export type RoomSeed = { id: string; capacity?: number; price?: number; active?: boolean; name?: string };

/** Create simple rooms; defaults: capacity 2, ₹1,000. */
export async function seedRooms(rooms: RoomSeed[] = [{ id: "101" }, { id: "102" }, { id: "103", capacity: 4 }]) {
  for (const [i, r] of rooms.entries()) {
    await prisma.room.create({
      data: {
        id: r.id,
        name: r.name ?? `Room ${r.id}`,
        type: "Test",
        pricePerNight: r.price ?? 1000,
        capacity: r.capacity ?? 2,
        bed: "Queen Bed",
        ac: true,
        size: "20 m²",
        floor: 1,
        shortDescription: "short",
        description: "long",
        amenities: ["WiFi"],
        images: [],
        active: r.active ?? true,
        sortOrder: i,
      },
    });
  }
}

/** Insert a booking row directly (bypasses the engine) for schema-level tests. */
export function rawBooking(
  roomId: string,
  checkInAt: string,
  checkOutAt: string,
  status: "PENDING" | "CONFIRMED" | "CANCELLED" = "CONFIRMED",
) {
  return prisma.booking.create({
    data: {
      roomId,
      guestName: "T",
      guestPhone: "919000000000",
      guests: 1,
      checkInAt: new Date(checkInAt),
      checkOutAt: new Date(checkOutAt),
      ratePerNight: 1000,
      nights: 1,
      total: 1000,
      status,
      source: "ADMIN",
    },
  });
}
