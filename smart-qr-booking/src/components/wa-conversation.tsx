"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  reduce,
  initialState,
  type SimState,
  type Msg,
  type Action,
} from "@/lib/wa-sim";
import { getRoom } from "@/lib/data";
import { saveBooking, updateBooking } from "@/lib/bookings-store";
import { config } from "@/config";
import { todayISO, addDays, nights } from "@/lib/pricing";
import { Icon } from "@/components/icons";

/* ---------- tiny *bold* renderer ---------- */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span className="whitespace-pre-line">
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <strong key={i} className="font-semibold">
            {p.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

/* ---------- inline date/time cards ---------- */
function BookDatesCard({
  done,
  maxGuests,
  onSubmit,
}: {
  done: boolean;
  maxGuests: number;
  onSubmit: (v: {
    checkIn: string;
    checkInTime: string;
    checkOut: string;
    checkOutTime: string;
    guests: number;
  }) => void;
}) {
  const [ci, setCi] = useState(addDays(todayISO(), 1));
  const [cit, setCit] = useState("13:00");
  const [co, setCo] = useState(addDays(todayISO(), 3));
  const [cot, setCot] = useState("11:00");
  const [g, setG] = useState(Math.min(2, maxGuests));
  const n = nights(ci, co);
  return (
    <div className="mt-1 w-full rounded-lg bg-white/70 p-2.5 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-[#667781]">Check-in</span>
          <input type="date" value={ci} min={todayISO()} disabled={done}
            onChange={(e) => { setCi(e.target.value); if (nights(e.target.value, co) <= 0) setCo(addDays(e.target.value, 2)); }}
            className="w-full min-w-0 rounded-md border border-[#d1d7db] px-1.5 py-1 outline-none" />
          <input type="time" value={cit} disabled={done} onChange={(e) => setCit(e.target.value)}
            className="w-full min-w-0 rounded-md border border-[#d1d7db] px-1.5 py-1 outline-none" />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-[#667781]">Check-out</span>
          <input type="date" value={co} min={addDays(ci, 1)} disabled={done}
            onChange={(e) => setCo(e.target.value)}
            className="w-full min-w-0 rounded-md border border-[#d1d7db] px-1.5 py-1 outline-none" />
          <input type="time" value={cot} disabled={done} onChange={(e) => setCot(e.target.value)}
            className="w-full min-w-0 rounded-md border border-[#d1d7db] px-1.5 py-1 outline-none" />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-[#667781]">Guests</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={done || g <= 1} onClick={() => setG((x) => x - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d1d7db] disabled:opacity-40">–</button>
          <span className="w-3 text-center font-medium">{g}</span>
          <button type="button" disabled={done || g >= maxGuests} onClick={() => setG((x) => x + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d1d7db] disabled:opacity-40">+</button>
        </div>
      </div>
      <button type="button" disabled={done || n <= 0}
        onClick={() => onSubmit({ checkIn: ci, checkInTime: cit, checkOut: co, checkOutTime: cot, guests: g })}
        className="mt-2.5 w-full rounded-full bg-[#075e54] py-1.5 text-[12px] font-medium text-white disabled:opacity-40">
        {done ? "Sent ✓" : n > 0 ? `Continue · ${n} night${n > 1 ? "s" : ""}` : "Pick valid dates"}
      </button>
    </div>
  );
}

function ExtendDatesCard({
  done,
  minDate,
  onSubmit,
}: {
  done: boolean;
  minDate: string;
  onSubmit: (v: { checkOut: string; checkOutTime: string }) => void;
}) {
  const [co, setCo] = useState(addDays(minDate, 2));
  const [cot, setCot] = useState("11:00");
  return (
    <div className="mt-1 w-full rounded-lg bg-white/70 p-2.5 text-[12px]">
      <span className="text-[10px] uppercase tracking-wide text-[#667781]">New check-out</span>
      <div className="mt-0.5 flex gap-2">
        <input type="date" value={co} min={addDays(minDate, 1)} disabled={done}
          onChange={(e) => setCo(e.target.value)}
          className="w-0 min-w-0 flex-1 rounded-md border border-[#d1d7db] px-1.5 py-1 outline-none" />
        <input type="time" value={cot} disabled={done} onChange={(e) => setCot(e.target.value)}
          className="w-0 min-w-0 flex-1 rounded-md border border-[#d1d7db] px-1.5 py-1 outline-none" />
      </div>
      <button type="button" disabled={done}
        onClick={() => onSubmit({ checkOut: co, checkOutTime: cot })}
        className="mt-2.5 w-full rounded-full bg-[#075e54] py-1.5 text-[12px] font-medium text-white disabled:opacity-40">
        {done ? "Sent ✓" : "Request extension"}
      </button>
    </div>
  );
}

/* ---------- one phone ---------- */
function Phone({
  title,
  subtitle,
  accent,
  messages,
  typing,
  submittedCards,
  maxGuests,
  extendMin,
  onChip,
  onAction,
  onBookDates,
  onExtendDates,
  onSend,
  composer,
}: {
  title: string;
  subtitle: string;
  accent: string;
  messages: Msg[];
  typing: boolean;
  submittedCards: Set<number>;
  maxGuests: number;
  extendMin: string;
  onChip: (t: string) => void;
  onAction: (a: Action) => void;
  onBookDates: (id: number, v: Parameters<Parameters<typeof BookDatesCard>[0]["onSubmit"]>[0]) => void;
  onExtendDates: (id: number, v: { checkOut: string; checkOutTime: string }) => void;
  onSend: (t: string) => void;
  composer: "input" | "readonly";
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  // only the latest message keeps its tappable chips / action buttons
  const lastId = messages.length ? messages[messages.length - 1].id : -1;

  return (
    <div className="w-full min-w-0 max-w-[380px] rounded-[2.4rem] border border-hairline bg-[#1c1712] p-2.5 shadow-[var(--shadow-lift)]">
      <div className="min-w-0 overflow-hidden rounded-[2rem] bg-[#e7ded3]">
        <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: accent }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 font-display text-sm">
            {title[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight">{title}</p>
            <p className="text-[10.5px] text-white/75">{typing ? "typing…" : subtitle}</p>
          </div>
        </div>

        <div ref={scroll} className="thin-scroll h-[56vh] min-h-[400px] space-y-1.5 overflow-y-auto px-3 py-3.5"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(60,45,30,0.05) 1px, transparent 0)", backgroundSize: "18px 18px" }}>
          {messages.map((m) =>
            m.from === "system" ? (
              <p key={m.id} className="mx-auto my-1 w-max max-w-[92%] rounded-lg bg-[#fcf4cd] px-2.5 py-1 text-center text-[10.5px] leading-snug text-[#5b5744] shadow-sm">
                {m.text}
              </p>
            ) : (
              <div key={m.id} className={`flex flex-col ${m.from === "me" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-[1.42] shadow-sm ${
                  m.from === "me" ? "rounded-br-none bg-[#d9fdd3] text-[#111b21]" : "rounded-bl-none bg-white text-[#111b21]"
                }`}>
                  {m.text ? <RichText text={m.text} /> : null}
                  <span className="ml-2 inline-block translate-y-0.5 text-[9.5px] text-[#667781]">{m.ts}</span>
                </div>

                {m.card === "book-dates" && (
                  <BookDatesCard done={submittedCards.has(m.id)} maxGuests={maxGuests}
                    onSubmit={(v) => onBookDates(m.id, v)} />
                )}
                {m.card === "extend-dates" && (
                  <ExtendDatesCard done={submittedCards.has(m.id)} minDate={extendMin}
                    onSubmit={(v) => onExtendDates(m.id, v)} />
                )}

                {m.chips && m.chips.length > 0 && m.id === lastId && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {m.chips.map((c) => (
                      <button key={c} onClick={() => onChip(c)}
                        className="rounded-full border border-[#075e54]/25 bg-white px-2.5 py-1 text-[11px] text-[#075e54]">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {m.actions && m.actions.length > 0 && m.id === lastId && (
                  <div className="mt-1 flex w-full max-w-[85%] flex-col gap-1">
                    {m.actions.map((a) => (
                      <button key={a.event} onClick={() => onAction(a)}
                        className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                          a.kind === "primary"
                            ? "bg-[#075e54] text-white"
                            : a.kind === "danger"
                              ? "border border-[#c0392b]/40 bg-white text-[#c0392b]"
                              : "border border-[#075e54]/25 bg-white text-[#075e54]"
                        }`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {typing && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-lg rounded-bl-none bg-white px-3 py-2 shadow-sm">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#9aa5ab]" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#9aa5ab]" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#9aa5ab]" />
              </div>
            </div>
          )}
        </div>

        {composer === "input" ? (
          <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onSend(draft); setDraft(""); } }}
            className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message"
              className="flex-1 rounded-full bg-white px-3.5 py-2 text-[12.5px] outline-none placeholder:text-[#8696a0]" />
            <button type="submit" aria-label="Send"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#075e54] text-white active:scale-95">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><path d="M3 3l18 9-18 9 4-9-4-9Z" /></svg>
            </button>
          </form>
        ) : (
          <div className="bg-[#f0f2f5] px-3 py-3 text-center text-[11px] text-[#8696a0]">
            Front desk replies with the buttons above
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- the two-sided conversation ---------- */
export function WaConversation({ roomId = "101" }: { roomId?: string }) {
  const [state, dispatch] = useReducer(reduce, roomId, (r) => initialState(r));
  const room = getRoom(state.roomId)!;

  const [gShown, setGShown] = useState(state.guestThread.length);
  const [oShown, setOShown] = useState(state.ownerThread.length);
  const [gTyping, setGTyping] = useState(false);
  const [oTyping, setOTyping] = useState(false);
  const [submitted, setSubmitted] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"guest" | "owner">("guest");
  const [ownerUnseen, setOwnerUnseen] = useState(0);

  // mirror the confirmed booking into the shared admin store, keep it in
  // sync as the guest extends / moves rooms
  const savedRef = useRef<{ id: string; checkOut: string; total: number } | null>(null);
  useEffect(() => {
    const b = state.booking;
    if (!b) {
      savedRef.current = null;
      return;
    }
    if (!savedRef.current || savedRef.current.id !== b.id) {
      saveBooking(
        {
          guestName: b.guestName,
          guestPhone: b.guestPhone,
          roomId: b.moveRoomId ?? b.roomId,
          roomName: b.moveRoomId ? (getRoom(b.moveRoomId)?.name ?? b.roomName) : b.roomName,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          guests: b.guests,
          nights: b.nights,
          ratePerNight: room.pricePerNight,
          total: b.total,
          source: "whatsapp",
          advancePaid: b.advance,
          balanceDue: b.balanceDue,
        },
        b.id,
      );
      savedRef.current = { id: b.id, checkOut: b.checkOut, total: b.total };
      return;
    }
    if (savedRef.current.checkOut !== b.checkOut || savedRef.current.total !== b.total) {
      updateBooking(b.id, {
        checkOut: b.checkOut,
        nights: b.nights,
        total: b.total,
        balanceDue: b.balanceDue,
        roomId: b.moveRoomId ?? b.roomId,
        roomName: b.moveRoomId ? (getRoom(b.moveRoomId)?.name ?? b.roomName) : b.roomName,
      });
      savedRef.current = { id: b.id, checkOut: b.checkOut, total: b.total };
    }
  }, [state.booking, room.pricePerNight]);

  // reveal loop — own messages instantly, incoming after a typing beat
  useEffect(() => {
    const full = state.guestThread.length;
    if (gShown >= full) return;
    let i = gShown;
    while (i < full && state.guestThread[i].from === "me") i++;
    if (i > gShown) { setGShown(i); return; }
    setGTyping(true);
    const t = setTimeout(() => { setGShown(full); setGTyping(false); }, 620);
    return () => clearTimeout(t);
  }, [state.guestThread, gShown]);

  useEffect(() => {
    const full = state.ownerThread.length;
    if (oShown >= full) return;
    let i = oShown;
    while (i < full && state.ownerThread[i].from === "me") i++;
    if (i > oShown) { setOShown(i); return; }
    setOTyping(true);
    const t = setTimeout(() => {
      setOShown(full);
      setOTyping(false);
      if (tab !== "owner") setOwnerUnseen((n) => n + (full - i));
    }, 620);
    return () => clearTimeout(t);
  }, [state.ownerThread, oShown, tab]);

  useEffect(() => {
    if (tab === "owner") setOwnerUnseen(0);
  }, [tab, oShown]);

  const markCard = (id: number) => setSubmitted((s) => new Set(s).add(id));

  const gMsgs = state.guestThread.slice(0, gShown);
  const oMsgs = state.ownerThread.slice(0, oShown);
  const extendMin = state.booking?.checkOut ?? todayISO();

  const guestPhone = (
    <Phone
      title={config.property.name}
      subtitle="online"
      accent="#075e54"
      messages={gMsgs}
      typing={gTyping}
      submittedCards={submitted}
      maxGuests={room.capacity}
      extendMin={extendMin}
      composer="input"
      onSend={(t) => dispatch({ type: "guest_text", text: t })}
      onChip={(t) => dispatch({ type: "guest_text", text: t })}
      onAction={(a) => dispatch({ type: "action", id: a.event })}
      onBookDates={(id, v) => { markCard(id); dispatch({ type: "book_dates", ...v }); }}
      onExtendDates={(id, v) => { markCard(id); dispatch({ type: "extend_dates", ...v }); }}
    />
  );

  const ownerPhone = (
    <Phone
      title="Front desk"
      subtitle={`${config.property.name} · booking alerts`}
      accent="#1f3a34"
      messages={oMsgs}
      typing={oTyping}
      submittedCards={submitted}
      maxGuests={room.capacity}
      extendMin={extendMin}
      composer="readonly"
      onSend={() => {}}
      onChip={() => {}}
      onAction={(a) => dispatch({ type: "action", id: a.event })}
      onBookDates={() => {}}
      onExtendDates={() => {}}
    />
  );

  return (
    <div>
      {/* director bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-paper px-3 py-2.5 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em] text-faint">
          <Icon.sliders width={13} height={13} /> Demo controls
        </span>
        <button onClick={() => dispatch({ type: "director", cmd: "prefill" })}
          className="rounded-full border border-hairline px-2.5 py-1 text-ink hover:bg-ink/[0.04]">
          Pre-fill guest details
        </button>
        <button onClick={() => dispatch({ type: "director", cmd: "lastday" })}
          className="rounded-full border border-hairline px-2.5 py-1 text-ink hover:bg-ink/[0.04]">
          Send last-day reminder
        </button>
        <button onClick={() => dispatch({ type: "director", cmd: "toggle_conflict" })}
          className="rounded-full border border-hairline px-2.5 py-1 text-ink hover:bg-ink/[0.04]">
          Follow-on booking: {state.followOn ? "on" : "off"}
        </button>
        <button onClick={() => { dispatch({ type: "director", cmd: "reset" }); setGShown(2); setOShown(1); setSubmitted(new Set()); setOwnerUnseen(0); }}
          className="ml-auto rounded-full bg-ink px-2.5 py-1 font-medium text-cream">
          Reset
        </button>
      </div>

      {/* mobile: tabbed single phone */}
      <div className="lg:hidden">
        <div className="mb-3 flex gap-1 rounded-full border border-hairline bg-paper p-1 text-[12px]">
          {(["guest", "owner"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`relative flex-1 rounded-full px-3 py-1.5 font-medium capitalize transition-colors ${
                tab === k ? "bg-ink text-cream" : "text-muted"
              }`}>
              {k === "guest" ? "Guest phone" : "Front desk"}
              {k === "owner" && ownerUnseen > 0 && (
                <span className="absolute -right-0 -top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[9px] text-white">
                  {ownerUnseen}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex justify-center">{tab === "guest" ? guestPhone : ownerPhone}</div>
      </div>

      {/* desktop: both phones */}
      <div className="hidden gap-6 lg:flex lg:justify-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Guest's WhatsApp</span>
          {guestPhone}
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Property's WhatsApp</span>
          {ownerPhone}
        </div>
      </div>
    </div>
  );
}
