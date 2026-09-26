import type { Metadata } from "next";
import { siteSettings } from "@/lib/site-settings";
import { phonePretty } from "@/lib/phone";
import type { Settings } from "@/lib/settings";

export const metadata: Metadata = { title: "Privacy policy" };

const sections = (P: Settings): { id?: string; title: string; body: string[] }[] => [
  {
    title: "What we collect",
    body: [
      "When you book or ask about a room in the chat on this website, we keep your name, your mobile number, the number of guests, your dates, and the messages you send in the chat.",
      "When you pay, we keep the amount and the UPI reference (UTR) you give us so the front desk can match your payment. We never see or store your UPI PIN, card or bank details: you pay in your own UPI app.",
      "The chat uses a cookie to remember your conversation on this device. We don't use advertising or tracking cookies.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To hold and confirm your booking, record what you've paid, answer you in the chat, remind you the day before check-out, call you if something needs sorting out, and meet our legal and tax obligations as a hotel.",
      "The front desk may also send your confirmation to the mobile number you gave, for example on WhatsApp from its own phone.",
      "We don't sell your information and don't use it for advertising.",
    ],
  },
  {
    title: "Who else handles it",
    body: [
      "Our website and database are hosted by Vercel and Neon, and the front desk gets booking and payment alerts on its phone through the phone's notification service. They process your information only to provide those services to us.",
      "We share guest details with authorities only where the law requires it, for example guest registration rules for hotels in India.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "Booking and payment records are kept for as long as the law requires us to keep accounts (normally up to 8 years). Chat messages are deleted after 12 months.",
    ],
  },
  {
    id: "delete",
    title: "Your choices — and deleting your data",
    body: [
      `You can ask to see, correct or delete the information we hold about you. Call us on ${phonePretty(P.phone)}${P.email ? ` or email ${P.email}` : ""} with the mobile number you booked with, and we'll reply within 30 days. We'll delete everything we aren't legally required to keep.`,
    ],
  },
  {
    title: "Security",
    body: [
      "Your information is stored in an access-controlled database; the owner's console is password-protected, and connections to this website are encrypted (HTTPS).",
    ],
  },
  {
    title: "Changes and contact",
    body: [
      `If we change this policy we'll update this page. Questions: ${[`${P.name}, ${P.address}`, phonePretty(P.phone), P.email].filter(Boolean).join(" · ")}.`,
    ],
  },
];

export default async function PrivacyPage() {
  const P = await siteSettings();
  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">{P.name}</p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-ink">Privacy policy</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          How {P.name} uses the information you share when you book or chat with us. Last updated 26 September 2026.
        </p>
        <div className="mt-10 space-y-9">
          {sections(P).map((s) => (
            <section key={s.title} id={s.id} className="scroll-mt-28">
              <h2 className="font-display text-2xl text-ink">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p.slice(0, 24)} className="mt-3 text-[15px] leading-relaxed text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
