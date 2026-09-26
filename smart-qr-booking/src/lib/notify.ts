/**
 * Owner-app notifications raised outside a chat (the pay page, the console): the same texts the
 * assistant uses, delivered through deliver().
 */
import * as C from "@/lib/bot/copy";
import { OWNER_PUSH, type Out, type PaymentView, type StayView } from "@/lib/bot/types";

/** "Customer X paid ₹Y for Room Z, UTR …" with Acknowledge / Not received. */
export function ownerClaimAlerts(p: PaymentView, stay: StayView | null, duplicateRef: string | null): Out[] {
  return [
    {
      to: OWNER_PUSH,
      text: C.ownerPaymentClaim(p, stay, duplicateRef),
      buttons: [
        { id: `ack:${p.id}`, title: "Acknowledge" },
        { id: `nack:${p.id}`, title: "Not received" },
      ],
    },
  ];
}

export const toOwner = (text: string): Out[] => [{ to: OWNER_PUSH, text }];
