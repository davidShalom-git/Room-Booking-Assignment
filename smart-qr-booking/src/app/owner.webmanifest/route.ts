/** The owner app's manifest: installing the console from the phone's browser opens the Today screen. */
import { config } from "@/config";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: `${config.property.name} — Owner`,
    short_name: "Owner",
    description: `Bookings, payments and rooms for ${config.property.name}.`,
    id: "/admin/today",
    start_url: "/admin/today",
    scope: "/admin/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#262119",
    icons: [192, 512].map((s) => ({ src: `/owner-icon/${s}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any maskable" })),
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json" } });
}
