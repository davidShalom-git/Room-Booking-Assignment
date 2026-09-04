"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Booking } from "@/lib/data";
import { getBooking } from "@/lib/bookings-store";
import { formatINR, formatDate } from "@/lib/pricing";
import { config } from "@/config";
import { Icon } from "@/components/icons";
import { waLink, confirmationMessage } from "@/lib/whatsapp";

function Confirmation() {
  const id = useSearchParams().get("id") ?? "";
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);

  useEffect(() => {
    setBooking(getBooking(id) ?? null);
  }, [id]);

  if (booking === undefined) {
    return <div className="h-64" />;
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-md rounded-[1.75rem] border border-hairline bg-paper p-10 text-center">
        <p className="font-display text-2xl text-ink">Booking not found</p>
        <p className="mt-2 text-[14px] text-muted">
          We couldn't find <span className="font-medium">{id || "that booking"}</span> in
          this browser. Demo bookings are stored locally on the device that made them.
        </p>
        <Link
          href="/rooms"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-clay px-5 py-2.5 text-sm font-medium text-white"
        >
          Browse rooms
          <Icon.arrowRight width={15} height={15} />
        </Link>
      </div>
    );
  }

  const b = booking;
  const rows: [string, string][] = [
    ["Booking ID", b.id],
    ["Room", `${b.roomName} — ${b.roomId}`],
    ["Check-in", `${formatDate(b.checkIn)} · from ${config.property.checkIn}`],
    ["Check-out", `${formatDate(b.checkOut)} · by ${config.property.checkOut}`],
    ["Duration", `${b.nights} night${b.nights > 1 ? "s" : ""}`],
    ["Guests", String(b.guests)],
    ["Total", `${formatINR(b.total)} · pay at property`],
  ];

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex flex-col items-center text-center">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-sage text-white">
          <span className="absolute inset-0 animate-ping rounded-full bg-sage/40" />
          <Icon.check width={26} height={26} />
        </span>
        <h1 className="font-display mt-6 text-4xl text-ink">Booking confirmed</h1>
        <p className="mt-2 text-[15px] text-muted">
          Thank you, <span className="text-ink">{b.guestName.split(" ")[0]}</span>. A
          confirmation is on its way to your WhatsApp.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-hairline bg-paper">
        <div className="flex items-center justify-between bg-sand/50 px-6 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
            {config.property.name}
          </span>
          <span className="rounded-full bg-sage-soft px-2.5 py-1 text-[11px] font-medium text-sage">
            {b.status}
          </span>
        </div>
        <dl className="divide-y divide-hairline text-[13.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-6 px-6 py-3.5">
              <dt className="text-faint">{k}</dt>
              <dd className={`text-right ${k === "Total" || k === "Booking ID" ? "font-medium text-ink" : "text-ink"}`}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href={waLink(confirmationMessage(b))}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-3 rounded-full bg-[#1f8a4c] py-2.5 pl-6 pr-2 text-sm font-medium text-white transition-all duration-500 hover:bg-[#1a7a42] active:scale-[0.98]"
        >
          Chat on WhatsApp
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform duration-500 group-hover:translate-x-0.5">
            <Icon.whatsapp width={15} height={15} />
          </span>
        </a>
        <Link
          href="/admin/bookings"
          className="inline-flex items-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.03]"
        >
          <Icon.gauge width={15} height={15} />
          View in admin demo
        </Link>
      </div>
      <p className="mt-6 text-center text-[12px] text-faint">
        Demo booking · stored locally in this browser · no email or payment was sent.
      </p>
      <div className="mt-4 text-center">
        <Link href="/rooms" className="text-[13px] font-medium text-clay">
          Browse more rooms →
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <div className="px-4 pb-8 pt-32">
      <Suspense fallback={<div className="h-64" />}>
        <Confirmation />
      </Suspense>
    </div>
  );
}
