import type { Metadata } from "next";
import { rooms } from "@/lib/data";
import { config } from "@/config";
import { qrLink } from "@/lib/whatsapp";
import { qrSvg, qrPng } from "@/lib/qr";
import { QrCard } from "@/components/qr-card";
import { Eyebrow } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Smart QR demo",
  description: "Every room has its own QR code — a scan opens WhatsApp with that room's enquiry.",
};

export default async function QrPage() {
  const cards = await Promise.all(
    rooms.map(async (room) => ({
      room,
      svg: await qrSvg(qrLink(room)),
      png: await qrPng(qrLink(room)),
    })),
  );
  const toWhatsapp = config.qrTarget === "whatsapp";

  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>Smart QR experience</Eyebrow>
        <h1 className="font-display mt-4 max-w-2xl text-4xl leading-[1.05] text-ink sm:text-5xl">
          One code per door
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          {toWhatsapp ? (
            <>
              These are real, working QR codes. Point your phone at one — your WhatsApp
              opens with a message about that exact room, addressed to the property.
              Hit send and it lands on the front-desk phone. Printed as small table
              cards or door stickers.
            </>
          ) : (
            <>
              These are real, working QR codes. A scan opens that room&apos;s page on
              this site, ready to book or enquire.
            </>
          )}
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            {toWhatsapp ? (
              <>
                <Icon.whatsapp width={15} height={15} className="text-clay" /> Scans open{" "}
                <code className="rounded bg-sand px-1.5 py-0.5 text-[12px] text-ink">
                  wa.me/{config.whatsappNumber}
                </code>
              </>
            ) : (
              <>
                <Icon.scan width={15} height={15} className="text-clay" /> Scans open{" "}
                <code className="rounded bg-sand px-1.5 py-0.5 text-[12px] text-ink">
                  {config.baseUrl.replace(/^https?:\/\//, "")}/rooms/…
                </code>
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon.download width={15} height={15} className="text-clay" /> Download each as PNG
          </span>
        </div>

        <div className="mt-12 grid gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ room, svg, png }, i) => (
            <Reveal key={room.id} delay={i * 60}>
              <QrCard room={room} svg={svg} png={png} />
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
