"use client";

import { useActionState } from "react";
import { importAction, type ImportState } from "@/app/admin/actions";
import { SubmitButton } from "./submit-button";

const SAMPLE = `room,guest name,phone,check-in,check-out,guests,advance paid
101,Meera Pillai,+91 98470 11111,12/10/2026,14/10/2026,2,1800
203,Kumar S,9847022222,2026-10-20,2026-10-23,3,0`;

export function ImportForm() {
  const [state, action] = useActionState<ImportState, FormData>(importAction, { n: 0 });
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">CSV file</span>
          <input name="file" type="file" accept=".csv,text/csv" className="mt-1.5 block w-full text-[13px] text-muted file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-1.5 file:text-[12px] file:text-cream" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">…or paste the rows</span>
          <textarea
            name="csv"
            rows={7}
            placeholder={SAMPLE}
            className="mt-1.5 w-full rounded-xl border border-hairline bg-paper px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-clay"
          />
        </label>
        <p className="text-[12px] text-faint">
          Upload a CSV file, or select the rows in Excel or Google Sheets, copy and paste them here (with or without the
          header row). Columns, in this order: room, guest name, phone, check-in, check-out, guests, advance paid. Dates
          are day first and need the full year (12/10/2026, 12-Oct-2026, 12 Oct 2026 or 2026-10-12). Each row becomes a
          confirmed booking; rows that clash with existing bookings are listed and skipped.
        </p>
        {state.error && (
          <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
            {state.error}
          </p>
        )}
        <SubmitButton pendingText="Importing…" className="rounded-full bg-clay px-6 py-2.5 text-[14px] font-medium text-white">
          Import bookings
        </SubmitButton>
      </form>

      {(state.created || state.errors) && (
        <div className="space-y-3" role="status">
          <p className="rounded-2xl border border-sage/25 bg-sage-soft px-4 py-3 text-[13px] text-sage">
            {state.created?.length ?? 0} booking{state.created?.length === 1 ? "" : "s"} imported
            {state.created && state.created.length > 0 ? `: ${state.created.join(", ")}` : "."}
          </p>
          {state.errors && state.errors.length > 0 && (
            <div className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
              <p className="font-medium">{state.errors.length} row{state.errors.length === 1 ? "" : "s"} skipped:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {state.errors.map((e) => (
                  <li key={e.line}>
                    Line {e.line}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
