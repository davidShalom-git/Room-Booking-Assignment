"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Room } from "@/lib/data";
import { nights, bookingTotal, formatINR, formatDate, todayISO, addDays } from "@/lib/pricing";
import { config } from "@/config";
import { waLink, enquiryMessage } from "@/lib/whatsapp";
import { Icon } from "@/components/icons";

export function RoomBooking({ room }: { room: Room }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [checkIn, setCheckIn] = useState(addDays(todayISO(), 1));
  const [checkOut, setCheckOut] = useState(addDays(todayISO(), 3));
  const [guests, setGuests] = useState(Math.min(2, room.capacity));

  const n = useMemo(() => nights(checkIn, checkOut), [checkIn, checkOut]);
  const total = bookingTotal(room.pricePerNight, n);
  const valid = n > 0;

  const goBook = () => {
    const q = new URLSearchParams({ checkIn, checkOut, guests: String(guests) });
    router.push(`/rooms/${room.id}/book?${q.toString()}`);
  };

  const wa = waLink(
    enquiryMessage({
      room: { id: room.id, name: room.name, pricePerNight: room.pricePerNight },
      checkIn,
      checkOut,
      guests,
    }),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Gallery */}
      <div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] border border-hairline bg-sand p-1.5">
          <div className="relative h-full w-full overflow-hidden rounded-[1.4rem]">
            <Image
              key={active}
              src={room.images[active]}
              alt={`${room.name} — view ${active + 1}`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="animate-fade-up object-cover"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {room.images.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActive(i)}
              className={`relative aspect-[4/3] overflow-hidden rounded-2xl border transition-all duration-300 ${
                i === active
                  ? "border-clay ring-2 ring-clay/25"
                  : "border-hairline opacity-70 hover:opacity-100"
              }`}
            >
              <Image src={src} alt="" fill sizes="20vw" className="object-cover" />
            </button>
          ))}
        </div>
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
                <label className="flex flex-col gap-1 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                    Check-in
                  </span>
                  <input
                    type="date"
                    value={checkIn}
                    min={todayISO()}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCheckIn(v);
                      if (nights(v, checkOut) <= 0) setCheckOut(addDays(v, 2));
                    }}
                    className="bg-transparent text-[13px] font-medium text-ink outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                    Check-out
                  </span>
                  <input
                    type="date"
                    value={checkOut}
                    min={addDays(checkIn, 1)}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="bg-transparent text-[13px] font-medium text-ink outline-none"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between border-t border-hairline p-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                  Guests
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-30"
                    disabled={guests <= 1}
                    aria-label="Fewer guests"
                  >
                    –
                  </button>
                  <span className="w-4 text-center text-[14px] font-medium text-ink">{guests}</span>
                  <button
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
              {!valid && (
                <p className="pt-1 text-[12px] text-clay">
                  Choose a check-out date after check-in.
                </p>
              )}
            </div>

            <button
              onClick={goBook}
              disabled={!valid}
              className="group mt-4 flex w-full items-center justify-between rounded-full bg-clay py-2.5 pl-6 pr-2 text-sm font-medium text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-clay-dark active:scale-[0.98] disabled:opacity-40"
            >
              Book now
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 group-hover:translate-x-0.5">
                <Icon.arrowRight width={15} height={15} />
              </span>
            </button>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-[#1f8a4c]/30 py-2.5 text-sm font-medium text-[#1a7a42] transition-colors hover:bg-[#1f8a4c]/[0.06]"
            >
              <Icon.whatsapp width={15} height={15} />
              Ask on WhatsApp
            </a>
            <p className="mt-3 text-center text-[11px] text-faint">
              No card needed · pay {formatINR(total)} at the property · free cancellation 48h
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-hairline bg-paper px-4 py-3 text-[12px] text-muted">
          <Icon.calendar width={15} height={15} className="mt-0.5 shrink-0 text-clay" />
          <span>
            {n > 0
              ? `${formatDate(checkIn)} → ${formatDate(checkOut)} · arrive after ${config.property.checkIn}`
              : "Pick your dates to see the total."}
          </span>
        </div>
      </div>
    </div>
  );
}
