"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { RoomWithStatus } from "@/lib/room-status";
import { nights, bookingTotal, formatINR, formatDate, todayISO, addDays } from "@/lib/pricing";
import { config } from "@/config";
import { enquiryMessage } from "@/lib/enquiry";
import { Icon } from "@/components/icons";
import { openChat } from "@/components/chat-widget";

type Room = Pick<RoomWithStatus, "id" | "name" | "pricePerNight" | "capacity" | "images">;
type Check = { key: string; state: "available" | "unavailable" | "error"; message?: string };

export function RoomBooking({ room }: { room: Room }) {
  const [active, setActive] = useState(0);
  const [checkIn, setCheckIn] = useState(addDays(todayISO(), 1));
  const [checkOut, setCheckOut] = useState(addDays(todayISO(), 3));
  const [guests, setGuests] = useState(Math.min(2, room.capacity));
  const [check, setCheck] = useState<Check | null>(null);

  const n = useMemo(() => nights(checkIn, checkOut), [checkIn, checkOut]);
  const total = bookingTotal(room.pricePerNight, n);
  const valid = n > 0 && n <= config.defaults.maxNights;
  const advance = Math.round(total * config.advanceRate);

  // Live availability for the chosen dates (debounced; stale answers are ignored by key).
  const key = `${room.id}|${checkIn}|${checkOut}|${guests}`;
  useEffect(() => {
    if (!valid) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ room: room.id, from: checkIn, to: checkOut, guests: String(guests) });
        const res = await fetch(`/api/availability?${q}`, { signal: ctrl.signal, cache: "no-store" });
        const body = (await res.json()) as { available?: boolean; error?: string };
        setCheck(res.ok ? { key, state: body.available ? "available" : "unavailable" } : { key, state: "error", message: body.error });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setCheck({ key, state: "error" });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, valid, room.id, checkIn, checkOut, guests]);
  const status = !valid ? null : check?.key === key ? check.state : "checking";
  const enquiry = enquiryMessage({ room, checkIn: valid ? checkIn : undefined, checkOut: valid ? checkOut : undefined, guests });
  const images = room.images.length > 0 ? room.images : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Gallery */}
      <div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] border border-hairline bg-sand p-1.5">
          <div className="relative h-full w-full overflow-hidden rounded-[1.4rem] bg-sand">
            {images[active] && (
              <Image
                key={active}
                src={images[active]}
                alt={`${room.name} — photo ${active + 1}`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="animate-fade-up object-cover"
              />
            )}
          </div>
        </div>
        {images.length > 1 && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={i === active}
                className={`relative aspect-[4/3] overflow-hidden rounded-2xl border transition-all duration-300 ${
                  i === active ? "border-clay ring-2 ring-clay/25" : "border-hairline opacity-70 hover:opacity-100"
                }`}
              >
                <Image src={src} alt="" fill sizes="20vw" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Booking panel */}
      <div className="lg:sticky lg:top-24 lg:h-max">
        <div className="rounded-[1.75rem] border border-hairline bg-paper p-1.5 shadow-[var(--shadow-soft)]">
          <div className="rounded-[1.4rem] bg-gradient-to-b from-sand/50 to-transparent p-5 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.6)]">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-faint">From</p>
                <p className="font-display text-3xl text-ink">
                  {formatINR(room.pricePerNight)}
                  <span className="text-sm font-normal text-muted"> / night</span>
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-[11px] font-medium text-sage">
                <Icon.users width={13} height={13} /> up to {room.capacity}
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-hairline bg-paper">
              <div className="grid grid-cols-2 divide-x divide-hairline">
                <label className="flex min-w-0 flex-col gap-1 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Check-in</span>
                  <input
                    type="date"
                    value={checkIn}
                    min={todayISO()}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCheckIn(v);
                      if (nights(v, checkOut) <= 0) setCheckOut(addDays(v, 2));
                    }}
                    className="w-full min-w-0 bg-transparent text-[13px] font-medium text-ink outline-none"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Check-out</span>
                  <input
                    type="date"
                    value={checkOut}
                    min={addDays(checkIn, 1)}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full min-w-0 bg-transparent text-[13px] font-medium text-ink outline-none"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between border-t border-hairline p-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Guests</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-30"
                    disabled={guests <= 1}
                    aria-label="Fewer guests"
                  >
                    –
                  </button>
                  <span className="w-4 text-center text-[14px] font-medium text-ink" aria-live="polite">
                    {guests}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGuests((g) => Math.min(room.capacity, g + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-30"
                    disabled={guests >= room.capacity}
                    aria-label="More guests"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between text-muted">
                <span>
                  {formatINR(room.pricePerNight)} × {n} night{n === 1 ? "" : "s"}
                </span>
                <span>{formatINR(total)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Taxes &amp; fees</span>
                <span>Included</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-2.5">
                <span className="font-medium text-ink">Total</span>
                <span className="font-display text-xl text-ink">{formatINR(total)}</span>
              </div>
            </div>

            <p aria-live="polite" className="mt-3 flex min-h-5 items-center gap-2 text-[12.5px]">
              {!valid && (
                <span className="text-clay">
                  {n > config.defaults.maxNights
                    ? `Stays are up to ${config.defaults.maxNights} nights — message us for longer.`
                    : "Choose a check-out date after check-in."}
                </span>
              )}
              {status === "checking" && (
                <span className="flex items-center gap-2 text-faint">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-faint" /> Checking availability…
                </span>
              )}
              {status === "available" && (
                <span className="flex items-center gap-1.5 font-medium text-sage">
                  <Icon.checkCircle width={15} height={15} /> Available for your dates
                </span>
              )}
              {status === "unavailable" && (
                <span className="text-clay">Booked on some of these nights — try other dates, or ask us for another room.</span>
              )}
              {status === "error" && (
                <span className="text-muted">{check?.message ?? "Couldn't check just now — ask us in the chat."}</span>
              )}
            </p>

            <button
              type="button"
              onClick={() => openChat(enquiry)}
              className="group mt-3 flex w-full items-center justify-between rounded-full bg-clay py-2.5 pl-6 pr-2 text-sm font-medium text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-clay-dark active:scale-[0.98]"
            >
              {status === "available" ? "Book in chat" : "Ask in chat"}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform duration-500 group-hover:translate-x-0.5">
                <Icon.chat width={15} height={15} />
              </span>
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
              {valid
                ? `Reserve in the chat with a ${Math.round(config.advanceRate * 100)}% advance (${formatINR(advance)}) by UPI · balance at check-in`
                : "Pick your dates, then book in the chat"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-hairline bg-paper px-4 py-3 text-[12px] text-muted">
          <Icon.calendar width={15} height={15} className="mt-0.5 shrink-0 text-clay" />
          <span>
            {valid
              ? `${formatDate(checkIn)} → ${formatDate(checkOut)} · check-in from ${config.property.checkIn}, check-out by ${config.property.checkOut}`
              : "Pick your dates to see the total."}
          </span>
        </div>
      </div>
    </div>
  );
}
