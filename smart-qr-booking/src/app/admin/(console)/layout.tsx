import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/auth";
import { siteSettings } from "@/lib/site-settings";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell name={(await siteSettings()).name}>{children}</AdminShell>;
}
