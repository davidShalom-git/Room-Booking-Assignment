import type { Metadata } from "next";
import Link from "next/link";
import { getRoom } from "@/lib/data";
import { Eyebrow } from "@/components/section-heading";
import { Icon } from "@/components/icons";
import { WaConversation } from "@/components/wa-conversation";
import { config } from "@/config";

export const metadata: Metadata = {
  title: "WhatsApp assistant",
  description:
    "The whole booking journey in chat — guest and front desk, both phones, including extend / check-out / room moves.",
};

const STEPS = [
  "Guest scans the room QR → WhatsApp opens on that room.",
  "They ask questions and book — name, phone, dates & times, guests.",
  "The front desk gets the booking on their WhatsApp instantly.",
  "On the last evening the guest is asked: extend or check out?",
  "Extend → the desk approves, or moves the guest to a free room if it's re-booked.",
];

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.room) ? sp.room[0] : sp.room;
  const roomId = raw && getRoom(raw) ? raw : "101";

  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <Eyebrow>WhatsApp-first · working simulation</Eyebrow>
          <h1 className="font-display mt-4 text-4xl leading-[1.05] text-ink sm:text-5xl">
            The whole stay, run from WhatsApp
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Two phones below: the <strong className="text-ink">guest</strong> and the{" "}
            <strong className="text-ink">front desk</strong>. Every step lands on both.
            This is a simulation of the intended flow — a live build wires the same
            messages to the WhatsApp Business API and a booking backend.
          </p>
          <ol className="mt-6 space-y-1.5 text-[13px] text-muted">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sand text-[10px] font-semibold text-clay">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 text-[12px] text-faint">
            <Icon.sliders width={13} height={13} />
            Use “Demo controls” to jump to the last-day and extend steps without waiting.
          </p>
        </div>

        <div className="mt-10">
          <WaConversation roomId={roomId} />
        </div>

        <p className="mt-6 text-center text-[12px] text-faint">
          Simulated {config.property.name} WhatsApp · nothing leaves your browser ·{" "}
          <Link href="/future" className="text-clay">
            what comes after this →
          </Link>
        </p>
      </div>
    </div>
  );
}
