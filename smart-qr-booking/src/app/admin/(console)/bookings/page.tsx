import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listBookings } from "@/lib/admin-data";
import { istTime } from "@/lib/dates";
import { formatDate, formatINR, formatTime } from "@/lib/pricing";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";
import { BookingActions } from "@/components/admin/booking-actions";
import { siteSettings } from "@/lib/site-settings";
import { Flash, one } from "@/components/admin/field";
import { phonePretty } from "@/lib/phone";

export const metadata = { title: "Bookings" };

const WHEN = [
  { id: "upcoming", label: "Upcoming & in house" },
  { id: "past", label: "Past" },
  { id: "all", label: "All" },
];
const STATUS = ["all", "pending", "confirmed", "cancelled"];
const SOURCE = [
  { id: "all", label: "All sources" },
  { id: "web", label: "Website chat" },
  { id: "admin", label: "Desk / phone" },
];
const select =
  "rounded-full border border-hairline bg-paper px-3 py-1.5 text-[12px] text-ink outline-none focus:border-clay";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await siteSettings();
  const f = {
    when: one(sp.when) ?? "upcoming",
    status: one(sp.status) ?? "all",
    source: one(sp.source) ?? "all",
    q: one(sp.q) ?? "",
  };
  const rows = await listBookings(f);
  const back = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== "all")).toString();
  const active = rows.filter((b) => b.status !== "CANCELLED");
  const due = active.reduce((s, b) => s + (b.total - b.advancePaid), 0);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Bookings</h1>
          <p className="mt-1 text-[13px] text-muted">
            {rows.length} shown · {formatINR(active.reduce((s, b) => s + b.total, 0))} booked · {formatINR(due)} still to collect
          </p>
        </div>
        <Link
          href="/admin/bookings/new"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-cream transition-transform hover:scale-[1.02]"
        >
          <Icon.calendar width={15} height={15} />
          New booking
        </Link>
      </header>

      <Flash msg={one(sp.msg)} err={one(sp.err)} />

      <form method="get" className="mt-6 flex flex-col gap-3 border-y border-hairline py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select name="when" defaultValue={f.when} className={select} aria-label="When">
            {WHEN.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
          <select name="status" defaultValue={f.status} className={`${select} capitalize`} aria-label="Status">
            {STATUS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "Any status" : s}</option>
            ))}
          </select>
          <select name="source" defaultValue={f.source} className={select} aria-label="Source">
            {SOURCE.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-paper px-3 py-1.5 focus-within:border-clay">
            <Icon.sliders width={14} height={14} className="shrink-0 text-faint" />
            <span className="sr-only">Search</span>
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Name, phone, room or HTL- ref"
              className="w-full min-w-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint sm:w-56"
            />
          </label>
          <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-cream">
            Apply
          </button>
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Booking</th>
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">Room</th>
                <th className="px-4 py-3 font-semibold">Stay</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((b) => (
                <tr key={b.id} className="align-top transition-colors hover:bg-sand/30">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-medium text-ink">{b.ref}</span>
                    <span className="block text-[10.5px] text-faint">
                      {b.source === "WEB" ? "Website chat" : b.source === "WHATSAPP" ? "WhatsApp (earlier)" : "Desk / phone"}
                      {b.parent && (b.parent.roomId !== b.roomId ? ` · move from ${b.parent.roomId}` : " · extension")}
                      {b.parent && <span className="block">of {b.parent.ref}</span>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="text-ink">{b.guestName}</span>
                    <a
                      href={`tel:+${b.guestPhone}`}
                      className="block text-[10.5px] text-faint hover:text-clay"
                    >
                      {phonePretty(b.guestPhone)}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {b.roomId}
                    <span className="block text-[10.5px] text-faint">{b.roomName}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDate(b.checkIn)}, {formatTime(b.checkInTime)}
                    <span className="block">
                      → {formatDate(b.checkOut)}, {formatTime(b.checkOutTime)}
                    </span>
                    <span className="block text-[10.5px] text-faint">
                      {b.nights} night{b.nights === 1 ? "" : "s"} · {b.guests} guest{b.guests === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className="text-ink">{formatINR(b.total)}</span>
                    {b.status !== "CANCELLED" && (
                      <span className="block text-[10.5px] text-sage">
                        Paid {formatINR(b.advancePaid)} · Due {formatINR(b.total - b.advancePaid)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={b.status.toLowerCase()} label={b.status === "PENDING" ? "Awaiting advance" : undefined} />
                    {b.status === "PENDING" && b.holdExpiresAt && (
                      <span className="mt-1 block text-[10.5px] text-faint">
                        held until {formatTime(istTime(new Date(b.holdExpiresAt)))}
                      </span>
                    )}
                    {b.openPayment?.status === "CLAIMED" && (
                      <span className="mt-1 block text-[10.5px] font-medium text-sage">UTR {b.openPayment.utr} — to check</span>
                    )}
                    {b.openPayment?.status === "REJECTED" && (
                      <span className="mt-1 block text-[10.5px] text-clay">payment not received</span>
                    )}
                    {b.status === "CANCELLED" && b.holdExpiresAt && (
                      <span className="mt-1 block text-[10.5px] text-faint">hold expired unpaid</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BookingActions booking={b} back={back} path="/admin/bookings" settings={s} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-muted">
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
