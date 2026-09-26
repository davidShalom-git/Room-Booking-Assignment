/**
 * The website chat. GET ?after=<id>: messages since that id. POST {text} or {button, title}:
 * send one, answered by the bot. The chat is the visitor's `cc_chat` cookie (see lib/web-chat.ts).
 */
import { cookies } from "next/headers";
import { chatMessages, chatSend, isChatKey, newChatKey, type ChatEvent } from "@/lib/web-chat";

const COOKIE = "cc_chat";
const MAX_AGE = 180 * 24 * 60 * 60;

const ipOf = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
const afterOf = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : 0);

export async function GET(request: Request) {
  const key = (await cookies()).get(COOKIE)?.value;
  const after = afterOf(new URL(request.url).searchParams.get("after"));
  return Response.json({ messages: isChatKey(key) ? await chatMessages(key, after) : [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown; button?: unknown; title?: unknown; after?: unknown } | null;
  const ev: ChatEvent =
    typeof body?.button === "string"
      ? { button: body.button, title: String(body.title ?? body.button) }
      : { text: String(body?.text ?? "") };

  const jar = await cookies();
  let key = jar.get(COOKIE)?.value;
  if (!isChatKey(key)) {
    key = newChatKey();
    jar.set(COOKIE, key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
  }
  const r = await chatSend(key, ev, { ip: ipOf(request) });
  return Response.json({ ...r, messages: await chatMessages(key, afterOf(body?.after)) }, { status: r.ok ? 200 : 400 });
}
