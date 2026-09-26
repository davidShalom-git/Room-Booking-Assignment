/** Chat state persistence: one row per website chat. */
import { prisma } from "@/lib/db";
import type { ConvState, Draft, Stage } from "./types";

export async function loadConv(chat: string): Promise<ConvState> {
  const row = await prisma.conversation.findUnique({ where: { chat } });
  if (!row) return { chat, roomId: null, stage: "browsing", draft: {} };
  return { chat, roomId: row.roomId, stage: row.stage as Stage, draft: (row.draft ?? {}) as Draft };
}

export async function saveConv(conv: ConvState): Promise<void> {
  const data = { roomId: conv.roomId, stage: conv.stage, draft: conv.draft };
  await prisma.conversation.upsert({
    where: { chat: conv.chat },
    create: { chat: conv.chat, ...data },
    update: data,
  });
}
