import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { ownerToday } from "@/lib/owner-app";
import { formatDate, formatINR } from "@/lib/pricing";
import { StatCard } from "@/components/stat-card";
import { PaymentDecision } from "@/components/admin/booking-actions";
import { OwnerAlerts } from "@/components/admin/owner-alerts";
import { Flash, one } from "@/components/admin/field";
import { phonePretty } from "@/lib/bot/copy";

export const metadata = { title: "Today" };

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{children}</h2>
);

/** The owner app's home screen: the day in numbers, and what needs the owner now. */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const t = await ownerToday();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Today</h1>
          <p className="mt-1 text-[13px] text-muted">{formatDate(t.date)}</p>
        </div>
        <Link href="/admin/today" className="rounded-full border border-hairline px-3 py-1.5 text-[12px] text-muted hover:text-ink">
          Refresh
        </Link>
      </header>

      <Flash msg={one(sp.msg)} err={one(sp.err)} />

      <div className="mt-5">
        <OwnerAlerts vapidKey={env.vapidPublicKey} />
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Free tonight" value={`${t.rooms.freeTonight}/${t.rooms.total}`} icon="bed" tone="sage" hint="rooms" />
        <StatCard label="New bookings" value={t.bookingsToday} icon="calendar" hint="made today" />
        <StatCard
          label="Received"
          value={formatINR(t.receivedToday.amount)}
          icon="checkCircle"
          tone="sage"
          hint={`${t.receivedToday.count} payment${t.receivedToday.count === 1 ? "" : "s"} today`}
        />
        <StatCard label="To check" value={t.toCheck.length} icon="bell" tone={t.toCheck.length ? "gold" : "ink"} hint="payments waiting for you" />
        <StatCard label="Awaiting payment" value={t.waitingForPayment} icon="calendar" hint="rooms on hold" />
        <StatCard label="Not received" value={t.notReceived} icon="x" tone={t.notReceived ? "clay" : "ink"} hint="guest asked to re-check" />
        <StatCard label="Arriving" value={t.arrivals} icon="arrowRight" hint="checking in today" />
        <StatCard label="Leaving" value={t.departures} icon="arrowLeft" hint="checking out today" />
      </section>

      {t.toCheck.length > 0 && (
        <section className="mt-8">
          <H2>Waiting for you — match the UTR in your UPI app, then acknowledge</H2>
          <ul className="mt-3 space-y-2">
            {t.toCheck.map((p) => (
              <li key={p.id} className="rounded-2xl border border-sage/30 bg-sage-soft/60 p-4">
                <p className="text-[14px] font-medium text-ink">
                  {formatINR(p.amount)} {p.kind === "EXTENSION" ? "extension" : "advance"} · {p.booking.guestName}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Room {p.booking.roomId} · {formatDate(p.booking.checkIn)} → {formatDate(p.booking.checkOut)} · {p.booking.ref}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  UTR <span className="font-mono text-ink">{p.utr}</span> ·{" "}
                  <a href={`tel:+${p.booking.guestPhone}`} className="text-clay">
                    {phonePretty(p.booking.guestPhone)}
                  </a>
                </p>
                {p.duplicateRef && (
                  <p className="mt-1 text-[12.5px] font-medium text-clay">
                    ⚠ This UTR was also sent for {p.duplicateRef} — make sure it&apos;s a separate payment.
                  </p>
                )}
                <div className="mt-3">
                  <PaymentDecision paymentId={p.id} utr={p.utr} amount={p.amount} path="/admin/today" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-[1.5rem] border border-hairline bg-paper p-1.5">
        <div className="rounded-[1.15rem] bg-sand/30 p-5">
          <H2>This month</H2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
            <div>
              <dt className="text-muted">Bookings</dt>
              <dd className="font-display text-2xl text-ink">{t.month.bookings}</dd>
            </div>
            <div>
              <dt className="text-muted">Collected</dt>
              <dd className="font-display text-2xl text-ink">{formatINR(t.month.collected)}</dd>
            </div>
            <div>
              <dt className="text-muted">Due at check-in</dt>
              <dd className="font-display text-2xl text-ink">{formatINR(t.dueAtCheckIn)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <nav className="mt-6 flex flex-wrap gap-2 pb-6 text-[13px]">
        {[
          ["/admin/bookings", "All bookings"],
          ["/admin/payments", "All payments"],
          ["/admin", "Room calendar"],
        ].map(([href, label]) => (
          <Link key={href} href={href!} className="rounded-full border border-hairline px-4 py-2 text-muted hover:text-ink">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
