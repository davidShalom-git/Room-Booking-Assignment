import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { todayISO } from "@/lib/pricing";
import { Icon } from "@/components/icons";
import { WalkInForm } from "@/components/admin/walk-in-form";

export const metadata = { title: "New booking" };

export default async function NewBookingPage() {
  await requireAdmin();
  const rooms = await prisma.room.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, pricePerNight: true, capacity: true },
  });
  return (
    <div>
      <Link href="/admin/bookings" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Icon.arrowLeft width={14} height={14} /> Bookings
      </Link>
      <h1 className="font-display mt-3 text-3xl text-ink">New booking</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        For guests who call or walk in. Chat bookings arrive on their own.
      </p>
      <WalkInForm rooms={rooms} today={todayISO()} />
    </div>
  );
}
