"use client";

import { useActionState, useState } from "react";
import { createWalkInAction, type FormState } from "@/app/admin/actions";
import { addDays, formatDate, formatINR, nights } from "@/lib/pricing";
import { Field, inputCls } from "./field";
import { SubmitButton } from "./submit-button";

type RoomOption = { id: string; name: string; pricePerNight: number; capacity: number };

export function WalkInForm({ rooms, today }: { rooms: RoomOption[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(createWalkInAction, { n: 0 });
  const v = state.values ?? {};
  const [roomId, setRoomId] = useState(v.roomId ?? rooms[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState(v.checkIn ?? today);
  const [checkOut, setCheckOut] = useState(v.checkOut ?? addDays(today, 1));
  const room = rooms.find((r) => r.id === roomId);
  const n = nights(checkIn, checkOut);
  const total = room && n > 0 ? room.pricePerNight * n : 0;
  const bad = (f: string) => state.field === f;

  if (rooms.length === 0) {
    return <p className="mt-6 text-[14px] text-muted">Add a room first (Rooms → Add room).</p>;
  }

  return (
    <form key={state.n} action={action} className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6">
        {state.error && (
          <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
            {state.error}
          </p>
        )}

        <Field label="Room" error={bad("roomId")}>
          <select name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inputCls(bad("roomId"))}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.id} · {r.name} · {formatINR(r.pricePerNight)} · sleeps {r.capacity}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guest name" error={bad("guestName")}>
            <input name="guestName" defaultValue={v.guestName} required autoComplete="off" className={inputCls(bad("guestName"))} />
          </Field>
          <Field label="Phone" error={bad("guestPhone")} hint="With country code. 10-digit Indian numbers get +91.">
            <input
              name="guestPhone"
              type="tel"
              defaultValue={v.guestPhone}
              placeholder="+91 98450 21133"
              required
              className={inputCls(bad("guestPhone"))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Guests" error={bad("guests")}>
            <input
              name="guests"
              type="number"
              min={1}
              max={room?.capacity}
              defaultValue={v.guests ?? String(Math.min(2, room?.capacity ?? 2))}
              required
              className={inputCls(bad("guests"))}
            />
          </Field>
          <Field label="Check-in" error={bad("checkIn")}>
            <input
              name="checkIn"
              type="date"
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (nights(e.target.value, checkOut) <= 0) setCheckOut(addDays(e.target.value, 1));
              }}
              required
              className={inputCls(bad("checkIn"))}
            />
          </Field>
          <Field label="Check-out" error={bad("checkOut")}>
            <input
              name="checkOut"
              type="date"
              value={checkOut}
              min={addDays(checkIn, 1)}
              onChange={(e) => setCheckOut(e.target.value)}
              required
              className={inputCls(bad("checkOut"))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Check-in time" error={bad("checkInTime")}>
            <input name="checkInTime" type="time" defaultValue={v.checkInTime ?? "13:00"} required className={inputCls(bad("checkInTime"))} />
          </Field>
          <Field label="Check-out time" error={bad("checkOutTime")}>
            <input name="checkOutTime" type="time" defaultValue={v.checkOutTime ?? "11:00"} required className={inputCls(bad("checkOutTime"))} />
          </Field>
          <Field label="Advance paid (₹)" error={bad("advancePaid")}>
            <input
              name="advancePaid"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={v.advancePaid ?? "0"}
              className={inputCls(bad("advancePaid"))}
            />
          </Field>
        </div>
      </div>

      <aside className="h-max rounded-[1.5rem] border border-hairline bg-paper p-1.5 lg:sticky lg:top-6">
        <div className="rounded-[1.15rem] bg-sand/40 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Summary</p>
          <p className="font-display mt-2 text-xl text-ink">{room ? `Room ${room.id}` : "—"}</p>
          <p className="text-[12.5px] text-muted">{room?.name}</p>
          <dl className="mt-4 space-y-1.5 text-[13px]">
            <div className="flex justify-between text-muted">
              <dt>Dates</dt>
              <dd>{n > 0 ? `${formatDate(checkIn)} → ${formatDate(checkOut)}` : "—"}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Nights</dt>
              <dd>{n > 0 ? n : "—"}</dd>
            </div>
            <div className="flex justify-between border-t border-hairline pt-2 text-ink">
              <dt className="font-medium">Total</dt>
              <dd className="font-display text-lg">{formatINR(total)}</dd>
            </div>
          </dl>
          <SubmitButton
            pendingText="Booking…"
            className="mt-5 w-full rounded-full bg-clay py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-clay-dark"
          >
            Confirm booking
          </SubmitButton>
          <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
            Confirmed immediately. The room is checked against every other booking — a clash is shown here, never saved.
          </p>
        </div>
      </aside>
    </form>
  );
}
