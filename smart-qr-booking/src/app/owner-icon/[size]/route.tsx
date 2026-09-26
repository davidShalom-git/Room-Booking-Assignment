/** The owner app's icon, drawn at build time: the property's initial on the brand's dark ink. */
import { ImageResponse } from "next/og";
import { config } from "@/config";

const SIZES = ["96", "192", "512"];
export const dynamicParams = false;
export const generateStaticParams = () => SIZES.map((size) => ({ size }));

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  const initial = config.property.name.replace(/^the\s+/i, "").charAt(0).toUpperCase();
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
    { width: size, height: size },
  );
}
