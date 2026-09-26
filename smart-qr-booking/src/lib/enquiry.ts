import { config } from "@/config";
import { formatDate, nights, bookingTotal, formatINR } from "@/lib/pricing";

type Room = { id: string; name: string; pricePerNight: number };

export type EnquiryContext = {
  room?: Room;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
};

/**
 * The first chat message when a guest starts from a room page ("Book in chat"): the room, and the
 * dates they picked. The assistant reads it (lib/dates.ts parseEnquiry) and answers availability.
 */
export function enquiryMessage(ctx: EnquiryContext): string {
  const lines: string[] = [];
  if (ctx.room) {
    lines.push(`Hi, I'm interested in Room ${ctx.room.id} — ${ctx.room.name}.`);
  } else {
    lines.push(`Hi, I'd like to ask about a room at ${config.property.name}.`);
  }
  if (ctx.checkIn) lines.push(`Check-in: ${formatDate(ctx.checkIn)}`);
  if (ctx.checkOut) lines.push(`Check-out: ${formatDate(ctx.checkOut)}`);
  if (ctx.guests) lines.push(`Guests: ${ctx.guests}`);
  if (ctx.room && ctx.checkIn && ctx.checkOut) {
    const n = nights(ctx.checkIn, ctx.checkOut);
    if (n > 0) {
      lines.push("");
      lines.push(`That's ${n} night${n > 1 ? "s" : ""} — roughly ${formatINR(bookingTotal(ctx.room.pricePerNight, n))}. Could you confirm availability?`);
    }
  } else {
    lines.push("");
    lines.push("Could you let me know about availability?");
  }
  return lines.join("\n");
}
