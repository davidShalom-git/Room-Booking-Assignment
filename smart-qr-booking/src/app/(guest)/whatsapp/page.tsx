import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";
import { WhatsappChat } from "@/components/whatsapp-chat";
import { config } from "@/config";

export const metadata: Metadata = {
  title: "WhatsApp assistant",
  description:
    "A working simulation: connect the property dataset, ask questions, and complete a booking in chat.",
};

const POINTS = [
  {
    icon: "grid" as const,
    title: "Upload the dataset",
    body: "Point the assistant at your rooms, prices and availability. Here it's property-rooms.json — tap Connect in the chat.",
  },
  {
    icon: "whatsapp" as const,
    title: "Guests just ask",
    body: "“Rooms under ₹1500”, “Is Room 201 free next weekend for 2?”, “Book the family room”. Answers come from the data.",
  },
  {
    icon: "checkCircle" as const,
    title: "Booking lands everywhere",
    body: "Confirm in chat and the guest gets name, dates, duration and guests back — and it appears in the admin bookings list.",
  },
];

export default function WhatsappPage() {
  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div className="lg:pt-4">
            <Eyebrow>WhatsApp enquiry · live simulation</Eyebrow>
            <h1 className="font-display mt-4 text-4xl leading-[1.05] text-ink sm:text-5xl">
              Chat that actually knows your rooms
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
              This is a working demo of the intended flow — not a live WhatsApp Business
              connection. The replies are generated from the same room data that powers
              the rest of the site.
            </p>

            <div className="mt-8 space-y-3">
              {POINTS.map((p, i) => {
                const IconCmp = Icon[p.icon];
                return (
                  <div
                    key={p.title}
                    className="flex gap-3.5 rounded-2xl border border-hairline bg-paper px-4 py-3.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-clay">
                      <IconCmp width={16} height={16} />
                    </span>
                    <div>
                      <p className="text-[14px] font-medium text-ink">
                        {i + 1}. {p.title}
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{p.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 rounded-2xl border border-hairline bg-sand/40 p-4">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">
                <Icon.sparkles width={14} height={14} /> Try these
              </p>
              <ul className="mt-2 space-y-1 text-[13px] text-muted">
                <li>“Rooms under ₹1500”</li>
                <li>“Is breakfast included?”</li>
                <li>“Book Room 101” → give a name → pick dates → “confirm”</li>
              </ul>
            </div>

            <Link
              href="/future"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-clay"
            >
              <Icon.sparkles width={14} height={14} />
              See the full future-automation concept
            </Link>
          </div>

          <div className="lg:w-[400px]">
            <WhatsappChat />
            <p className="mt-4 text-center text-[11px] text-faint">
              Simulated {config.property.name} assistant · no messages leave your browser
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
