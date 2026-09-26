import type { Metadata } from "next";
import Link from "next/link";
import { siteSettings } from "@/lib/site-settings";
import { RecoverForm } from "@/components/admin/owner-login-forms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default async function RecoverPage() {
  const s = await siteSettings();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-hairline bg-paper p-1.5 shadow-[var(--shadow-soft)]">
        <div className="rounded-[1.4rem] bg-sand/40 p-6 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.6)]">
          <p className="font-display text-xl text-ink">{s.name}</p>
          <p className="mb-5 text-[11px] uppercase tracking-[0.16em] text-faint">Forgot your password?</p>
          <RecoverForm />
          <Link href="/admin/login" className="mt-4 block text-center text-[12.5px] text-muted hover:text-ink">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
