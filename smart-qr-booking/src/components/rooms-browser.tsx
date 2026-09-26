"use client";

import { useMemo, useState } from "react";
import type { RoomWithStatus } from "@/lib/room-status";
import { RoomCard } from "@/components/room-card";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";

type Filter = "all" | "ac" | "nonac" | "family";
type Sort = "asc" | "desc";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All rooms" },
  { id: "ac", label: "AC" },
  { id: "nonac", label: "Non-AC" },
  { id: "family", label: "Sleeps 3+" },
];

export function RoomsBrowser({ rooms }: { rooms: RoomWithStatus[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("asc");

  const list = useMemo(() => {
    let r = rooms.filter((room) => {
      if (filter === "ac") return room.ac;
      if (filter === "nonac") return !room.ac;
      if (filter === "family") return room.capacity >= 3;
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === "asc" ? a.pricePerNight - b.pricePerNight : b.pricePerNight - a.pricePerNight,
    );
    return r;
  }, [rooms, filter, sort]);

  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>{rooms.length} rooms · one house</Eyebrow>
        <h1 className="font-display mt-4 max-w-2xl text-4xl leading-[1.05] text-ink sm:text-5xl">
          Every room, honestly priced
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
          Prices are per room, per night, taxes included. Tap any room for photos,
          amenities and live availability for your dates.
        </p>

        {/* Controls */}
        <div className="mt-9 flex flex-col gap-3 border-y border-hairline py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-300 ${
                  filter === f.id
                    ? "bg-ink text-cream"
                    : "border border-hairline text-muted hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-faint">{list.length} shown</span>
            <button
              onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}
              className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-ink/[0.03]"
            >
              <Icon.sliders width={14} height={14} />
              Price {sort === "asc" ? "low → high" : "high → low"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((room, i) => (
            <RoomCard key={room.id} room={room} priority={i < 3} />
          ))}
        </div>
        {list.length === 0 && (
          <p className="py-16 text-center text-sm text-muted">
            No rooms match that filter.
          </p>
        )}
      </div>
    </div>
  );
}
