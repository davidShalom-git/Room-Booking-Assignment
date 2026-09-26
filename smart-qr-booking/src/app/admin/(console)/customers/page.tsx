import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/lib/admin-data";
import { istDate } from "@/lib/dates";
import { formatDate, formatINR } from "@/lib/pricing";
import { Icon } from "@/components/icons";
import { one } from "@/components/admin/field";
import { phonePretty } from "@/lib/bot/copy";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const rows = await listCustomers(q);

  return (
    <div>
      <header>
        <h1 className="font-display text-3xl text-ink">Customers</h1>
        <p className="mt-1 text-[13px] text-muted">
          Everyone who has booked, in the website chat or at the desk — one account per phone number.
        </p>
      </header>

      <form method="get" className="mt-6 flex items-center gap-2 border-y border-hairline py-4">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-paper px-3 py-1.5 focus-within:border-clay sm:max-w-sm">
          <Icon.sliders width={14} height={14} className="shrink-0 text-faint" />
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={q} placeholder="Name or phone" className="w-full min-w-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint" />
        </label>
        <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-cream">Search</button>
      </form>

      <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 text-center font-semibold">Stays</th>
                <th className="px-4 py-3 text-right font-semibold">Paid in total</th>
                <th className="px-4 py-3 font-semibold">Last stay</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-sand/30">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="text-ink">{c.name || "—"}</span>
                    <a href={`tel:+${c.phone}`} className="block text-[10.5px] text-faint hover:text-clay">
                      {phonePretty(c.phone)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center text-ink">{c.stays}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-ink">{formatINR(c.paid)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{c.lastStay ? formatDate(istDate(new Date(c.lastStay))) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/bookings?when=all&q=${c.phone}`} className="rounded-full border border-hairline px-2.5 py-1 text-[11.5px] text-ink hover:bg-ink/[0.04]">
                      Bookings
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-muted">No customers yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
