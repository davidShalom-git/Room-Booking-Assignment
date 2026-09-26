import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { RoomForm } from "@/components/admin/room-form";

export const metadata = { title: "Edit room" };

export default async function EditRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  await requireAdmin();
  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: decodeURIComponent(roomId) } });
  if (!room) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/rooms" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Icon.arrowLeft width={14} height={14} /> Rooms
      </Link>
      <h1 className="font-display mt-3 text-3xl text-ink">Room {room.id}</h1>
      <p className="mt-1 text-[13px] text-muted">
        Price changes apply to new bookings only; existing bookings keep the rate they were made at.
      </p>
      <RoomForm
        existingId={room.id}
        initial={{
          id: room.id,
          name: room.name,
          type: room.type,
          pricePerNight: String(room.pricePerNight),
          capacity: String(room.capacity),
          bed: room.bed,
          ac: room.ac,
          size: room.size,
          floor: String(room.floor),
          shortDescription: room.shortDescription,
          description: room.description,
          amenities: room.amenities.join("\n"),
          images: room.images.join("\n"),
          active: room.active,
        }}
      />
    </div>
  );
}
