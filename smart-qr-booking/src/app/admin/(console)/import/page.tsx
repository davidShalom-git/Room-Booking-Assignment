import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "@/components/admin/import-form";

export const metadata = { title: "Import bookings" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink">Import bookings</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        Bring in the bookings you already have (from a register or spreadsheet) so the website and the chat assistant
        know exactly which rooms are free from day one.
      </p>
      <div className="mt-6">
        <ImportForm />
      </div>
    </div>
  );
}
