import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";
import { FutureChat } from "@/components/future-chat";
import { CtaButton } from "@/components/cta-button";

export const metadata: Metadata = { title: "Future WhatsApp automation" };

const ROADMAP = [
  { now: true, label: "Pre-filled WhatsApp enquiries", note: "Live in this demo" },
  { now: true, label: "Rule-based assistant over your room data", note: "Try it on the WhatsApp page" },
  { now: false, label: "WhatsApp Business API auto-replies 24/7", note: "Next phase" },
  { now: false, label: "In-chat payments & deposits", note: "Next phase" },
  { now: false, label: "Occupancy & revenue analytics", note: "Later" },
];

export default function FuturePage() {
  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div>
            <Eyebrow>Concept · not implemented</Eyebrow>
            <h1 className="font-display mt-4 text-4xl leading-[1.05] text-ink sm:text-5xl">
              Where WhatsApp goes next
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
              Today every enquiry reaches a person. In the paid build, the WhatsApp
              Business API answers common questions instantly, quotes from live
              availability, and hands off to staff only when it should. The chat on the
              right is a scripted preview of that experience.
            </p>

            <div className="mt-8 rounded-[1.5rem] border border-hairline bg-paper p-1.5">
              <ul className="divide-y divide-hairline">
                {ROADMAP.map((r) => (
                  <li key={r.label} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        r.now ? "bg-sage text-white" : "border border-hairline text-faint"
                      }`}
                    >
                      {r.now ? <Icon.check width={13} height={13} /> : <Icon.sparkles width={12} height={12} />}
                    </span>
                    <span className="flex-1 text-[13.5px] text-ink">{r.label}</span>
                    <span
                      className={`text-[11px] ${r.now ? "text-sage" : "text-faint"}`}
                    >
                      {r.note}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <CtaButton href="/whatsapp" variant="whatsapp" icon="whatsapp">
                Try the live assistant
              </CtaButton>
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 self-center text-[13px] font-medium text-clay"
              >
                See the owner dashboard →
              </Link>
            </div>
          </div>

          <div className="lg:w-[400px]">
            <FutureChat />
          </div>
        </div>
      </div>
    </div>
  );
}
