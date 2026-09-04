import Link from "next/link";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-faint">
        404
      </span>
      <h1 className="font-display mt-3 text-4xl text-ink sm:text-5xl">
        We can't find that page
      </h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted">
        The link may be old, or the room number doesn't exist. Everything is a tap away
        from the home page.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-clay px-5 py-2.5 text-sm font-medium text-white"
        >
          <Icon.arrowLeft width={15} height={15} />
          Home
        </Link>
        <Link
          href="/rooms"
          className="inline-flex items-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink"
        >
          Browse rooms
        </Link>
      </div>
    </div>
  );
}
