import Link from "next/link";
import { config } from "@/config";
import { Icon } from "@/components/icons";
import { ChatCta } from "@/components/chat-cta";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-hairline bg-sand/50">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-display text-2xl text-ink">{config.property.name}</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              {config.property.tagline}. {config.property.address}.
            </p>
            <ChatCta className="mt-5">Chat to book</ChatCta>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
              Explore
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li><Link href="/rooms" className="hover:text-ink">Rooms</Link></li>
              <li><Link href="/qr" className="hover:text-ink">Scan to book</Link></li>
              <li><Link href="/about" className="hover:text-ink">About</Link></li>
              <li><Link href="/contact" className="hover:text-ink">Contact</Link></li>
              <li><Link href="/privacy" className="hover:text-ink">Privacy</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
              Contact
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li>
                <a href={`tel:${config.property.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-ink">
                  <Icon.phone width={14} height={14} /> {config.property.phone}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Icon.mail width={14} height={14} /> {config.property.email}
              </li>
              <li className="flex items-center gap-2">
                <Icon.mapPin width={14} height={14} /> {config.property.city}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-hairline pt-6 text-[12px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {config.property.name}. All rights reserved.</p>
          <p>Book in the chat on any page · pay by UPI · {config.property.phone}</p>
        </div>
      </div>
    </footer>
  );
}
