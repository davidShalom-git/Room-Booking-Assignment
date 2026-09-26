/**
 * The website chat: the booking assistant on the lodge's own website.
 *
 * A chat is a random key ("web:<22 chars>") kept in the visitor's cookie. The assistant (step.ts)
 * answers each message; its replies are stored as ChatMessage rows (deliver.ts) and the chat window
 * polls for them. A booking made here remembers its chat (Booking.chatKey), so the owner's
 * confirmation — from the owner app or the console — comes back into the same chat.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { step } from "@/lib/bot/step";
import { loadConv, saveConv } from "@/lib/bot/conversation";
import { prismaPorts } from "@/lib/bot/ports-prisma";
import type { InEvent, Out, Ports, Row } from "@/lib/bot/types";
import { deliver } from "@/lib/deliver";
import { hit } from "@/lib/rate-limit";

const HOUR_MS = 3_600_000;

export const newChatKey = () => `web:${randomBytes(16).toString("base64url")}`;
export const isChatKey = (k: string | null | undefined): k is string => !!k && /^web:[A-Za-z0-9_-]{22}$/.test(k);

/**
 * The assistant's ports for a website visitor: at most 3 new holds an hour from one network —
 * anyone can open a chat, and a hold blocks a room until it lapses.
 */
export function webPorts(base: Ports, ip: string): Ports {
  return {
    ...base,
    createHold: async (i) =>
      (await hit(`hold:${ip}`, 3, HOUR_MS, base.now()))
        ? base.createHold(i)
        : {
            ok: false,
            code: "LIMIT",
            message: `Too many bookings from this network in the last hour — please try again later.`,
          },
  };
}

/**
 * Serialize work per chat across all server instances: a Postgres advisory lock held for the
 * length of a transaction. Two taps at once (a double tap) then see each other's result instead
 * of racing on the same conversation.
 */
export async function oneAtATime<T>(chat: string, work: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(4242, hashtext(${chat}))`;
      return work();
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export type ChatEvent = { text: string } | { button: string; title: string };
export type ChatMsg = {
  id: number;
  fromGuest: boolean;
  text: string;
  buttons: { id: string; title: string }[] | null;
  list: { button: string; rows: Row[] } | null;
  at: string;
};

/** One message from the visitor: stored, answered by the assistant, answer stored. */
export async function chatSend(
  key: string,
  ev: ChatEvent,
  opts: { ip: string; now?: Date; ports?: Ports },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isChatKey(key)) return { ok: false, error: "This chat has expired — please reload the page." };
  const text = ("text" in ev ? ev.text : ev.title).trim();
  if (!text || text.length > 1000) return { ok: false, error: "Please type a message (up to 1,000 characters)." };
  if ("button" in ev && (!ev.button || ev.button.length > 100)) return { ok: false, error: "That option isn't valid." };

  const now = opts.now ?? new Date();
  if (!(await hit(`chat:${key}`, 20, 60_000, now)) || !(await hit(`ip:${opts.ip}`, 60, 60_000, now))) {
    return { ok: false, error: "You're sending messages very fast — please wait a few seconds." };
  }

  const event: InEvent = "text" in ev ? { kind: "text", from: key, text } : { kind: "button", from: key, id: ev.button };
  const ports = opts.ports ?? webPorts(prismaPorts(), opts.ip);
  await oneAtATime(key, async () => {
    await prisma.chatMessage.create({ data: { chat: key, fromGuest: true, text } });
    const r = await step(await loadConv(key), event, ports);
    await deliver(r.out);
    await saveConv(r.conv);
  });
  return { ok: true };
}

/** The chat's messages after `after` (a message id), oldest first. */
export async function chatMessages(key: string, after = 0): Promise<ChatMsg[]> {
  if (!isChatKey(key)) return [];
  const rows = await prisma.chatMessage.findMany({
    where: { chat: key, id: { gt: after } },
    orderBy: { id: "asc" },
    take: 200,
  });
  return rows.map((m) => ({
    id: m.id,
    fromGuest: m.fromGuest,
    text: m.text,
    buttons: (m.buttons as Out["buttons"]) ?? null,
    list: (m.list as Out["list"]) ?? null,
    at: m.createdAt.toISOString(),
  }));
}
