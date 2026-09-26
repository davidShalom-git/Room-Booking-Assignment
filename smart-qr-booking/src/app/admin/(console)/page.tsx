import Link from "next/link";
import { config } from "@/config";
import { requireAdmin } from "@/lib/auth";
import { dashboardData, type AdminBooking } from "@/lib/admin-data";
import { istTime } from "@/lib/dates";
import { formatDate, formatINR, formatTime } from "@/lib/pricing";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";
import { OccupancyGrid } from "@/components/admin/occupancy-grid";
import { BookingActions, PaymentDecision } from "@/components/admin/booking-actions";
import { Flash, one } from "@/components/admin/field";
import { phonePretty } from "@/lib/bot/copy";

export const metadata = { title: "Dashboard" };

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{children}</h2>
);

function DayList({ title, items, empty, kind }: { title: string; items: AdminBooking[]; empty: string; kind: "in" | "out" }) {
  return (
    <div className="rounded-[1.5rem] border border-hairline bg-paper p-4">
      <p className="text-[12px] font-medium text-ink">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-faint">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {items.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
              <span className="min-w-0">
                <span className="font-medium text-ink">{b.guestName}</span>
                <span className="block truncate text-faint">
                  Room {b.roomId} · {b.guests} guest{b.guests === 1 ? "" : "s"} · {b.ref}
                </span>
              </span>
              <span className="shrink-0 text-right text-muted">
                {formatTime(kind === "in" ? b.checkInTime : b.checkOutTime)}
                {kind === "in" && b.total - b.advancePaid > 0 && (
                  <span className="block text-[11px] text-clay">collect {formatINR(b.total - b.advancePaid)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const d = await dashboardData();

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">
            {formatDate(d.today)} · {d.rooms.total} rooms · {d.rooms.available} free right now
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/bookings/new"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-cream transition-transform hover:scale-[1.02]"
          >
            <Icon.calendar width={15} height={15} />
            New booking
          </Link>
          <Link
            href="/admin/qr"
            className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.03]"
          >
            <Icon.qr width={15} height={15} />
            QR codes
          </Link>
        </div>
      </header>

      <Flash msg={one(sp.msg)} err={one(sp.err)} />

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Arrivals" value={d.arrivals.length} icon="arrowRight" tone="sage" hint="checking in today" />
        <StatCard label="Departures" value={d.departures.length} icon="arrowLeft" tone="clay" hint="checking out today" />
        <StatCard label="In house" value={`${d.rooms.occupied}/${d.rooms.total}`} icon="bed" hint="rooms occupied now" />
        <StatCard label="To check" value={d.claims.length} icon="checkCircle" tone="gold" hint={`payments · ${d.pendingHolds.length} more on hold`} />
      </section>

      {d.claims.length > 0 && (
        <section className="mt-8">
          <H2>Payments to check — match the UTR in your UPI app, then acknowledge</H2>
          <ul className="mt-3 space-y-2">
            {d.claims.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border border-sage/30 bg-sage-soft/60 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 text-[13px]">
                  <p className="font-medium text-ink">
                    {formatINR(p.amount)} {p.kind === "EXTENSION" ? "extension" : "advance"} · {p.booking.guestName} · Room {p.booking.roomId}
                  </p>
                  <p className="mt-0.5 text-muted">
                    UTR <span className="font-mono text-ink">{p.utr}</span> · {p.booking.ref} · {formatDate(p.booking.checkIn)} →{" "}
                    {formatDate(p.booking.checkOut)} ·{" "}
                    <a href={`tel:+${p.booking.guestPhone}`} className="text-clay underline-offset-2 hover:underline">
                      {phonePretty(p.booking.guestPhone)}
                    </a>
                  </p>
                  {p.duplicateRef && (
                    <p className="mt-1 font-medium text-clay">
                      ⚠ This UTR was also sent for {p.duplicateRef} — make sure it's a separate payment before acknowledging.
                    </p>
                  )}
                </div>
                <PaymentDecision paymentId={p.id} utr={p.utr} amount={p.amount} path="/admin" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.pendingHolds.length > 0 && (
        <section className="mt-8">
          <H2>Rooms on hold — waiting for the guest to pay</H2>
          <ul className="mt-3 space-y-2">
            {d.pendingHolds.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-3 rounded-2xl border border-[#ead9a6] bg-[#fbf5e3] p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 text-[13px]">
                  <p className="font-medium text-ink">
                    {b.guestName} · Room {b.roomId} · {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
                  </p>
                  <p className="mt-0.5 text-muted">
                    {b.ref} · {b.parentId ? "extension" : "advance"}{" "}
                    {formatINR(b.openPayment?.amount ?? (b.parentId ? b.total : Math.round(b.total * config.advanceRate)))} of {formatINR(b.total)}
                    {b.holdExpiresAt && <> · held until {formatTime(istTime(new Date(b.holdExpiresAt)))}</>} ·{" "}
                    <a href={`tel:+${b.guestPhone}`} className="text-clay underline-offset-2 hover:underline">
                      {phonePretty(b.guestPhone)}
                    </a>
                  </p>
                </div>
                <BookingActions booking={b} path="/admin" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <H2>Next 14 nights</H2>
        <div className="mt-3">
          <OccupancyGrid grid={d.grid} />
        </div>
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0">
          <H2>Today</H2>
          <div className="mt-3 space-y-3">
            <DayList title="Arriving" items={d.arrivals} empty="No arrivals today." kind="in" />
            <DayList title="Leaving" items={d.departures} empty="No departures today." kind="out" />
            <div className="rounded-[1.5rem] border border-hairline bg-paper p-1.5">
              <div className="rounded-[1.15rem] bg-sand/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{d.month.label} stays</p>
                <p className="font-display mt-2 text-3xl text-ink">{formatINR(d.month.revenue)}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {d.month.bookings} confirmed booking{d.month.bookings === 1 ? "" : "s"} · {formatINR(d.month.advance)} collected as advance
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="min-w-0">
          <div className="flex items-center justify-between">
            <H2>Latest bookings</H2>
            <Link href="/admin/bookings?when=all" className="text-[12px] font-medium text-clay">
              View all →
            </Link>
          </div>
          <div className="mt-3 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                    <th className="px-4 py-2.5 font-semibold">Guest</th>
                    <th className="px-4 py-2.5 font-semibold">Room</th>
                    <th className="px-4 py-2.5 font-semibold">Stay</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {d.recent.map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-sand/30">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="font-medium text-ink">{b.guestName}</span>
                        <span className="block text-[10.5px] text-faint">
                          {b.ref} · {b.source === "WEB" ? "Chat" : b.source === "WHATSAPP" ? "WhatsApp (earlier)" : "Desk"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{b.roomId}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                        {formatDate(b.checkIn)} – {formatDate(b.checkOut)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink">{formatINR(b.total)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={b.status.toLowerCase()} />
                      </td>
                    </tr>
                  ))}
                  {d.recent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-muted">
                        No bookings yet. They'll appear here as guests book in the chat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
