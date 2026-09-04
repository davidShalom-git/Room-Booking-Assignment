import { config } from "@/config";
import { formatDate, nights, bookingTotal, formatINR } from "@/lib/pricing";
import type { Room, Booking } from "@/lib/data";

export type EnquiryContext = {
  room?: Pick<Room, "id" | "name" | "pricePerNight">;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
};

/** Pre-filled "I'm interested" message a guest sends the property. */
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
      lines.push(
        `That's ${n} night${n > 1 ? "s" : ""} — roughly ${formatINR(
          bookingTotal(ctx.room.pricePerNight, n),
        )}. Could you confirm availability?`,
      );
    }
  } else {
    lines.push("");
    lines.push("Could you let me know about availability?");
  }
  return lines.join("\n");
}

/** Confirmation message the guest receives after a booking is confirmed. */
export function confirmationMessage(b: Booking): string {
  return [
    `✅ Booking confirmed at ${config.property.name}`,
    "",
    `Name: ${b.guestName}`,
    `Booking ID: ${b.id}`,
    `Room: ${b.roomName} — ${b.roomId}`,
    `Check-in: ${formatDate(b.checkIn)} (from ${config.property.checkIn})`,
    `Check-out: ${formatDate(b.checkOut)} (by ${config.property.checkOut})`,
    `Duration: ${b.nights} night${b.nights > 1 ? "s" : ""}`,
    `Guests: ${b.guests}`,
    `Total: ${formatINR(b.total)} (pay at property)`,
    "",
    `${config.property.address}`,
    `Questions? Just reply to this chat.`,
  ].join("\n");
}

/** wa.me deep link with a pre-filled message. Opens WhatsApp on any device. */
export function waLink(message: string, number: string = config.whatsappNumber): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
