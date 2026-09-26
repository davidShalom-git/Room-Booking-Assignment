# The Coral Courtyard — hotel booking with a chat assistant and an owner app

A booking system for a small hotel. Guests book in a chat on the hotel's own website; the owner runs everything from an app on their phone. No third-party messaging accounts to set up.

> **Room QR / website → chat → guest pays a 50% advance by UPI and sends the UTR → owner taps Acknowledge on a phone notification → booked. Extensions: self-service, paid in full, acknowledged the same way.**

- **Guests** scan a room's QR code, which opens that room's page, or tap **Chat to book** anywhere on the site. The booking assistant answers questions and checks the real calendar. It takes the booking (name, mobile number, guests, check-in and check-out) and holds the room for 2 hours while they pay the 50% advance. Payment is a link to a pay page: one tap opens their UPI app with the amount filled in, or they can scan the QR code there. They tap **I've paid** and send the 12-digit UPI reference (UTR). Guests can type *my booking* at any time to see where things stand.
- **A chat belongs to the visitor's browser**, not to a phone number typed into it. Nobody can see or cancel someone else's booking by typing their number. The owner's confirmation comes back into the same chat, and the pay page shows it too.
- **Owner app:** the console installs on the owner's phone (*Install app* / Add to Home Screen) and opens on **Today**: rooms free tonight, new bookings, money received, payments waiting, arrivals and departures. With alerts on, every payment arrives as a notification, e.g. *"Priya Sharma paid ₹1,500 advance for Room 102, UTR 777788889999"*, with **Acknowledge** / **Not received** buttons that work straight from the notification. Acknowledge confirms the booking and tells the guest in their chat. A summary of the day arrives every evening at 9 PM.
- **Extensions are self-service:** the evening before check-out the chat asks whether the guest would like to extend (they can also type *extend* at any time). They pick a new check-out date. If the room is still free, the extra nights are held in the same room. If it's taken, the guest picks one of the free rooms and moves. Either way they pay the extra nights in full and the owner acknowledges the payment.
- **The owner console** (`/admin`) works in any browser as well: payments to check, a 14-night occupancy grid, bookings (with *Balance received* at check-in), customers, rooms, printable QR codes, and a CSV import for bookings you already have.
- **No double bookings, ever.** Postgres itself refuses overlapping stays for the same room, through an `EXCLUDE` constraint that is tested with parallel requests. Unpaid holds block the room and release automatically when they lapse.

## How it fits together

```
Website chat (every page) ──► POST /api/chat ──► assistant (src/lib/bot/step.ts) ──► booking engine ──► Postgres
                                                        │
                        replies ◄── chat messages ◄─────┤
                owner's phone ◄── Web Push ◄────────────┘   (payment alerts, "call me" requests)
Owner notification: Acknowledge / Not received ──► POST /api/owner/act (signed, one payment) ──► booking engine
Vercel Cron 17:00 IST ──► /api/cron/last-day ──► "extend your stay?" in the guest's chat
Vercel Cron 21:00 IST ──► /api/cron/daily-summary ──► the day in numbers, to the owner's phone
Owner app / console (/admin, password) ──► server actions ──► booking engine
```

| Piece | Where |
|---|---|
| Booking engine: availability, holds, stays & extension segments, customers | `src/lib/engine.ts` |
| Payment ledger: owed → claimed (UTR) → acknowledged, balance at check-in | `src/lib/payments.ts` |
| No-overlap guarantee | `prisma/migrations/*_booking_no_overlap/migration.sql` |
| The assistant: every message and branch, a pure function | `src/lib/bot/step.ts`, `copy.ts` |
| Website chat: chat key cookie, rate limits, one message at a time per chat | `src/lib/web-chat.ts`, `src/app/api/chat/route.ts`, `src/components/chat-widget.tsx` |
| Where messages go (the guest's chat, or the owner's phone) | `src/lib/deliver.ts`, `src/lib/push.ts` |
| Owner app: Today, notifications, 9 PM summary | `src/lib/owner-app.ts`, `src/app/admin/(console)/today`, `public/owner-sw.js` |
| Pay page (UPI link, QR code, UTR box) | `src/app/(guest)/pay/[bookingId]`, `src/lib/pay-page.ts` |
| Owner console | `src/app/admin/**`, `src/lib/admin-ops.ts`, `src/lib/admin-data.ts` |
| Property details (name, address, phone, check-in times, advance %) | `src/config.ts` |

Stack: Next.js 16 (App Router) · TypeScript · Prisma 7 + PostgreSQL · Web Push · Tailwind CSS v4 · Vercel.

## Run it locally

Needs Node 22+ and Docker.

```bash
npm install                 # also generates the Prisma client
npm run db:up               # Postgres 16 in Docker on localhost:55432 (+ a test database)
cp .env.example .env        # then set ADMIN_PASSWORD and SESSION_SECRET
npm run db:migrate
npm run db:seed             # the 8 rooms
npm run dev                 # http://localhost:3000 — chat on every page, owner console at /admin
```

### Tests

```bash
npm test                       # 189 tests: website chat, owner app, dates/IST, engine, payments, stays, concurrency, assistant transcripts (on Postgres), pay page, admin
npm run build && npm run e2e   # production build: full guest and owner journeys over real HTTP
```

`npm test` only ever touches `TEST_DATABASE_URL`, and refuses to run without it.

## Configuration

Everything secret or per-environment is an environment variable. `.env.example` lists them all.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection. On Neon use the **pooled** URL (host contains `-pooler`), with `sslmode=verify-full`. |
| `DIRECT_DATABASE_URL` | Production only: Neon's **direct** URL (same without `-pooler`). Used by migrations during the build. |
| `ADMIN_PASSWORD` | Owner console password. |
| `SESSION_SECRET` | 32+ random characters. Changing it signs everyone out and expires the buttons on notifications already sent. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Owner app notifications (Web Push). Generate once with `npx web-push generate-vapid-keys`. Without them the app works, just without notifications. |
| `UPI_ID`, `UPI_PAYEE_NAME` | Where guests pay the advance. The pay page builds a `upi://` link and QR code from them. |
| `HOLD_MINUTES` | How long an unpaid booking holds the room (default 120). |
| `CRON_SECRET` | Protects `/api/cron/*` (Vercel sends it automatically). |
| `NEXT_PUBLIC_BASE_URL` | The public site URL, e.g. `https://smart-qr-booking.vercel.app`. QR codes and pay links use it. |

The property name, address, phone number, check-in/out times and the advance share (`advanceRate`) are in `src/config.ts`.

## Deploy (Vercel + Neon)

1. **Database:** the Neon database is already migrated and seeded with the 8 rooms. For a fresh one: `DIRECT_DATABASE_URL=<direct url> npx prisma migrate deploy`, then `DATABASE_URL=<pooled url> npm run db:seed`.
2. **Vercel → Project → Settings → Environment Variables:** add every variable from the table above, scoped to **Production**. Keep the database variables out of Preview, or point Preview at a separate Neon branch, so preview deployments never touch live bookings.
3. **Deploy.** On production builds `vercel.json` runs `prisma migrate deploy` before `next build`, so schema changes apply themselves. Preview builds skip it. `vercel.json` also registers the two daily crons (17:00 and 21:00 IST).
4. Open `https://<domain>/api/health`. It should say `{"ok":true,"rooms":8}`.
5. Sign in at `https://<domain>/admin`.

## Go-live checklist

1. **Owner's phone:** open `https://<domain>/admin` on the phone, sign in, and tap **Install app** (on iPhone: Share → *Add to Home Screen*, then open it from the home screen).
2. **Alerts:** on **Today**, tap **Turn on alerts** and allow notifications. Send yourself a test from the same card. Repeat on any other phone that should get alerts, such as the front desk's.
3. **Payments:** set `UPI_ID` and `UPI_PAYEE_NAME` to the account guests should pay.
4. **Print the QR codes** from `/admin/qr`. Each one opens its room's page, where **Book in chat** starts the booking.
5. **Smoke test** from a phone that is not the owner's: scan a code, book in the chat, pay the advance and send the UTR, tap *Acknowledge* on the owner's phone, and check that the chat shows the confirmation and `/admin/bookings` shows the booking.

## Day to day

- **A guest has paid:** a notification shows their name, room, amount and UTR, with **Acknowledge** / **Not received**. The same list is under *Payments to check* on **Today** and in the console. Find the UTR in your UPI app or bank SMS, then tap. The guest gets their confirmation and booking ID (`HTL-20261012-007`) in their chat. A UTR that was already used on another booking is flagged.
- **Existing bookings:** import them once from a spreadsheet at `/admin/import`, so the chat and the website know the true occupancy from day one.
- **Balance at check-in:** tap **Balance received** on the booking. The customer's total paid is kept on `/admin/customers`.
- **One unpaid hold per chat.** A guest can release their own hold (**Cancel booking**, or type *cancel*), and the owner is told.
- **Unpaid holds** release on their own after `HOLD_MINUTES`. A guest who already sent their UTR isn't told it expired. Acknowledging still works as long as nobody else has taken the room meanwhile (also **Payment arrived late — confirm** in `/admin/bookings`). If someone has, you're told to refund.
- **Guest asks for a person** (types *desk*, *call me*, …): they're shown the front-desk number, and you get a notification with their number to call back.
- **Phone / walk-in bookings:** `/admin/bookings/new`. Clashes are shown, never saved.
- **Rooms:** edit prices, descriptions and photos (image URLs) at `/admin/rooms`. *Hide* takes a room out of the site and the chat without touching its bookings. Price changes never alter existing bookings.
- **Cancelling** a chat booking in the console tells the guest in their chat. If the stay was moved to a second room, that part is cancelled too.

## Known limits

- Payments are confirmed by the owner (manual UPI). There is no payment gateway, and no automatic refunds.
- The assistant understands keywords and simple dates ("12 oct", "12/10", "tomorrow", "+2 nights"), not free-form conversation. Anything it doesn't get produces a menu, and "desk" hands the guest to a person.
- A guest's chat lives in their browser. On another phone or after clearing site data they start a new chat. Their booking stays safe and the owner can see it, but the new chat can't act on it.
- Notifications need the owner app installed and alerts turned on. On iPhone that means iOS 16.4 or later, from the home-screen app.
- There is one owner password: no per-staff accounts and no rate limit beyond a delay on wrong passwords.
- Room photos are URLs (no upload).

Design and implementation notes: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
