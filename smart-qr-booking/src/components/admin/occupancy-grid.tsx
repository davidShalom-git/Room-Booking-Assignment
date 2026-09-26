import type { DashboardData } from "@/lib/admin-data";
import { formatDate } from "@/lib/pricing";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

/** Rooms × nights. A night belongs to the date it starts on (check-in day counts, check-out day doesn't). */
export function OccupancyGrid({ grid }: { grid: DashboardData["grid"] }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-hairline bg-paper">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-paper px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                Room
              </th>
              {grid.days.map((d, i) => (
                <th key={d} className={`px-0.5 py-2 text-center font-medium ${i === 0 ? "text-clay" : "text-faint"}`}>
                  <span className="block text-[10px] uppercase tracking-wide">{weekday(d)}</span>
                  <span className={`block text-[12px] ${i === 0 ? "text-clay" : "text-ink"}`}>{Number(d.slice(8))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="sticky left-0 z-10 border-t border-hairline bg-paper px-4 py-1.5 text-left font-medium text-ink">
                  {r.id}
                  <span className="block max-w-[9rem] truncate text-[10px] font-normal text-faint">{r.name}</span>
                </th>
                {r.cells.map((c, i) => {
                  const prev = r.cells[i - 1];
                  const next = r.cells[i + 1];
                  const joinL = c.bookingId && prev?.bookingId === c.bookingId;
                  const joinR = c.bookingId && next?.bookingId === c.bookingId;
                  const tone =
                    c.status === "CONFIRMED" ? "bg-clay/80" : c.status === "PENDING" ? "bg-gold/55" : "bg-sand/70";
                  const title = c.bookingId
                    ? `${formatDate(c.day)} · ${c.guestName} · ${c.ref}${c.status === "PENDING" ? " (awaiting advance)" : ""}`
                    : `${formatDate(c.day)} · free`;
                  return (
                    <td key={c.day} className="border-t border-hairline px-0 py-1.5">
                      <div
                        title={title}
                        aria-label={title}
                        className={`h-6 ${tone} ${joinL ? "rounded-l-none" : "ml-0.5 rounded-l-md"} ${joinR ? "rounded-r-none" : "mr-0.5 rounded-r-md"}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {grid.rows.length === 0 && (
              <tr>
                <td colSpan={grid.days.length + 1} className="px-4 py-10 text-center text-[13px] text-muted">
                  No rooms yet — add one on the Rooms page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-hairline px-4 py-2.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-clay/80" /> Booked</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-gold/55" /> Awaiting advance</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-sand/70" /> Free</span>
      </div>
    </div>
  );
}
