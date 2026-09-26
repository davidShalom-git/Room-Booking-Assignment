"use client";

import { useActionState } from "react";
import { saveRoomAction, type FormState } from "@/app/admin/actions";
import { Field, inputCls } from "./field";
import { SubmitButton } from "./submit-button";
import { PhotoPicker } from "./photo-picker";

export type RoomFormValues = {
  id: string;
  name: string;
  type: string;
  pricePerNight: string;
  capacity: string;
  bed: string;
  ac: boolean;
  size: string;
  floor: string;
  shortDescription: string;
  description: string;
  amenities: string;
  images: string;
  active: boolean;
};

/** Create (existingId undefined) or edit a room. */
export function RoomForm({ initial, existingId }: { initial: RoomFormValues; existingId?: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveRoomAction, { n: 0 });
  // After a failed save, show what was submitted rather than the original values.
  const sv = state.values;
  const v = (k: keyof RoomFormValues) => (sv ? (sv[k] ?? "") : String(initial[k]));
  const checked = (k: "ac" | "active") => (sv ? sv[k] === "on" : initial[k]);
  const bad = (f: string) => state.field === f;
  const photos = v("images").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  return (
    <form key={state.n} action={action} className="mt-6 space-y-6">
      {existingId && <input type="hidden" name="existingId" value={existingId} />}
      {state.error && (
        <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
          {state.error}
        </p>
      )}

      <section className="space-y-4 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Room number" error={bad("id")} hint={existingId ? "Can't be changed." : "Shown on the door QR."}>
            <input
              name="id"
              defaultValue={existingId ?? v("id")}
              disabled={!!existingId}
              required
              maxLength={8}
              className={inputCls(bad("id"))}
            />
          </Field>
          <Field label="Name" error={bad("name")}>
            <input name="name" defaultValue={v("name")} required maxLength={80} className={inputCls(bad("name"))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Price / night (₹)" error={bad("pricePerNight")}>
            <input name="pricePerNight" inputMode="numeric" pattern="[0-9]*" defaultValue={v("pricePerNight")} required className={inputCls(bad("pricePerNight"))} />
          </Field>
          <Field label="Sleeps" error={bad("capacity")}>
            <input name="capacity" type="number" min={1} max={20} defaultValue={v("capacity")} required className={inputCls(bad("capacity"))} />
          </Field>
          <Field label="Floor" error={bad("floor")}>
            <input name="floor" type="number" defaultValue={v("floor")} className={inputCls(bad("floor"))} />
          </Field>
          <Field label="Size" error={bad("size")}>
            <input name="size" defaultValue={v("size")} placeholder="24 m²" className={inputCls(bad("size"))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" error={bad("type")} hint="e.g. Deluxe Double">
            <input name="type" defaultValue={v("type")} className={inputCls(bad("type"))} />
          </Field>
          <Field label="Beds" error={bad("bed")} hint="e.g. King Bed, or 2 Single Beds">
            <input name="bed" defaultValue={v("bed")} required className={inputCls(bad("bed"))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6 pt-1">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" name="ac" defaultChecked={checked("ac")} className="h-4 w-4 accent-clay" />
            Air conditioned
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" name="active" defaultChecked={checked("active")} className="h-4 w-4 accent-clay" />
            Bookable (shown on the site and in the chat)
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6">
        <Field label="One-line description" error={bad("shortDescription")}>
          <input name="shortDescription" defaultValue={v("shortDescription")} required maxLength={200} className={inputCls(bad("shortDescription"))} />
        </Field>
        <Field label="Full description" error={bad("description")}>
          <textarea name="description" defaultValue={v("description")} required rows={5} className={inputCls(bad("description"))} />
        </Field>
        <Field label="Amenities" error={bad("amenities")} hint="One per line (or comma-separated).">
          <textarea name="amenities" defaultValue={v("amenities")} rows={5} className={inputCls(bad("amenities"))} />
        </Field>
        <div>
          <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${bad("images") ? "text-clay" : "text-faint"}`}>Photos</span>
          <p className="mb-2 mt-0.5 text-[11.5px] text-faint">Take them on your phone or pick from the gallery. The first is the cover photo (tap ★ to change it).</p>
          <PhotoPicker name="images" initial={photos} max={12} error={bad("images")} />
        </div>
      </section>

      <div className="flex justify-end">
        <SubmitButton
          pendingText="Saving…"
          className="rounded-full bg-clay px-6 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-clay-dark"
        >
          {existingId ? "Save changes" : "Add room"}
        </SubmitButton>
      </div>
    </form>
  );
}
