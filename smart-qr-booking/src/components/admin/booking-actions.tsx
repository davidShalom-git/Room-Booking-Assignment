import { ackPaymentAction, balanceAction, cancelAction, markPaidAction, rejectPaymentAction } from "@/app/admin/actions";
import type { AdminBooking } from "@/lib/admin-data";
import type { Settings } from "@/lib/settings";
import { whatsappConfirmation } from "@/lib/bot/copy";
import { formatDate, formatINR, todayISO } from "@/lib/pricing";
import { SubmitButton } from "./submit-button";

const pill = "rounded-full border border-hairline px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-clay/40 hover:text-clay";
const primary = "rounded-full bg-sage px-3 py-1.5 text-[12px] font-medium text-white transition-transform active:scale-[0.97]";

/** Acknowledge / Not received for a payment the guest says they've made (UTR shown). */
export function PaymentDecision({ paymentId, utr, amount, back = "", path }: { paymentId: string; utr: string | null; amount: number; back?: string; path: string }) {
  const hidden = (
    <>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="path" value={path} />
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={ackPaymentAction}>
        {hidden}
        <SubmitButton
          confirm={`Acknowledge ${formatINR(amount)}${utr ? ` (UTR ${utr})` : ""}? Only if it has reached your account.`}
          pendingText="Saving…"
          className={primary}
        >
          Acknowledge
        </SubmitButton>
      </form>
      <form action={rejectPaymentAction}>
        {hidden}
        <SubmitButton pendingText="…" className={pill}>
          Not received
        </SubmitButton>
      </form>
    </div>
  );
}

/** Row actions. `back` + `path` bring the owner back to the same view. */
export function BookingActions({
  booking: b,
  back = "",
  path,
  settings,
}: {
  booking: AdminBooking;
  back?: string;
  path: string;
  settings: Settings;
}) {
  const hidden = (
    <>
      <input type="hidden" name="id" value={b.id} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="path" value={path} />
    </>
  );
  const tellGuest = b.chat ? " The guest is told in their chat." : "";
  const upcoming = b.checkOut >= todayISO();
  const cancel = (label: string, question: string) => (
    <form action={cancelAction}>
      {hidden}
      <SubmitButton confirm={question} pendingText="Cancelling…" className={pill}>
        {label}
      </SubmitButton>
    </form>
  );
  const pay = (label: string, question?: string) => (
    <form action={markPaidAction} className="flex items-center gap-1.5">
      {hidden}
      <label className="flex items-center rounded-full border border-hairline bg-paper pl-2.5 text-[12px] text-muted">
        <span aria-hidden>₹</span>
        <span className="sr-only">Amount received for {b.ref}, in rupees</span>
        <input
          name="amount"
          inputMode="numeric"
          pattern="[0-9]*"
          defaultValue={b.openPayment?.amount ?? (b.parentId ? b.total : Math.round((b.total * settings.advancePercent) / 100))}
          className="w-16 bg-transparent px-1 py-1.5 text-ink outline-none"
        />
      </label>
      <SubmitButton confirm={question} pendingText="Saving…" className={primary}>
        {label}
      </SubmitButton>
    </form>
  );

  // The guest says they've paid: check the UTR and decide.
  if (b.openPayment?.status === "CLAIMED" && (b.status === "PENDING" || b.holdExpiresAt)) {
    return <PaymentDecision paymentId={b.openPayment.id} utr={b.openPayment.utr} amount={b.openPayment.amount} back={back} path={path} />;
  }
  if (b.status === "PENDING") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {pay("Payment received")}
        {cancel("Cancel hold", `Cancel the hold ${b.ref} for ${b.guestName}? The room is released.${tellGuest}`)}
      </div>
    );
  }
  // The hold lapsed before the money arrived. If it arrived late, confirm it here — the room is
  // re-checked, and you're told if someone else has taken it meanwhile.
  if (b.status === "CANCELLED" && b.holdExpiresAt && upcoming) {
    return pay("Payment arrived late — confirm", `Confirm ${b.ref} for ${b.guestName}? Only if the money has reached you.${tellGuest}`);
  }
  if (b.status === "CONFIRMED" && upcoming) {
    const due = b.total - b.advancePaid;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={whatsappConfirmation(settings, b)}
          target="_blank"
          rel="noopener noreferrer"
          title="Opens WhatsApp with the confirmation ready to send"
          className={pill}
        >
          Send on WhatsApp
        </a>
        {due > 0 && (
          <form action={balanceAction}>
            {hidden}
            <SubmitButton confirm={`Record ${formatINR(due)} received for ${b.ref}?`} pendingText="Saving…" className={primary}>
              Balance received ({formatINR(due)})
            </SubmitButton>
          </form>
        )}
        {cancel(
          "Cancel",
          `Cancel ${b.ref} for ${b.guestName} (${formatDate(b.checkIn)} → ${formatDate(b.checkOut)})? This frees the room.${tellGuest}`,
        )}
      </div>
    );
  }
  return null;
}
