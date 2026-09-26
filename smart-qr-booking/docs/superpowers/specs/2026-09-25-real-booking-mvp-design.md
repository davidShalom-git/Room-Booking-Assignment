# The Coral Courtyard: real booking MVP — design

Date: 2026-09-25 · Status: draft for review · App: `smart-qr-booking/`

## 1. Goal

Turn the demo into a working product without changing its shape:

> QR on the room door → WhatsApp chat with the hotel → guest books in chat → owner confirms the advance in chat → booking lives in a database → owner manages everything in an authenticated admin.

"Real" means: nothing is simulated in the booking path. Rooms, availability, bookings and chat state are in Postgres; the WhatsApp side talks to Meta's Cloud API; the admin is behind a login; two people can never hold the same room for overlapping time.

### Decisions already made with the owner of this work

| Decision | Choice |
|---|---|
| Scope of "real" | Real core **and** a real WhatsApp Cloud API bot. Payments stay manual (owner confirms advance). |
| Backend | Everything inside the existing Next.js app on Vercel. Prisma 7 + hosted Postgres (Neon). `room-booking-api` is not reused as a service; its overlap constraint and concurrency test are ported. |
| Payment | Manual UPI advance with a 2-hour hold. No payment gateway. |
| Website | Stays enquiry-only. Booking happens in WhatsApp. |

### Non-goals (each can be added later)

Image upload (rooms use image URLs), Razorpay/UPI-gateway payments, WhatsApp Flows (form UI), editing a booking's dates in admin (cancel and rebook), roles or multiple admins, email, reports, LLM chat, multi-language, multi-property.

## 2. Architecture

One Next.js 16 app (App Router). All server code runs as route handlers / server actions on Vercel.

```
Guest phone ──► WhatsApp Cloud API ──► POST /api/whatsapp ──► bot core ──► engine ──► Postgres
Owner phone ──►        (Meta)     ◄── Graph API send ◄──────────┘
Vercel Cron (daily) ──► GET /api/cron/last-day ──► bot core (nudges)
Browser ──► guest site (server components) ─► engine (read) ─► Postgres
Browser ──► /admin/* (session cookie)      ─► server actions ─► engine ─► Postgres
```

Serverless keeps nothing in memory between requests, so every piece of chat state is a DB row.

Layers (each independently testable):

| Unit | Path | Depends on |
|---|---|---|
| Time/date + pricing | `src/lib/pricing.ts`, `src/lib/dates.ts` | nothing |
| Booking engine | `src/lib/engine.ts` | Prisma |
| Bot core (pure `step`) | `src/lib/bot/*` | a `Ports` interface |
| Prisma ports / memory ports | `src/lib/bot/ports-prisma.ts`, `ports-memory.ts` | engine / nothing |
| WhatsApp transport | `src/lib/wa/*`, `src/app/api/whatsapp/route.ts` | bot core, Graph API |
| Admin auth | `src/lib/auth.ts`, `src/proxy.ts` | Node `crypto` |
| Admin + site UI | `src/app/**` | engine |

## 3. Data model (Prisma, Postgres)

```prisma
model Room {
  id               String   @id            // "101" — also the URL segment and the QR payload
  name             String
  type             String
  pricePerNight    Int                      // INR
  capacity         Int
  bed              String
  ac               Boolean
  size             String
  floor            Int
  shortDescription String
  description      String
  amenities        String[]
  images           String[]
  active           Boolean  @default(true)
  sortOrder        Int      @default(0)
  bookings         Booking[]
}

enum BookingStatus { PENDING CONFIRMED CANCELLED }
enum BookingSource { WHATSAPP ADMIN }

model Booking {
  id            String        @id @default(cuid())
  seq           Int           @unique @default(autoincrement())  // display ref = makeBookingId(checkIn date, seq)
  roomId        String
  room          Room          @relation(fields: [roomId], references: [id])
  guestName     String
  guestPhone    String                    // digits, international (WhatsApp wa_id)
  guests        Int
  checkInAt     DateTime      @db.Timestamptz(3)
  checkOutAt    DateTime      @db.Timestamptz(3)
  ratePerNight  Int                       // snapshot at booking time
  nights        Int
  total         Int
  advancePaid   Int           @default(0)
  status        BookingStatus
  source        BookingSource
  holdExpiresAt DateTime?  @db.Timestamptz(3)   // PENDING only
  parentId      String?                   // set on the second leg of a mid-stay room move
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  @@index([roomId, checkInAt])
  @@index([guestPhone])
}

model Conversation {                        // one per WhatsApp number (guest or owner)
  phone     String   @id
  roomId    String?                         // room the guest is enquiring about
  stage     String   @default("browsing")
  draft     Json     @default("{}")
  updatedAt DateTime @updatedAt
}

model ProcessedMessage {                    // Meta retries webhooks; dedupe by message id
  id        String   @id
  createdAt DateTime @default(now())
}
```

The `available | occupied | pending` field on rooms is **removed** from data; it is derived: `occupied` if a CONFIRMED booking covers now, `pending` if a PENDING hold covers now, else `available`. Admin `active=false` hides a room from the site, the bot and the availability engine.

Seed: the 8 rooms from today's `src/lib/data.ts`. Mock bookings are not seeded.

### The overlap guarantee

Ported from `room-booking-api`, second migration (raw SQL):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist ("roomId" WITH =, tstzrange("checkInAt","checkOutAt",'[)') WITH &&)
  WHERE ("status" IN ('PENDING','CONFIRMED'));
```

The database is the guarantee. The engine also pre-checks so the common case returns a clean conflict, and catches the constraint violation for the race case. Half-open ranges: check-out 11:00 and the next check-in 13:00 the same day is allowed; PENDING holds block the room; CANCELLED rows are invisible, so a cancelled or expired slot is reusable at once.

### Time

Property timezone is fixed `+05:30` (Asia/Kolkata, no DST). The app works in `YYYY-MM-DD` + `HH:mm` strings (as today) and converts at the DB boundary: `instant = new Date(`${date}T${time}:00+05:30`)`. Display converts back with a fixed offset shift, independent of the server's timezone (Vercel runs UTC). Default times: check-in 13:00, check-out 11:00 (from `config.property`). Nights are calendar-day differences between the two dates, as today.

## 4. Booking engine (`src/lib/engine.ts`)

All functions return typed results; none throw for expected outcomes (conflict, not found, invalid).

- `sweepHolds()` — one `UPDATE … SET status='CANCELLED' WHERE status='PENDING' AND holdExpiresAt < now()`. Called at the start of every availability read and every write. No cron needed for expiry.
- `isFree(roomId, from, to, excludeBookingId?)`, `freeRooms(from, to, {minCapacity, excludeRoomId})`.
- `createBooking(input)` — validates (guests ≤ capacity, nights 1..30, room active, from < to), pre-checks, inserts inside a transaction, maps the exclusion violation to `Conflict`. Status `PENDING` gets `holdExpiresAt = now + HOLD_MINUTES` (default 120); admin walk-ins are created `CONFIRMED`.
- `confirmBooking(id, advance)` — `PENDING → CONFIRMED`, records `advancePaid`. If the hold already expired (CANCELLED by sweep) it attempts to revive it; the constraint decides whether the room is still free. Idempotent when already CONFIRMED.
- `cancelBooking(id)` — status `CANCELLED`.
- `extendBooking(id, newCheckOutAt)` — updates `checkOutAt/nights/total`; the constraint rechecks; conflict is a normal result. Idempotent if already extended to that time.
- `moveRest(id, toRoomId, newCheckOutAt)` — the mid-stay room move: creates a second booking (`parentId` = original) in the other room from the original check-out to `newCheckOutAt`. Extra nights are all due at the property.
- `occupancy(days)` — data for the admin grid.
- `roomStatusNow(rooms)` — derived badge.

The display reference is `makeBookingId(checkInDate, seq)` (existing function), e.g. `HTL-20260910-007`; lookup parses the trailing digits back to `seq`.

## 5. The WhatsApp bot

### 5.1 Bot core

`wa-sim.ts` becomes the real bot. Shape:

```ts
step(conv: ConvState, event: InEvent, ports: Ports, now: Date): Promise<{ conv: ConvState; out: Out[] }>
InEvent = { kind: "text"; from; text } | { kind: "button"; from; id } | { kind: "media"; from }
Out     = { to: string; text: string; buttons?: {id, title}[]; list?: {title, rows}[] }
```

`Ports` are the async DB/clock operations (rooms, freeRooms, createBooking, confirm, extend, moveRest, bookingsByPhone). `ports-prisma` calls the engine; `ports-memory` is an in-memory fake used by transcript tests. The pure logic and message copy are kept from the simulation; only the plumbing changes.

Rendering rule: ≤3 actions → WhatsApp reply buttons (title ≤20 chars); >3 → list message (≤10 rows). Button/list ids are self-contained (`paid:<bookingId>`, `ext_ok:<bookingId>:<yyyy-mm-dd>`, `move:<bookingId>:<roomId>:<yyyy-mm-dd>`) so the owner side is stateless and taps are idempotent.

### 5.2 Guest flow

1. **Entry.** The QR opens `wa.me/<number>?text=…` with `Room 101 — …` (existing `waRoomLink`). The bot extracts the room from the text, or from a `…/rooms/101` URL, or, with none, shows a list of active rooms. If the message carries dates/guests (website enquiry format), they prefill the draft.
2. **Browsing.** Intents (regex, as the sim): tell me about the room, price, breakfast/amenities, human/front desk, availability. "Available?" asks for dates and answers from the real engine, not the room's old status field.
3. **Booking.** name → guests (1..capacity) → check-in date → nights. The phone number is the WhatsApp number, so it is not asked. Dates are typed: `today`, `tomorrow`, `12/10`, `12-10-2026`, `12 oct`, `oct 12`, `2026-10-12`; no year → next occurrence; past dates rejected; unparseable → re-ask with an example. Nights: a bare integer or `N nights`, max 30.
4. **Availability.** If the room is taken for those dates, the bot offers the free rooms that fit (list); picking one continues the flow with that room.
5. **Review.** Summary + [Confirm] [Change]. Confirm creates the PENDING hold, then sends: total, 50% advance, balance, the UPI details (`upi://pay?pa=…&pn=…&am=…&tn=<ref>` link and the plain UPI ID), and the hold deadline.
6. **Payment.** Owner taps [Advance received] (or does it in admin) → `confirmBooking` → guest gets the confirmation with ref, dates, paid, due at check-in, address. If the guest sends a screenshot or says "paid", the bot replies that the desk will confirm shortly and pings the owner once.
7. **Hold expired.** Any guest action on an expired hold gets: hold expired, [Start again].

### 5.3 Owner flow

The owner is any number listed in `OWNER_WHATSAPP` (comma-separated). Messages from those numbers are routed to the owner handler; owner button ids from any other number are ignored.

- **New booking hold** → [Advance received] [Cancel].
- **Extension request** (from a guest; the new check-out uses the default check-out time) → real conflict check first. Free: [Approve] [Decline]. Re-booked: who has it and from when, then [Move to another room] [Decline]. Move shows a list of rooms free for the extra nights; the choice sends the guest [Sounds good] [I'll check out]. Approve rechecks under the constraint; if it now conflicts, the owner is told and offered Move/Decline.
- **Last-day check-out confirmation**, **guest asked for the front desk**, **payment proof received** — plain notifications.

### 5.4 Last-day nudge

`vercel.json` cron `30 11 * * *` (5 PM IST, UTC schedule) → `GET /api/cron/last-day` (requires `Authorization: Bearer $CRON_SECRET`) → for each CONFIRMED booking whose `checkOutAt` falls on tomorrow (IST), send the guest [Extend my stay] [Check out]. Idempotent per booking per day (marker in `Conversation.draft`). Extend: guest types the new check-out date (or `+N nights`); flows into 5.3.

### 5.5 Transport (`/api/whatsapp`)

- `GET`: Meta verification handshake (`hub.verify_token` == `WA_VERIFY_TOKEN` → echo `hub.challenge`).
- `POST`: read the **raw body**, verify `X-Hub-Signature-256` (HMAC-SHA256 with `WA_APP_SECRET`, constant-time compare) — reject otherwise. For each inbound message: insert `ProcessedMessage(id)`; on unique violation skip (retry); run `step`; send `out[]`; on failure delete the `ProcessedMessage` row so Meta's retry can reprocess. Return 200 fast; processing runs via `after()`.
- Sending: `POST {WA_API_BASE}/{WA_PHONE_NUMBER_ID}/messages` with `Authorization: Bearer WA_ACCESS_TOKEN`. `WA_API_BASE` defaults to the pinned Graph API base and is overridden in tests to a local mock. Send errors are logged and never crash the handler.
- **24-hour window.** Owner alerts and last-day nudges are business-initiated and usually outside the window, so Meta requires approved templates. Env `WA_TPL_OWNER_ALERT` and `WA_TPL_LAST_DAY` name them; when unset the message goes out as free-form text (fine with Meta's test number and inside the window). The README lists the templates to create.

## 6. Admin

Same visual design, real data.

- **Auth.** `ADMIN_PASSWORD` + HMAC-signed session cookie (`SESSION_SECRET`, Node `crypto`, `httpOnly`, `Secure` in prod, `SameSite=Lax`, 7-day expiry). `/admin/login` page. `src/proxy.ts` (Next 16's replacement for `middleware.ts`) redirects unauthenticated `/admin/*`; every server action re-verifies the session itself and never trusts the proxy alone. Constant-time password compare.
- **Dashboard.** Arrivals/departures today, occupied now, pending holds, advance collected, recent bookings, and a rooms × next-14-nights occupancy grid.
- **Bookings.** Filters (status, source, search by name/phone/ref). Row actions: Advance received (amount defaults to 50%), Cancel. **Add walk-in** form: room, guest, phone, guests, dates, times → `createBooking` as CONFIRMED; conflicts show inline with the clashing booking.
- **Rooms.** Create/edit all fields (price, capacity, description, amenities, image URLs, active). QR page reads rooms from the DB.

## 7. Guest website

- Pages read rooms from the DB (dynamic rendering; availability is time-sensitive).
- Room page gets a date picker with live availability via `GET /api/availability?room=&from=&to=` → "Available · 2 nights · ₹3,600" / "Not available for these dates". CTA stays "Enquire on WhatsApp" and now carries the dates.
- Room/list badges use the derived status.
- **Removed:** `/whatsapp` simulator page and `wa-conversation.tsx`, `/future`, `bookings-store.ts` and `localStorage`, `mockBookings`, `todayActivity`, `ViewSwitcher`, the fake "demo" contact form (the contact page keeps the WhatsApp, phone and email cards — the form only pretended to send). Nav/footer/home links to the removed pages are updated.
- `README.md` rewritten: it no longer describes a demo.

## 8. Configuration

| Var | Purpose |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | Postgres (Neon pooled URL in prod, Docker locally) |
| `ADMIN_PASSWORD`, `SESSION_SECRET` | admin login |
| `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` | Cloud API |
| `WA_API_BASE` | optional override (tests) |
| `WA_TPL_OWNER_ALERT`, `WA_TPL_LAST_DAY` | optional approved template names |
| `OWNER_WHATSAPP` | owner number(s), digits, comma-separated |
| `UPI_ID`, `UPI_PAYEE_NAME` | advance payment details |
| `HOLD_MINUTES` | hold length, default 120 |
| `CRON_SECRET` | authorises the cron route |
| `NEXT_PUBLIC_BASE_URL` | public URL (unchanged) |

The advance rate (50%) and default check-in/out times live in `config.ts`.

## 9. Testing

Runner: `tsx --test` (Node's built-in `node:test`), `npm test`. DB tests run against a Dockerised Postgres 16 (`docker compose up db`), migrations applied by the test setup, tables truncated between tests.

| Layer | What is asserted |
|---|---|
| Pure | pricing, INR/date formatting (existing checks move over), date-text parser, IST conversion, ref round-trip |
| Engine | overlap rejected; back-to-back same-day allowed; PENDING blocks, expired hold frees; cancelled frees; capacity/nights validation; extend conflict; `moveRest`; confirm after expiry; **N parallel `createBooking` on one slot → exactly one wins** (ported concurrency test) |
| Bot | scripted transcripts on memory ports: browse, full booking, room-taken → alternatives, payment, extend free / conflict / move, hold expiry, prefill from enquiry, bad dates |
| Webhook | bad or missing signature → 401; verify handshake; duplicate message id processed once; owner button from a non-owner ignored; sends hit a local mock Graph server |
| Auth | login success/failure, tampered cookie rejected, server actions refuse without a session |

Manual/end-to-end verification before calling it done: run the app locally against Docker Postgres, drive a whole booking → advance → last-day → extend → move journey with signed fake webhooks, and open the admin and site in a browser.

## 10. Deploy and go-live

I do not deploy, push or commit. Deliverables: `vercel.json` (cron), `prisma migrate deploy` in the build, `.env.example`, and a README checklist:

1. Create Neon database → `DATABASE_URL`; set env vars in Vercel.
2. Meta: developer app → WhatsApp product → a **number dedicated to Cloud API**; webhook URL `https://<domain>/api/whatsapp` with `WA_VERIFY_TOKEN`, subscribe to `messages`; copy app secret, phone-number id, permanent token.
3. Create and get approved the two templates (owner alert, last-day nudge).
4. Point `config.whatsappNumber` at that number and regenerate/print the QR codes.
5. Smoke test from a different phone than the owner's.

## 11. Risks and open items

- **The current business number `917539943015` cannot serve both the WhatsApp app and Cloud API.** Registering it on Cloud API disconnects it from the phone app. Use a dedicated number (Meta provides a free test number for development).
- **Unverifiable here:** actual delivery through Meta. Covered by signed fake payloads + a mock Graph server; the go-live checklist is the real test.
- **Prisma 7 + driver adapter + Next 16/Turbopack** on Vercel, and the exact error shape of an exclusion violation under the adapter. `room-booking-api` already handles Prisma error `P2004`; the plan starts with a short spike to confirm both before building on them.
- Login has no rate limiting (single-owner MVP); add Vercel firewall rules or a counter if exposed to abuse.
- Free-form inbound handling is regex intent matching, not language understanding; unknown text gets a helpful menu, never an error.
