import Image from "next/image";
import Link from "next/link";
import { tonightLabel, type RoomWithStatus } from "@/lib/room-status";
import { formatINR } from "@/lib/pricing";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";

export function RoomCard({ room, priority = false }: { room: RoomWithStatus; priority?: boolean }) {
  return (
    <Link
      href={`/rooms/${room.id}`}
      className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-hairline bg-paper p-1.5 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.4rem] bg-sand">
        {room.images[0] ? (
          <Image
            src={room.images[0]}
            alt={room.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            priority={priority}
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-faint">
            <Icon.bed width={28} height={28} />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge status={room.status} label={tonightLabel(room.status)} />
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-cream/85 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur-sm">
          Room {room.id}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg leading-tight text-ink">{room.name}</h3>
            <p className="mt-0.5 text-[12px] text-faint">Floor {room.floor} · {room.size}</p>
          </div>
          <p className="shrink-0 text-right">
            <span className="font-display text-lg text-ink">{formatINR(room.pricePerNight)}</span>
            <span className="block text-[11px] text-faint">per night</span>
          </p>
        </div>

        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
          {room.shortDescription}
        </p>

        <div className="mt-auto flex items-center gap-3 border-t border-hairline pt-3 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><Icon.users width={14} height={14} />{room.capacity}</span>
          <span className="flex items-center gap-1.5"><Icon.bed width={14} height={14} />{room.bed.split(" ")[0]}</span>
          <span className="flex items-center gap-1.5">
            <Icon.snow width={14} height={14} />{room.ac ? "AC" : "Non-AC"}
          </span>
          <span className="ml-auto flex items-center gap-1 font-medium text-clay">
            View
            <Icon.arrowUpRight width={13} height={13} className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-px" />
          </span>
        </div>
      </div>
    </Link>
  );
}
