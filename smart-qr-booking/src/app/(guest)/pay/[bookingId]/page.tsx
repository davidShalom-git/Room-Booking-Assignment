/**
 * Payment page, linked from the website chat. One tap opens the guest's UPI app with the amount
 * filled in, and the QR code covers paying from another phone. The guest then sends the UPI
 * reference (UTR) — here or in the chat — and the front desk confirms in the owner app.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { config } from "@/config";
import { env } from "@/lib/env";
import { bookingRef, getBooking } from "@/lib/engine";
import { openPayment } from "@/lib/payments";
import { payState } from "@/lib/pay-page";
import { istDate, istTime } from "@/lib/dates";
import { formatDate, formatINR, formatTime } from "@/lib/pricing";
import { upiPayLink } from "@/lib/upi";
import { qrSvg } from "@/lib/qr";
import { ChatCta } from "@/components/chat-cta";
import { CopyButton } from "@/components/copy-button";
import { ClaimForm } from "@/components/claim-form";

export const metadata: Metadata = { title: "Pay", robots: { index: false, follow: false } };

export default async function PayPage({ params }: { params: Promise<{ bookingId: string }> }) {
  await connection();
  const { bookingId } = await params;
  const b = /^[a-z0-9_]{10,40}$/i.test(bookingId) ? await getBooking(bookingId) : null;
  if (!b) notFound();

  const ref = bookingRef(b);
  const owed = await openPayment(b.id);
  const isExtension = b.parentId !== null;
  const amount = owed?.amount ?? (isExtension ? b.total : Math.round(b.total * config.advanceRate));
  const state = payState(b, owed);
  const payable = state === "pay";
  const upiId = env.upiId;
  const link = upiId && payable ? upiPayLink({ upiId, name: env.upiPayeeName, amount, note: ref }) : null;
  const qr = link ? await qrSvg(link) : null;
  const row = "flex justify-between gap-4 py-1.5";
  const title =
    b.status === "CONFIRMED"
      ? isExtension ? "Extension confirmed" : "Booking confirmed"
      : payable
        ? isExtension ? "Pay for your extension" : "Pay your advance"
        : state === "expired"
          ? "Your hold expired"
          : "This booking isn't on hold";

  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-md">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">{config.property.name}</p>
        <h1 className="font-display mt-2 text-3xl leading-tight text-ink">{title}</h1>

        <div className="mt-6 rounded-[1.5rem] border border-hairline bg-paper p-1.5">
          <div className="rounded-[1.15rem] bg-sand/40 p-5 text-[13.5px] text-muted">
            <p className="font-medium text-ink">
              Room {b.roomId} — {b.room.name}
              {isExtension && " · extra nights"}
            </p>
            <p className="mt-0.5">
              {formatDate(istDate(b.checkInAt))} → {formatDate(istDate(b.checkOutAt))} · {b.nights} night{b.nights === 1 ? "" : "s"} ·{" "}
              <span className="whitespace-nowrap">Ref {ref}</span>
            </p>
            <dl className="mt-4 border-t border-hairline pt-2">
              <div className={row}>
                <dt>Total</dt>
                <dd className="text-ink">{formatINR(b.total)}</dd>
              </div>
              {b.status === "CONFIRMED" ? (
                <>
                  <div className={row}>
                    <dt>Paid</dt>
                    <dd className="text-sage">{formatINR(b.advancePaid)}</dd>
                  </div>
                  {b.total > b.advancePaid && (
                    <div className={row}>
                      <dt>Due at check-in</dt>
                      <dd className="font-medium text-ink">{formatINR(b.total - b.advancePaid)}</dd>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={row}>
                    <dt>{isExtension ? "Pay now (in full)" : `Advance (${Math.round(config.advanceRate * 100)}%)`}</dt>
                    <dd className="font-display text-xl text-ink">{formatINR(amount)}</dd>
                  </div>
                  {!isExtension && (
                    <div className={row}>
                      <dt>Balance at check-in</dt>
                      <dd className="text-ink">{formatINR(b.total - amount)}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>
        </div>

        {payable && (
          <div className="mt-5 space-y-4">
            {owed?.status === "REJECTED" && (
              <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
                The front desk couldn't find your payment{owed.utr ? ` (UTR ${owed.utr})` : ""} yet. Please check the UTR in your UPI
                app and send it again below.
              </p>
            )}
            {link ? (
              <>
                <a
                  href={link}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[15px] font-medium text-cream transition-transform active:scale-[0.98]"
                >
                  Pay {formatINR(amount)} with UPI
                </a>
                {b.holdExpiresAt && b.status === "PENDING" && (
                  <p className="text-center text-[12px] text-faint">
                    Your room is held until {formatTime(istTime(b.holdExpiresAt))}, {formatDate(istDate(b.holdExpiresAt))}.
                  </p>
                )}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-paper px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">UPI ID</p>
                    <p className="truncate font-medium text-ink">{upiId}</p>
                    <p className="text-[12px] text-faint">{env.upiPayeeName}</p>
                  </div>
                  <CopyButton text={upiId} />
                </div>
                {qr && (
                  <div className="flex flex-col items-center rounded-2xl border border-hairline bg-paper p-5 text-center">
                    <div className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
                    <p className="mt-3 text-[12px] text-muted">Paying from another phone? Scan this with any UPI app.</p>
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-2xl border border-hairline bg-paper px-4 py-3 text-[13px] text-muted">
                The front desk will send you the payment details in the chat.
              </p>
            )}
            <ClaimForm bookingId={b.id} claimedUtr={owed?.status === "CLAIMED" ? owed.utr : null} />
          </div>
        )}

        {state === "expired" && (
          <div className="mt-5 space-y-4">
            <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
              The hold on this room ran out
              {b.holdExpiresAt && ` at ${formatTime(istTime(b.holdExpiresAt))}, ${formatDate(istDate(b.holdExpiresAt))}`}, so it may have been
              booked by someone else — please don't pay for it now. Already paid? Send the UPI reference below and the front desk
              will check. Otherwise, book again in the chat.
            </p>
            <ClaimForm bookingId={b.id} claimedUtr={null} />
          </div>
        )}

        {state === "none" && b.status === "CANCELLED" && (
          <p className="mt-5 rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
            This booking is no longer on hold. If you&apos;ve already paid, tell us in the chat (reference {ref}) or call{" "}
            {config.property.phone}, and we&apos;ll sort it out straight away.
          </p>
        )}

        <div className="mt-5 flex justify-center">
          <ChatCta variant="outline">Back to the chat</ChatCta>
        </div>
      </div>
    </div>
  );
}
