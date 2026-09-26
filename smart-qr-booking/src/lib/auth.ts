import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";
import { ownerSessionValid } from "@/lib/owner-login";

export async function isAdmin(): Promise<boolean> {
  return ownerSessionValid((await cookies()).get(SESSION_COOKIE)?.value);
}

/** First line of every admin page and server action. proxy.ts is a convenience, not the guard. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
