import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { siteSettings } from "@/lib/site-settings";
import { PageFade } from "@/components/page-fade";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await siteSettings();
  return {
    title: { default: `${s.name} — ${s.tagline}`, template: `%s · ${s.name}` },
    description: `${s.name}, ${s.city}. Scan, view the room, check dates and book in the chat.`,
  };
}

export const viewport: Viewport = {
  themeColor: "#fbf8f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable}`}>
      <body className="grain min-h-[100dvh] antialiased">
        <PageFade>{children}</PageFade>
      </body>
    </html>
  );
}
