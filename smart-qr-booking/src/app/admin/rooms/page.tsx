import Link from "next/link";
import Image from "next/image";
import { rooms } from "@/lib/data";
import { formatINR } from "@/lib/pricing";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";

export const metadata = { title: "Rooms" };

export default function AdminRoomsPage() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Rooms</h1>
          <p className="mt-1 text-[13px] text-muted">{rooms.length} rooms · tap a row action to preview</p>
        </div>
        <Link
          href="/admin/qr"
          className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.03]"
        >
          <Icon.qr width={15} height={15} />
          Generate QR codes
        </Link>
      </header>

      <div className="mt-7 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-5 py-3 font-semibold">Room</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Bed · Guests</th>
                <th className="px-5 py-3 text-right font-semibold">Price / night</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rooms.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-sand/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg">
                        <Image src={r.images[0]} alt="" fill sizes="56px" className="object-cover" />
                      </div>
                      <div>
                        <p className="font-medium text-ink">Room {r.id}</p>
                        <p className="text-[11px] text-faint">{r.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{r.type}</td>
                  <td className="px-5 py-3 text-muted">
                    {r.bed.split(" ")[0]} · {r.capacity}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-ink">
                    {formatINR(r.pricePerNight)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/rooms/${r.id}`}
                        className="rounded-full border border-hairline px-2.5 py-1 text-[11.5px] text-ink transition-colors hover:bg-ink/[0.04]"
                      >
                        View
                      </Link>
                      <button
                        title="Editing is out of scope for this demo"
                        className="cursor-not-allowed rounded-full border border-hairline px-2.5 py-1 text-[11.5px] text-faint"
                      >
                        Edit
                      </button>
                      <Link
                        href="/admin/qr"
                        className="rounded-full bg-ink px-2.5 py-1 text-[11.5px] text-cream transition-transform hover:scale-[1.03]"
                      >
                        QR
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-faint">
        Editing, rates and inventory management are part of the full build — the buttons
        show where they live.
      </p>
    </div>
  );
}
