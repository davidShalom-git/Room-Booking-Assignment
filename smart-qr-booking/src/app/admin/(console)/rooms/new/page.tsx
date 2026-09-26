import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { RoomForm } from "@/components/admin/room-form";

export const metadata = { title: "Add room" };

export default async function NewRoomPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl">
      <Link href="/admin/rooms" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Icon.arrowLeft width={14} height={14} /> Rooms
      </Link>
      <h1 className="font-display mt-3 text-3xl text-ink">Add a room</h1>
      <RoomForm
        initial={{
          id: "",
          name: "",
          type: "",
          pricePerNight: "",
          capacity: "2",
          bed: "",
          ac: true,
          size: "",
          floor: "1",
          shortDescription: "",
          description: "",
          amenities: "Free WiFi\nTV\nHot Water\nAttached Bathroom\nDaily Housekeeping",
          images: "",
          active: true,
        }}
      />
    </div>
  );
}
