"use server";

/**
 * Admin server actions: session check first, then the tested logic in lib/admin-ops.ts.
 * Plain forms post here, so everything works without client JavaScript.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import { attemptLogin, changePassword, loginConfigured, newRecoveryCode, recoverWithCode } from "@/lib/owner-login";
import { saveSettings } from "@/lib/settings";
import * as ops from "@/lib/admin-ops";
import { OWNER_PUSH, removePushSubscription, savePushSubscription, sendOwnerPush } from "@/lib/push";

export type FormState = { n: number; error?: string; field?: string; values?: Record<string, string> };

const safeNext = (n: string) => (/^\/admin(\/|\?|$)/.test(n) ? n : "/admin");

const formValues = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));

const ipOf = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

async function signIn() {
  (await cookies()).set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function login(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!(await loginConfigured())) redirect(`/admin/login?error=config`);
  const r = await attemptLogin(String(formData.get("password") ?? ""), await ipOf());
  if (r !== "ok") {
    if (r === "wrong") await new Promise((res) => setTimeout(res, 750)); // slows guessing further
    redirect(`/admin/login?error=${r === "limited" ? "limited" : "password"}&next=${encodeURIComponent(next)}`);
  }
  await signIn();
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/** Back to the page the form was on, with a message. `back` carries that page's filters. */
function backTo(formData: FormData, ok: boolean, text: string): never {
  const qs = new URLSearchParams(String(formData.get("back") ?? ""));
  qs.delete("msg");
  qs.delete("err");
  qs.set(ok ? "msg" : "err", text);
  const path = String(formData.get("path") ?? "");
  redirect(`${/^\/admin(\/[\w/-]*)?$/.test(path) ? path : "/admin/bookings"}?${qs}`);
}

export async function markPaidAction(formData: FormData) {
  await requireAdmin();
  const r = await ops.confirmAdvance(String(formData.get("id") ?? ""), String(formData.get("amount") ?? ""));
  revalidatePath("/admin", "layout");
  backTo(formData, r.ok, r.ok ? (r.message ?? "Done.") : r.error);
}

export async function cancelAction(formData: FormData) {
  await requireAdmin();
  const r = await ops.cancelAsAdmin(String(formData.get("id") ?? ""));
  revalidatePath("/admin", "layout");
  backTo(formData, r.ok, r.ok ? (r.message ?? "Cancelled.") : r.error);
}

export async function createWalkInAction(prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData);
  const r = await ops.createWalkIn(values);
  if (!r.ok) return { n: prev.n + 1, error: r.error, field: r.field, values };
  revalidatePath("/admin", "layout");
  redirect(`/admin/bookings?msg=${encodeURIComponent(r.message ?? "Booked.")}`);
}

export async function saveRoomAction(prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData);
  const r = await ops.saveRoom(values, values["existingId"] || undefined);
  if (!r.ok) return { n: prev.n + 1, error: r.error, field: r.field, values };
  revalidatePath("/", "layout");
  redirect(`/admin/rooms?msg=${encodeURIComponent(r.message ?? "Saved.")}`);
}

export async function toggleRoomAction(formData: FormData) {
  await requireAdmin();
  const r = await ops.setRoomActive(String(formData.get("id") ?? ""), formData.get("active") === "true");
  revalidatePath("/", "layout");
  redirect(`/admin/rooms?${r.ok ? "msg" : "err"}=${encodeURIComponent(r.ok ? (r.message ?? "Saved.") : r.error)}`);
}

export async function ackPaymentAction(formData: FormData) {
  await requireAdmin();
  const r = await ops.acknowledgeAsAdmin(String(formData.get("paymentId") ?? ""), String(formData.get("amount") ?? ""));
  revalidatePath("/admin", "layout");
  backTo(formData, r.ok, r.ok ? (r.message ?? "Acknowledged.") : r.error);
}

export async function rejectPaymentAction(formData: FormData) {
  await requireAdmin();
  const r = await ops.rejectAsAdmin(String(formData.get("paymentId") ?? ""));
  revalidatePath("/admin", "layout");
  backTo(formData, r.ok, r.ok ? (r.message ?? "Marked as not received.") : r.error);
}

export async function balanceAction(formData: FormData) {
  await requireAdmin();
  const r = await ops.balanceReceived(String(formData.get("id") ?? ""));
  revalidatePath("/admin", "layout");
  backTo(formData, r.ok, r.ok ? (r.message ?? "Recorded.") : r.error);
}

export type ImportState = { n: number; created?: string[]; errors?: { line: number; error: string }[]; error?: string };

export async function importAction(prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  const fromFile = file instanceof File && file.size > 0 ? await file.text() : "";
  const csv = fromFile || String(formData.get("csv") ?? "");
  if (!csv.trim()) return { n: prev.n + 1, error: "Choose a CSV file or paste the rows." };
  if (csv.length > 500_000) return { n: prev.n + 1, error: "That file is too big — split it into smaller files." };
  const r = await ops.importBookings(csv);
  revalidatePath("/admin", "layout");
  return { n: prev.n + 1, created: r.created, errors: r.errors };
}

// --- owner app notifications (called from components/admin/owner-alerts.tsx) ------------

export async function savePushAction(subscription: unknown): Promise<boolean> {
  await requireAdmin();
  return savePushSubscription(subscription);
}

export async function removePushAction(endpoint: string): Promise<void> {
  await requireAdmin();
  await removePushSubscription(String(endpoint));
}

/** Returns how many of the owner's devices got the test notification. */
export async function testPushAction(): Promise<number> {
  await requireAdmin();
  return sendOwnerPush({ to: OWNER_PUSH, text: "🔔 Notifications are on\nPayments, new bookings and the 9 PM summary will show up here." });
}

// --- settings and sign-in (the Settings screen, and "Forgot password?" on the login page) ----------

export type SettingsState = { n: number; ok?: boolean; message?: string; error?: string; field?: string; values?: Record<string, string> };

export async function saveSettingsAction(prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();
  const values = formValues(formData);
  const r = await saveSettings(values);
  if (!r.ok) return { n: prev.n + 1, error: r.error, field: r.field, values };
  revalidatePath("/", "layout");
  return { n: prev.n + 1, ok: true, message: "Saved — your website shows the new details now." };
}

export type PasswordState = { n: number; ok?: boolean; error?: string; field?: string; code?: string };

/** Change the password: every other phone and browser is signed out, this one stays in. */
export async function changePasswordAction(prev: PasswordState, formData: FormData): Promise<PasswordState> {
  await requireAdmin();
  const v = formValues(formData);
  const r = await changePassword({ current: v["current"] ?? "", next: v["next"] ?? "", confirm: v["confirm"] ?? "" });
  if (!r.ok) return { n: prev.n + 1, error: r.error, field: r.field };
  await signIn();
  return { n: prev.n + 1, ok: true };
}

/** A new recovery code, shown once. */
export async function recoveryCodeAction(prev: PasswordState): Promise<PasswordState> {
  await requireAdmin();
  return { n: prev.n + 1, ok: true, code: (await newRecoveryCode()).code };
}

/** Forgotten password (signed out): the recovery code sets a new password and signs in. */
export async function recoverAction(prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const v = formValues(formData);
  const r = await recoverWithCode({ code: v["code"] ?? "", next: v["next"] ?? "", confirm: v["confirm"] ?? "" }, await ipOf());
  if (!r.ok) return { n: prev.n + 1, error: r.error, field: r.field };
  await signIn();
  return { n: prev.n + 1, ok: true, code: r.code };
}
