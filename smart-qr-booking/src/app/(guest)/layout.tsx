import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/footer";
import { ViewSwitcher } from "@/components/view-switcher";

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <Footer />
      <ViewSwitcher />
      <div className="h-16" aria-hidden />
    </div>
  );
}
