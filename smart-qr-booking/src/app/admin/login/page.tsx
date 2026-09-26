import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { config } from "@/config";
import { isAdmin } from "@/lib/auth";
import { login } from "../actions";
import { SubmitButton } from "@/components/admin/submit-button";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  password: "That password isn't right.",
  config: "Sign-in isn't set up yet: ADMIN_PASSWORD and SESSION_SECRET must be configured.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  if (await isAdmin()) redirect(sp.next?.startsWith("/admin") ? sp.next : "/admin");
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.password) : null;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-hairline bg-paper p-1.5 shadow-[var(--shadow-soft)]">
        <form action={login} className="rounded-[1.4rem] bg-sand/40 p-6 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.6)]">
          <p className="font-display text-xl text-ink">{config.property.name}</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Owner console</p>

          <label className="mt-7 block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Password</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              aria-invalid={!!error}
              className={`mt-1.5 w-full rounded-xl border bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-clay ${
                error ? "border-clay" : "border-hairline"
              }`}
            />
          </label>
          <input type="hidden" name="next" value={sp.next ?? ""} />

          {error && (
            <p role="alert" className="mt-3 text-[12.5px] text-clay">
              {error}
            </p>
          )}

          <SubmitButton
            pendingText="Signing in…"
            className="mt-5 w-full rounded-full bg-ink py-2.5 text-[14px] font-medium text-cream transition-transform active:scale-[0.98]"
          >
            Sign in
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
