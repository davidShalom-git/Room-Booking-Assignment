"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  changePasswordAction,
  recoverAction,
  recoveryCodeAction,
  type PasswordState,
} from "@/app/admin/actions";
import { CopyButton } from "@/components/copy-button";
import { Field, inputCls } from "./field";
import { SubmitButton } from "./submit-button";

const button = "rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-cream transition-transform active:scale-[0.98]";

function Problem({ state }: { state: PasswordState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[13px] text-clay-dark">
      {state.error}
    </p>
  );
}

/** A recovery code, shown once. */
export function RecoveryCode({ code }: { code: string }) {
  return (
    <div className="rounded-2xl border border-sage/30 bg-sage-soft p-4">
      <p className="text-[12.5px] font-medium text-sage">Your recovery code — shown only now</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <code className="select-all whitespace-nowrap font-mono text-[16px] tracking-wide text-ink">{code}</code>
        <CopyButton text={code} />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Write it down or take a screenshot, and keep it somewhere safe. If you ever forget your password, it&apos;s how you
        get back in (<em>Forgot your password?</em> on the sign-in page). Each code works once.
      </p>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, { n: 0 });
  const bad = (f: string) => state.field === f;
  return (
    <form key={state.n} action={action} className="space-y-4">
      <Problem state={state} />
      {state.ok && (
        <p role="status" className="rounded-2xl border border-sage/25 bg-sage-soft px-4 py-3 text-[13px] text-sage">
          Password changed. Other phones and browsers have been signed out; this one stays signed in.
        </p>
      )}
      <Field label="Current password" error={bad("current")}>
        <input type="password" name="current" required autoComplete="current-password" className={inputCls(bad("current"))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" error={bad("next")} hint="At least 8 characters.">
          <input type="password" name="next" required minLength={8} autoComplete="new-password" className={inputCls(bad("next"))} />
        </Field>
        <Field label="New password again" error={bad("confirm")}>
          <input type="password" name="confirm" required minLength={8} autoComplete="new-password" className={inputCls(bad("confirm"))} />
        </Field>
      </div>
      <SubmitButton pendingText="Saving…" className={button}>
        Change password
      </SubmitButton>
    </form>
  );
}

export function RecoveryCodeForm() {
  const [state, action] = useActionState<PasswordState>(recoveryCodeAction, { n: 0 });
  return (
    <form action={action} className="space-y-3">
      {state.code && <RecoveryCode code={state.code} />}
      <SubmitButton
        pendingText="Making a code…"
        confirm="Make a new recovery code? Any code you saved before will stop working."
        className="rounded-full border border-hairline px-5 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-ink/[0.04]"
      >
        {state.code ? "Make another code" : "Make a recovery code"}
      </SubmitButton>
    </form>
  );
}

/** "Forgot your password?" — signed out. */
export function RecoverForm() {
  const [state, action] = useActionState<PasswordState, FormData>(recoverAction, { n: 0 });
  const bad = (f: string) => state.field === f;
  if (state.ok && state.code) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-[14px] text-ink">
          Your password is changed and you&apos;re signed in. Your old recovery code is used up — here is a new one:
        </p>
        <RecoveryCode code={state.code} />
        <Link href="/admin/today" className={`${button} inline-block`}>
          Open the app
        </Link>
      </div>
    );
  }
  return (
    <form key={state.n} action={action} className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted">
        Enter the recovery code you saved when your website was set up (or from Settings), and choose a new password.
      </p>
      <Problem state={state} />
      <Field label="Recovery code" error={bad("code")} hint="The code you saved, like ABCD-EFGH-JKLM-NPQR.">
        <input
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputCls(bad("code"))} font-mono uppercase tracking-wider`}
        />
      </Field>
      <Field label="New password" error={bad("next")} hint="At least 8 characters.">
        <input type="password" name="next" required minLength={8} autoComplete="new-password" className={inputCls(bad("next"))} />
      </Field>
      <Field label="New password again" error={bad("confirm")}>
        <input type="password" name="confirm" required minLength={8} autoComplete="new-password" className={inputCls(bad("confirm"))} />
      </Field>
      <SubmitButton pendingText="Checking…" className={`${button} w-full`}>
        Set new password
      </SubmitButton>
    </form>
  );
}
