"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself while the form's action runs, with an optional "are you sure?". */
export function SubmitButton({
  children,
  className = "",
  pendingText = "Working…",
  confirm: confirmText,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
