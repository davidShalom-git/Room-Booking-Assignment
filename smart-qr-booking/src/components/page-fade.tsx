"use client";

import { usePathname } from "next/navigation";

/** Re-mounts on every route change so each page plays the fade-up entrance. */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-up">
      {children}
    </div>
  );
}
