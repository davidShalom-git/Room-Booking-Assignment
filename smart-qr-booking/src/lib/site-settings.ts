/**
 * The owner's settings for a page render: read on every request (the owner can change them at
 * any time from the app) and once per request however many components ask.
 */
import { cache } from "react";
import { connection } from "next/server";
import { getSettings } from "@/lib/settings";

export const siteSettings = cache(async () => {
  await connection();
  return getSettings();
});
