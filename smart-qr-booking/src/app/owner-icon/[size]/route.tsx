/** The owner app's icon: the property's initial on the brand's dark ink (cached for a day). */
import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";

const SIZES = ["96", "192", "512"];

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const raw = (await params).size;
  if (!SIZES.includes(raw)) return new Response("Not found", { status: 404 });
  const size = Number(raw);
  const initial = (await getSettings()).name.replace(/^the\s+/i, "").charAt(0).toUpperCase();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#262119",
          color: "#fbf8f3",
          fontSize: size * 0.46,
          fontWeight: 700,
        }}
      >
        {initial}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
