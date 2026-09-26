"use client";

import { useActionState } from "react";
import { claimAction, type ClaimState } from "@/app/(guest)/actions";
import { SubmitButton } from "@/components/admin/submit-button";

/** "I've paid": the 12-digit UPI reference goes to the front desk to check. */
export function ClaimForm({ bookingId, claimedUtr }: { bookingId: string; claimedUtr: string | null }) {
  const [state, action] = useActionState<ClaimState, FormData>(claimAction, { n: 0 });
  const sent = state.sent || claimedUtr;
  return (
    <form action={action} className="rounded-2xl border border-hairline bg-paper p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      {sent ? (
        <p role="status" className="mb-3 rounded-xl bg-sage-soft px-3 py-2 text-[13px] text-sage">
          Payment reference {sent} sent — the front desk will confirm in the chat shortly. Sent the wrong one? Send it again below.
        </p>
      ) : null}
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Paid? Enter the UPI reference (UTR)</span>
        <input
          name="utr"
          inputMode="numeric"
          placeholder="12-digit number from your UPI app"
          required
          className="mt-1.5 w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-[15px] tracking-wider text-ink outline-none focus:border-clay"
        />
      </label>
      {state.error && (
        <p role="alert" className="mt-2 text-[13px] text-clay">
          {state.error}
        </p>
      )}
      <SubmitButton pendingText="Sending…" className="mt-3 w-full rounded-full bg-ink py-2.5 text-[14px] font-medium text-cream">
        I've paid — send to the front desk
      </SubmitButton>
    </form>
  );
}
