import Link from "next/link";
import { config } from "@/config";
import { Icon } from "@/components/icons";
import { waLink, enquiryMessage } from "@/lib/whatsapp";

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
            <a
              href={waLink(enquiryMessage({}))}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#1f8a4c] px-4 py-2 text-[13px] font-medium text-white"
            >
              <Icon.whatsapp width={15} height={15} />
              Chat on WhatsApp
            </a>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
              Explore
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li><Link href="/rooms" className="hover:text-ink">Rooms</Link></li>
              <li><Link href="/qr" className="hover:text-ink">Scan demo</Link></li>
              <li><Link href="/whatsapp" className="hover:text-ink">WhatsApp assistant</Link></li>
              <li><Link href="/future" className="hover:text-ink">Future automation</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
              Contact
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <Icon.phone width={14} height={14} /> {config.property.phone}
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
          <p>© {new Date().getFullYear()} {config.property.name}. Demo prototype — not a live booking service.</p>
          <p>Smart QR Booking + WhatsApp Enquiry · MVP concept</p>
        </div>
      </div>
    </footer>
  );
}
