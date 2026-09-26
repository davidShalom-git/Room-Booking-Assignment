const tones: Record<string, string> = {
  available: "bg-sage-soft text-sage",
  confirmed: "bg-sage-soft text-sage",
  occupied: "bg-clay-soft text-clay-dark",
  cancelled: "bg-ink/[0.06] text-faint line-through decoration-1",
  pending: "bg-[#f6eccf] text-[#8a6d1f]",
};

const dot: Record<string, string> = {
  available: "bg-sage",
  confirmed: "bg-sage",
  occupied: "bg-clay",
  cancelled: "bg-faint",
  pending: "bg-[#c98a3c]",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${tones[status] ?? "bg-ink/[0.06] text-muted"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? "bg-muted"}`} />
      {label ?? status}
    </span>
  );
}
