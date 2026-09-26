import { step, lastDayNudges } from "../../src/lib/bot/step";
import { chatMessages } from "../../src/lib/web-chat";
import type { ConvState, InEvent, Out, Ports } from "../../src/lib/bot/types";

/** Website chats — the key is what each visitor's cookie holds. */
export const GUEST = "web:GUESTaaaaaaaaaaaaaaaaa";
export const OTHER = "web:OTHERbbbbbbbbbbbbbbbbb";
/** The mobile number the guest gives while booking. */
export const GUEST_PHONE = "919812345678";

export const blankConv = (chat: string): ConvState => ({ chat, roomId: null, stage: "browsing", draft: {} });

/** What "Book in chat" on a room page sends first (see lib/enquiry.ts). */
export const qrText = (room = "101", name = "Deluxe Double Room") =>
  `Hi, I'm interested in Room ${room} — ${name}.\n\nCould you let me know about availability?`;

/** A tiny "chat world": one conversation per chat, every message the assistant sends recorded. */
export function world(ports: Ports) {
  const convs = new Map<string, ConvState>();
  const log: Out[] = [];

  async function send(ev: InEvent): Promise<Out[]> {
    const conv = convs.get(ev.from) ?? blankConv(ev.from);
    const r = await step(conv, ev, ports);
    convs.set(ev.from, r.conv);
    log.push(...r.out);
    return r.out;
  }

  const w = {
    ports,
    log,
    conv: (chat: string) => convs.get(chat) ?? blankConv(chat),
    say: (from: string, text: string) => send({ kind: "text", from, text }),
    tap: (from: string, id: string) => send({ kind: "button", from, id }),
    /** Every message sent to `to` (a chat, or OWNER_PUSH) by the assistant so far. */
    to: (to: string) => log.filter((o) => o.to === to),
    lastTo: (to: string) => log.filter((o) => o.to === to).at(-1),
    /** Forget what was sent so far (assert only on what happens next). */
    clear: () => {
      log.length = 0;
    },
    /** Messages that reached a chat from outside the conversation (the owner acting in the owner app / console). */
    inbox: async (chat: string) => (await chatMessages(chat)).filter((m) => !m.fromGuest),
    /** Run the last-day cron for a check-out date; returns (and logs) the messages sent. */
    nudge: async (tomorrow: string) => {
      const sent = await lastDayNudges(ports, tomorrow);
      log.push(...sent);
      return sent;
    },
    /** Overwrite a conversation — e.g. to simulate a save that never happened. */
    setConv: (chat: string, conv: ConvState) => void convs.set(chat, conv),
    /** Ids of buttons / list rows on a message. */
    ids: (o: Out | undefined) => [...(o?.buttons ?? []).map((b) => b.id), ...(o?.list?.rows ?? []).map((r) => r.id)],
  };
  return w;
}

/** Walk a guest through a booking up to (and including) the review screen. */
export async function bookUpToReview(
  w: ReturnType<typeof world>,
  opts: { from?: string; room?: string; name?: string; phone?: string; guests?: number; checkIn?: string; checkOut?: string } = {},
) {
  const from = opts.from ?? GUEST;
  await w.say(from, qrText(opts.room ?? "101"));
  await w.tap(from, "book");
  await w.say(from, opts.name ?? "Asha Nair");
  await w.say(from, opts.phone ?? "98123 45678");
  await w.say(from, String(opts.guests ?? 2));
  await w.say(from, opts.checkIn ?? "12 oct");
  await w.say(from, opts.checkOut ?? "14 oct");
}
