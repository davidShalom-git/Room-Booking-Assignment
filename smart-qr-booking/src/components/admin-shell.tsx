"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { config } from "@/config";
import { logout } from "@/app/admin/actions";
import { Icon, type IconName } from "@/components/icons";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/today", label: "Today", icon: "bell" },
  { href: "/admin", label: "Dashboard", icon: "gauge" },
  { href: "/admin/bookings", label: "Bookings", icon: "calendar" },
  { href: "/admin/payments", label: "Payments", icon: "checkCircle" },
  { href: "/admin/customers", label: "Customers", icon: "users" },
  { href: "/admin/rooms", label: "Rooms", icon: "grid" },
  { href: "/admin/qr", label: "QR Codes", icon: "qr" },
  { href: "/admin/import", label: "Import", icon: "download" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col md:flex-row">
      {/* Sidebar / top bar */}
      <aside className="border-b border-hairline bg-paper md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
          <div>
            <p className="font-display text-[15px] text-ink">{config.property.name}</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Owner console</p>
          </div>
          <form action={logout} className="md:hidden">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-ink"
            >
              <Icon.logout width={12} height={12} />
              Sign out
            </button>
          </form>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
          {NAV.map((n) => {
            const IconCmp = Icon[n.icon];
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors duration-200 ${
                  active(n.href)
                    ? "bg-ink text-cream"
                    : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <IconCmp width={15} height={15} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden px-3 pt-6 md:block">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            <Icon.arrowUpRight width={14} height={14} />
            View website
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
            >
              <Icon.logout width={14} height={14} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
