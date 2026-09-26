"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked: the text is still selectable */
        }
      }}
      className="shrink-0 rounded-full border border-hairline px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.04]"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
