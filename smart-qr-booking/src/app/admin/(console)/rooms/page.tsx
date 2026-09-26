import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { roomStatusNow } from "@/lib/engine";
import { formatINR } from "@/lib/pricing";
import { toggleRoomAction } from "@/app/admin/actions";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/admin/submit-button";
import { Flash, one } from "@/components/admin/field";

export const metadata = { title: "Rooms" };

export default async function AdminRoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const [rooms, status] = await Promise.all([prisma.room.findMany({ orderBy: { sortOrder: "asc" } }), roomStatusNow()]);
  const pill = "rounded-full border border-hairline px-2.5 py-1 text-[11.5px] text-ink transition-colors hover:bg-ink/[0.04]";

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Rooms</h1>
          <p className="mt-1 text-[13px] text-muted">
            {rooms.filter((r) => r.active).length} bookable · {rooms.filter((r) => !r.active).length} hidden
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/rooms/new"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-cream transition-transform hover:scale-[1.02]"
          >
            <Icon.bed width={15} height={15} />
            Add room
          </Link>
          <Link
            href="/admin/qr"
            className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.03]"
          >
            <Icon.qr width={15} height={15} />
            QR codes
          </Link>
        </div>
      </header>

      <Flash msg={one(sp.msg)} err={one(sp.err)} />

      <div className="mt-7 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-5 py-3 font-semibold">Room</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Beds · Sleeps</th>
                <th className="px-5 py-3 text-right font-semibold">Price / night</th>
                <th className="px-5 py-3 font-semibold">Right now</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rooms.map((r) => (
                <tr key={r.id} className={`transition-colors hover:bg-sand/30 ${r.active ? "" : "opacity-60"}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                        {r.images[0] && <Image src={r.images[0]} alt="" fill sizes="56px" className="object-cover" />}
                      </div>
                      <div>
                        <p className="font-medium text-ink">Room {r.id}</p>
                        <p className="text-[11px] text-faint">{r.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{r.type}</td>
                  <td className="px-5 py-3 text-muted">
                    {r.bed} · {r.capacity}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-ink">{formatINR(r.pricePerNight)}</td>
                  <td className="px-5 py-3">
                    {r.active ? (
                      <StatusBadge status={status[r.id] ?? "available"} />
                    ) : (
                      <StatusBadge status="cancelled" label="Hidden" />
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/admin/rooms/${encodeURIComponent(r.id)}`} className={pill}>
                        Edit
                      </Link>
                      <form action={toggleRoomAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                        <SubmitButton
                          pendingText="…"
                          confirm={
                            r.active
                              ? `Hide Room ${r.id}? Guests won't see or be able to book it. Existing bookings stay.`
                              : undefined
                          }
                          className={pill}
                        >
                          {r.active ? "Hide" : "Show"}
                        </SubmitButton>
                      </form>
                      {r.active && (
                        <Link href={`/rooms/${encodeURIComponent(r.id)}`} target="_blank" className={pill}>
                          View
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[13px] text-muted">
                    No rooms yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
