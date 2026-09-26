import { requireAdmin } from "@/lib/auth";
import { listPayments } from "@/lib/admin-data";
import { istDate, istTime } from "@/lib/dates";
import { formatDate, formatINR, formatTime } from "@/lib/pricing";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";
import { PaymentDecision } from "@/components/admin/booking-actions";
import { Flash, one } from "@/components/admin/field";
import { phonePretty } from "@/lib/phone";

export const metadata = { title: "Payments" };

const STATUS = [
  { id: "all", label: "Any state" },
  { id: "claimed", label: "To check (UTR sent)" },
  { id: "awaiting", label: "Waiting for payment" },
  { id: "acknowledged", label: "Received" },
  { id: "rejected", label: "Not received" },
  { id: "cancelled", label: "Cancelled" },
];
const KIND = [
  { id: "all", label: "All kinds" },
  { id: "advance", label: "Advance" },
  { id: "extension", label: "Extension" },
  { id: "balance", label: "Balance" },
];
const LABEL: Record<string, { tone: string; text: string }> = {
  AWAITING: { tone: "pending", text: "Waiting" },
  CLAIMED: { tone: "pending", text: "To check" },
  ACKNOWLEDGED: { tone: "confirmed", text: "Received" },
  REJECTED: { tone: "occupied", text: "Not received" },
  CANCELLED: { tone: "cancelled", text: "Cancelled" },
};
const select = "rounded-full border border-hairline bg-paper px-3 py-1.5 text-[12px] text-ink outline-none focus:border-clay";
const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatDate(istDate(d))}, ${formatTime(istTime(d))}`;
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const f = { status: one(sp.status) ?? "all", kind: one(sp.kind) ?? "all", q: one(sp.q) ?? "" };
  const rows = await listPayments(f);
  const back = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== "all")).toString();
  const received = rows.filter((p) => p.status === "ACKNOWLEDGED").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <header>
        <h1 className="font-display text-3xl text-ink">Payments</h1>
        <p className="mt-1 text-[13px] text-muted">
          {rows.length} shown · {formatINR(received)} received · {rows.filter((p) => p.status === "CLAIMED").length} to check
        </p>
      </header>

      <Flash msg={one(sp.msg)} err={one(sp.err)} />

      <form method="get" className="mt-6 flex flex-col gap-3 border-y border-hairline py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={f.status} className={select} aria-label="State">
            {STATUS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select name="kind" defaultValue={f.kind} className={select} aria-label="Kind">
            {KIND.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-paper px-3 py-1.5 focus-within:border-clay">
            <Icon.sliders width={14} height={14} className="shrink-0 text-faint" />
            <span className="sr-only">Search</span>
            <input name="q" defaultValue={f.q} placeholder="UTR, name, phone or HTL- ref" className="w-full min-w-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint sm:w-56" />
          </label>
          <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-cream">Apply</button>
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">For</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">UTR</th>
                <th className="px-4 py-3 font-semibold">State</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((p) => (
                <tr key={p.id} className="align-top transition-colors hover:bg-sand/30">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="text-ink">{p.booking.guestName}</span>
                    <a href={`tel:+${p.booking.guestPhone}`} className="block text-[10.5px] text-faint hover:text-clay">
                      {phonePretty(p.booking.guestPhone)}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {p.kind === "ADVANCE" ? "Advance" : p.kind === "EXTENSION" ? "Extension" : "Balance"} · Room {p.booking.roomId}
                    <span className="block text-[10.5px] text-faint">
                      {p.booking.ref} · {formatDate(p.booking.checkIn)} → {formatDate(p.booking.checkOut)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-ink">{formatINR(p.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-ink">
                    {p.utr ?? <span className="font-sans text-faint">—</span>}
                    {p.claimedAt && <span className="block font-sans text-[10.5px] text-faint">sent {when(p.claimedAt)}</span>}
                    {p.duplicateRef && (
                      <span className="block font-sans text-[10.5px] font-medium text-clay">⚠ also sent for {p.duplicateRef}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={LABEL[p.status]!.tone} label={LABEL[p.status]!.text} />
                    {p.acknowledgedAt && <span className="mt-1 block text-[10.5px] text-faint">{when(p.acknowledgedAt)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "CLAIMED" && (
                      <PaymentDecision paymentId={p.id} utr={p.utr} amount={p.amount} back={back} path="/admin/payments" />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-muted">No payments match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
