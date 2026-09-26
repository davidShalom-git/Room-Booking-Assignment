"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** Longest side after resizing: sharp on any phone, a few hundred KB to upload. */
const MAX_SIDE = 1600;

/** Shrink a photo in the browser before upload (phone photos are often 5–10 MB). */
async function resize(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file; // the server still checks it's a real JPEG / PNG / WebP
  }
}

/**
 * Photos for a form: upload from the phone (camera roll or camera), reorder the cover, remove.
 * Submits as `name` — one photo URL per line — like a textarea would.
 */
export function PhotoPicker({ name, initial, max, error }: { name: string; initial: string[]; max: number; error?: boolean }) {
  const [urls, setUrls] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setProblem(null);
    const list = [...files].slice(0, max - urls.length);
    if (list.length < files.length) setProblem(`Up to ${max} photos — the extra ones were skipped.`);
    for (const [i, file] of list.entries()) {
      setBusy(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : "Uploading…");
      const body = new FormData();
      body.append("photo", await resize(file), "photo.jpg");
      try {
        const res = await fetch("/api/owner/photos", { method: "POST", body });
        const r = (await res.json()) as { ok: boolean; url?: string; error?: string };
        if (!r.ok || !r.url) {
          setProblem(r.error ?? "That photo couldn't be uploaded.");
          continue;
        }
        setUrls((u) => [...u, r.url!]);
      } catch {
        setProblem("No connection — check your internet and try again.");
        break;
      }
    }
    setBusy(null);
  }

  const move = (i: number) => setUrls((u) => [u[i]!, ...u.filter((_, k) => k !== i)]);
  const remove = (i: number) => setUrls((u) => u.filter((_, k) => k !== i));

  return (
    <div>
      <input type="hidden" name={name} value={urls.join("\n")} />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {urls.map((src, i) => (
          <div key={src + i} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-hairline bg-sand">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploads and owner-supplied links */}
            <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium text-cream">Cover</span>
            )}
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => move(i)}
                  aria-label={`Make photo ${i + 1} the cover`}
                  title="Make this the cover photo"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-cream/90 text-ink shadow-sm"
                >
                  <Icon.star width={12} height={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-cream/90 text-ink shadow-sm"
              >
                <Icon.x width={12} height={12} />
              </button>
            </div>
          </div>
        ))}
        {urls.length < max && (
          <label
            className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-[12px] transition-colors hover:border-clay hover:text-clay ${
              error ? "border-clay text-clay" : "border-hairline text-muted"
            } ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <Icon.download width={16} height={16} className="rotate-180" />
            {busy ?? "Add photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={!!busy}
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-[12px] text-clay">
          {problem}
        </p>
      )}
    </div>
  );
}
