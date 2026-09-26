"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/admin/actions";
import { Field, inputCls } from "./field";
import { SubmitButton } from "./submit-button";
import { PhotoPicker } from "./photo-picker";

export type SettingsValues = Record<
  | "name" | "tagline" | "city" | "address" | "phone" | "email" | "about" | "directions" | "amenities"
  | "rating" | "reviews" | "checkInTime" | "checkOutTime" | "advancePercent" | "upiId" | "upiName" | "photos",
  string
>;

const section = "space-y-4 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6";
const heading = "font-display text-xl text-ink";

/** The property's details: what the website, the chat and the pay page show. */
export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettingsAction, { n: 0 });
  // After a failed save, show what was submitted rather than the saved values.
  const v = (k: keyof SettingsValues) => state.values?.[k] ?? initial[k];
  const bad = (f: keyof SettingsValues) => state.field === f;

  return (
    <form key={state.n} action={action} className="mt-6 space-y-6">
      {state.error && (
        <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-2xl border border-sage/25 bg-sage-soft px-4 py-3 text-[13px] text-sage">
          {state.message}
        </p>
      )}

      <section className={section}>
        <h2 className={heading}>Your property</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={bad("name")}>
            <input name="name" defaultValue={v("name")} required maxLength={80} className={inputCls(bad("name"))} />
          </Field>
          <Field label="Town, state" error={bad("city")} hint="e.g. Munnar, Kerala">
            <input name="city" defaultValue={v("city")} required maxLength={60} className={inputCls(bad("city"))} />
          </Field>
        </div>
        <Field label="Tagline" error={bad("tagline")} hint="One line, shown in search results and at the top of the About page.">
          <input name="tagline" defaultValue={v("tagline")} required maxLength={120} className={inputCls(bad("tagline"))} />
        </Field>
        <Field label="About the place" error={bad("about")} hint="A few lines for the home and About pages.">
          <textarea name="about" defaultValue={v("about")} required rows={4} maxLength={600} className={inputCls(bad("about"))} />
        </Field>
        <Field label="Address" error={bad("address")}>
          <input name="address" defaultValue={v("address")} required maxLength={200} className={inputCls(bad("address"))} />
        </Field>
        <Field label="Getting here (optional)" error={bad("directions")} hint="e.g. Bus stand 9 km — we can pick you up.">
          <input name="directions" defaultValue={v("directions")} maxLength={300} className={inputCls(bad("directions"))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Front-desk phone" error={bad("phone")} hint="Guests see it on the site and in the chat.">
            <input name="phone" type="tel" defaultValue={v("phone")} required className={inputCls(bad("phone"))} />
          </Field>
          <Field label="Email (optional)" error={bad("email")}>
            <input name="email" type="email" defaultValue={v("email")} maxLength={120} className={inputCls(bad("email"))} />
          </Field>
        </div>
        <Field label="What you offer" error={bad("amenities")} hint="One per line, up to 12 — e.g. Free WiFi, Breakfast included. The chat uses this to answer questions.">
          <textarea name="amenities" defaultValue={v("amenities")} rows={5} className={inputCls(bad("amenities"))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Guest rating (optional)" error={bad("rating")} hint="e.g. 4.6 out of 5">
            <input name="rating" inputMode="decimal" defaultValue={v("rating")} className={inputCls(bad("rating"))} />
          </Field>
          <Field label="Number of reviews (optional)" error={bad("reviews")}>
            <input name="reviews" inputMode="numeric" pattern="[0-9]*" defaultValue={v("reviews")} className={inputCls(bad("reviews"))} />
          </Field>
        </div>
      </section>

      <section className={section}>
        <h2 className={heading}>Stays and payment</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Check-in from" error={bad("checkInTime")}>
            <input name="checkInTime" type="time" defaultValue={v("checkInTime")} required className={inputCls(bad("checkInTime"))} />
          </Field>
          <Field label="Check-out by" error={bad("checkOutTime")}>
            <input name="checkOutTime" type="time" defaultValue={v("checkOutTime")} required className={inputCls(bad("checkOutTime"))} />
          </Field>
          <Field label="Advance (%)" error={bad("advancePercent")} hint="Paid by UPI to hold a room.">
            <input name="advancePercent" type="number" min={10} max={100} defaultValue={v("advancePercent")} required className={inputCls(bad("advancePercent"))} />
          </Field>
        </div>
        <p className="text-[12px] text-faint">New times and advance apply to new bookings; existing bookings keep theirs.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="UPI ID" error={bad("upiId")} hint="Where guests pay, e.g. yourname@oksbi">
            <input name="upiId" defaultValue={v("upiId")} required autoCapitalize="none" spellCheck={false} className={inputCls(bad("upiId"))} />
          </Field>
          <Field label="Name on the UPI account" error={bad("upiName")}>
            <input name="upiName" defaultValue={v("upiName")} required maxLength={60} className={inputCls(bad("upiName"))} />
          </Field>
        </div>
      </section>

      <section className={section}>
        <h2 className={heading}>Photos of the place</h2>
        <p className="-mt-2 text-[12.5px] text-faint">
          Shown on the home and About pages; the first is the big cover photo (tap ★ to change it). Without any, room photos are used.
        </p>
        <PhotoPicker name="photos" initial={v("photos").split("\n").filter(Boolean)} max={6} error={bad("photos")} />
      </section>

      <div className="sticky bottom-3 flex justify-end">
        <SubmitButton
          pendingText="Saving…"
          className="rounded-full bg-clay px-6 py-2.5 text-[14px] font-medium text-white shadow-[var(--shadow-soft)] transition-colors hover:bg-clay-dark"
        >
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
