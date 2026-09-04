import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { ViewSwitcher } from "@/components/view-switcher";

export const metadata: Metadata = {
  title: { default: "Admin demo", template: "%s · Admin" },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminShell>{children}</AdminShell>
      <ViewSwitcher />
      <div className="h-16" aria-hidden />
    </>
  );
}
