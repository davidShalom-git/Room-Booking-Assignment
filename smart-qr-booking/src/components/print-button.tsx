"use client";

import { Icon } from "@/components/icons";

export function PrintButton({ label = "Print sheet" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.03] print:hidden"
    >
      <Icon.download width={15} height={15} />
      {label}
    </button>
  );
}
