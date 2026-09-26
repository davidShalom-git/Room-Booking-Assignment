/**
 * UPI "pay" deep link (NPCI URL spec). Opens the guest's UPI app with the payee, amount and
 * note filled in. Chat apps don't make upi:// links tappable, so the chat links to the https
 * pay page (/pay/[bookingId]) which offers this link as a button plus a QR code.
 */
export function upiPayLink(p: { upiId: string; name: string; amount: number; note: string }): string {
  const q = [
    `pa=${p.upiId.trim()}`,
    `pn=${encodeURIComponent(p.name)}`,
    `am=${p.amount.toFixed(2)}`,
    "cu=INR",
    `tn=${encodeURIComponent(p.note)}`,
  ];
  return `upi://pay?${q.join("&")}`;
}
