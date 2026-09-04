"use client";

import { useEffect, useRef, useState } from "react";
import {
  handleText,
  handleDateCard,
  initialContext,
  type BotContext,
  type BotOut,
} from "@/lib/bot";
import { saveBooking } from "@/lib/bookings-store";
import { config } from "@/config";
import { formatDate, todayISO, addDays, nights } from "@/lib/pricing";
import { Icon } from "@/components/icons";

type Msg = {
  id: number;
  from: "me" | "bot" | "system";
  text?: string;
  card?: "dates";
  time: string;
};

const now = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

let seq = 0;
const mk = (m: Omit<Msg, "id" | "time">): Msg => ({ id: ++seq, time: now(), ...m });

const START_CHIPS = ["Connect property dataset", "Is breakfast included?"];

export function WhatsappChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ctx, setCtx] = useState<BotContext>(initialContext());
  const [chips, setChips] = useState<string[]>(START_CHIPS);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs([
      mk({
        from: "system",
        text: `You're chatting with ${config.property.name} on WhatsApp — simulated for this demo.`,
      }),
    ]);
    const t = setTimeout(() => pushBot(handleText("hello", initialContext())), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  function pushBot(out: BotOut) {
    setTyping(true);
    window.setTimeout(() => {
      let saved: ReturnType<typeof saveBooking> | null = null;
      if (out.booking) saved = saveBooking(out.booking);

      setMsgs((prev) => [
        ...prev,
        ...out.messages.map((text) =>
          mk({ from: "bot", text: saved ? text.replace("HTL-…", saved.id) : text }),
        ),
        ...(out.showDateCard ? [mk({ from: "bot", card: "dates" as const })] : []),
        ...(saved
          ? [mk({ from: "system", text: `Saved to bookings · ${saved.id} · shows in the admin demo` })]
          : []),
      ]);
      setChips(out.chips ?? []);
      setCtx(out.context);
      setTyping(false);
    }, 650);
  }

  function send(raw: string) {
    const text = raw.trim();
    if (!text || typing) return;
    setInput("");
    setMsgs((prev) => [...prev, mk({ from: "me", text })]);

    if (!ctx.connected && /connect.*dataset|dataset|upload/i.test(text)) {
      window.setTimeout(() => {
        setMsgs((prev) => [
          ...prev,
          mk({ from: "system", text: "🔗 property-rooms.json connected — 8 rooms, live pricing & availability" }),
        ]);
        pushBot(handleText("hi", { ...ctx, connected: true }));
      }, 300);
      return;
    }
    pushBot(handleText(text, ctx));
  }

  function submitDates(v: { checkIn: string; checkOut: string; guests: number }) {
    setMsgs((prev) => [
      ...prev,
      mk({
        from: "me",
        text: `${formatDate(v.checkIn)} → ${formatDate(v.checkOut)} · ${v.guests} guest${v.guests > 1 ? "s" : ""}`,
      }),
    ]);
    pushBot(handleDateCard(v, ctx));
  }

  function restart() {
    seq = 0;
    setCtx(initialContext());
    setChips(START_CHIPS);
    setMsgs([
      mk({ from: "system", text: "Chat reset." }),
    ]);
    setTimeout(() => pushBot(handleText("hello", initialContext())), 300);
  }

  return (
    <div className="mx-auto w-full max-w-[400px]">
      {/* phone frame */}
      <div className="rounded-[2.6rem] border border-hairline bg-[#1c1712] p-2.5 shadow-[var(--shadow-lift)]">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-[#e7ded3]">
          {/* header */}
          <div className="relative z-10 flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <Icon.arrowLeft width={18} height={18} className="opacity-80" />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-display text-sm">
              {config.property.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium leading-tight">
                {config.property.name}
              </p>
              <p className="text-[11px] text-white/70">
                {typing ? "typing…" : ctx.connected ? "online · dataset connected" : "online"}
              </p>
            </div>
            <button onClick={restart} aria-label="Restart chat" className="opacity-80 hover:opacity-100">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M4 10a8 8 0 0 1 14-4l2 2M20 4v4h-4M20 14a8 8 0 0 1-14 4l-2-2M4 20v-4h4" />
              </svg>
            </button>
          </div>

          {/* messages */}
          <div
            ref={scrollRef}
            className="thin-scroll h-[62vh] min-h-[420px] space-y-2 overflow-y-auto bg-[#e7ded3] px-3.5 py-4"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(60,45,30,0.05) 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          >
            {msgs.map((m) =>
              m.from === "system" ? (
                <p
                  key={m.id}
                  className="mx-auto w-max max-w-[90%] rounded-lg bg-[#fcf4cd] px-3 py-1 text-center text-[11px] leading-snug text-[#5b5744] shadow-sm"
                >
                  {m.text}
                </p>
              ) : m.card === "dates" ? (
                <DateCard key={m.id} onSubmit={submitDates} />
              ) : (
                <div
                  key={m.id}
                  className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] whitespace-pre-line rounded-lg px-2.5 py-1.5 text-[13px] leading-[1.4] shadow-sm ${
                      m.from === "me"
                        ? "rounded-br-none bg-[#d9fdd3] text-[#111b21]"
                        : "rounded-bl-none bg-white text-[#111b21]"
                    }`}
                  >
                    {m.text}
                    <span className="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10px] text-[#667781]">
                      {m.time}
                      {m.from === "me" && (
                        <svg width={14} height={11} viewBox="0 0 16 11" fill="none">
                          <path
                            d="M1 5.5 4 8.5 10 2M6 8.5 9 8.5 15 2"
                            stroke="#53bdeb"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </div>
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

          {/* dataset connector */}
          {!ctx.connected && (
            <div className="flex items-center gap-2.5 border-t border-black/5 bg-[#f0f2f5] px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25d366]/15 text-[#1f8a4c]">
                <Icon.grid width={15} height={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[#111b21]">
                  property-rooms.json
                </p>
                <p className="text-[10.5px] text-[#667781]">8 rooms · pricing · availability</p>
              </div>
              <button
                onClick={() => send("connect dataset")}
                className="rounded-full bg-[#075e54] px-3 py-1.5 text-[11px] font-medium text-white"
              >
                Connect
              </button>
            </div>
          )}

          {/* quick replies */}
          {chips.length > 0 && (
            <div className="thin-scroll flex gap-1.5 overflow-x-auto bg-[#f0f2f5] px-3 pt-2">
              {chips.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  className="shrink-0 rounded-full border border-[#075e54]/25 bg-white px-3 py-1 text-[11.5px] text-[#075e54]"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message"
              className="flex-1 rounded-full bg-white px-4 py-2 text-[13px] text-[#111b21] outline-none placeholder:text-[#8696a0]"
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#075e54] text-white transition-transform active:scale-95"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3l18 9-18 9 4-9-4-9Z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function DateCard({
  onSubmit,
}: {
  onSubmit: (v: { checkIn: string; checkOut: string; guests: number }) => void;
}) {
  const [checkIn, setCheckIn] = useState(addDays(todayISO(), 1));
  const [checkOut, setCheckOut] = useState(addDays(todayISO(), 3));
  const [guests, setGuests] = useState(2);
  const [done, setDone] = useState(false);
  const n = nights(checkIn, checkOut);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg rounded-bl-none bg-white p-3 text-[12px] shadow-sm">
        <p className="mb-2 font-medium text-[#111b21]">Choose dates &amp; guests</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-[#667781]">Check-in</span>
            <input
              type="date"
              value={checkIn}
              min={todayISO()}
              disabled={done}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (nights(e.target.value, checkOut) <= 0) setCheckOut(addDays(e.target.value, 2));
              }}
              className="rounded-md border border-[#d1d7db] px-2 py-1 text-[12px] outline-none"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-[#667781]">Check-out</span>
            <input
              type="date"
              value={checkOut}
              min={addDays(checkIn, 1)}
              disabled={done}
              onChange={(e) => setCheckOut(e.target.value)}
              className="rounded-md border border-[#d1d7db] px-2 py-1 text-[12px] outline-none"
            />
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[#667781]">Guests</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={done || guests <= 1}
              onClick={() => setGuests((g) => Math.max(1, g - 1))}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d1d7db] disabled:opacity-40"
            >
              –
            </button>
            <span className="w-3 text-center font-medium">{guests}</span>
            <button
              type="button"
              disabled={done || guests >= 6}
              onClick={() => setGuests((g) => Math.min(6, g + 1))}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d1d7db] disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={done || n <= 0}
          onClick={() => {
            setDone(true);
            onSubmit({ checkIn, checkOut, guests });
          }}
          className="mt-3 w-full rounded-full bg-[#075e54] py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
        >
          {done ? "Sent ✓" : n > 0 ? `Check ${n} night${n > 1 ? "s" : ""}` : "Pick valid dates"}
        </button>
      </div>
    </div>
  );
}
