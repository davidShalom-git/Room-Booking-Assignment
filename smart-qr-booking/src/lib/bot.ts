/**
 * Simulated WhatsApp assistant. Pure, rule-based, dataset-aware.
 *
 * This is NOT a real WhatsApp Business API or an LLM. It's a deterministic
 * demo of the intended flow: connect the property dataset, ask questions in
 * natural language, get answers from the data, and complete a booking — after
 * which the guest "receives" a confirmation with name, dates, duration and
 * guests.
 */
import { rooms, getRoom, type Booking } from "@/lib/data";
import { nights, bookingTotal, formatINR, formatDate } from "@/lib/pricing";
import { confirmationMessage } from "@/lib/whatsapp";
import { config } from "@/config";

export type ChatStage = "idle" | "need_name" | "need_dates" | "confirm";

export type BotContext = {
  connected: boolean;
  stage: ChatStage;
  draft: {
    roomId?: string;
    guestName?: string;
    guests?: number;
    checkIn?: string;
    checkOut?: string;
  };
};

export type BotOut = {
  messages: string[];
  chips?: string[];
  /** ask the UI to render the inline date + guests picker */
  showDateCard?: boolean;
  context: BotContext;
  /** present when a booking was just confirmed — caller persists it */
  booking?: Omit<Booking, "id" | "createdAt" | "status"> & { status: "confirmed" };
};

export const initialContext = (): BotContext => ({
  connected: false,
  stage: "idle",
  draft: {},
});

const DEFAULT_CHIPS = [
  "Rooms under ₹1500",
  "Is breakfast included?",
  "Book Room 101",
  "Talk to staff",
];

const has = (t: string, re: RegExp) => re.test(t);
const roomList = (rs: typeof rooms) =>
  rs
    .map(
      (r) =>
        `• Room ${r.id} — ${r.name}, ${formatINR(r.pricePerNight)}/night, sleeps ${r.capacity}, ${r.ac ? "AC" : "Non-AC"}`,
    )
    .join("\n");

/** Free-text turn. */
export function handleText(raw: string, ctx: BotContext): BotOut {
  const t = raw.trim().toLowerCase();
  const draft = { ...ctx.draft };
  const roomMatch = t.match(/room\s*#?\s*(\d{3})/);
  if (roomMatch && getRoom(roomMatch[1])) draft.roomId = roomMatch[1];

  // ---- booking flow stages ------------------------------------------------
  if (ctx.stage === "need_name") {
    const name = raw.trim().replace(/^(my name is|it's|this is|i am|i'm)\s+/i, "");
    draft.guestName = name.slice(0, 60) || "Guest";
    return {
      messages: [
        `Thanks, ${draft.guestName}. Pick your dates and party size and I'll check Room ${draft.roomId}.`,
      ],
      showDateCard: true,
      context: { ...ctx, stage: "need_dates", draft },
    };
  }

  if (ctx.stage === "confirm") {
    if (has(t, /\b(confirm|yes|book it|go ahead|proceed|ok|sure)\b/)) {
      return confirmBooking({ ...ctx, draft });
    }
    if (has(t, /\b(change|edit|different|another date|reschedule)\b/)) {
      return {
        messages: ["No problem — pick new dates below."],
        showDateCard: true,
        context: { ...ctx, stage: "need_dates", draft },
      };
    }
    if (has(t, /\b(cancel|nevermind|stop)\b/)) {
      return {
        messages: ["Cancelled — nothing booked. Ask me anything else."],
        chips: DEFAULT_CHIPS,
        context: { ...initialContext(), connected: ctx.connected },
      };
    }
    return {
      messages: [`Reply "confirm" to book, or "change dates" to adjust.`],
      chips: ["Confirm booking", "Change dates", "Talk to staff"],
      context: { ...ctx, draft },
    };
  }

  // ---- greeting (works even before the dataset is connected) -------------
  if (has(t, /^(hi|hello|hey|namaste|good (morning|evening|afternoon))\b/)) {
    return {
      messages: [
        `Hi! You're chatting with ${config.property.name}. I can check availability, prices and amenities, and take a booking right here.`,
        ctx.connected
          ? "What would you like to know?"
          : "Tip: connect the property dataset (the button above) and I'll answer from live room data.",
      ],
      chips: DEFAULT_CHIPS,
      context: { ...ctx, draft },
    };
  }

  // ---- generic FAQ (no dataset needed) ----------------------------------
  if (has(t, /breakfast/))
    return say(
      "Yes — complimentary breakfast is served on the rooftop from 7:30 AM to 10:00 AM.",
      ctx,
      draft,
    );
  if (has(t, /check[\s-]?(in|out).*(time)|what time.*(check[\s-]?(in|out))/))
    return say(
      `Check-in is from ${config.property.checkIn} and check-out is by ${config.property.checkOut}. Early check-in is subject to availability.`,
      ctx,
      draft,
    );
  if (has(t, /\bwi[\s-]?fi\b|internet/))
    return say("Free WiFi covers the whole property; the password is on your room card.", ctx, draft);
  if (has(t, /\bpet|\bdog|\bcat\b/))
    return say("We welcome small, well-behaved pets — please tell us in advance.", ctx, draft);
  if (has(t, /park(ing)?/))
    return say(
      "Free street parking is usually available; a secured lot 200 m away is ₹150/night.",
      ctx,
      draft,
    );
  if (has(t, /cancel|refund/))
    return say("Free cancellation up to 48 hours before check-in. After that the first night is charged.", ctx, draft);
  if (has(t, /airport|pick[\s-]?up|\bcab\b|\btaxi\b/))
    return say("Airport pickup from Kochi (COK) is ₹1,600 one way — share your flight number and we'll arrange it.", ctx, draft);

  // ---- everything below wants the dataset ------------------------------
  const wantsData =
    !!roomMatch ||
    has(t, /room|price|₹|rupee|available|availabilit|vacan|book|reserve|cheap|budget|family|suite|ac\b|non[\s-]?ac|balcony/);
  if (wantsData && !ctx.connected) {
    return {
      messages: [
        "I can answer that once the property dataset is connected. Tap “Connect property dataset” above — it takes a second.",
      ],
      chips: ["Connect property dataset", "Is breakfast included?"],
      context: { ...ctx, draft },
    };
  }

  // ---- dataset-backed answers ----------------------------------------
  const under = t.match(/under\s*₹?\s*(\d[\d,]*)/);
  if (under) {
    const cap = Number(under[1].replace(/,/g, ""));
    const matches = rooms.filter((r) => r.pricePerNight <= cap);
    return say(
      matches.length
        ? `Rooms up to ${formatINR(cap)}/night:\n${roomList(matches)}`
        : `Nothing under ${formatINR(cap)} right now — our lowest is the Budget Single at ${formatINR(1000)}/night.`,
      ctx,
      draft,
      ["Book Room 104", "See all rooms"],
    );
  }
  if (has(t, /cheap|budget|lowest|affordable/)) {
    const sorted = [...rooms].sort((a, b) => a.pricePerNight - b.pricePerNight).slice(0, 3);
    return say(`Our most affordable rooms:\n${roomList(sorted)}`, ctx, draft, ["Book Room 204", "See all rooms"]);
  }
  if (has(t, /family|kids|children|group/)) {
    const fam = rooms.filter((r) => r.capacity >= 3);
    return say(`For families and groups:\n${roomList(fam)}`, ctx, draft, ["Book Room 103", "Book Room 203"]);
  }
  if (has(t, /\bac\b|air[\s-]?con/) && !has(t, /non[\s-]?ac/)) {
    const ac = rooms.filter((r) => r.ac);
    return say(`AC rooms:\n${roomList(ac)}`, ctx, draft);
  }
  if (has(t, /non[\s-]?ac|fan/)) {
    const fan = rooms.filter((r) => !r.ac);
    return say(`Non-AC (fan / naturally cooled) rooms:\n${roomList(fan)}`, ctx, draft);
  }
  if (has(t, /all rooms|list rooms|see rooms|what rooms|rooms do you have/)) {
    return say(`Here's everything we have:\n${roomList(rooms)}`, ctx, draft);
  }

  // start a booking
  if (has(t, /\bbook|reserve|reservation|i want.*room|stay/)) {
    if (!draft.roomId) {
      return {
        messages: ["Sure — which room? Send the room number, e.g. “Room 101”."],
        chips: rooms.slice(0, 4).map((r) => `Book Room ${r.id}`),
        context: { ...ctx, draft },
      };
    }
    const r = getRoom(draft.roomId)!;
    return {
      messages: [
        `Room ${r.id} — ${r.name}, ${formatINR(r.pricePerNight)}/night, sleeps ${r.capacity}.`,
        "What name should the booking be under?",
      ],
      context: { ...ctx, stage: "need_name", draft },
    };
  }

  // room detail / availability
  if (draft.roomId) {
    const r = getRoom(draft.roomId)!;
    return {
      messages: [
        `Room ${r.id} — ${r.name}\n${formatINR(r.pricePerNight)}/night · ${r.bed} · sleeps ${r.capacity} · ${r.ac ? "AC" : "Non-AC"}`,
        r.shortDescription,
        "Want me to check specific dates?",
      ],
      chips: [`Check dates for Room ${r.id}`, `Book Room ${r.id}`],
      showDateCard: false,
      context: { ...ctx, draft },
    };
  }
  if (has(t, /available|availabilit|vacan|free night/)) {
    return {
      messages: ["Which room, and for which dates? Pick below."],
      showDateCard: true,
      context: { ...ctx, stage: "need_dates", draft },
    };
  }

  // staff handoff
  if (has(t, /staff|human|agent|reception|front desk|call you|speak to someone|manager/)) {
    return {
      messages: [
        "Connecting you to our front desk — someone will reply here shortly.",
        "(Demo: no real staff are connected. In production this hands off to a person.)",
      ],
      chips: DEFAULT_CHIPS,
      context: { ...ctx, draft },
    };
  }

  // fallback
  return {
    messages: [
      "I can help with room availability, prices, amenities and bookings.",
      'Try: “Is Room 201 available?”, “Rooms under ₹1500”, or “Book Room 103”.',
    ],
    chips: DEFAULT_CHIPS,
    context: { ...ctx, draft },
  };
}

/** Inline date + guests card submitted. */
export function handleDateCard(
  input: { checkIn: string; checkOut: string; guests: number },
  ctx: BotContext,
): BotOut {
  const draft = { ...ctx.draft, ...input };
  const n = nights(input.checkIn, input.checkOut);
  if (n <= 0) {
    return {
      messages: ["Check-out needs to be after check-in — try again."],
      showDateCard: true,
      context: { ...ctx, stage: "need_dates", draft },
    };
  }
  if (!draft.roomId) {
    return {
      messages: [`${n} night${n > 1 ? "s" : ""}, ${input.guests} guest${input.guests > 1 ? "s" : ""}. Which room? Send e.g. “Room 101”.`],
      chips: rooms.slice(0, 4).map((r) => `Room ${r.id}`),
      context: { ...ctx, stage: "idle", draft },
    };
  }
  const r = getRoom(draft.roomId)!;
  const total = bookingTotal(r.pricePerNight, n);
  const overCap = input.guests > r.capacity;
  const summary = [
    `Room ${r.id} — ${r.name} is available ✅`,
    "",
    `${formatDate(input.checkIn)} → ${formatDate(input.checkOut)}`,
    `${n} night${n > 1 ? "s" : ""} × ${formatINR(r.pricePerNight)} = ${formatINR(total)}`,
    `Guests: ${input.guests}${overCap ? `  ⚠️ over the ${r.capacity}-guest limit for this room` : ""}`,
    draft.guestName ? `Name: ${draft.guestName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!draft.guestName) {
    return {
      messages: [summary, "What name should I put the booking under?"],
      context: { ...ctx, stage: "need_name", draft },
    };
  }
  return {
    messages: [summary, `Reply "confirm" and it's booked.`],
    chips: ["Confirm booking", "Change dates", "Talk to staff"],
    context: { ...ctx, stage: "confirm", draft },
  };
}

function confirmBooking(ctx: BotContext): BotOut {
  const d = ctx.draft;
  const r = getRoom(d.roomId!)!;
  const n = nights(d.checkIn!, d.checkOut!);
  const total = bookingTotal(r.pricePerNight, n);
  const booking = {
    guestName: d.guestName || "Guest",
    guestPhone: "via WhatsApp",
    roomId: r.id,
    roomName: r.name,
    checkIn: d.checkIn!,
    checkOut: d.checkOut!,
    guests: d.guests || 1,
    nights: n,
    ratePerNight: r.pricePerNight,
    total,
    source: "whatsapp" as const,
    status: "confirmed" as const,
  };
  // Fake an id purely for the message preview; the real stored id comes from saveBooking.
  const preview = confirmationMessage({
    ...booking,
    id: "HTL-…",
    createdAt: new Date().toISOString(),
  } as Booking);
  return {
    messages: [preview, "You'll get this as a WhatsApp message. See you soon! 👋"],
    chips: ["See all rooms", "Talk to staff"],
    context: { ...initialContext(), connected: ctx.connected },
    booking,
  };
}

function say(
  msg: string,
  ctx: BotContext,
  draft: BotContext["draft"],
  chips: string[] = DEFAULT_CHIPS,
): BotOut {
  return { messages: [msg], chips, context: { ...ctx, draft } };
}

// --- self-check: `npx tsx src/lib/bot.ts` ---------------------------------
if (process.argv[1]?.endsWith("bot.ts")) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
    console.log("ok  -", m);
  };
  let ctx = initialContext();

  let out = handleText("hi", ctx);
  assert(out.messages.length > 0, "greeting works before connect");

  out = handleText("is room 101 available", ctx);
  assert(/connect/i.test(out.messages[0]), "data question blocked until connected");

  ctx = { ...ctx, connected: true };
  out = handleText("is breakfast included?", ctx);
  assert(/7:30/.test(out.messages[0]), "breakfast FAQ");

  out = handleText("rooms under ₹1500", ctx);
  assert(/Room 104/.test(out.messages[0]) && /Room 101/.test(out.messages[0]) === false, "under-price filter");

  out = handleText("book room 101", ctx);
  assert(out.context.stage === "need_name" && out.context.draft.roomId === "101", "booking flow starts");

  out = handleText("David", out.context);
  assert(out.context.stage === "need_dates" && out.showDateCard === true, "name captured, asks dates");

  out = handleDateCard({ checkIn: "2026-09-10", checkOut: "2026-09-12", guests: 2 }, out.context);
  assert(/₹3,600/.test(out.messages[0]) && out.context.stage === "confirm", "quote 2×1800=3600");

  out = handleText("confirm", out.context);
  assert(!!out.booking && out.booking.total === 3600 && out.booking.source === "whatsapp", "booking emitted");
  assert(/Name: David/.test(out.messages[0]) && /Duration: 2 nights/.test(out.messages[0]), "confirmation has name + duration");

  out = handleDateCard({ checkIn: "2026-09-12", checkOut: "2026-09-10", guests: 2 }, { ...initialContext(), connected: true, stage: "need_dates", draft: { roomId: "101" } });
  assert(/after check-in/.test(out.messages[0]), "reversed dates rejected");

  console.log("\nall bot checks passed");
}
