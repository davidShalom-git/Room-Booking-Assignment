import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

type Variant = "primary" | "outline" | "cream" | "whatsapp";

const base =
  "group inline-flex items-center gap-3 rounded-full pl-6 pr-2 py-2.5 text-sm font-medium tracking-tight " +
  "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-clay text-white hover:bg-clay-dark shadow-[0_10px_30px_-10px_rgba(180,85,45,0.6)]",
  outline:
    "border border-ink/15 text-ink hover:border-ink/40 hover:bg-ink/[0.03]",
  cream: "bg-paper text-ink border border-hairline hover:shadow-[var(--shadow-soft)]",
  whatsapp: "bg-[#1f8a4c] text-white hover:bg-[#1a7a42] shadow-[0_10px_30px_-10px_rgba(31,138,76,0.6)]",
};

const chipTone: Record<Variant, string> = {
  primary: "bg-white/15 text-white",
  outline: "bg-ink/[0.06] text-ink",
  cream: "bg-clay-soft text-clay",
  whatsapp: "bg-white/20 text-white",
};

type Props = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: Variant;
  icon?: IconName | null;
  external?: boolean;
  className?: string;
  disabled?: boolean;
};

export function CtaButton({
  children,
  href,
  onClick,
  type = "button",
  variant = "primary",
  icon = "arrowUpRight",
  external,
  className = "",
  disabled,
}: Props) {
  const IconCmp = icon ? Icon[icon] : null;
  const inner = (
    <>
      <span>{children}</span>
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105 ${chipTone[variant]}`}
      >
        {IconCmp ? <IconCmp width={15} height={15} /> : <span className="text-xs">·</span>}
      </span>
    </>
  );
  const cls = `${base} ${variants[variant]} ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`;

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
