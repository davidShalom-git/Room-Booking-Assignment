"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { rooms, todayActivity, type Booking } from "@/lib/data";
import { allBookings } from "@/lib/bookings-store";
import { formatINR, formatDate } from "@/lib/pricing";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  useEffect(() => setBookings(allBookings()), []);

  const available = rooms.filter((r) => r.status === "available").length;
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const pending = rooms.filter((r) => r.status === "pending").length;

  const revenue = bookings
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + b.total, 0);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">
            Overview for {formatDate(new Date().toISOString().slice(0, 10))}
          </p>
        </div>
        <Link
          href="/admin/qr"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-cream transition-transform hover:scale-[1.02]"
        >
          <Icon.qr width={15} height={15} />
          Room QR codes
        </Link>
      </header>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
          Overview
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total rooms" value={rooms.length} icon="grid" />
          <StatCard label="Available" value={available} icon="check" tone="sage" hint="ready to sell" />
          <StatCard label="Occupied" value={occupied} icon="bed" tone="clay" hint="in-house" />
          <StatCard label="Pending" value={pending} icon="calendar" tone="gold" hint="hold / unconfirmed" />
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
            Today's activity
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatCard label="Arrivals" value={todayActivity.checkIns} icon="arrowRight" tone="sage" hint="checking in" />
            <StatCard label="Departures" value={todayActivity.checkOuts} icon="arrowLeft" tone="clay" hint="checking out" />
          </div>
          <div className="mt-3 rounded-[1.5rem] border border-hairline bg-paper p-1.5">
            <div className="rounded-[1.15rem] bg-sand/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                Booked revenue (demo)
              </p>
              <p className="font-display mt-2 text-3xl text-ink">{formatINR(revenue)}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {bookings.filter((b) => b.status !== "cancelled").length} active bookings
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
              Recent bookings
            </h2>
            <Link href="/admin/bookings" className="text-[12px] font-medium text-clay">
              View all →
            </Link>
          </div>
          <div className="mt-3 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                    <th className="px-4 py-2.5 font-semibold">Booking</th>
                    <th className="px-4 py-2.5 font-semibold">Guest</th>
                    <th className="px-4 py-2.5 font-semibold">Room</th>
                    <th className="px-4 py-2.5 font-semibold">Dates</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {bookings.slice(0, 6).map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-sand/30">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{b.id}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{b.guestName}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{b.roomId}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                        {formatDate(b.checkIn)} – {formatDate(b.checkOut)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink">
                        {formatINR(b.total)}
                        {b.advancePaid !== undefined && (
                          <span className="block text-[10px] font-normal text-sage">
                            Due {formatINR(b.balanceDue ?? 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
