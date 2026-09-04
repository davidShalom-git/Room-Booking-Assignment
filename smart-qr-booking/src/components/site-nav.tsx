"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { config } from "@/config";
import { waLink, enquiryMessage } from "@/lib/whatsapp";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/rooms", label: "Rooms" },
  { href: "/qr", label: "Scan Demo" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4">
        <nav
          className={`pointer-events-auto mt-4 flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-white/50 px-4 py-2 pl-5 backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            scrolled
              ? "bg-cream/80 shadow-[0_10px_40px_-16px_rgba(38,33,25,0.28)]"
              : "bg-cream/55"
          }`}
        >
          <Link
            href="/"
            className="font-display text-[15px] font-medium tracking-tight text-ink"
          >
            {config.property.name}
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-[13px] transition-colors duration-300 ${
                  isActive(l.href)
                    ? "bg-ink/[0.06] text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={waLink(enquiryMessage({}))}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full bg-[#1f8a4c] px-3.5 py-1.5 text-[12px] font-medium text-white transition-transform duration-300 hover:scale-[1.03] sm:inline-flex"
            >
              <Icon.whatsapp width={14} height={14} />
              WhatsApp
            </a>
            <button
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-ink md:hidden"
            >
              <span
                className={`absolute h-px w-4 bg-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  open ? "rotate-45" : "-translate-y-1"
                }`}
              />
              <span
                className={`absolute h-px w-4 bg-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  open ? "-rotate-45" : "translate-y-1"
                }`}
              />
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 flex flex-col justify-center bg-cream/85 px-8 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex flex-col gap-2">
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-display text-4xl text-ink transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                transitionDelay: open ? `${80 + i * 55}ms` : "0ms",
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(20px)",
              }}
            >
              {l.label}
            </Link>
          ))}
          <a
            href={waLink(enquiryMessage({}))}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex w-max items-center gap-2 rounded-full bg-[#1f8a4c] px-5 py-3 text-sm font-medium text-white transition-all duration-500"
            style={{
              transitionDelay: open ? `${80 + LINKS.length * 55}ms` : "0ms",
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0)" : "translateY(20px)",
            }}
          >
            <Icon.whatsapp width={16} height={16} />
            Chat on WhatsApp
          </a>
        </div>
      </div>
    </>
  );
}
