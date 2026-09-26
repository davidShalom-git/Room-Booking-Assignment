/**
 * Fixed configuration. The property's own details (name, contact, times, advance, UPI, photos)
 * are owner-editable settings, see lib/settings.ts; secrets and per-environment values are env
 * vars, see .env.example.
 */
export const config = {
  defaults: {
    /** Longest single stay the chat / console will accept. */
    maxNights: 30,
  },

  /**
   * Public base URL the QR codes and pay links point at. In production set NEXT_PUBLIC_BASE_URL
   * to the deployed domain (e.g. https://coral-courtyard.vercel.app). Falls back to localhost.
   */
  baseUrl:
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000",
} as const;

export const roomUrl = (roomId: string) => `${config.baseUrl}/rooms/${roomId}`;
