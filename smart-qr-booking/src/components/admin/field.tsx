/** Form building blocks shared by the admin forms. */

export const inputCls = (error?: boolean) =>
  `w-full min-w-0 rounded-xl border bg-paper px-3 py-2 text-[14px] text-ink outline-none transition-colors focus:border-clay ${
    error ? "border-clay bg-clay-soft/30" : "border-hairline"
  }`;

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${error ? "text-clay" : "text-faint"}`}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <p
      role={err ? "alert" : "status"}
      className={`mt-5 rounded-2xl border px-4 py-3 text-[13px] ${
        err ? "border-clay/30 bg-clay-soft text-clay-dark" : "border-sage/25 bg-sage-soft text-sage"
      }`}
    >
      {err ?? msg}
    </p>
  );
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
