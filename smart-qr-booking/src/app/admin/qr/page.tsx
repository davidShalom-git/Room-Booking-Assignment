import { rooms } from "@/lib/data";
import { roomUrl, config } from "@/config";
import { qrSvg, qrPng } from "@/lib/qr";
import { QrCard } from "@/components/qr-card";
import { PrintButton } from "@/components/print-button";
import { Icon } from "@/components/icons";

export const metadata = { title: "QR Codes" };

export default async function AdminQrPage() {
  const cards = await Promise.all(
    rooms.map(async (room) => ({
      room,
      svg: await qrSvg(roomUrl(room.id)),
      png: await qrPng(roomUrl(room.id)),
    })),
  );

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Room QR codes</h1>
          <p className="mt-1 max-w-lg text-[13px] text-muted">
            One code per room, each pointing at its live page. Download individually or
            print the whole sheet for the doors.
          </p>
        </div>
        <PrintButton />
      </header>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-hairline bg-sand/40 px-4 py-3 text-[12.5px] text-muted print:hidden">
        <Icon.scan width={16} height={16} className="shrink-0 text-clay" />
        Codes resolve to{" "}
        <code className="rounded bg-paper px-1.5 py-0.5 text-[12px] text-ink">
          {config.baseUrl.replace(/^https?:\/\//, "")}/rooms/&lt;room&gt;
        </code>
        . Set <code className="rounded bg-paper px-1.5 py-0.5 text-[12px] text-ink">NEXT_PUBLIC_BASE_URL</code>{" "}
        to your domain before printing.
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(({ room, svg, png }) => (
          <QrCard key={room.id} room={room} svg={svg} png={png} compact />
        ))}
      </div>
    </div>
  );
}
