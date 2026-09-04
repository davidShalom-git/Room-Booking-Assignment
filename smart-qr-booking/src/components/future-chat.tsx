"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/config";
import { Icon } from "@/components/icons";

type Line =
  | { from: "me" | "bot"; text: string }
  | { from: "actions" };

const SCRIPT: Line[] = [
  { from: "me", text: "Is breakfast included?" },
  { from: "bot", text: "Yes — complimentary breakfast is served on the rooftop from 7:30 AM to 10:00 AM." },
  { from: "me", text: "Is Room 101 available from Sep 10 to Sep 12?" },
  { from: "bot", text: "Yes. Deluxe Double Room 101 is free for those nights.\nThe total for 2 nights is ₹3,600." },
  { from: "actions" },
  { from: "me", text: "Confirm booking" },
  { from: "bot", text: "Done ✅\nBooking HTL-20260910-001\nGuest: David · 2 guests\n10 Sep → 12 Sep (2 nights)\nTotal ₹3,600 — pay at the property.\nI've sent David this confirmation." },
];

export function FutureChat() {
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = useCallback((from: number) => {
    clear();
    let acc = from === 0 ? 500 : 300;
    for (let i = from; i < SCRIPT.length; i++) {
      const line = SCRIPT[i];
      if (line.from === "actions") {
        timers.current.push(
          window.setTimeout(() => setCount(i + 1), acc),
        );
        break; // wait for the user to click an action
      }
      if (line.from === "bot") {
        const at = acc;
        timers.current.push(window.setTimeout(() => setTyping(true), at));
        acc += 1100;
        timers.current.push(
          window.setTimeout(() => {
            setTyping(false);
            setCount(i + 1);
          }, acc),
        );
        acc += 500;
      } else {
        const at = acc;
        timers.current.push(window.setTimeout(() => setCount(i + 1), at));
        acc += 900;
      }
    }
  }, []);

  useEffect(() => {
    play(0);
    return clear;
  }, [play]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [count, typing]);

  const shown = SCRIPT.slice(0, count);
  const awaitingAction = SCRIPT[count - 1]?.from === "actions";

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="rounded-[2.6rem] border border-hairline bg-[#1c1712] p-2.5 shadow-[var(--shadow-lift)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-[#e7ded3]">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-display text-sm">
              {config.property.name[0]}
            </div>
            <div className="flex-1">
              <p className="text-[13.5px] font-medium leading-tight">{config.property.name}</p>
              <p className="text-[11px] text-white/70">{typing ? "typing…" : "auto-reply · concept"}</p>
            </div>
            <button
              onClick={() => {
                setCount(0);
                play(0);
              }}
              className="text-[11px] text-white/80 hover:text-white"
            >
              Replay
            </button>
          </div>

          <div
            ref={scrollRef}
            className="thin-scroll h-[440px] space-y-2 overflow-y-auto px-3.5 py-4"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(60,45,30,0.05) 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          >
            {shown.map((line, i) =>
              line.from === "actions" ? null : (
                <div key={i} className={`flex ${line.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] whitespace-pre-line rounded-lg px-2.5 py-1.5 text-[13px] leading-[1.4] shadow-sm ${
                      line.from === "me"
                        ? "rounded-br-none bg-[#d9fdd3] text-[#111b21]"
                        : "rounded-bl-none bg-white text-[#111b21]"
                    }`}
                  >
                    {line.text}
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

            {awaitingAction && (
              <div className="space-y-1.5 pt-1">
                {[
                  { label: "Confirm Booking", primary: true },
                  { label: "See More Rooms", primary: false },
                  { label: "Talk to Staff", primary: false },
                ].map((b) => (
                  <button
                    key={b.label}
                    onClick={() => b.primary && play(count)}
                    className={`w-full rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                      b.primary
                        ? "border-[#075e54] bg-[#075e54] text-white"
                        : "border-[#075e54]/25 bg-white text-[#075e54]"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
                <p className="pt-1 text-center text-[10px] text-[#8a7f70]">
                  Mock buttons — tap “Confirm Booking” to continue the script
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#f0f2f5] px-3 py-2.5">
            <div className="rounded-full bg-white px-4 py-2 text-[12px] text-[#8696a0]">
              Automated — no typing needed
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-clay">
        <Icon.sparkles width={13} height={13} />
        Future WhatsApp automation — not yet implemented
      </p>
    </div>
  );
}
