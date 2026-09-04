"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Room } from "@/lib/data";
import { nights, bookingTotal, formatINR, formatDate } from "@/lib/pricing";
import { saveBooking } from "@/lib/bookings-store";
import { waLink, enquiryMessage } from "@/lib/whatsapp";
import { config } from "@/config";
import { Icon } from "@/components/icons";

const STEPS = ["Dates", "Your details", "Confirmed"];

export function BookingForm({
  room,
  checkIn,
  checkOut,
  guests,
}: {
  room: Room;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const router = useRouter();
  const n = nights(checkIn, checkOut);
  const total = bookingTotal(room.pricePerNight, n);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const nameOk = name.trim().length >= 2;
  const phoneOk = phone.replace(/\D/g, "").length >= 7;
  const datesOk = n > 0;
  const canSubmit = nameOk && phoneOk && datesOk && !submitting;

  if (!datesOk) {
    return (
      <div className="rounded-[1.75rem] border border-hairline bg-paper p-10 text-center">
        <p className="font-display text-2xl text-ink">Let's pick dates first</p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted">
          This page needs a check-in and check-out. Head back to the room and choose
          your dates.
        </p>
        <Link
          href={`/rooms/${room.id}`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-clay px-5 py-2.5 text-sm font-medium text-white"
        >
          <Icon.arrowLeft width={15} height={15} />
          Back to Room {room.id}
        </Link>
      </div>
    );
  }

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    const booking = saveBooking({
      guestName: name.trim(),
      guestPhone: phone.trim(),
      guestEmail: email.trim() || undefined,
      roomId: room.id,
      roomName: room.name,
      checkIn,
      checkOut,
      guests,
      nights: n,
      ratePerNight: room.pricePerNight,
      total,
      source: "web",
    });
    router.push(`/booking/confirmation?id=${booking.id}`);
  };

  return (
    <>
      <Link
        href={`/rooms/${room.id}`}
        className="group inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <Icon.arrowLeft
          width={14}
          height={14}
          className="transition-transform duration-300 group-hover:-translate-x-0.5"
        />
        Room {room.id}
      </Link>

      {/* Stepper */}
      <div className="mt-5 flex items-center gap-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <span
              className={`flex items-center gap-2 text-[12px] ${
                i <= 1 ? "text-ink" : "text-faint"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  i < 1
                    ? "bg-sage text-white"
                    : i === 1
                      ? "bg-clay text-white"
                      : "border border-hairline text-faint"
                }`}
              >
                {i < 1 ? <Icon.check width={11} height={11} /> : i + 1}
              </span>
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-hairline" />}
          </div>
        ))}
      </div>

      <h1 className="font-display mt-6 text-4xl leading-tight text-ink">Almost there</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Guest details */}
        <div className="rounded-[1.75rem] border border-hairline bg-paper p-1.5">
          <div className="rounded-[1.4rem] bg-sand/30 p-6 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.6)]">
            <h2 className="font-display text-xl text-ink">Guest details</h2>
            <p className="mt-1 text-[13px] text-muted">
              We'll send the confirmation here. No payment now — you pay at the property.
            </p>

            <div className="mt-6 space-y-4">
              <Field
                label="Full name"
                value={name}
                onChange={setName}
                placeholder="e.g. David Thomas"
                error={touched && !nameOk ? "Please enter your name" : ""}
              />
              <Field
                label="Phone (WhatsApp)"
                value={phone}
                onChange={setPhone}
                placeholder="+91 …"
                type="tel"
                error={touched && !phoneOk ? "Enter a valid phone number" : ""}
              />
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="optional"
                type="email"
                optional
              />
            </div>

            <button
              onClick={submit}
              disabled={submitting}
              className="group mt-7 flex w-full items-center justify-between rounded-full bg-clay py-3 pl-6 pr-2 text-sm font-medium text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-clay-dark active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Confirming…" : `Confirm booking · ${formatINR(total)}`}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 group-hover:translate-x-0.5">
                <Icon.check width={15} height={15} />
              </span>
            </button>
            <a
              href={waLink(
                enquiryMessage({
                  room: { id: room.id, name: room.name, pricePerNight: room.pricePerNight },
                  checkIn,
                  checkOut,
                  guests,
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-[#1f8a4c]/30 py-2.5 text-sm font-medium text-[#1a7a42] transition-colors hover:bg-[#1f8a4c]/[0.06]"
            >
              <Icon.whatsapp width={15} height={15} />
              Ask on WhatsApp instead
            </a>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 lg:h-max">
          <div className="overflow-hidden rounded-[1.75rem] border border-hairline bg-paper">
            <div className="relative h-40 w-full">
              <Image src={room.images[0]} alt={room.name} fill sizes="40vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              <div className="absolute bottom-3 left-4 text-white">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/70">
                  Room {room.id}
                </p>
                <p className="font-display text-lg">{room.name}</p>
              </div>
            </div>
            <dl className="divide-y divide-hairline text-[13px]">
              <Row label="Check-in" value={`${formatDate(checkIn)} · after ${config.property.checkIn}`} />
              <Row label="Check-out" value={`${formatDate(checkOut)} · by ${config.property.checkOut}`} />
              <Row label="Guests" value={String(guests)} />
              <Row label="Nights" value={String(n)} />
              <Row label="Rate" value={`${formatINR(room.pricePerNight)} / night`} />
              <div className="flex items-baseline justify-between px-5 py-4">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="font-display text-xl text-ink">{formatINR(total)}</dd>
              </div>
            </dl>
          </div>
          <p className="mt-3 flex items-center gap-2 px-1 text-[12px] text-faint">
            <Icon.shield width={14} height={14} className="text-sage" />
            Free cancellation up to 48 hours before check-in.
          </p>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error = "",
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
        {optional && <span className="font-normal normal-case tracking-normal text-faint">— optional</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1.5 w-full rounded-xl border bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-clay ${
          error ? "border-clay" : "border-hairline"
        }`}
      />
      {error && <span className="mt-1 block text-[12px] text-clay">{error}</span>}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
