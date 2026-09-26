/**
 * Getting a message where it goes: a website chat (stored; the chat window picks it up) or the
 * owner app (a push notification). Anything else — e.g. a booking made at the desk, which has no
 * chat — has nobody to tell online and is skipped.
 */
import { prisma } from "@/lib/db";
import { OWNER_PUSH, type Out } from "@/lib/bot/types";
import { sendOwnerPush } from "@/lib/push";

export async function deliver(outs: Out[]): Promise<void> {
  for (const out of outs) {
    try {
      if (out.to.startsWith("web:")) {
        await prisma.chatMessage.create({
          data: { chat: out.to, fromGuest: false, text: out.text, buttons: out.buttons ?? undefined, list: out.list ?? undefined },
        });
      } else if (out.to === OWNER_PUSH) {
        await sendOwnerPush(out);
      }
    } catch (e) {
      console.error("[deliver] failed", out.to, e);
    }
  }
}
