import Image from "next/image";
import Link from "next/link";
import { propertyPhotos } from "@/lib/settings";
import { siteSettings } from "@/lib/site-settings";
import { getRooms } from "@/lib/rooms";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { CtaButton } from "@/components/cta-button";
import { ChatCta } from "@/components/chat-cta";
import { RoomCard } from "@/components/room-card";
import { SectionHeading, Eyebrow } from "@/components/section-heading";
import { formatINR, formatTime } from "@/lib/pricing";

const STEPS = [
  {
    icon: "scan" as const,
    title: "Scan the room QR",
    body: "Every door has its own code. A guest points their camera — no app, no reception queue.",
  },
  {
    icon: "chat" as const,
    title: "That room's page opens",
    body: "Photos, price and live availability for that exact room — with a Book in chat button. Nothing to install.",
  },
  {
    icon: "bed" as const,
    title: "Ask, book, or extend — all in chat",
    body: "Ask anything, check live availability, and book with a small UPI advance. Near the end of the stay, extend or check out — all in the same chat.",
  },
];

export default async function HomePage() {
  const [rooms, s] = await Promise.all([getRooms(), siteSettings()]);
  const hero = propertyPhotos(s, rooms)[0];
  const fromPrice = rooms.length ? Math.min(...rooms.map((r) => r.pricePerNight)) : 0;
  const available = [...rooms]
    .sort((a, b) => Number(a.status !== "available") - Number(b.status !== "available"))
    .slice(0, 6);
  const stats = [
    ...(s.rating !== null ? [{ label: "Guest rating", value: `${s.rating} / 5`, icon: "star" as const }] : []),
    { label: "Rooms", value: String(rooms.length), icon: "grid" as const },
    { label: "From", value: formatINR(fromPrice), icon: "bed" as const },
    { label: "Check-in", value: formatTime(s.checkInTime), icon: "calendar" as const },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative px-4 pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-hairline bg-sand p-1.5">
            <div className="relative overflow-hidden rounded-[2.1rem]">
              <div className="relative h-[70vh] min-h-[480px] w-full bg-[#1c1509]">
                {hero && <Image src={hero} alt={s.name} fill priority sizes="100vw" className="object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#160f06]/95 via-[#160f06]/55 to-[#160f06]/20" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#160f06]/80 to-transparent" />
              </div>

              <div className="absolute inset-0 flex flex-col justify-end p-7 [text-shadow:0_1px_20px_rgba(0,0,0,0.35)] sm:p-12">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur-sm">
                    <Icon.mapPin width={12} height={12} />
                    {s.city}
                  </span>
                  <h1 className="font-display mt-4 text-[2.6rem] leading-[1.02] text-white sm:text-6xl">
                    Find your perfect stay
                  </h1>
                  <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/85">{s.about}</p>
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <CtaButton href="/rooms" icon="arrowRight">
                      Explore rooms
                    </CtaButton>
                    <ChatCta variant="cream">Chat to book</ChatCta>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div
            className={`mx-auto -mt-10 grid max-w-4xl gap-px overflow-hidden rounded-[1.75rem] border border-hairline bg-hairline shadow-[var(--shadow-soft)] ${
              stats.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
            }`}
          >
            {stats.map((st) => {
              const IconCmp = Icon[st.icon];
              return (
                <div
                  key={st.label}
                  className="flex flex-col items-center gap-1.5 bg-paper px-5 py-6 text-center"
                >
                  <IconCmp width={16} height={16} className="text-clay" />
                  <span className="font-display text-lg text-ink">{st.value}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-faint">
                    {st.label}
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
              eyebrow="How booking works"
              title={<>From the door to a booking<br className="hidden sm:block" /> in under a minute</>}
              lede="No app, no forms, no queue at reception. Every room's code opens its page, with a chat that knows the room, checks live availability and holds it for you."
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
                Scan a room code
              </CtaButton>
              <span className="text-[13px] text-faint">
                Point your phone at any code — that room's page opens, ready to book.
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
              <SectionHeading eyebrow="Stay with us" title="Our rooms" />
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

      {/* Chat band */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[2.25rem] border border-hairline bg-ink p-1.5">
            <div className="grid min-w-0 grid-cols-1 items-center gap-8 rounded-[1.9rem] bg-[radial-gradient(120%_140%_at_0%_0%,#4a3426,#262119)] p-8 sm:p-12 md:grid-cols-2">
              <div className="min-w-0">
                <Eyebrow>Book in the chat</Eyebrow>
                <h2 className="font-display mt-4 text-3xl leading-tight text-white sm:text-4xl">
                  Book the way you already chat
                </h2>
                <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/70">
                  Our booking assistant answers questions, checks the real calendar and
                  holds your room while you pay a {s.advancePercent}% advance by UPI. The front desk
                  confirms right in the chat — and it's there when you want to extend.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <ChatCta>Start a chat</ChatCta>
                  <CtaButton href="/rooms" variant="outline" icon="arrowRight" className="border-white/25 text-white hover:bg-white/10">
                    Browse rooms first
                  </CtaButton>
                </div>
              </div>
              <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex min-w-0 flex-col gap-2.5 text-[13px]">
                  <div className="flex justify-end">
                    <p className="max-w-[80%] rounded-2xl rounded-br-md bg-cream px-3.5 py-2 text-ink">
                      Is Room 101 free 10–12 Oct for 2?
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-white/90">
                      ✅ Room 101 is free 10 → 12 Oct (2 nights). Total ₹3,600.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <p className="max-w-[80%] rounded-2xl rounded-br-md bg-cream px-3.5 py-2 text-ink">
                      Book it — under David
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-white/90">
                      Held for you ✅ Pay the ₹1,800 advance by UPI and we&apos;ll confirm here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
