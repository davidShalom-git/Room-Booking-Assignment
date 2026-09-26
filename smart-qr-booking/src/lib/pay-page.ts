/**
 * The pay page (/pay/<bookingId>, linked from the chat): what it offers, and the UTR box, which
 * claims the payment exactly like sending the UTR in the chat — the owner app gets it to acknowledge.
 */
import type { Booking, Payment } from "@/generated/prisma/client";
import * as engine from "@/lib/engine";
import * as payments from "@/lib/payments";
import { paymentView, stayView } from "@/lib/bot/ports-prisma";
import { ownerClaimAlerts } from "@/lib/notify";
import { deliver } from "@/lib/deliver";

/**
 * "pay": UPI + the UTR box, while the hold is live — or after it lapsed if the payment is already
 * with the desk. "expired": a lapsed hold nobody has paid for; only the UTR box, for money already
 * sent (the room may be gone). "none": nothing is owed.
 */
export function payState(
  b: Pick<Booking, "status" | "holdExpiresAt">,
  owed: Pick<Payment, "status"> | null,
): "pay" | "expired" | "none" {
  if (!owed) return "none";
  if (b.status === "PENDING") return "pay";
  if (b.status === "CANCELLED" && b.holdExpiresAt) return owed.status === "CLAIMED" ? "pay" : "expired";
  return "none";
}

/** The UTR from the pay page: the payment is claimed and the owner app gets it to acknowledge. */
export async function claimFromPayPage(bookingId: string, utr: string, now: Date = new Date()) {
  const r = await payments.claimPayment(bookingId, utr, now);
  if (!r.ok) return r;
  const stay = r.value.kind === "EXTENSION" ? await engine.stayOf(bookingId) : null;
  await deliver(ownerClaimAlerts(paymentView(r.value), stay ? stayView(stay) : null, r.value.duplicateRef));
  return r;
}
