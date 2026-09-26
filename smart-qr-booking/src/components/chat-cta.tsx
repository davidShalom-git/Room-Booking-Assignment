"use client";

import { openChat } from "@/components/chat-widget";
import { CtaButton } from "@/components/cta-button";

/** A call to action that opens the website chat — optionally sending a first message (e.g. a room). */
export function ChatCta({
  children,
  text,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  text?: string;
  variant?: "primary" | "outline" | "cream";
  className?: string;
}) {
  return (
    <CtaButton variant={variant} icon="chat" onClick={() => openChat(text)} className={className}>
      {children}
    </CtaButton>
  );
}
