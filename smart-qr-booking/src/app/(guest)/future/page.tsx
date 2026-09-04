import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";
import { CtaButton } from "@/components/cta-button";

export const metadata: Metadata = { title: "What comes after the demo" };

const NOW = [
  "QR → WhatsApp → ask, book, confirm",
  "Front desk gets every booking on WhatsApp",
  "Last-day nudge → extend or check out",
  "Extend with approval, or move the guest to a free room",
];

const NEXT = [
  { t: "Real WhatsApp Business API", d: "Verified number, Meta approval, a provider (Twilio / 360dialog / Gupshup), message templates. The chat flows you just saw, wired to real WhatsApp.", when: "Phase 1" },
  { t: "Booking backend + calendar", d: "Per-date room availability, no double-bookings, real booking IDs, cancellation windows.", when: "Phase 1" },
  { t: "Payments in chat", d: "Deposit or full payment via a UPI / card link inside WhatsApp, with auto-receipts.", when: "Phase 2" },
  { t: "Automated reminders & housekeeping", d: "Scheduled last-day nudges, check-in instructions, checkout housekeeping alerts.", when: "Phase 2" },
  { t: "Owner dashboard & reports", d: "Occupancy, revenue, source mix, repeat guests — the web console, filled with real data.", when: "Phase 2" },
  { t: "Multi-property", d: "Same WhatsApp flow across several properties, one console.", when: "Later" },
];

export default function FuturePage() {
  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Roadmap</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-[1.05] text-ink sm:text-5xl">
          What comes after the demo
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          The demo shows the full guest ↔ front-desk flow as a simulation. The paid
          build turns it into a live product.
        </p>

        <div className="mt-8 rounded-2xl border border-hairline bg-sage-soft/50 p-5">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-sage">
            <Icon.check width={14} height={14} /> Working in this demo
          </p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {NOW.map((n) => (
              <li key={n} className="flex items-start gap-2 text-[13px] text-ink">
                <Icon.check width={14} height={14} className="mt-0.5 shrink-0 text-sage" />
                {n}
              </li>
            ))}
          </ul>
          <Link href="/whatsapp" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-clay">
            <Icon.whatsapp width={14} height={14} /> Replay it on the WhatsApp page
          </Link>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-hairline bg-paper p-1.5">
          <ul className="divide-y divide-hairline">
            {NEXT.map((r) => (
              <li key={r.t} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                  {r.when}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-ink">{r.t}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{r.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <CtaButton href="/whatsapp" variant="whatsapp" icon="whatsapp">
            See the WhatsApp flow
          </CtaButton>
          <CtaButton href="/admin" variant="outline" icon="gauge">
            See the owner console
          </CtaButton>
        </div>
      </div>
    </div>
  );
}
