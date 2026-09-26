/** Ultra-light line icons — 24×24, stroke 1.25, currentColor. */
import type { SVGProps } from "react";

const S = (props: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const Icon = {
  wifi: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0" />
      <circle cx="12" cy="19" r=".5" fill="currentColor" />
    </svg>
  ),
  snow: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 2v20M4 6l16 12M20 6 4 18M12 5 9 8m3-3 3 3M12 19l-3-3m3 3 3-3M5 9l1 3-1 3m14-6-1 3 1 3" />
    </svg>
  ),
  tv: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M8 21h8M12 6 8 2m4 4 4-4" />
    </svg>
  ),
  droplet: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  ),
  bath: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 12h16M5 12v4a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-4M6 12V6a2 2 0 0 1 4 0M7 19l-1 2m12-2 1 2" />
    </svg>
  ),
  bell: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  chat: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5v-9ZM8 9h8M8 12h5" />
    </svg>
  ),
  send: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 12 20 4l-6 16-3-7-7-1ZM11 13l9-9" />
    </svg>
  ),
  fridge: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="6" y="2" width="12" height="20" rx="1.5" />
      <path d="M6 9h12M9 5v1M9 12v3" />
    </svg>
  ),
  sun: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4 12H2m20 0h-2M5 5 4 4m15 1 1-1M5 19l-1 1m15-1 1 1" />
    </svg>
  ),
  leaf: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M20 4S8 4 6 12s6 8 6 8 8-2 8-10c0-3-0-6 0-6ZM6 20 14 10" />
    </svg>
  ),
  wind: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 14h15a2.5 2.5 0 1 1-2.5 2.5M3 19h9" />
    </svg>
  ),
  desk: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M3 7h18M4 7l1 13m14-13-1 13M5 12h6M14 20v-6h5v6" />
    </svg>
  ),
  coffee: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 9h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9ZM17 10h2a2 2 0 0 1 0 4h-2M8 3v2m3-2v2" />
    </svg>
  ),
  sparkle: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6ZM19 3v3M21 4h-3" />
    </svg>
  ),
  moon: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M20 13a8 8 0 1 1-9-9 6 6 0 0 0 9 9Z" />
    </svg>
  ),
  broom: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M19 3 11 11M8 14l2 2M6 21c-1-3 1-6 4-7l3 3c-1 3-4 5-7 4ZM10 17l4 4" />
    </svg>
  ),
  sofa: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v5H3v-5ZM6 20v-3m12 3v-3" />
    </svg>
  ),
  bed: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M3 6v13M3 12h18v7M21 19v-7a3 3 0 0 0-3-3H10v3M3 9h4a2 2 0 0 1 0 4H3" />
    </svg>
  ),
  users: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6m5 9a5.5 5.5 0 0 0-4-5.3" />
    </svg>
  ),
  ruler: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="2" y="7" width="20" height="10" rx="1.5" />
      <path d="M7 7v3M12 7v4M17 7v3" />
    </svg>
  ),
  arrowUpRight: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  ),
  arrowRight: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  ),
  arrowLeft: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M20 12H4M10 6l-6 6 6 6" />
    </svg>
  ),
  check: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 12.5 9 17 20 6" />
    </svg>
  ),
  checkCircle: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 11 15.5 16 9" />
    </svg>
  ),
  calendar: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  mapPin: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  star: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)} fill="currentColor" stroke="none">
      <path d="m12 3 2.6 5.5 6 .9-4.3 4.3 1 6-5.3-2.9L6.7 22.7l1-6L3.4 9.4l6-.9L12 3Z" />
    </svg>
  ),
  download: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  ),
  sliders: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  ),
  menu: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  x: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  phone: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M6 3h3l1.5 5-2 1a11 11 0 0 0 5 5l1-2 5 1.5V22a1 1 0 0 1-1 1A18 18 0 0 1 3 5a1 1 0 0 1 1-1h2Z" />
    </svg>
  ),
  mail: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  ),
  shield: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3ZM9 12l2 2 4-4" />
    </svg>
  ),
  qr: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h7M20 20v.01" />
    </svg>
  ),
  scan: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
    </svg>
  ),
  sparkles: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4ZM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
    </svg>
  ),
  grid: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  gauge: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M4 18a8 8 0 1 1 16 0M12 14l4-4" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  logout: (p: SVGProps<SVGSVGElement>) => (
    <svg {...S(p)}>
      <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 12H3M6 8l-4 4 4 4" />
    </svg>
  ),
};

export type IconName = keyof typeof Icon;

/** Map an amenity label to an icon name. */
export function amenityIcon(label: string): IconName {
  const l = label.toLowerCase();
  if (l.includes("wifi")) return "wifi";
  if (l.includes("air condition") || l === "ac") return "snow";
  if (l.includes("tv")) return "tv";
  if (l.includes("hot water")) return "droplet";
  if (l.includes("bath") || l.includes("bathroom")) return "bath";
  if (l.includes("room service")) return "bell";
  if (l.includes("fridge")) return "fridge";
  if (l.includes("balcony")) return "sun";
  if (l.includes("garden")) return "leaf";
  if (l.includes("fan")) return "wind";
  if (l.includes("desk")) return "desk";
  if (l.includes("tea") || l.includes("coffee")) return "coffee";
  if (l.includes("purifier")) return "sparkle";
  if (l.includes("blackout") || l.includes("curtain")) return "moon";
  if (l.includes("housekeeping")) return "broom";
  if (l.includes("sitting")) return "sofa";
  if (l.includes("bedding") || l.includes("extra bed")) return "bed";
  return "check";
}
