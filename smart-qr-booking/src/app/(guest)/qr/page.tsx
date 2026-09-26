import type { Metadata } from "next";
import { getRooms } from "@/lib/rooms";
import { config, roomUrl } from "@/config";
import { qrSvg, qrPng } from "@/lib/qr";
import { QrCard } from "@/components/qr-card";
import { siteSettings } from "@/lib/site-settings";
import { Eyebrow } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Scan to book",
  description: "Every room has its own QR code — scan it to open that room's page and book in the chat.",
};

export default async function QrPage() {
  const [rooms, s] = await Promise.all([getRooms(), siteSettings()]);
  const cards = await Promise.all(
    rooms.map(async (room) => ({
      room,
      svg: await qrSvg(roomUrl(room.id)),
      png: await qrPng(roomUrl(room.id)),
    })),
  );

  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>Scan to book</Eyebrow>
        <h1 className="font-display mt-4 max-w-2xl text-4xl leading-[1.05] text-ink sm:text-5xl">
          One code per door
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Point your phone camera at a room's code. That room's page opens — photos, price
          and live availability — and our assistant takes it from there in the chat. You'll
          find the same codes on every door.
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <Icon.scan width={15} height={15} className="text-clay" /> Scans open{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-[12px] text-ink">
              {config.baseUrl.replace(/^https?:\/\//, "")}/rooms/…
            </code>
          </span>
          <span className="flex items-center gap-1.5">
            <Icon.download width={15} height={15} className="text-clay" /> Download each as PNG
          </span>
        </div>

        <div className="mt-12 grid gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ room, svg, png }, i) => (
            <Reveal key={room.id} delay={i * 60}>
              <QrCard room={room} svg={svg} png={png} propertyName={s.name} />
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
