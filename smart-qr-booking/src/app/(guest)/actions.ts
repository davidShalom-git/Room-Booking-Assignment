"use server";

/** Guest-side server action: the UTR box on the pay page. */
import { revalidatePath } from "next/cache";
import { claimFromPayPage } from "@/lib/pay-page";

export type ClaimState = { n: number; error?: string; sent?: string };

export async function claimAction(prev: ClaimState, fd: FormData): Promise<ClaimState> {
  const r = await claimFromPayPage(String(fd.get("bookingId") ?? ""), String(fd.get("utr") ?? ""));
  if (!r.ok) return { n: prev.n + 1, error: r.message };
  revalidatePath(`/pay/${r.value.bookingId}`);
  return { n: prev.n + 1, sent: r.value.utr ?? "" };
}
