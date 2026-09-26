import type { Metadata } from "next";
import Image from "next/image";
import { propertyPhotos } from "@/lib/settings";
import { siteSettings } from "@/lib/site-settings";
import { formatTime } from "@/lib/pricing";
import { getRooms } from "@/lib/rooms";
import { Eyebrow, SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { CtaButton } from "@/components/cta-button";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "About" };

export default async function AboutPage() {
  const [rooms, s] = await Promise.all([getRooms(), siteSettings()]);
  const photos = propertyPhotos(s, rooms).slice(0, 3);
  return (
    <div className="px-4 pt-28">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>{s.city}</Eyebrow>
        <h1 className="font-display mt-4 max-w-3xl text-4xl leading-[1.05] text-ink sm:text-[3.25rem]">
          {s.tagline}
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          {s.name} · {rooms.length} {rooms.length === 1 ? "room" : "rooms"}. {s.about}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {photos.map(
            (src, i) => (
              <Reveal key={src} delay={i * 80}>
                <div className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem] border border-hairline">
                  <Image src={src} alt="" fill sizes="33vw" className="object-cover" />
                </div>
              </Reveal>
            ),
          )}
        </div>

        <div className="mt-16 grid gap-10 border-t border-hairline pt-12 md:grid-cols-2">
          <Reveal>
            <SectionHeading
              eyebrow="What's on site"
              title="Little things, done properly"
            />
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {s.amenities.map((a) => (
                <li key={a} className="flex items-center gap-2.5 text-[14px] text-ink">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand text-clay">
                    <Icon.check width={14} height={14} />
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={80}>
            <div className="rounded-[1.75rem] border border-hairline bg-paper p-1.5">
              <div className="rounded-[1.4rem] bg-sand/40 p-6">
                <h3 className="font-display text-xl text-ink">Getting here</h3>
                <dl className="mt-4 space-y-3 text-[13.5px]">
                  <div className="flex gap-3">
                    <Icon.mapPin width={16} height={16} className="mt-0.5 shrink-0 text-clay" />
                    <dd className="text-muted">{s.address}</dd>
                  </div>
                  {s.directions && (
                    <div className="flex gap-3">
                      <Icon.scan width={16} height={16} className="mt-0.5 shrink-0 text-clay" />
                      <dd className="text-muted">{s.directions}</dd>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Icon.calendar width={16} height={16} className="mt-0.5 shrink-0 text-clay" />
                    <dd className="text-muted">
                      Check-in {formatTime(s.checkInTime)} · check-out {formatTime(s.checkOutTime)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-6">
                  <CtaButton href="/rooms" icon="arrowRight">
                    See the rooms
                  </CtaButton>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
