# Real Booking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No commits unless the user asks** — each task ends at a green checkpoint instead.

**Goal:** Replace the demo internals of `smart-qr-booking` with a real system: Postgres-backed rooms/bookings that can't double-book, a WhatsApp Cloud API bot that runs the booking chat, and an authenticated owner admin.

**Architecture:** One Next.js 16 app. Pure bot core (`step`) with async `Ports`; a Prisma engine that owns overlap safety via a Postgres `EXCLUDE` constraint; a signed webhook route as transport; session-cookie admin. All chat state in Postgres (serverless).

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`, `after()`), React 19, Prisma 7 + `@prisma/adapter-pg` + `pg`, Postgres 16 (Docker locally, Neon in prod), `tsx --test` (`node:test`), Tailwind v4 (existing).

**Spec:** `docs/superpowers/specs/2026-09-25-real-booking-mvp-design.md` (all section numbers below refer to it).

## Global Constraints

- App root is `smart-qr-booking/`. Path alias `@/*` → `src/*`. Node 22.12.
- Read `node_modules/next/dist/docs/01-app/**` before using any Next API (AGENTS.md: this Next has breaking changes; `middleware` is `proxy`).
- Money is integer INR. Times are property-local `+05:30` (IST), stored as `timestamptz`; app-level values are `YYYY-MM-DD` + `HH:mm` strings. Server TZ (UTC on Vercel) must never leak into results.
- Overlap is half-open `[checkInAt, checkOutAt)`; PENDING and CONFIRMED block; CANCELLED does not.
- Advance rate 50% (`config.advanceRate`), hold 120 min (`HOLD_MINUTES`), nights 1..30, default check-in 13:00 / check-out 11:00.
- Meta limits: reply buttons ≤3, title ≤20 chars; list ≤10 rows, row title ≤24 chars; button/list id ≤256 chars.
- Webhook must verify `X-Hub-Signature-256` over the raw body before doing anything; owner actions only from `OWNER_WHATSAPP` numbers.
- No new dependency for auth/crypto. Dev/test dependencies allowed: `tsx`. Runtime additions: `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`.
- Existing visual design (Tailwind tokens, components) is kept; guest copy keeps its tone.
- No commits, pushes or deploys.

## Review Focus

1. **Two guests book the same room/dates at once** → exactly one wins, the other gets a clean "just taken" reply, never a 500 (Task 3 concurrency test).
2. **Meta re-delivers the same webhook / sends a duplicate message id** → processed once (Task 6).
3. **Guest types garbage where a date/number is expected** ("next friday-ish", "0", "-3", "1000", emoji) → re-asked with an example, state unchanged, never a crash or a bad booking (Task 1 parser tests, Task 4 transcripts).
4. **Owner taps a stale or repeated button** (advance received twice; approve after hold expired or after the room was re-booked) → idempotent or clear message, never a double charge/duplicate booking (Task 3, Task 4).
5. **Vercel runs in UTC** → a booking at 23:30 IST or check-in "today" near midnight IST lands on the right IST calendar day (Task 1 tests with fixed instants).

---

## File Structure

```
smart-qr-booking/
  docker-compose.yml                 Postgres 16 for dev/test
  prisma/schema.prisma
  prisma/migrations/*                init + booking_no_overlap
  prisma/seed.ts                     8 rooms from old data.ts
  prisma.config.ts
  vercel.json                        cron
  .env.example
  src/config.ts                      + advanceRate, holdMinutes, defaults (env read in src/lib/env.ts)
  src/lib/env.ts                     typed env access (server only)
  src/lib/db.ts                      Prisma client singleton
  src/lib/pricing.ts                 (kept) formatting/nights
  src/lib/dates.ts                   IST conversion + text parsers
  src/lib/engine.ts                  booking engine (Task 3)
  src/lib/bot/types.ts               Stage/Draft/InEvent/Out/Ports/BookingView
  src/lib/bot/step.ts                pure step() — guest + owner
  src/lib/bot/copy.ts                message text builders
  src/lib/bot/ports-memory.ts        in-memory Ports (tests)
  src/lib/bot/ports-prisma.ts        engine-backed Ports
  src/lib/wa/signature.ts            HMAC verify
  src/lib/wa/client.ts               Graph API send (+ templates)
  src/lib/wa/inbound.ts              parse Meta payload → InEvent[]
  src/lib/wa/handle.ts               dedupe + conversation load/save + step + send
  src/app/api/whatsapp/route.ts      GET verify, POST inbound
  src/app/api/cron/last-day/route.ts
  src/app/api/availability/route.ts
  src/lib/auth.ts                    session sign/verify
  src/proxy.ts                       /admin guard
  src/app/admin/login/page.tsx + actions
  src/app/admin/** (dashboard, bookings, rooms, qr) on DB
  src/app/(guest)/** on DB
  tests/**                           node:test suites + helpers
  README.md                          rewritten
```

Deleted: `src/lib/wa-sim.ts`, `src/components/wa-conversation.tsx`, `src/app/(guest)/whatsapp/`, `src/app/(guest)/future/`, `src/lib/bookings-store.ts`, `src/components/view-switcher.tsx`, `src/components/contact-form.tsx`. `src/lib/data.ts` shrinks to types + image constants + the seed room list moved to `prisma/seed-data.ts`.

---

### Task 1: Foundations — deps, DB tooling, pure date/time logic

**Files:**
- Modify: `package.json`, `.gitignore`, `src/lib/pricing.ts`
- Create: `docker-compose.yml`, `prisma.config.ts`, `.env.example`, `src/lib/dates.ts`, `tests/dates.test.ts`, `tests/pricing.test.ts`

**Interfaces:**
- Produces (`src/lib/dates.ts`):
  - `TZ_OFFSET = "+05:30"`
  - `toInstant(date: string, time: string): Date`
  - `istDate(d: Date): string` (YYYY-MM-DD in IST), `istTime(d: Date): string` (HH:mm in IST)
  - `parseDateText(text: string, today: string): string | null` — `today`, `tomorrow`, `12/10`, `12-10-2026`, `12 oct`, `oct 12`, `12 october 2026`, `2026-10-12`; no year → next occurrence ≥ today; past → null
  - `parseNights(text: string): number | null` — `2`, `2 nights`, `for 3 nights`; 1..30 else null
  - `parseEnquiry(text: string): { roomId?: string; checkIn?: string; checkOut?: string; guests?: number }` — reads the website's `enquiryMessage` format (`Room 101`, `Check-in: 10 Sep 2026`, `Check-out: …`, `Guests: 2`) and `…/rooms/101`
- Existing `pricing.ts` exports stay (`nights`, `bookingTotal`, `formatINR`, `formatDate`, `formatTime`, `formatDateTime`, `makeBookingId`, `todayISO`, `addDays`) and its `process.argv` self-check block is deleted (moves to `tests/pricing.test.ts`). `todayISO()` must become IST-based: `todayISO(now = new Date())` = `istDate(now)`.

- [ ] **Step 1:** `npm i prisma @prisma/client @prisma/adapter-pg pg` and `npm i -D tsx @types/pg dotenv`. Add scripts: `"test": "tsx --test tests/**/*.test.ts"` (use the quoted-glob form that works on Windows: `tsx --test tests/`), `"db:up": "docker compose up -d db"`, `"db:migrate": "prisma migrate deploy"`, `"db:seed": "tsx prisma/seed.ts"`, `"postinstall": "prisma generate"`, `"build": "prisma migrate deploy && next build"` is **not** used — build stays `next build`; migrations run via a Vercel build command in the README.
- [ ] **Step 2:** Write `docker-compose.yml` (`postgres:16`, port 5432→55432 host to avoid clashes, db `coral`, user/pass `coral`, volume). Write `.env.example` with all vars from spec §8.
- [ ] **Step 3: Write failing tests** `tests/dates.test.ts` covering every Review Focus 3 and 5 input: `toInstant("2026-10-12","13:00").toISOString() === "2026-10-12T07:30:00.000Z"`; `istDate(new Date("2026-10-12T19:00:00Z")) === "2026-10-13"` (IST is already the 13th); `istTime` same instant → `"00:30"`; `parseDateText("tomorrow","2026-10-12")==="2026-10-13"`; `"12/10"` with today `2026-10-20` → `2027-10-12` (next occurrence); `"12 oct"`; `"oct 12"`; `"12-10-2026"`; `"2026-10-12"`; past date `"1 jan 2020"` → null; garbage `"next friday-ish"`, `"🙂"`, `""`, `"31/02"` → null; `parseNights("2")===2`, `"0"`, `"-3"`, `"31"`, `"1000"`, `"abc"` → null, `"for 3 nights"===3`; `parseEnquiry` on the exact `enquiryMessage()` output and on a QR message with a `/rooms/104` URL.
- [ ] **Step 4:** Run `npm test` → FAIL (module missing).
- [ ] **Step 5:** Implement `dates.ts` (no libs; month-name table; strict calendar validation so `31/02` is null; year inference = try current year, else next).
- [ ] **Step 6:** Move the old `pricing.ts` self-checks into `tests/pricing.test.ts` (same assertions + `todayISO` IST test), delete the `process.argv` block, change `todayISO`.
- [ ] **Step 7:** Run `npm test` → PASS. Checkpoint.

---

### Task 2: Schema, migrations, seed, DB client (includes the Prisma/Next spike)

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/<ts>_init/migration.sql` (generated), `prisma/migrations/<ts>_booking_no_overlap/migration.sql`, `prisma/seed-data.ts`, `prisma/seed.ts`, `src/lib/db.ts`, `src/lib/env.ts`, `tests/helpers/db.ts`, `tests/setup.ts`, `tests/schema.test.ts`
- Modify: `.gitignore` (`/src/generated`), `next.config.ts` if the spike needs `serverExternalPackages`

**Interfaces:**
- Produces: `prisma` (`src/lib/db.ts`), models exactly as spec §3; `resetDb()`, `seedRooms()` in `tests/helpers/db.ts`; `env` object in `src/lib/env.ts` (`DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `WA_*`, `OWNER_WHATSAPP` → `string[]`, `UPI_ID`, `UPI_PAYEE_NAME`, `HOLD_MINUTES` → number default 120, `CRON_SECRET`), each read lazily so missing vars only fail the feature that needs them.

- [ ] **Step 1: Spike (30 min cap).** `docker compose up -d db` (Docker Desktop must be running). Write the schema from spec §3 with `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`. `prisma migrate dev --name init`. Confirm `import { PrismaClient } from "@/generated/prisma/client"` works from (a) a `tsx` test and (b) a Next route under `next build` (Turbopack). If ESM extension/`importFileExtension` or `serverExternalPackages` config is needed, record the working config in `prisma/schema.prisma` / `next.config.ts` with a comment.
- [ ] **Step 2:** Hand-write the second migration (`booking_no_overlap`) exactly as spec §3 (`btree_gist` + `EXCLUDE`). `prisma migrate deploy` applies both cleanly on an empty DB.
- [ ] **Step 3: Failing test** `tests/schema.test.ts`: (a) inserting two overlapping CONFIRMED bookings for one room rejects; capture the raw error and assert what shape it has (`code`/`cause`/message contains `booking_no_overlap`) — this fixes the `isExclusionViolation` implementation used by Task 3; (b) same-day back-to-back allowed; (c) PENDING vs CONFIRMED overlap rejects; (d) CANCELLED overlap allowed; (e) different rooms allowed.
- [ ] **Step 4:** `tests/setup.ts` loads `.env`, points `DATABASE_URL` at `TEST_DATABASE_URL` when set; `resetDb()` truncates `Booking, Conversation, ProcessedMessage, Room` `RESTART IDENTITY CASCADE`. Run → PASS.
- [ ] **Step 5:** Write `prisma/seed-data.ts` (the 8 rooms copied verbatim from the old `data.ts`, minus `status`) and `prisma/seed.ts` (upsert by id, `sortOrder` = index). `npm run db:seed` fills the dev DB.
- [ ] **Step 6:** Write `db.ts` (global singleton for hot reload, `PrismaPg` adapter) and `env.ts`. Checkpoint.

---

### Task 3: Booking engine (`src/lib/engine.ts`)

**Files:**
- Create: `src/lib/engine.ts`, `tests/engine.test.ts`, `tests/concurrency.test.ts`
- Modify: `src/config.ts` (add `advanceRate: 0.5`, `defaults: { checkInTime: "13:00", checkOutTime: "11:00", maxNights: 30 }`, `timezoneOffset`)

**Interfaces:**
- Consumes: `prisma`, `dates.ts`, `pricing.ts`, `env.HOLD_MINUTES`
- Produces:
```ts
export type Fail = { ok: false; code: "CONFLICT"|"NOT_FOUND"|"INVALID"|"CAPACITY"|"INACTIVE"; message: string };
export type Ok<T> = { ok: true; value: T };
export type Result<T> = Ok<T> | Fail;
export type BookingRow = Booking & { room: Room };          // Prisma types

export function bookingRef(b: Pick<Booking,"seq"|"checkInAt">): string;   // HTL-YYYYMMDD-NNN (IST date)
export function seqFromRef(ref: string): number | null;
export function sweepHolds(now?: Date): Promise<number>;
export function isFree(roomId: string, from: Date, to: Date, excludeId?: string): Promise<boolean>;
export function freeRooms(from: Date, to: Date, opts?: { minCapacity?: number; excludeRoomId?: string }): Promise<Room[]>;
export function createBooking(i: {
  roomId: string; guestName: string; guestPhone: string; guests: number;
  checkIn: string; checkOut: string; checkInTime?: string; checkOutTime?: string;
  status: "PENDING"|"CONFIRMED"; source: "WHATSAPP"|"ADMIN";
  advancePaid?: number; parentId?: string; now?: Date;
}): Promise<Result<BookingRow>>;
export function confirmBooking(id: string, advance?: number, now?: Date): Promise<Result<BookingRow>>;   // default advance = round(total * advanceRate)
export function cancelBooking(id: string): Promise<Result<BookingRow>>;
export function extendBooking(id: string, newCheckOut: string, now?: Date): Promise<Result<BookingRow>>;  // uses default check-out time
export function moveRest(id: string, toRoomId: string, newCheckOut: string, now?: Date): Promise<Result<BookingRow>>;
export function occupancy(fromDate: string, days: number): Promise<{ roomId: string; day: string; bookingId: string|null; status: "PENDING"|"CONFIRMED"|null }[]>;
export function roomStatusNow(now?: Date): Promise<Record<string, "available"|"occupied"|"pending">>;
```
Every mutating function calls `sweepHolds` first. `createBooking` maps the exclusion violation (shape fixed in Task 2 step 3) to `{ code: "CONFLICT" }`.

- [ ] **Step 1: Failing tests** `tests/engine.test.ts`: create CONFIRMED ok + ref format `HTL-20261012-001`; overlap → CONFLICT; back-to-back same day (out 11:00 / in 13:00) ok; PENDING blocks and stores `holdExpiresAt = now+120min`; expired hold frees the room (`now` injected +3h) and the row becomes CANCELLED; cancelled frees; guests > capacity → CAPACITY; inactive room → INACTIVE; `checkOut <= checkIn` → INVALID; 31 nights → INVALID; unknown room → NOT_FOUND; `confirmBooking` sets CONFIRMED + `advancePaid` = 50% and is idempotent on a second call (no change, still ok); confirm after expiry revives when free, returns CONFLICT when someone else took the slot (Review Focus 4); `extendBooking` free → total/nights updated; blocked by a later booking → CONFLICT and row unchanged; extend to same value idempotent; `moveRest` creates a linked booking (`parentId`) in another room from the original check-out to the new date with `advancePaid` 0; `freeRooms` excludes booked and undersized rooms; `occupancy` marks nights covered (checkIn date ≤ day < checkOut date); `roomStatusNow` occupied/pending/available; `seqFromRef(bookingRef(b)) === b.seq`.
- [ ] **Step 2: Failing test** `tests/concurrency.test.ts`: 8 parallel `createBooking` on the same room/dates → exactly 1 ok, 7 CONFLICT, and no throw (Review Focus 1). Second test: parallel `confirmBooking` on one PENDING row → both ok, `advancePaid` set once.
- [ ] **Step 3:** Run → FAIL. Implement `engine.ts`; pre-check with `isFree`, insert in a transaction, catch exclusion violation. `sweepHolds` is one `updateMany`.
- [ ] **Step 4:** Run → PASS (engine + concurrency + schema). Checkpoint.

---

### Task 4: Bot core (`step`) + memory ports + transcripts

**Files:**
- Create: `src/lib/bot/types.ts`, `src/lib/bot/copy.ts`, `src/lib/bot/step.ts`, `src/lib/bot/ports-memory.ts`, `tests/bot.test.ts`, `tests/helpers/chat.ts`
- Source of copy/branching: existing `src/lib/wa-sim.ts` (delete it at the end of this task once ported)

**Interfaces:**
- Produces (`types.ts`):
```ts
export type Stage = "browsing"|"need_name"|"need_guests"|"need_checkin"|"need_nights"|"review"|"awaiting_payment"|"ext_need_date";
export type Draft = { name?: string; guests?: number; checkIn?: string; nights?: number; roomId?: string; bookingId?: string; extendBookingId?: string; lastNudge?: string; paymentPinged?: boolean };
export type ConvState = { phone: string; roomId: string | null; stage: Stage; draft: Draft };
export type InEvent = { kind:"text"; from:string; text:string } | { kind:"button"; from:string; id:string } | { kind:"media"; from:string };
export type Row = { id: string; title: string; description?: string };
export type Out = { to: string; text: string; buttons?: { id: string; title: string }[]; list?: { button: string; rows: Row[] }; template?: "owner_alert"|"last_day" };
export type BookingView = { id: string; ref: string; roomId: string; roomName: string; ratePerNight: number; guestName: string; guestPhone: string; guests: number; checkIn: string; checkInTime: string; checkOut: string; checkOutTime: string; nights: number; total: number; advancePaid: number; status: "PENDING"|"CONFIRMED"|"CANCELLED"; holdExpiresAt: string | null };
export interface Ports {
  settings: { owners: string[]; upiId: string; upiName: string; holdMinutes: number };
  now(): Date;
  rooms(): Promise<Room[]>;                         // active, ordered
  room(id: string): Promise<Room | null>;
  freeRooms(checkIn: string, checkOut: string, minCapacity: number, excludeRoomId?: string): Promise<Room[]>;
  createHold(i: { roomId: string; guestName: string; guestPhone: string; guests: number; checkIn: string; checkOut: string }): Promise<Result<BookingView>>;
  confirm(id: string): Promise<Result<BookingView>>;
  cancel(id: string): Promise<Result<BookingView>>;
  extend(id: string, newCheckOut: string): Promise<Result<BookingView>>;
  moveRest(id: string, toRoomId: string, newCheckOut: string): Promise<Result<BookingView>>;
  booking(id: string): Promise<BookingView | null>;
  activeByPhone(phone: string): Promise<BookingView[]>;
}
export function step(conv: ConvState, ev: InEvent, ports: Ports): Promise<{ conv: ConvState; out: Out[] }>;
export function lastDayNudges(ports: Ports, tomorrow: string): Promise<{ to: string; conv: ConvState|null; out: Out[] }[]>;   // used by cron (Task 7)
```
`Room` and `Result` come from Task 2/3 (`@/generated/prisma/client`, `@/lib/engine`).

Button/list ids: `start`, `confirm`, `change`, `restart`, `pick:<roomId>` (guest), `paid:<bId>`, `cancel:<bId>`, `ext_ok:<bId>:<yyyy-mm-dd>`, `ext_no:<bId>`, `ext_move:<bId>:<yyyy-mm-dd>`, `move:<bId>:<roomId>:<yyyy-mm-dd>`, `want_extend:<bId>`, `want_out:<bId>`, `accept_move:<bId>`, `decline_move:<bId>`.

- [ ] **Step 1:** `ports-memory.ts` — an in-memory Ports with an overlap check equal to the engine's semantics, settable clock, a rooms fixture (3 rooms), and helper `seedBooking()`. `tests/helpers/chat.ts` — `say(text)`, `tap(id)` helpers that run `step` and return `out`, plus `lastTo(phone)`.
- [ ] **Step 2: Failing transcript tests** in `tests/bot.test.ts` (all against memory ports, owner `919000000001`, guest `919812345678`):
  1. QR entry text `Hi! I'm interested in *Room 101 — Deluxe Double Room* …/rooms/101` → intro with 3 buttons, `conv.roomId==="101"`. No room in text → list of rooms.
  2. Website enquiry text with `Check-in: 10 Sep 2026 Check-out: 12 Sep 2026 Guests: 2` → draft prefilled; bot goes to `need_name`, later skips date questions.
  3. Info/price/breakfast/human intents; human → owner gets a notification.
  4. Full booking: `book` → name → guests → check-in → nights → review shows total; `confirm` → PENDING hold created, guest gets 50% advance text with UPI link (`upi://pay?pa=…&am=<advance>`), owner gets an alert with `paid:` and `cancel:` buttons, `template === "owner_alert"`.
  5. Owner taps `paid:<id>` → booking CONFIRMED; guest gets confirmation with ref, paid, due; owner gets ack. Tapping `paid:` again → "already confirmed", no duplicate messages to guest (Review Focus 4). `paid:` from a non-owner number → ignored, no out.
  6. Room taken for those dates → guest offered a list of free rooms that fit; picking `pick:<roomId>` continues to review with that room.
  7. Garbage dates/numbers at each stage (Review Focus 3): stage unchanged, example given; `guests` `0`, `9`, `abc`; nights `0`, `31`, `abc`; past date.
  8. Hold expired (clock +3h): guest `confirm`/`paid` gets "hold expired" + `restart` button; owner `paid:` on an expired hold revives if free, else tells the owner the room was taken.
  9. Last-day: `lastDayNudges(ports,"2026-10-13")` returns a nudge with `want_extend:`/`want_out:` for CONFIRMED bookings whose check-out is that date and not nudged that day; `want_out` → guest ack + owner note; `want_extend` → `ext_need_date`; date `+2 nights` / `15 oct` → extension request to owner.
  10. Extension: room free → owner gets `ext_ok`/`ext_no`; approve → booking extended, guest told; second tap → "already done". Room re-booked by someone else → owner sees who/from-when with `ext_move`/`ext_no`; `ext_move` → list of free rooms (`move:` rows); pick → `moveRest` leg created, guest gets `accept_move`/`decline_move`; `decline_move` cancels the leg.
  11. Media while `awaiting_payment` → guest reply + one owner ping (not repeated).
  12. Unknown text → friendly menu with chips, never an error.
- [ ] **Step 3:** Run → FAIL. Implement `types.ts`, `copy.ts`, `step.ts` porting the branching/copy from `wa-sim.ts` (message text kept), removing the sim's `Director`, threads, `followOn` fake, and `SimState`. Split `step` into `guestStep` and `ownerStep` chosen by `ports.settings.owners.includes(ev.from)`.
- [ ] **Step 4:** Run → PASS. Delete `src/lib/wa-sim.ts`. Checkpoint.

---

### Task 5: Prisma ports + conversation persistence

**Files:**
- Create: `src/lib/bot/ports-prisma.ts`, `src/lib/bot/conversation.ts`, `tests/ports-prisma.test.ts`

**Interfaces:**
- Consumes: engine (Task 3), `Ports`/`BookingView` (Task 4)
- Produces: `prismaPorts(now?: () => Date): Ports`; `toView(b: BookingRow): BookingView`; `loadConv(phone: string): Promise<ConvState>` (default `{stage:"browsing", roomId:null, draft:{}}`), `saveConv(conv: ConvState): Promise<void>` (upsert).

- [ ] **Step 1: Failing test:** run one full scripted booking + confirm + extend via `step` with `prismaPorts()` on the test DB (same assertions as bot tests 4, 5, 10 condensed) so memory and Prisma ports are proven equivalent; `loadConv`/`saveConv` round-trip; `toView` renders IST dates/times correctly for an instant at 23:30 IST (Review Focus 5).
- [ ] **Step 2:** Implement; `settings` read from `env`. `createHold` → `engine.createBooking({status:"PENDING", source:"WHATSAPP"})`; `confirm` → `engine.confirmBooking`.
- [ ] **Step 3:** Run → PASS. Checkpoint.

---

### Task 6: WhatsApp transport (`/api/whatsapp`)

**Files:**
- Create: `src/lib/wa/signature.ts`, `src/lib/wa/client.ts`, `src/lib/wa/inbound.ts`, `src/lib/wa/handle.ts`, `src/app/api/whatsapp/route.ts`, `tests/helpers/mockGraph.ts`, `tests/webhook.test.ts`

**Interfaces:**
- Produces:
  - `verifySignature(rawBody: string, header: string | null, secret: string): boolean` (constant-time)
  - `sendOut(out: Out): Promise<void>` — text → `type:"text"`; ≤3 buttons → `interactive.button`; list → `interactive.list`; if `out.template` and the matching `WA_TPL_*` env is set → `type:"template"` with body param = `out.text`; errors are caught and `console.error`ed
  - `parseInbound(body: unknown): { id: string; event: InEvent }[]` — text, `interactive.button_reply.id`, `interactive.list_reply.id`, image/document/other → `media`; ignores statuses
  - `handleInbound(msgs: {id:string; event:InEvent}[], ports = prismaPorts()): Promise<void>` — per message: insert `ProcessedMessage` (skip on unique violation), `loadConv(from)`, `step`, `saveConv`, `sendOut` each; on thrown error delete the `ProcessedMessage` row and rethrow-log
  - Route: `GET` verify handshake; `POST` raw body → signature → `after(() => handleInbound(...))` → `200`

- [ ] **Step 1:** `mockGraph.ts` — a local `http.createServer` capturing POSTs to `/{phoneId}/messages`, returns `{messages:[{id}]}`; sets `WA_API_BASE` to it.
- [ ] **Step 2: Failing tests** `tests/webhook.test.ts`: signature valid/invalid/missing/tampered-body; GET handshake right/wrong token; `parseInbound` for text, button_reply, list_reply, image, status-only; `handleInbound` end-to-end: guest QR text → mock Graph receives intro with buttons in the exact Cloud API JSON shape; **same message id twice → one reply set** (Review Focus 2); a thrown send error still leaves state consistent and retry works after deleting the marker; owner `paid:` from a non-owner number is ignored; a 4th button is rendered as a list; template used when env set, plain text otherwise.
- [ ] **Step 3:** Run → FAIL. Implement. Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` and `.../03-file-conventions/route.md` first; route uses `export const runtime = "nodejs"` and `await request.text()` for the raw body.
- [ ] **Step 4:** Run → PASS. Checkpoint.

---

### Task 7: Last-day cron and availability API

**Files:**
- Create: `src/app/api/cron/last-day/route.ts`, `src/app/api/availability/route.ts`, `vercel.json`, `tests/cron.test.ts`, `tests/availability.test.ts`

**Interfaces:**
- Consumes: `lastDayNudges`, `saveConv`, `sendOut`, `engine.isFree`, `toInstant`
- Produces: `GET /api/cron/last-day` (401 without `Authorization: Bearer $CRON_SECRET`; body `{sent: number}`), `GET /api/availability?room=101&from=2026-10-12&to=2026-10-14` → `{available: boolean, nights: number, total: number}` or `400`/`404` with `{error}`; `vercel.json` cron `30 11 * * *`.

- [ ] **Step 1: Failing tests:** cron auth 401/200; CONFIRMED booking with IST check-out tomorrow gets one nudge, second call the same day sends none (idempotent), PENDING/CANCELLED get none; near-midnight IST edge; availability true/false/400 for bad dates/`from>=to`/404 unknown room, capped at 30 nights.
- [ ] **Step 2:** Implement; the route handler wraps engine in try/catch → `500 {error}` never leaks stack. Run → PASS. Checkpoint.

---

### Task 8: Admin auth

**Files:**
- Create: `src/lib/auth.ts`, `src/proxy.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`, `tests/auth.test.ts`
- Modify: `src/app/admin/layout.tsx` (remove `ViewSwitcher`; add logout), `src/components/admin-shell.tsx` (logout button)

**Interfaces:**
- Produces: `signSession(now?: number): string`, `verifySession(token: string | undefined, now?: number): boolean` (HMAC-SHA256 over `exp.nonce`, 7-day expiry, constant-time), `checkPassword(input: string): boolean` (constant-time), `requireAdmin(): Promise<void>` (reads `cookies()`, `redirect("/admin/login")` when invalid) — called first in every admin page and server action; `proxy.ts` redirects unauthenticated `/admin/*` (not `/admin/login`).

- [ ] **Step 1:** Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `04-functions/cookies.md`.
- [ ] **Step 2: Failing tests:** sign/verify round-trip; expired token; tampered payload/signature; empty/undefined; wrong-length signature doesn't throw; `checkPassword` right/wrong/empty; missing `ADMIN_PASSWORD`/`SESSION_SECRET` → login refused (never accept empty).
- [ ] **Step 3:** Implement; login action sets `httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"`. Run → PASS. Checkpoint.

---

### Task 9: Admin UI on the database

**Files:**
- Modify: `src/app/admin/page.tsx`, `src/app/admin/bookings/page.tsx`, `src/app/admin/rooms/page.tsx`, `src/app/admin/qr/page.tsx`, `src/components/status-badge.tsx` (if new labels needed)
- Create: `src/app/admin/bookings/actions.ts`, `src/app/admin/bookings/new/page.tsx`, `src/app/admin/rooms/actions.ts`, `src/app/admin/rooms/[roomId]/page.tsx`, `src/app/admin/rooms/new/page.tsx`, `src/components/occupancy-grid.tsx`, `src/components/room-form.tsx`, `tests/admin-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, engine, `bookingRef`, `roomStatusNow`, `occupancy`
- Produces server actions (each starts with `await requireAdmin()`): `markAdvanceReceived(bookingId, amount?)`, `cancelBookingAction(bookingId)`, `createWalkIn(formData) → { error?: string }` (conflict message names the clashing booking ref/dates), `saveRoom(formData)`, `toggleRoomActive(roomId)`.

- [ ] **Step 1: Failing tests** (call the action functions directly with a stubbed `requireAdmin` via the same cookie helper used in `auth.test.ts`): unauthenticated call throws/redirects and changes nothing; `markAdvanceReceived` flips PENDING→CONFIRMED with default 50%; custom amount; `cancelBookingAction`; `createWalkIn` ok, conflict returns error text with ref, invalid guests/dates return field errors; `saveRoom` validates price > 0, capacity ≥ 1, id format `^[A-Za-z0-9-]{1,8}$`, image URLs must be `https://`; `toggleRoomActive` hides room from `freeRooms`.
- [ ] **Step 2:** Implement actions, then rebuild the pages keeping the existing look: dashboard (stat cards from real counts + `OccupancyGrid` 14 nights + recent bookings), bookings (filters status/source/search via `searchParams`, action buttons, "Add walk-in" link), rooms (list + create/edit form + active toggle), QR page reading rooms from DB. Money via `formatINR`, dates via IST helpers.
- [ ] **Step 3:** Run tests → PASS. Checkpoint.

---

### Task 10: Guest site on the database; remove demo-only code

**Files:**
- Modify: `src/app/(guest)/page.tsx`, `src/app/(guest)/rooms/page.tsx`, `src/app/(guest)/rooms/[roomId]/page.tsx`, `src/app/(guest)/qr/page.tsx`, `src/app/(guest)/contact/page.tsx`, `src/app/(guest)/layout.tsx`, `src/components/room-booking.tsx`, `src/components/room-card.tsx`, `src/components/site-nav.tsx`, `src/components/footer.tsx`, `src/lib/data.ts`, `src/lib/whatsapp.ts`
- Delete: `src/app/(guest)/whatsapp/`, `src/app/(guest)/future/`, `src/components/wa-conversation.tsx`, `src/components/view-switcher.tsx`, `src/components/contact-form.tsx`, `src/lib/bookings-store.ts`

**Interfaces:**
- Consumes: `prisma`, `roomStatusNow`, `GET /api/availability`
- Produces: `getRooms(): Promise<Room[]>` and `getRoom(id): Promise<Room|null>` in `src/lib/rooms.ts` (active only, ordered); `RoomBooking` (client) calls `/api/availability` on date change and shows Available / Not available with total; its CTA is `waLink(enquiryMessage({room, checkIn, checkOut, guests}))`.

- [ ] **Step 1:** `src/lib/rooms.ts`; pages switch to `await getRooms()`; remove `generateStaticParams` in favour of dynamic rendering (`export const dynamic = "force-dynamic"` or the Next-16-documented equivalent — read `.../02-route-segment-config/`). Unknown/inactive room → `notFound()`.
- [ ] **Step 2:** `RoomBooking` availability check (debounced fetch, aborts stale requests, error state falls back to "Couldn't check — ask on WhatsApp"). Badges use `roomStatusNow`.
- [ ] **Step 3:** Delete the demo-only files and fix every link/import (`grep -rn "whatsapp\"\|/future\|/whatsapp\|bookings-store\|ViewSwitcher\|mockBookings\|todayActivity"`). Home/footer/nav: replace links to removed pages with `/rooms` and the WhatsApp CTA. Contact page: remove the form, keep the contact cards.
- [ ] **Step 4:** `npm run lint` and `npx tsc --noEmit` clean. Checkpoint.

---

### Task 11: Config, docs, deployment files

**Files:**
- Modify: `README.md`, `.env.example`, `src/config.ts`, `.gitignore`
- Create: `vercel.json` (if not already from Task 7)

- [ ] **Step 1:** README rewritten: what it is, architecture in 6 lines, local setup (`npm i`, `docker compose up -d db`, `cp .env.example .env`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, `npm test`), env table, Vercel + Neon deploy (build command `prisma migrate deploy && next build`, `postinstall` generates the client), Meta go-live checklist from spec §10, the dedicated-number warning from spec §11, admin usage, the 3 message templates with sample body text.
- [ ] **Step 2:** `.env.example` complete and commented; `config.ts` comment updated (no more "DEMO CONFIG"). Checkpoint.

---

### Task 12: End-to-end verification

- [ ] **Step 1:** `docker compose up -d db`, migrate, seed, `npm test` → all green (paste the pass count).
- [ ] **Step 2:** `npm run build` succeeds (fix any Turbopack/Prisma issue), `npm run lint` clean.
- [ ] **Step 3:** Start `next start` with a mock Graph server and signed fake webhooks (`scripts/e2e.ts`, not shipped in the bundle): full journey — QR text → book → advance → owner confirms → cron nudge → extend (free) → second guest re-books → extend (conflict) → move → decline/accept; assert DB rows and every outbound message JSON.
- [ ] **Step 4:** Browser check with agent-browser (headless): login redirect, wrong password, dashboard, bookings actions, walk-in conflict message, rooms edit, room page availability widget, mobile width overflow check, QR page. Fix defects found.
- [ ] **Step 5:** Report to the user: what passed with evidence, what could not be verified (real Meta delivery), and the exact list of credentials/values needed (Neon `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, Meta `WA_*`, `OWNER_WHATSAPP`, `UPI_ID`/payee name, `CRON_SECRET`, dedicated WhatsApp number, template approvals).

---

## Self-review notes

- Spec §3–§9 map to Tasks 2, 3, 4/5, 6, 7, 8, 9, 10, 1/12. §10/§11 → Task 11. The 24-hour window/template behaviour is in Task 6 (`sendOut`) and Task 4 (`template` on owner alerts and nudges).
- `Result`, `BookingView`, `Ports`, `step`, `lastDayNudges`, `loadConv`/`saveConv`, `prismaPorts` names are used identically wherever they appear.
- Owner-side state is carried in button ids (`ext_ok:<bId>:<date>` etc.); the guest `Conversation.draft` holds only guest-side progress.
