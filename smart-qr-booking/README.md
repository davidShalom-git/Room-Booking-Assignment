# The Coral Courtyard — Smart QR Booking + WhatsApp Enquiry (demo MVP)

**Live:** https://smart-qr-booking.vercel.app

A polished, mobile-first **prototype** for a boutique hotel/hostel client. It shows the
concept end to end:

> **QR code → mobile room page → WhatsApp enquiry → booking, confirmed in chat**

Booking happens **only on WhatsApp** — the website is the shopfront (browse rooms,
photos, pricing, availability) and always hands off to chat to actually book. This is a
**demo**, not production. No database, auth, payments, email or real WhatsApp Business
API. All data is static/typed; bookings made through the WhatsApp simulation are kept in
`localStorage` so they show up in the admin screens.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

## Deploy (functional QR codes need a public URL)

1. Push this folder to a Git repo (GitHub/GitLab).
2. Import it at [vercel.com/new](https://vercel.com/new) — framework auto-detects as Next.js.
3. Add an environment variable:
   `NEXT_PUBLIC_BASE_URL = https://<your-project>.vercel.app`
   (or your custom domain). Used inside the pre-filled WhatsApp message.
4. Deploy. Re-deploy after changing the variable so it takes effect.

CLI alternative:

```bash
npm i -g vercel
vercel            # first run: log in + link the project
vercel --prod     # production deploy
```

## Make it "theirs" before the demo

Everything client-specific lives in **[`src/config.ts`](src/config.ts)**:

- property name, tagline, city, address, rating, contact, check-in/out times
- `whatsappNumber` — real business number, digits only, international format
  (currently `917539943015`). Every `wa.me` link and the room QR codes use it.
  **Note:** WhatsApp's click-to-chat can't open a chat with the number that's
  logged in on the same device — test the guest side from a *different* phone
  or WhatsApp account than this one.
- `qrTarget` — `"whatsapp"` (default): a room QR scan opens WhatsApp with that
  room's enquiry pre-filled. `"room"`: the QR opens the room's web page instead.
- `baseUrl` — falls back to `NEXT_PUBLIC_BASE_URL`.

Rooms, mock bookings and dashboard numbers are in
**[`src/lib/data.ts`](src/lib/data.ts)**. Room photos are curated Unsplash URLs.

## Screens

| Guest | Admin |
|---|---|
| `/` home | `/admin` dashboard |
| `/rooms` + filters | `/admin/rooms` |
| `/rooms/[id]` detail, dates, price, "Enquire on WhatsApp" | `/admin/bookings` + filters |
| `/qr` public QR wall | `/admin/qr` download / print |
| `/whatsapp` — the real flow, simulated: two phones (guest + front desk), ask → book → 50% advance → confirmation → last-day extend/checkout | |
| `/future` — real-API / payments / backend roadmap | |
| `/about`, `/contact` | |

A floating **Guest ⇄ Admin** switcher is on every page for presenting.

## What actually works

Navigation, room filtering, date/guest selection, live price calc, real `wa.me`
enquiry links, **real QR codes**, and the full WhatsApp simulation: connect →
ask (availability/pricing/amenities) → book (name, phone, dates+times, guests)
→ simulated advance payment → confirmation → last-day nudge → extend
(approve, or reallocate the guest if the room's re-booked) or check out. Every
WhatsApp booking persists into the admin dashboard/bookings with paid/due
shown. Everything else is visual.

## Logic checks

Pure logic has runnable self-checks (no test framework):

```bash
npx tsx src/lib/pricing.ts   # nights, totals, INR/date formatting, booking id
npx tsx src/lib/wa-sim.ts    # WhatsApp flow: booking, advance, extend, reallocation, checkout
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · `qrcode` · Fraunces + Plus Jakarta Sans.
