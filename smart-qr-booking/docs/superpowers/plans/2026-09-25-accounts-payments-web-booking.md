# Accounts, Payments, Website Booking & Paid Extensions — Implementation Plan

> **For agentic workers:** executed inline (superpowers:executing-plans) at the user's request ("build it now"). Steps are TDD: failing test → implement → green suite. No commits unless the user asks.

**Goal:** One booking engine with two front doors (WhatsApp bot and website), automatic phone-number accounts, a payment ledger the owner acknowledges, and self-service paid extensions — per the spec.

**Architecture:** Postgres is the single source of truth. New tables `Customer`, `Payment`, `OtpCode`. A *stay* is a root booking plus PENDING/CONFIRMED *segments* (`parentId` = root) for extensions or moves, each held by the no-overlap constraint while unpaid. Every amount owed is a `Payment` (AWAITING → CLAIMED with UTR → ACKNOWLEDGED/REJECTED). The bot keeps its `step()`/`Ports` seam, but the in-memory ports are removed: transcripts run against Postgres through `prismaPorts`, so there's one implementation to keep correct.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + adapter-pg, Postgres 16/Neon, WhatsApp Cloud API, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-09-25-accounts-payments-web-booking-design.md` (+ the base spec `2026-09-25-real-booking-mvp-design.md`).

## Global Constraints

- Advance for a new stay = `round(total * config.advanceRate)` (50%). Extension/move segments are paid 100%.
- UTR = exactly 12 digits. OTP = 6 digits, HMAC-hashed, 10-minute expiry, 5 attempts, 1 send/minute, 5 sends/hour per number.
- Guest session cookie `cc_guest`, 30 days, HMAC with SESSION_SECRET and a purpose prefix distinct from the admin cookie.
- Owner acknowledges payments, not bookings: owner WhatsApp buttons `ack:<paymentId>` / `nack:<paymentId>`. Legacy `paid:<bookingId>` still works; the old extension-approval buttons are answered as out of date.
- The no-overlap constraint, deadlock retry, per-number lock, 24h-window queue: unchanged and applied to segments.
- IST everywhere; money in integer INR; no new runtime dependencies.

## Review Focus

1. Owner taps Acknowledge twice / on a payment whose hold lapsed and the nights were taken → one confirmation, or a clear "refund" message; never a double `advancePaid`.
2. Guest extends while an unpaid extension is already open, or extends a stay that already has segments → one open segment, and the new one starts at the stay's current end.
3. Same UTR used for two payments → the owner is warned ("UTR seen before on HTL-…").
4. OTP brute force / resend spam → locked after 5 wrong codes; resend limited; the same message whether or not the number is known.
5. A signed-in guest opening another guest's booking or pay-claim → only their own stays on `/account`. Pay links stay unguessable ids.

---

### Task 1: Schema — Customer, Payment, OtpCode, Booking.customerId/contactPhone, source WEB
- Migration `accounts_payments` + backfill: one Customer per distinct `Booking.guestPhone` (name = most recent guestName), `customerId` set; one ACKNOWLEDGED ADVANCE Payment for every booking with `advancePaid > 0`, and one AWAITING Payment for every PENDING booking.
- Test (`tests/schema.test.ts`): Payment ↔ Booking relation, `Customer.phone` unique, OtpCode upsert.

### Task 2: Engine — customers + payment ledger
- `createBooking` upserts the Customer by phone, stores `customerId` and `contactPhone`, and creates the Payment: PENDING root → AWAITING ADVANCE(50%); PENDING segment → AWAITING EXTENSION(100%); CONFIRMED with `advancePaid > 0` → ACKNOWLEDGED ADVANCE.
- New: `customerByPhone(phone)`, `openPayment(bookingId)`, `paymentById(id)`, `claimPayment(bookingId, utr, now?)` → `Result<PaymentRow & { duplicateRef: string | null }>`, `acknowledgePayment(paymentId, amount?)` → `Result<PaymentRow & { already: boolean }>`, `rejectPayment(paymentId)`, `recordBalance(bookingId)`.
- `confirmBooking(id, amount?)` stays: it acknowledges the booking's open payment, creating one if none.
- `cancelBooking` also cancels open payments of the booking and its segments.
- Tests: claim validation (bad UTR, already acknowledged), duplicate UTR flag, ack idempotent + `advancePaid` once under parallel acks, ack after lapse revives or CONFLICT, reject → re-claim, balance.

### Task 3: Engine — stays and segments (replaces moveRest/extendBooking/activeLeg)
- `stayOf(id)` → `{ root, segments, end } | null` (active only; `end` = the latest check-out).
- `createSegment({ stayId, roomId, newCheckOut, now? })` → PENDING segment from `end.checkOutAt` to the default check-out time on `newCheckOut`, guests from the root, rate from the room, payment EXTENSION 100%. Idempotent for the same room + date while PENDING; INVALID if another segment is PENDING; CONFLICT if the nights are taken; 30-night limit on the whole stay.
- `extensionFree(stayId, newCheckOut)` → `{ end, sameRoomFree, freeRooms }`.
- `checkingOutOn(date)` returns only the end of each stay.
- Tests replace the moveRest/extendBooking suites.

### Task 4: Bot — booking questions, UTR claims, owner ack/nack, self-service extensions
- Ports: drop memory ports. `prismaPorts(clock)` gains `customer`, `claim`, `acknowledge`, `reject`, `payment`, `openPayment`, `stay`, `extensionOptions`, `extend`. `BookingView` gains `contactPhone`, `source`.
- Stages: `need_contact`, `need_utr`, `ext_choose_room` added. `need_nights` also accepts a check-out date.
- Flow per spec §5: name confirm (from Customer) → contact [this number / another] → guests → check-in → check-out → review → hold → pay link + [I've paid][Cancel booking] → UTR → claim → owner `ack`/`nack` → guest told. Extensions: date → same room free → segment + pay link; taken → list (`pick_ext:<room>`) → segment + pay link → claim → ack.
- Tests: `tests/bot.test.ts` rewritten on Postgres through the chat helper (clock injectable), covering every branch above plus the existing behaviours (entry, questions, bad input, holds, nudges, limits).

### Task 5: Guest accounts — OTP sign-in, session, /signin, /account
- `src/lib/guest-auth.ts`: `requestCode(phone, now?)`, `verifyCode(phone, code, now?)`. The code is sent via `WA_TPL_OTP` (authentication template with a copy-code button). Without the template: dev logs the code, production refuses.
- `src/lib/session.ts`: `signGuestSession(customerId)`, `verifyGuestSession(token)`. `src/lib/guest.ts`: `currentGuest()` (server).
- Pages: `(guest)/signin` (number → code), `(guest)/account` (stays with segments and payments, Pay, Extend on WhatsApp, sign out). Nav: Sign in / My account.
- Tests: `tests/guest-auth.test.ts` (hash, expiry, attempts, rate limits, enumeration-safe result, session sign/verify/tamper).

### Task 6: Website booking + pay-page claims
- `(guest)/book` page (sign-in required) → review → server action `createWebBooking` → engine hold (source WEB) → redirect to `/pay/[id]`.
- Pay page: UTR form → `claimFromWeb` → owner alert (same text as WhatsApp claims). Shows claimed / confirmed states.
- Room page: **Book now** (primary) + Ask on WhatsApp.
- Tests: `tests/web-booking.test.ts` on the logic module `src/lib/web-booking.ts` (sign-in required, capacity/dates validated, hold + payment created, claim → owner alert queued).

### Task 7: Owner console — payments to verify, payments, customers, balance, import
- Dashboard "Payments to verify" (CLAIMED) with Acknowledge / Not received. `/admin/payments` (filters). `/admin/customers` (search, stays, total paid, last stay). Booking rows: payments summary, segment labels, **Balance received**. `/admin/import` CSV → bookings (clash/bad-row report).
- Tests: `tests/admin.test.ts` additions (ack/reject via ops, balance, CSV import parsing + clashes).

### Task 8: Docs, templates, e2e, browser, final review
- README: accounts, OTP template, payments/UTR, extensions, import. `.env.example`: `WA_TPL_OTP`.
- `scripts/e2e.ts`: WhatsApp journey with UTR + ack + paid extension (same room and move); website journey with OTP (code captured from mock Graph), booking, claim, ack, account page.
- Browser checks (desktop + phone): sign-in, account, book, pay-claim, admin payments, customers, import.
- Fresh whole-branch review; fix Critical/Important with RED→GREEN tests.
