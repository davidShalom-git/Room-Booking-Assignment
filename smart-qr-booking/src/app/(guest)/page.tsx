import Image from "next/image";
import Link from "next/link";
import { config } from "@/config";
import { rooms, PROPERTY_IMAGES } from "@/lib/data";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { CtaButton } from "@/components/cta-button";
import { RoomCard } from "@/components/room-card";
import { SectionHeading, Eyebrow } from "@/components/section-heading";
import { formatINR } from "@/lib/pricing";

const STEPS = [
  {
    icon: "scan" as const,
    title: "Scan the room QR",
    body: "Every door has its own code. A guest points their camera — no app, no reception queue.",
  },
  {
    icon: "whatsapp" as const,
    title: "WhatsApp opens on that room",
    body: "Their WhatsApp opens with a message about that exact room, addressed to the front desk. One tap to send.",
  },
  {
    icon: "bed" as const,
    title: "Ask, book, or extend — all in chat",
    body: "Questions, a full booking with dates and guests, and later the extend-or-check-out flow. The website is there too, if they'd rather browse.",
  },
];

export default function HomePage() {
  const fromPrice = Math.min(...rooms.map((r) => r.pricePerNight));
  const available = rooms.filter((r) => r.status !== "occupied").slice(0, 6);

  return (
    <>
      {/* Hero */}
      <section className="relative px-4 pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-hairline bg-sand p-1.5">
            <div className="relative overflow-hidden rounded-[2.1rem]">
              <div className="relative h-[70vh] min-h-[480px] w-full">
                <Image
                  src={PROPERTY_IMAGES.hero}
                  alt={config.property.name}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#160f06]/95 via-[#160f06]/55 to-[#160f06]/20" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#160f06]/80 to-transparent" />
              </div>

              <div className="absolute inset-0 flex flex-col justify-end p-7 [text-shadow:0_1px_20px_rgba(0,0,0,0.35)] sm:p-12">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur-sm">
                    <Icon.mapPin width={12} height={12} />
                    {config.property.city}
                  </span>
                  <h1 className="font-display mt-4 text-[2.6rem] leading-[1.02] text-white sm:text-6xl">
                    Find your perfect stay
                  </h1>
                  <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/85">
                    {config.property.name} is a {config.property.reviews}-review boutique
                    property in the old town — {rooms.length} rooms, courtyard light,
                    rooftop breakfast, and a two-minute walk to the water.
                  </p>
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <CtaButton href="/rooms" icon="arrowRight">
                      Explore rooms
                    </CtaButton>
                    <CtaButton href="/whatsapp" variant="whatsapp" icon="whatsapp">
                      Chat on WhatsApp
                    </CtaButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mx-auto -mt-10 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-[1.75rem] border border-hairline bg-hairline shadow-[var(--shadow-soft)] sm:grid-cols-4">
            {(
              [
                { label: "Guest rating", value: `${config.property.rating} / 5`, icon: "star" },
                { label: "Rooms", value: String(rooms.length), icon: "grid" },
                { label: "From", value: formatINR(fromPrice), icon: "bed" },
                { label: "Front desk", value: "24 × 7", icon: "bell" },
              ] as const
            ).map((s) => {
              const IconCmp = Icon[s.icon];
              return (
                <div
                  key={s.label}
                  className="flex flex-col items-center gap-1.5 bg-paper px-5 py-6 text-center"
                >
                  <IconCmp width={16} height={16} className="text-clay" />
                  <span className="font-display text-lg text-ink">{s.value}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-faint">
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How the QR works */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading
              eyebrow="The Smart QR concept"
              title={<>From the door to a booking<br className="hidden sm:block" /> in under a minute</>}
              lede="No printed brochures, no “let me check the register”. The QR carries the guest straight into a live, bookable room page."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const IconCmp = Icon[s.icon];
              return (
                <Reveal key={s.title} delay={i * 90}>
                  <div className="flex h-full flex-col rounded-[1.75rem] border border-hairline bg-paper p-1.5">
                    <div className="flex h-full flex-col rounded-[1.4rem] bg-sand/40 p-6 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <div className="flex items-center justify-between">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-clay-soft text-clay">
                          <IconCmp width={18} height={18} />
                        </span>
                        <span className="font-display text-3xl text-shell">0{i + 1}</span>
                      </div>
                      <h3 className="font-display mt-5 text-xl text-ink">{s.title}</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CtaButton href="/qr" variant="outline" icon="qr">
                See the QR demo
              </CtaButton>
              <span className="text-[13px] text-faint">
                Try scanning one with your phone — it really opens the room page.
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Available rooms */}
      <section className="px-4 pb-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading eyebrow="Stay with us" title="Available rooms" />
              <Link
                href="/rooms"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-clay"
              >
                View all {rooms.length} rooms
                <Icon.arrowRight
                  width={15}
                  height={15}
                  className="transition-transform duration-500 group-hover:translate-x-1"
                />
              </Link>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((room, i) => (
              <Reveal key={room.id} delay={i * 70}>
                <RoomCard room={room} priority={i < 3} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WhatsApp band */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[2.25rem] border border-hairline bg-[#0f2f1f] p-1.5">
            <div className="grid items-center gap-8 rounded-[1.9rem] bg-[radial-gradient(120%_140%_at_0%_0%,#1a4a30,#0f2f1f)] p-8 sm:p-12 md:grid-cols-2">
              <div>
                <Eyebrow>WhatsApp enquiry</Eyebrow>
                <h2 className="font-display mt-4 text-3xl leading-tight text-white sm:text-4xl">
                  Your guests already live on WhatsApp
                </h2>
                <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/70">
                  Every “Ask on WhatsApp” button opens a chat with the room, dates and
                  guest count already typed out. Today it reaches your phone. Next, it
                  answers on its own — from your room data.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <CtaButton href="/whatsapp" variant="whatsapp" icon="whatsapp">
                    Open the live assistant
                  </CtaButton>
                  <CtaButton href="/future" variant="outline" icon="sparkles" className="border-white/25 text-white hover:bg-white/10">
                    See future automation
                  </CtaButton>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="space-y-2.5 text-[13px]">
                  <p className="ml-auto w-max max-w-[80%] rounded-2xl rounded-br-md bg-[#25d366]/90 px-3.5 py-2 text-[#08240f]">
                    Is Room 101 free 10–12 Sep for 2?
                  </p>
                  <p className="w-max max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-white/90">
                    Yes — Deluxe Double, 2 nights × ₹1,800 = ₹3,600. Shall I hold it?
                  </p>
                  <p className="ml-auto w-max max-w-[80%] rounded-2xl rounded-br-md bg-[#25d366]/90 px-3.5 py-2 text-[#08240f]">
                    Yes please, under David
                  </p>
                  <p className="w-max max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-white/90">
                    Booked ✅ HTL-20260910-001 · you'll get the details here.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Owner band */}
      <section className="px-4 pb-4">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-hairline bg-paper p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <Eyebrow>For the owner</Eyebrow>
              <h2 className="font-display mt-3 text-2xl text-ink sm:text-3xl">
                See what your front desk sees
              </h2>
              <p className="mt-2 max-w-md text-[14px] text-muted">
                A dashboard with rooms, bookings and one-click QR codes for every door.
              </p>
            </div>
            <CtaButton href="/admin" variant="primary" icon="gauge">
              Open admin demo
            </CtaButton>
          </div>
        </div>
      </section>
    </>
  );
}
