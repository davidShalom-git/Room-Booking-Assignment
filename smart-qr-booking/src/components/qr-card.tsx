type Room = { id: string; name: string; pricePerNight: number; capacity: number };
import { config, roomUrl } from "@/config";
import { formatINR } from "@/lib/pricing";
import { Icon } from "@/components/icons";

/**
 * One room's QR. `svg` and `png` are generated server-side (see lib/qr.ts) from the room's
 * page URL: a scan opens that room's page, where the guest books in the chat.
 */
export function QrCard({
  room,
  svg,
  png,
  compact = false,
}: {
  room: Room;
  svg: string;
  png: string;
  compact?: boolean;
}) {
  const target = roomUrl(room.id);

  return (
    <div className="flex flex-col rounded-[1.75rem] border border-hairline bg-paper p-1.5">
      <div className="flex flex-col items-center rounded-[1.4rem] bg-sand/60 px-6 py-7 text-center">
        <div className="rounded-2xl bg-paper p-4 shadow-[var(--shadow-soft)]">
          <div
            className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        <p className="mt-4 font-display text-lg text-ink">Room {room.id}</p>
        <p className="text-[13px] text-muted">{room.name}</p>
        {!compact && (
          <p className="mt-1 text-[12px] text-faint">
            {formatINR(room.pricePerNight)}/night · sleeps {room.capacity}
          </p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-faint">
          Scan to view this room &amp; book
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-3">
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-hairline px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.03]"
        >
          <Icon.arrowUpRight width={13} height={13} />
          Open link
        </a>
        <a
          href={png}
          download={`${room.id}-${config.property.name.toLowerCase().replace(/\s+/g, "-")}-qr.png`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[12px] font-medium text-cream transition-transform hover:scale-[1.02]"
        >
          <Icon.download width={13} height={13} />
          Download
        </a>
      </div>

      <p className="truncate px-4 pb-3 text-center text-[10px] text-faint">
        {target}
      </p>
    </div>
  );
}
