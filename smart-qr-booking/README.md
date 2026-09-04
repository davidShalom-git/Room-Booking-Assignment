# The Coral Courtyard — Smart QR Booking + WhatsApp Enquiry (demo MVP)

**Live:** https://smart-qr-booking.vercel.app


A polished, mobile-first **prototype** for a boutique hotel/hostel client. It shows the
concept end to end:

> **QR code → mobile room page → availability → Book now _or_ Ask on WhatsApp → confirmation**

This is a **demo**, not production. No database, auth, payments, email or real WhatsApp
Business API. All data is static/typed; bookings made in the browser are kept in
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
   (or your custom domain). This is what the QR codes encode.
4. Deploy. Re-deploy after changing the variable so the QR codes pick it up.

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
- `qrTarget` — `"whatsapp"` (default): a room QR scan opens WhatsApp with that
  room's enquiry pre-filled, addressed to `whatsappNumber`. `"room"`: the QR
  opens the room's web page instead.
- `baseUrl` — falls back to `NEXT_PUBLIC_BASE_URL`; used for links inside the
  pre-filled WhatsApp message.

Rooms, mock bookings and dashboard numbers are in
**[`src/lib/data.ts`](src/lib/data.ts)**. Room photos are curated Unsplash URLs.

## Screens

| Guest | Admin |
|---|---|
| `/` home | `/admin` dashboard |
| `/rooms` + filters | `/admin/rooms` |
| `/rooms/[id]` detail, dates, price, CTAs | `/admin/bookings` + filters |
| `/rooms/[id]/book` → `/booking/confirmation` | `/admin/qr` download / print |
| `/qr` public QR wall | |
| `/whatsapp` interactive assistant (connect dataset → ask → book) | |
| `/future` scripted "Future WhatsApp Automation" concept | |
| `/about`, `/contact` | |

A floating **Guest ⇄ Admin** switcher is on every page for presenting.

## What actually works

Navigation, room filtering, date/guest selection, live price calc, the booking form,
booking confirmation, WhatsApp pre-filled messages, **real QR codes** linking to room
pages, the rule-based WhatsApp assistant (availability, pricing, amenities, full booking
flow), and demo bookings flowing into the admin views. Everything else is visual.

## Logic checks

Pure logic has runnable self-checks (no test framework):

```bash
npx tsx src/lib/pricing.ts   # nights, totals, INR/date formatting, booking id
npx tsx src/lib/bot.ts       # WhatsApp assistant intents + booking flow
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · `qrcode` · Fraunces + Plus Jakarta Sans.
