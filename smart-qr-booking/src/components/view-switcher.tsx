"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

/** Floating pill to jump between the guest site and the admin demo. */
export function ViewSwitcher() {
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin");

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div className="flex items-center gap-1 rounded-full border border-white/50 bg-cream/80 p-1 pl-3 text-[12px] shadow-[0_12px_40px_-16px_rgba(38,33,25,0.35)] backdrop-blur-xl">
        <span className="mr-1 hidden font-medium text-muted sm:inline">
          Demo view
        </span>
        <Link
          href="/"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-300 ${
            inAdmin ? "text-muted hover:text-ink" : "bg-ink text-cream"
          }`}
        >
          <Icon.scan width={13} height={13} />
          Guest
        </Link>
        <Link
          href="/admin"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-300 ${
            inAdmin ? "bg-ink text-cream" : "text-muted hover:text-ink"
          }`}
        >
          <Icon.gauge width={13} height={13} />
          Admin
        </Link>
      </div>
    </div>
  );
}
