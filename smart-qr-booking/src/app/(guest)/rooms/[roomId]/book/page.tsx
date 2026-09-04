import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRoom } from "@/lib/data";
import { BookingForm } from "@/components/booking-form";

export const metadata: Metadata = { title: "Complete your booking" };

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomId } = await params;
  const sp = await searchParams;
  const room = getRoom(roomId);
  if (!room) notFound();

  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  return (
    <div className="px-4 pt-24">
      <div className="mx-auto max-w-5xl">
        <BookingForm
          room={room}
          checkIn={str(sp.checkIn)}
          checkOut={str(sp.checkOut)}
          guests={Number(str(sp.guests)) || 1}
        />
      </div>
    </div>
  );
}
