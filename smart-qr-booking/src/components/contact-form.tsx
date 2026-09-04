"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-sage-soft px-4 py-4 text-[14px] text-sage">
        <Icon.checkCircle width={18} height={18} />
        Thanks — we&apos;ll be in touch shortly. (Demo: nothing was actually sent.)
      </div>
    );
  }

  return (
    <form
      className="mt-5 space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      {[
        { label: "Name", type: "text", ph: "Your name" },
        { label: "Phone or email", type: "text", ph: "How we reach you" },
      ].map((f) => (
        <label key={f.label} className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            {f.label}
          </span>
          <input
            required
            type={f.type}
            placeholder={f.ph}
            className="mt-1.5 w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-clay"
          />
        </label>
      ))}
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
          Message
        </span>
        <textarea
          required
          rows={4}
          placeholder="Dates, room, anything you'd like to know…"
          className="mt-1.5 w-full resize-none rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-clay"
        />
      </label>
      <button
        type="submit"
        className="group flex w-full items-center justify-between rounded-full bg-clay py-2.5 pl-6 pr-2 text-sm font-medium text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-clay-dark active:scale-[0.98]"
      >
        Send message
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 group-hover:translate-x-0.5">
          <Icon.arrowRight width={15} height={15} />
        </span>
      </button>
    </form>
  );
}
