import Link from "next/link";
import { notFound } from "next/navigation";
import type { Room } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { bookingRef, extensionOptions, stayOf } from "@/lib/engine";
import { istDate, istTime } from "@/lib/dates";
import { addDays, formatDate, formatINR, formatTime, nights } from "@/lib/pricing";
import { phonePretty } from "@/lib/phone";
import { extendAction } from "@/app/admin/actions";
import { Icon } from "@/components/icons";
import { Field, Flash, inputCls, one } from "@/components/admin/field";
import { SubmitButton } from "@/components/admin/submit-button";

export const metadata = { title: "Extend / move" };

const card = "rounded-[1.5rem] border border-hairline bg-paper p-5";

/** Extend a stay, or move it to another room, for guests the chat can't do it for (entered by the owner). */
export default async function ExtendPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const stay = await stayOf(id);
  if (!stay) notFound();

  const { root, end } = stay;
  const endDate = istDate(end.checkOutAt);
  const to = one(sp.to) ?? "";
  const opts = to ? await extensionOptions(root.id, to) : null;
  const parts = [root, ...stay.segments.filter((s) => s.status === "CONFIRMED")];
  const n = nights(endDate, to);
  const choices: { room: Room; label: string }[] = opts?.ok
    ? [
        ...(opts.value.sameRoomFree ? [{ room: end.room, label: `Extend in Room ${end.roomId}` }] : []),
        ...opts.value.freeRooms.map((r) => ({ room: r, label: `Move to Room ${r.id}` })),
      ]
    : [];

  return (
    <div className="max-w-2xl">
      <Link href="/admin/bookings" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Icon.arrowLeft width={14} height={14} /> Bookings
      </Link>
      <h1 className="font-display mt-3 text-3xl text-ink">Extend / move</h1>

      <section className={`mt-5 ${card}`}>
        <p className="text-ink">
          {root.guestName} <span className="text-[12px] text-faint">· {bookingRef(root)}</span>
        </p>
        <a href={`tel:+${root.guestPhone}`} className="text-[12.5px] text-muted hover:text-clay">
          {phonePretty(root.guestPhone)}
        </a>
        <ul className="mt-3 space-y-1 text-[13px] text-muted">
          {parts.map((p) => (
            <li key={p.id}>
              Room {p.roomId} · {formatDate(istDate(p.checkInAt))} → {formatDate(istDate(p.checkOutAt))}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-ink">
          Checks out <span className="font-medium">{formatDate(endDate)}, {formatTime(istTime(end.checkOutAt))}</span> from Room{" "}
          {end.roomId}
        </p>
      </section>

      <Flash err={one(sp.err)} />

      {stay.pending ? (
        <Flash
          err={`An extension (${bookingRef(stay.pending)}) is waiting for payment. Confirm or cancel it on the Bookings page first.`}
        />
      ) : (
        <form method="get" className={`mt-5 flex flex-wrap items-end gap-3 ${card}`}>
          <div className="min-w-0 flex-1">
            <Field label="New check-out">
              <input type="date" name="to" required min={addDays(endDate, 1)} defaultValue={to || addDays(endDate, 1)} className={inputCls()} />
            </Field>
          </div>
          <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-cream">
            Check rooms
          </button>
        </form>
      )}

      {opts && !opts.ok && <Flash err={opts.message} />}

      {opts?.ok && !stay.pending && (
        <section className="mt-5 space-y-3">
          {!opts.value.sameRoomFree && (
            <p className="text-[13px] text-muted">
              Room {end.roomId} isn&apos;t free after {formatDate(endDate)}.{" "}
              {choices.length > 0 ? `Move ${root.guestName} to a free room on ${formatDate(endDate)}:` : ""}
            </p>
          )}
          {choices.length === 0 && (
            <p className="text-[13px] text-muted">No room for {root.guests} is free until {formatDate(to)}. Try an earlier date.</p>
          )}
          {choices.map(({ room, label }) => {
            const total = room.pricePerNight * n;
            return (
              <div key={room.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-ink">
                    Room {room.id} <span className="text-[12.5px] text-muted">· {room.name}</span>
                  </p>
                  <p className="font-display text-lg text-ink">{formatINR(total)}</p>
                </div>
                <p className="text-[12px] text-faint">
                  {formatINR(room.pricePerNight)} × {n} night{n === 1 ? "" : "s"} · until {formatDate(to)}
                </p>
                <form action={extendAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={root.id} />
                  <input type="hidden" name="roomId" value={room.id} />
                  <input type="hidden" name="newCheckOut" value={to} />
                  <input type="hidden" name="path" value={`/admin/bookings/${root.id}/extend`} />
                  <input type="hidden" name="back" value={new URLSearchParams({ to }).toString()} />
                  <div className="min-w-0 flex-1">
                    <Field label="Received now (₹)">
                      <input name="amount" inputMode="numeric" pattern="[0-9]*" defaultValue={total} className={inputCls()} />
                    </Field>
                  </div>
                  <SubmitButton
                    pendingText="Saving…"
                    className="rounded-full bg-clay px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-clay-dark"
                  >
                    {label}
                  </SubmitButton>
                </form>
                <p className="mt-2 text-[11.5px] text-faint">0 if they&apos;ll pay later — the rest shows as due.</p>
              </div>
            );
          })}
          {root.chatKey && <p className="text-[12px] text-faint">The guest is told in their website chat.</p>}
        </section>
      )}
    </div>
  );
}
