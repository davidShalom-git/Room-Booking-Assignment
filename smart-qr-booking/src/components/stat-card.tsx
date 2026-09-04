import { Icon, type IconName } from "@/components/icons";

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  icon: IconName;
  hint?: string;
  tone?: "ink" | "sage" | "clay" | "gold";
}) {
  const IconCmp = Icon[icon];
  const toneCls = {
    ink: "bg-ink/[0.04] text-ink",
    sage: "bg-sage-soft text-sage",
    clay: "bg-clay-soft text-clay",
    gold: "bg-[#f6eccf] text-[#8a6d1f]",
  }[tone];

  return (
    <div className="rounded-[1.5rem] border border-hairline bg-paper p-1.5">
      <div className="rounded-[1.15rem] bg-sand/30 p-4 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.6)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            {label}
          </span>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${toneCls}`}>
            <IconCmp width={15} height={15} />
          </span>
        </div>
        <p className="font-display mt-3 text-3xl text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
    </div>
  );
}
