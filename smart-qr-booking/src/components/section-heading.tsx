export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-max max-w-full items-center self-start rounded-full border border-hairline bg-paper/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-4 ${align === "center" ? "items-center text-center" : "items-start"} ${className}`}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="font-display text-3xl leading-[1.08] text-ink sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {lede ? (
        <p className={`max-w-xl text-[15px] leading-relaxed text-muted ${align === "center" ? "mx-auto" : ""}`}>
          {lede}
        </p>
      ) : null}
    </div>
  );
}
