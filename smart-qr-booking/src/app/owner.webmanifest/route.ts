/** The owner app's manifest: installing the console from the phone's browser opens the Today screen. */
import { getSettings } from "@/lib/settings";

export async function GET() {
  const { name } = await getSettings();
  const manifest = {
    name: `${name} — Owner`,
    short_name: "Owner",
    description: `Bookings, payments and rooms for ${name}.`,
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
