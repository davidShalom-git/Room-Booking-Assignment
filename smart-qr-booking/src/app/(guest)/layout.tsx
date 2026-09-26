import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/footer";
import { ChatWidget } from "@/components/chat-widget";
import { siteSettings } from "@/lib/site-settings";

export default async function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await siteSettings();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteNav name={s.name} />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatWidget name={s.name} />
    </div>
  );
}
