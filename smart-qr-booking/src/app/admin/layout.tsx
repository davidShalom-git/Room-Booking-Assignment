import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Owner console", template: "%s · Owner console" },
  robots: { index: false, follow: false },
  // Installable as the owner app (Add to Home Screen) — opens on the Today screen.
  manifest: "/owner.webmanifest",
  appleWebApp: { capable: true, title: "Owner", statusBarStyle: "default" },
  icons: { apple: "/owner-icon/192" },
};

export const viewport: Viewport = { themeColor: "#262119" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
