import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { phonePretty } from "@/lib/phone";
import { SettingsForm } from "@/components/admin/settings-form";
import { ChangePasswordForm, RecoveryCodeForm } from "@/components/admin/owner-login-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink">Settings</h1>
      <p className="mt-1 text-[13px] text-muted">Your property&apos;s details — the website, the chat and the pay page all use them.</p>

      <SettingsForm
        initial={{
          name: s.name,
          tagline: s.tagline,
          city: s.city,
          address: s.address,
          phone: phonePretty(s.phone),
          email: s.email,
          about: s.about,
          directions: s.directions,
          amenities: s.amenities.join("\n"),
          rating: s.rating === null ? "" : String(s.rating),
          reviews: s.reviews === null ? "" : String(s.reviews),
          checkInTime: s.checkInTime,
          checkOutTime: s.checkOutTime,
          advancePercent: String(s.advancePercent),
          upiId: s.upiId,
          upiName: s.upiName,
          photos: s.photos.join("\n"),
        }}
      />

      <section id="security" className="mt-10 space-y-4 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6">
        <h2 className="font-display text-xl text-ink">Password</h2>
        <ChangePasswordForm />
      </section>

      <section className="mt-6 space-y-3 rounded-[1.5rem] border border-hairline bg-paper p-5 sm:p-6">
        <h2 className="font-display text-xl text-ink">Recovery code</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          If you forget your password, a recovery code lets you set a new one yourself — no need to call anyone. Make one
          and keep it somewhere safe.
        </p>
        <RecoveryCodeForm />
      </section>
    </div>
  );
}
