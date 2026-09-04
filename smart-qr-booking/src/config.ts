/**
 * DEMO CONFIG — swap these values before showing the client.
 * Everything the demo needs to feel like a real property lives here.
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
    phone: "+91 75399 43015",
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

  /**
   * WhatsApp business number in international format, digits only (no +, spaces or dashes).
   * Used to build real wa.me links (open WhatsApp with a pre-filled message).
   */
  whatsappNumber: "917539943015",

  /**
   * What the room QR codes point at:
   *   "whatsapp" — scan opens WhatsApp with a pre-filled enquiry for that room (real)
   *   "room"     — scan opens the room page on the website
   */
  qrTarget: "whatsapp" as "whatsapp" | "room",

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
