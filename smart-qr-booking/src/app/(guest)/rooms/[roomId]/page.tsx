import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rooms, getRoom } from "@/lib/data";
import { config } from "@/config";
import { formatINR } from "@/lib/pricing";
import { qrLink } from "@/lib/whatsapp";
import { qrSvg } from "@/lib/qr";
import { Icon, amenityIcon } from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";
import { RoomBooking } from "@/components/room-booking";
import { RoomCard } from "@/components/room-card";
import { Reveal } from "@/components/reveal";

export function generateStaticParams() {
  return rooms.map((r) => ({ roomId: r.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomId: string }>;
}): Promise<Metadata> {
  const { roomId } = await params;
  const room = getRoom(roomId);
  if (!room) return { title: "Room not found" };
  return {
    title: `Room ${room.id} — ${room.name}`,
    description: room.shortDescription,
  };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const room = getRoom(roomId);
  if (!room) notFound();

  const svg = await qrSvg(qrLink(room));
  const others = rooms.filter((r) => r.id !== room.id).slice(0, 3);

  const facts = [
    { icon: "users" as const, label: `Up to ${room.capacity} guests` },
    { icon: "bed" as const, label: room.bed },
    { icon: "snow" as const, label: room.ac ? "Air conditioned" : "Fan / naturally cooled" },
    { icon: "ruler" as const, label: room.size },
  ];

  return (
    <div className="px-4 pt-24">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/rooms"
          className="group inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
        >
          <Icon.arrowLeft
            width={14}
            height={14}
            className="transition-transform duration-300 group-hover:-translate-x-0.5"
          />
          All rooms
        </Link>

        {/* Header */}
        <div className="mt-5 flex flex-col gap-4 border-b border-hairline pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
                Room {room.id}
              </span>
              <StatusBadge status={room.status} />
            </div>
            <h1 className="font-display mt-2 text-4xl leading-[1.03] text-ink sm:text-[3rem]">
              {room.name}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
              <span className="flex items-center gap-1 text-gold">
                <Icon.star width={14} height={14} />
                {config.property.rating}
              </span>
              · {room.type} · Floor {room.floor}
            </p>
          </div>
          <p className="shrink-0">
            <span className="font-display text-3xl text-ink">{formatINR(room.pricePerNight)}</span>
            <span className="text-sm text-muted"> / night</span>
          </p>
        </div>

        <div className="py-9">
          <RoomBooking room={room} />
        </div>

        {/* Facts */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-hairline bg-hairline sm:grid-cols-4">
          {facts.map((f) => {
            const IconCmp = Icon[f.icon];
            return (
              <div key={f.label} className="flex items-center gap-3 bg-paper px-5 py-4">
                <IconCmp width={17} height={17} className="shrink-0 text-clay" />
                <span className="text-[13px] text-ink">{f.label}</span>
              </div>
            );
          })}
        </div>

        {/* Description + amenities + QR */}
        <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Reveal>
              <h2 className="font-display text-2xl text-ink">About this room</h2>
              <p className="mt-4 whitespace-pre-line text-[15px] leading-[1.75] text-muted">
                {room.description}
              </p>
            </Reveal>

            <Reveal delay={80}>
              <h3 className="font-display mt-10 text-xl text-ink">What's included</h3>
              <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {room.amenities.map((a) => {
                  const IconCmp = Icon[amenityIcon(a)];
                  return (
                    <li key={a} className="flex items-center gap-3 text-[13.5px] text-ink">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sand text-clay">
                        <IconCmp width={15} height={15} />
                      </span>
                      {a}
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>

          {/* This room's QR */}
          <Reveal delay={120}>
            <div className="rounded-[1.75rem] border border-hairline bg-paper p-1.5 lg:sticky lg:top-24">
              <div className="flex flex-col items-center rounded-[1.4rem] bg-sand/50 px-6 py-8 text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
                  This room's code
                </span>
                <div className="mt-4 rounded-2xl bg-paper p-4 shadow-[var(--shadow-soft)]">
                  <div
                    className="h-36 w-36 [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </div>
                <p className="mt-4 text-[13px] text-muted">
                  Print it, stick it on the door of Room {room.id}. A guest scan opens
                  WhatsApp with this room&apos;s enquiry ready to send.
                </p>
                <Link
                  href="/qr"
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-clay"
                >
                  <Icon.qr width={14} height={14} />
                  See all room codes
                </Link>
              </div>
            </div>
          </Reveal>
        </div>

        {/* More rooms */}
        <div className="mt-16 border-t border-hairline pt-12">
          <h2 className="font-display text-2xl text-ink">More rooms</h2>
          <div className="mt-6 grid gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
