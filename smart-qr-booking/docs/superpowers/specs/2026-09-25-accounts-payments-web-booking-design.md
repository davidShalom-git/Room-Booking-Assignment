# Accounts, payments, website booking and paid extensions — design

Date: 2026-09-25 · Status: approved in conversation · Builds on `2026-09-25-real-booking-mvp-design.md`

## 1. Goal

The same booking journey on two front doors, WhatsApp and the website, backed by one database that is the single source of truth: which rooms are free, who the customers are, what is paid, what is extended.

> **WhatsApp:** guest taps the WhatsApp button under a room → asks about it (free rooms listed if it's taken) → books (name, contact phone, guests, check-in, check-out) → gets a UPI pay link for the advance → taps *I've paid* and gives the UTR → owner gets "customer X paid ₹Y for Room Z, UTR …" → owner taps **Acknowledge** → booked.
>
> **Extension:** guest asks to extend → system checks the room → free: pay the extra nights in full → owner acknowledges → extended. Taken: guest picks another free room → pays in full → owner acknowledges → the stay continues in that room.
>
> **Website:** the same booking online, plus an account page with every past and upcoming stay.

### Decisions made with the owner of this work

| Decision | Choice |
|---|---|
| Accounts | **Automatic**, keyed by phone number. Created on first booking (WhatsApp or website). No sign-up form. Website sign-in = WhatsApp number + 6-digit code sent on WhatsApp. |
| Payment proof | Guest gives the 12-digit UPI reference (UTR), or sends a screenshot on WhatsApp. Owner matches it in the bank app and acknowledges. No payment gateway. |
| Advance | 50% of a new stay (`config.advanceRate`). Balance at check-in, recorded by the owner. |
| Extensions | No owner approval. The system checks availability. Extra nights are paid **in full** up front and confirmed by the owner's acknowledgment. |
| Room taken for an extension | **Guest picks** from the free rooms (list with prices), then pays. |
| Existing data | Rooms are already seeded. Existing bookings can be imported from a CSV in the console. |

## 2. How the bot talks to the database

```
Guest WhatsApp → Meta → POST /api/whatsapp → bot step() → Ports → booking engine → Postgres
                                   reply ← Graph API ← deliver() ←┘
```

The bot never keeps state in memory. Every message is read from, and written to, Postgres:

| Question the bot answers | Where it comes from |
|---|---|
| Is Room 101 free 12–14 Oct? Which rooms are? | `Booking` rows (PENDING/CONFIRMED block, CANCELLED don't) + the `booking_no_overlap` constraint |
| Who is this? | `Customer` (by WhatsApp number) |
| What does this guest owe / has paid? | `Payment` rows |
| Where is this chat up to? | `Conversation` (stage + draft) |
| Is this stay extended / moved? | `Booking.parentId` chain (segments of one stay) |

The website and the owner console read and write the same tables, through the same engine.

## 3. Data model changes

```prisma
model Customer {
  id        String    @id @default(cuid())
  phone     String    @unique            // digits, international — the WhatsApp number
  name      String
  email     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  bookings  Booking[]
}

enum PaymentKind   { ADVANCE EXTENSION BALANCE }
enum PaymentStatus { AWAITING CLAIMED ACKNOWLEDGED REJECTED CANCELLED }

model Payment {
  id             String        @id @default(cuid())
  bookingId      String                      // the booking (or extension segment) it pays for
  booking        Booking       @relation(fields: [bookingId], references: [id])
  kind           PaymentKind
  amount         Int                         // INR
  status         PaymentStatus
  utr            String?                     // UPI reference the guest gave
  proof          String?                     // "screenshot on WhatsApp", or a note
  claimedAt      DateTime?  @db.Timestamptz(3)
  acknowledgedAt DateTime?  @db.Timestamptz(3)
  createdAt      DateTime      @default(now())
  @@index([status])
  @@index([bookingId])
}

model OtpCode {                             // website sign-in codes
  phone     String   @id
  codeHash  String                           // HMAC of the code; the code itself is never stored
  expiresAt DateTime @db.Timestamptz(3)
  attempts  Int      @default(0)
  sentAt    DateTime @db.Timestamptz(3)
  sendCount Int      @default(1)             // per rolling hour, for rate limiting
}
```

`Booking` gains `customerId` (required once backfilled; the migration creates a customer for every existing phone) and `contactPhone` (the number the guest gave, which defaults to the WhatsApp number). `Booking.advancePaid` stays as a denormalised total of acknowledged payments, so the existing screens and queries keep working.

**Stays and segments.** A stay is a root booking plus any segments linked by `parentId`. A segment is an extension in the same room or a move to another room. Segments are real bookings: they hold the nights (`PENDING` with `holdExpiresAt`) while the guest pays, and they fall under the same no-overlap constraint, so nobody can take those nights in between. The existing `moveRest` mechanism generalises to "same room or another room".

## 4. Payments — one flow for everything

1. A hold (new stay or segment) is created → a `Payment(AWAITING)` for the advance (stay) or the full amount (segment).
2. Guest pays by UPI via the pay page (`/pay/[bookingId]`, already built: UPI deep link, QR, copy UPI ID).
3. **Claim.** On WhatsApp the guest taps *I've paid*, and the bot asks for the 12-digit UTR (or a screenshot). On the website, the pay page has a UTR field. → `Payment(CLAIMED, utr)`.
4. **Owner alert** (WhatsApp + console "Payments to verify"): *"Asha Nair · +91 98123 45678 paid ₹1,800 advance for Room 101 (12 → 14 Oct) · UTR 412345678901"* with **Acknowledge** / **Not received**.
5. **Acknowledge** → `Payment(ACKNOWLEDGED)` → booking/segment `CONFIRMED` (reviving a lapsed hold if the room is still free, as today) → guest told, and `advancePaid` updated. **Not received** → `Payment(REJECTED)`, and the guest is asked to check and re-send. The hold keeps running until it expires.
6. **Balance at check-in:** the console's **Balance received** records a `Payment(BALANCE, ACKNOWLEDGED)`.

UTR validation: exactly 12 digits (UPI RRN). A screenshot on WhatsApp is accepted as a claim without a UTR ("proof: screenshot on WhatsApp").

## 5. WhatsApp flow changes

- **Booking questions:** "Book under *Asha Nair*?" [Yes] [Another name] (from `Customer`, or asked the first time) → contact number [Use this WhatsApp number] [Another number] → guests → check-in date → **check-out date** (a number of nights is still accepted) → availability (free rooms listed if taken) → review → hold → pay link + [I've paid] [Cancel booking].
- **I've paid** → "Send the 12-digit UPI reference (UTR) from your UPI app, or a screenshot" → claim → "Thanks, the front desk will confirm shortly."
- **Owner buttons** become payment decisions: `ack:<paymentId>`, `nack:<paymentId>`. The old approve / decline / move buttons are answered as out of date.
- **Extend** (from the last-day nudge, or by typing *extend*): new check-out date → same room free? → hold segment + full-amount pay link. Taken → list of free rooms for those nights → guest picks → hold segment there + pay link → claim → owner acknowledges → *"You're extended to 16 Oct"* / *"From 14 Oct you'll be in Room 201"*. Owner alert names what it is: *"Asha extends Room 101 by 2 nights, paid ₹3,600, UTR …"* or *"… moving 101 → 201 on 14 Oct …"*.
- *my booking* lists stays with paid / due and pay links.

## 6. Website

- **Sign-in** (`/signin`): WhatsApp number → code sent via the `WA_TPL_OTP` authentication template → 6-digit code → signed guest session cookie (`cc_guest`, 30 days; the same HMAC scheme as the admin cookie, different secret purpose). Codes are HMAC-hashed, expire after 10 minutes, and allow 5 attempts. Sends are limited to 1 per minute and 5 per hour per number.
- **Room page:** **Book now** (primary) next to *Ask on WhatsApp*, using the existing date/guest picker with live availability → `/book?room&from&to&guests` → sign-in if needed → review (name prefilled, editable) → **Confirm** → hold + payment → `/pay/[bookingId]` with a UTR form → claimed → owner alert → on acknowledgment the guest is told on WhatsApp and `/account` shows Confirmed.
- **`/account`:** upcoming and past stays, each with rooms/segments, dates, total, paid, due, status, a **Pay** button when something is awaiting, and **Extend on WhatsApp** (a deep link with *extend HTL-…* pre-filled). Sign out.
- The pay page stays reachable by its unguessable link, and also from `/account`.

## 7. Owner console additions

- **Dashboard:** "Payments to verify" (claimed payments with UTR) with Acknowledge / Not received.
- **Payments page:** all payments, filterable by state and kind.
- **Customers page:** name, phone, number of stays, total paid, last stay. Clicking one shows their bookings.
- **Booking row:** the payment history, **Balance received**, and segments shown as one stay.
- **Import** (`/admin/import`): upload a CSV with `room,guest name,phone,check-in,check-out,guests,advance paid`. Each row becomes a CONFIRMED admin booking through the engine (customer auto-created); clashes and bad rows are listed and not saved.

## 8. Templates (Meta)

| Env | Category | Purpose |
|---|---|---|
| `WA_TPL_OTP` | Authentication | Website sign-in code (Meta's standard OTP format with a copy-code button) |
| `WA_TPL_NOTIFY` | Utility | Anything outside the 24h window (owner alerts, web bookers) — existing |
| `WA_TPL_LAST_DAY` | Utility | Last-day nudge — existing |

Without `WA_TPL_OTP`, website sign-in can't send codes. The sign-in page says so and offers *continue on WhatsApp* instead.

## 9. Error handling and edge cases

- The no-overlap constraint, the deadlock retry and the per-number processing lock all apply to segments and payments unchanged.
- **Acknowledging a payment:** idempotent. A second tap says "already acknowledged".
- **Acknowledging after the hold lapsed:** revives the hold if the nights are still free. Otherwise the owner is told to refund, and nothing is confirmed.
- **Double claims:** a second UTR replaces the first while the payment is CLAIMED. After acknowledgment it's refused politely.
- **UTR reuse:** a UTR already acknowledged on another payment is flagged to the owner ("UTR seen before on HTL-…").
- **OTP:** wrong code → attempts++, and after 5 the code is invalidated. An expired code needs a new one. Rate limits return a friendly wait time. An enumeration-safe message is shown whether or not the number has an account.
- **Guest session:** only the signed-in customer's own bookings are visible. Every server action re-checks the session.

## 10. Testing

- Scripted chat tests (memory ports) for every new branch: name/contact confirmation, check-out date, claim with UTR / screenshot / bad UTR, owner ack / nack / repeat, extension same room, extension with a move, taken rooms listed, lapsed segment hold.
- Database tests: payments and segments under races (parallel claims, parallel acknowledgments, a segment hold vs a competing booking), customer backfill migration, CSV import (clashes, bad rows).
- Auth tests: OTP hash/expiry/attempts/rate limit, and guest session sign/verify.
- End-to-end on the production build: a WhatsApp journey with UTR claim + acknowledgment + paid extension; a website journey with sign-in by code (mock Graph captures the code), booking, UTR claim, acknowledgment, account page.
- Browser check of the new pages on desktop and phone widths.

## 11. Out of scope (can follow)

A payment gateway (Razorpay auto-confirmation), refunds, in-WhatsApp forms (WhatsApp Flows), extending from the website (the account page links to WhatsApp for it), email notifications, multiple staff accounts.
