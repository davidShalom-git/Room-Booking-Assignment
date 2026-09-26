import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/footer";
import { ChatWidget } from "@/components/chat-widget";
import { config } from "@/config";

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
      <ChatWidget name={config.property.name} />
    </div>
  );
}
