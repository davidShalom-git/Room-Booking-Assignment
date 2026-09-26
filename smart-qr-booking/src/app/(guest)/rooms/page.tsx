import type { Metadata } from "next";
import { getRooms } from "@/lib/rooms";
import { RoomsBrowser } from "@/components/rooms-browser";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage() {
  return <RoomsBrowser rooms={await getRooms()} />;
}
