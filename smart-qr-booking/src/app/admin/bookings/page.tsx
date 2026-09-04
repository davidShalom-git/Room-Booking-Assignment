"use client";

import { useEffect, useMemo, useState } from "react";
import { type Booking, type BookingStatus } from "@/lib/data";
import { allBookings } from "@/lib/bookings-store";
import { formatINR, formatDate } from "@/lib/pricing";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";

const STATUSES: (BookingStatus | "all")[] = ["all", "confirmed", "pending", "cancelled"];
const SOURCES = ["all", "web", "whatsapp", "walk-in"] as const;

export default function AdminBookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
  const [q, setQ] = useState("");

  useEffect(() => setRows(allBookings()), []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (source !== "all" && b.source !== source) return false;
      if (needle && !`${b.id} ${b.guestName} ${b.roomName}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [rows, status, source, q]);

  const total = filtered
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + b.total, 0);

  return (
    <div>
      <header>
        <h1 className="font-display text-3xl text-ink">Bookings</h1>
        <p className="mt-1 text-[13px] text-muted">
          {rows.length} total · demo bookings from the guest flow are included
        </p>
      </header>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 border-y border-hairline py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-[12px] capitalize transition-all duration-200 ${
                  status === s ? "bg-ink text-cream" : "border border-hairline text-muted hover:text-ink"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}
            className="rounded-full border border-hairline bg-paper px-3 py-1.5 text-[12px] text-ink outline-none"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All sources" : s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5">
          <Icon.sliders width={14} height={14} className="text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guest or ID"
            className="w-40 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[12px] text-muted">
        <span>{filtered.length} shown</span>
        <span>
          Filtered total: <span className="font-medium text-ink">{formatINR(total)}</span>
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Booking ID</th>
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">Room</th>
                <th className="px-4 py-3 font-semibold">Check-in</th>
                <th className="px-4 py-3 font-semibold">Check-out</th>
                <th className="px-4 py-3 text-center font-semibold">Guests</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((b) => (
                <tr key={b.id} className="transition-colors hover:bg-sand/30">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{b.id}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {b.guestName}
                    <span className="block text-[10.5px] text-faint">{b.guestPhone}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {b.roomId} · {b.roomName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(b.checkIn)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(b.checkOut)}</td>
                  <td className="px-4 py-3 text-center text-muted">{b.guests}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-ink">
                    {formatINR(b.total)}
                    {b.advancePaid !== undefined && (
                      <span className="block text-[10.5px] font-normal text-sage">
                        Paid {formatINR(b.advancePaid)} · Due {formatINR(b.balanceDue ?? 0)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{b.source}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-muted">
                    No bookings match these filters.
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
