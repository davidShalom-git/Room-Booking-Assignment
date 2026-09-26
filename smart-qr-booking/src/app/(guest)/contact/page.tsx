import type { Metadata } from "next";
import { config } from "@/config";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";
import { ChatCta } from "@/components/chat-cta";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const items = [
    { icon: "phone" as const, label: "Call the front desk", value: config.property.phone, href: `tel:${config.property.phone.replace(/\s/g, "")}` },
    { icon: "mail" as const, label: "Email", value: config.property.email, href: `mailto:${config.property.email}` },
    { icon: "mapPin" as const, label: "Address", value: config.property.address },
  ];

  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>We usually reply within minutes</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-[1.05] text-ink sm:text-5xl">
          Get in touch
        </h1>

        <div className="mt-10 grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            {items.map((it) => {
              const IconCmp = Icon[it.icon];
              const inner = (
                <div className="flex items-start gap-3.5 rounded-2xl border border-hairline bg-paper px-4 py-4 transition-colors hover:bg-ink/[0.02]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-clay">
                    <IconCmp width={16} height={16} />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                      {it.label}
                    </p>
                    <p className="mt-0.5 text-[14px] text-ink">{it.value}</p>
                  </div>
                </div>
              );
              return it.href ? (
                <a
                  key={it.label}
                  href={it.href}
                  target={it.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                >
                  {inner}
                </a>
              ) : (
                <div key={it.label}>{inner}</div>
              );
            })}
          </div>

          <div className="rounded-[1.75rem] border border-hairline bg-paper p-1.5">
            <div className="rounded-[1.4rem] bg-sand/30 p-6">
              <h2 className="font-display text-xl text-ink">The quickest way: the chat</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                Ask about a room, check live availability and book — all in one chat.
                We hold your room while you pay a 50% advance by UPI; the balance is
                paid at check-in.
              </p>
              <ul className="mt-5 space-y-2 text-[13px] text-muted">
                <li className="flex items-center gap-2"><Icon.check width={14} height={14} className="text-sage" /> Check-in from {config.property.checkIn}, check-out by {config.property.checkOut}</li>
                <li className="flex items-center gap-2"><Icon.check width={14} height={14} className="text-sage" /> Front desk open 24 × 7</li>
                <li className="flex items-center gap-2"><Icon.check width={14} height={14} className="text-sage" /> Extend your stay from the same chat</li>
              </ul>
              <div className="mt-6">
                <ChatCta>Chat to book</ChatCta>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
