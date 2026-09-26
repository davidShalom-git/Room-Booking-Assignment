"use client";

/**
 * The website chat window: the booking assistant, on the lodge's own site.
 * Messages live on the server (/api/chat, lib/web-chat.ts); this polls for new ones — quickly
 * while open, slowly while closed so the owner's confirmation still shows up as unread.
 * Open it from anywhere with openChat("text to send").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type Row = { id: string; title: string; description?: string };
type Msg = {
  id: number;
  fromGuest: boolean;
  text: string;
  buttons: { id: string; title: string }[] | null;
  list: { button: string; rows: Row[] } | null;
};
type Send = { text: string } | { button: string; title: string };

const OPEN_EVENT = "open-chat";
/** Last message the visitor has seen (this browser only): what's newer shows as unread. */
const SEEN_KEY = "chat-seen";

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Open the chat, optionally sending a message (e.g. the room and dates the guest picked). */
export function openChat(text?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { text } }));
}

const TOKENS = /(https?:\/\/[^\s]+)|\*([^*\n]+)\*/g;

/** Chat text: *bold* and links, line by line. React escapes everything else. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const parts: React.ReactNode[] = [];
        let last = 0;
        for (const m of line.matchAll(TOKENS)) {
          if (m.index > last) parts.push(line.slice(last, m.index));
          parts.push(
            m[1] ? (
              <a key={m.index} href={m[1]} target="_blank" rel="noopener noreferrer" className="break-all font-medium underline underline-offset-2">
                {m[1]}
              </a>
            ) : (
              <strong key={m.index} className="font-semibold">
                {m[2]}
              </strong>
            ),
          );
          last = m.index + m[0].length;
        }
        parts.push(line.slice(last));
        return (
          <span key={i} className="block min-h-[0.75em]">
            {parts}
          </span>
        );
      })}
    </>
  );
}

export function ChatWidget({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [seenId, setSeenId] = useState(readSeen);
  const lastId = useRef(0);
  const openRef = useRef(false);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const add = useCallback((incoming: Msg[]) => {
    const fresh = incoming.filter((m) => m.id > lastId.current);
    if (fresh.length === 0) return;
    lastId.current = fresh[fresh.length - 1]!.id;
    setMsgs((prev) => [...prev, ...fresh]);
    if (openRef.current) {
      try {
        localStorage.setItem(SEEN_KEY, String(lastId.current)); // read while the window is open
      } catch {
        /* private mode */
      }
    }
  }, []);

  /** Everything up to now counts as read (called when the window opens or closes). */
  const markSeen = useCallback(() => {
    setSeenId(lastId.current);
    try {
      localStorage.setItem(SEEN_KEY, String(lastId.current));
    } catch {
      /* private mode: the badge just resets on reload */
    }
  }, []);
  const show = useCallback(() => {
    openRef.current = true;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    markSeen();
    openRef.current = false;
    setOpen(false);
  }, [markSeen]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat?after=${lastId.current}`, { cache: "no-store" });
      if (r.ok) add(((await r.json()) as { messages: Msg[] }).messages);
    } catch {
      /* offline: try again on the next tick */
    }
  }, [add]);

  const send = useCallback(
    async (ev: Send) => {
      setSending(true);
      setError("");
      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...ev, after: lastId.current }),
        });
        const j = (await r.json()) as { ok: boolean; error?: string; messages: Msg[] };
        add(j.messages ?? []);
        if (!j.ok) setError(j.error ?? "Something went wrong — please try again.");
      } catch {
        setError("No connection — please try again.");
      } finally {
        setSending(false);
      }
    },
    [add],
  );

  // Earlier conversation (the chat is kept in a cookie), then keep checking for replies.
  useEffect(() => {
    openRef.current = open;
    const first = setTimeout(poll, 0);
    const timer = setInterval(poll, open ? 3000 : 20000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [open, poll]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      show();
      if (text) {
        started.current = true;
        void send({ text });
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [send, show]);

  // A first visit starts with a hello, so the assistant introduces itself.
  useEffect(() => {
    if (!open || started.current) return;
    const t = setTimeout(() => {
      if (!started.current && lastId.current === 0) {
        started.current = true;
        void send({ text: "Hi" });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [open, send]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, msgs.length, sending]);

  const lastMsg = msgs[msgs.length - 1];
  const choices = lastMsg && !lastMsg.fromGuest && !sending ? lastMsg : null;
  const unread = open ? 0 : msgs.filter((m) => !m.fromGuest && m.id > seenId).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    started.current = true;
    void send({ text });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={show}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-ink py-3 pl-4 pr-5 text-[14px] font-medium text-cream shadow-[0_10px_30px_-10px_rgba(38,33,25,0.6)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
        aria-label={unread ? `Chat to book — ${unread} new` : "Chat to book"}
      >
        <Icon.chat width={18} height={18} />
        Chat to book
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={`Chat with ${name}`}
      className="fixed bottom-0 left-0 right-0 top-0 z-50 flex flex-col bg-cream sm:bottom-4 sm:left-auto sm:right-4 sm:top-auto sm:h-[min(640px,calc(100dvh-2rem))] sm:w-[390px] sm:overflow-hidden sm:rounded-[1.5rem] sm:border sm:border-hairline sm:shadow-[0_30px_80px_-20px_rgba(38,33,25,0.45)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-hairline bg-paper px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{name}</p>
          <p className="text-[11.5px] text-sage">● Booking assistant · replies instantly</p>
        </div>
        <button
          type="button"
          onClick={hide}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-ink/[0.05] hover:text-ink"
          aria-label="Close chat"
        >
          <Icon.x width={18} height={18} />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.fromGuest ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                m.fromGuest ? "rounded-br-md bg-ink text-cream" : "rounded-bl-md border border-hairline bg-paper text-ink"
              }`}
            >
              <Rich text={m.text} />
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-hairline bg-paper px-4 py-3 text-[13px] text-faint">typing…</div>
          </div>
        )}
        {choices?.buttons && (
          <div className="flex flex-wrap gap-2 pl-1 pt-1">
            {choices.buttons.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => send({ button: b.id, title: b.title })}
                className="rounded-full border border-clay/40 bg-paper px-3.5 py-1.5 text-[13px] font-medium text-clay transition-colors hover:bg-clay hover:text-white"
              >
                {b.title}
              </button>
            ))}
          </div>
        )}
        {choices?.list && (
          <div className="space-y-1.5 pl-1 pt-1">
            {choices.list.rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => send({ button: r.id, title: r.title })}
                className="block w-full rounded-xl border border-hairline bg-paper px-3.5 py-2 text-left transition-colors hover:border-clay"
              >
                <span className="block text-[13.5px] font-medium text-ink">{r.title}</span>
                {r.description && <span className="block text-[12px] text-muted">{r.description}</span>}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="px-1 text-[12.5px] text-clay">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-hairline bg-paper px-3 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-full border border-hairline bg-cream px-4 py-2.5 text-[15px] text-ink outline-none focus:border-clay"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay text-white transition-opacity disabled:opacity-50"
          aria-label="Send"
        >
          <Icon.send width={17} height={17} />
        </button>
      </form>
    </div>
  );
}
