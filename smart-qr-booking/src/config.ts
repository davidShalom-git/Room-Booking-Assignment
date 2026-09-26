/**
 * Property configuration — the details that make this "your" hotel.
 * Secrets and per-environment values (database, push keys, UPI id) are env vars,
 * see .env.example; everything else the site shows lives here.
 */
export const config = {
  property: {
    name: "The Coral Courtyard",
    tagline: "A boutique stay in the heart of the old town",
    city: "Fort Kochi, Kerala",
    address: "12 Bastion Street, Fort Kochi, Kerala 682001",
    rating: 4.8,
    reviews: 214,
    email: "stay@coralcourtyard.example",
    phone: "+91 86374 66746",
    checkIn: "1:00 PM",
    checkOut: "11:00 AM",
    // Property-level amenities shown on the home page.
    amenities: [
      "Free WiFi",
      "Complimentary breakfast",
      "Airport pickup",
      "Rooftop cafe",
      "24×7 front desk",
      "Travel desk",
    ],
  },

  /** Share of the total collected up front to hold a booking. */
  advanceRate: 0.5,

  /** Times applied when a booking is made in chat (property local time, IST). */
  defaults: {
    checkInTime: "13:00",
    checkOutTime: "11:00",
    /** Longest single stay the chat / console will accept. */
    maxNights: 30,
  },

  /**
   * Public base URL the QR codes point at. In production set NEXT_PUBLIC_BASE_URL
   * to the deployed domain (e.g. https://coral-courtyard.vercel.app).
   * Falls back to localhost for local runs.
   */
  baseUrl:
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000",
} as const;

export const roomUrl = (roomId: string) => `${config.baseUrl}/rooms/${roomId}`;
