import type { Metadata } from "next";
import { config } from "@/config";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";
import { waLink, enquiryMessage } from "@/lib/whatsapp";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const items = [
    { icon: "whatsapp" as const, label: "WhatsApp", value: config.property.phone, href: waLink(enquiryMessage({})) },
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
              <h2 className="font-display text-xl text-ink">Send a message</h2>
              <p className="mt-1 text-[13px] text-muted">
                Demo form — in production this drops into your inbox or WhatsApp.
              </p>
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
