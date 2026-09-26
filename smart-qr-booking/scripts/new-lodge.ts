/**
 * Set up a new lodge — same code, its own database and settings:
 *
 *   DATABASE_URL=<its pooled URL> DIRECT_DATABASE_URL=<its direct URL> \
 *     npx tsx scripts/new-lodge.ts lodges/green-valley.json [--reset-password] [--force]
 *
 * The JSON file is shaped like scripts/lodge.example.json. The script migrates the database,
 * writes the lodge's details, rooms and the owner's sign-in (lib/lodge-setup.ts), then writes to
 * lodges/<slug>/ (git-ignored):
 *   .env.production  the deployment's environment variables (secrets generated once, then kept)
 *   HANDOVER.md      the owner's sheet: links, password, recovery code, first steps
 * Nothing here reads .env: the target database must be given explicitly.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import webpush from "web-push";

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) fail("Usage: DATABASE_URL=... npx tsx scripts/new-lodge.ts <lodge.json> [--reset-password] [--force]");
  const db = process.env["DATABASE_URL"];
  if (!db) fail("Set DATABASE_URL to the new lodge's own database (and DIRECT_DATABASE_URL on Neon).");

  const input = JSON.parse(readFileSync(file, "utf8")) as { slug?: string; siteUrl?: string; settings: never; rooms: never };
  const slug = input.slug ?? "";
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) fail(`"slug" must be lowercase letters, digits and dashes, e.g. green-valley.`);
  const siteUrl = (input.siteUrl ?? "").replace(/\/$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(siteUrl)) fail(`"siteUrl" must be the site's https:// address, e.g. https://${slug}.vercel.app`);

  console.log(`Lodge:    ${slug}\nDatabase: ${new URL(db).host}\n`);
  // Pin both URLs: prisma.config.ts loads .env, which must never redirect the migration elsewhere.
  const direct = process.env["DIRECT_DATABASE_URL"] || db;
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: db, DIRECT_DATABASE_URL: direct } });

  const { setupLodge } = await import("../src/lib/lodge-setup");
  const r = await setupLodge(input, { resetPassword: args.includes("--reset-password"), force: args.includes("--force") });
  if (!r.ok) fail(r.error);
  console.log(`\n✔ Details and ${r.rooms} room(s) saved.`);

  const dir = `lodges/${slug}`;
  mkdirSync(dir, { recursive: true });
  const envFile = `${dir}/.env.production`;
  if (existsSync(envFile)) {
    console.log(`✔ Kept ${envFile} (secrets are generated once; changing them would sign the owner out).`);
  } else {
    const vapid = webpush.generateVAPIDKeys();
    const lines = {
      NEXT_PUBLIC_BASE_URL: siteUrl,
      DATABASE_URL: db,
      DIRECT_DATABASE_URL: process.env["DIRECT_DATABASE_URL"] ?? "",
      SESSION_SECRET: randomBytes(32).toString("hex"),
      CRON_SECRET: randomBytes(24).toString("hex"),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
    };
    writeFileSync(envFile, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    console.log(`✔ Wrote ${envFile}`);
  }

  const { getSettings } = await import("../src/lib/settings");
  const name = (await getSettings()).name;
  if (r.password) {
    const sheet = [
      `# ${name} — your website and owner app`,
      ``,
      `- **Website:** ${siteUrl}`,
      `- **Owner app:** ${siteUrl}/admin`,
      `- **Password:** \`${r.password}\` — change it any time in Settings → Password.`,
      `- **Recovery code:** \`${r.recoveryCode}\` — keep this safe. If you forget your password, tap *Forgot your password?* on the sign-in page and enter it.`,
      ``,
      `## First steps`,
      ``,
      `1. On your phone, open ${siteUrl}/admin, sign in, and tap **Install app** (iPhone: Share → *Add to Home Screen*).`,
      `2. On **Today**, tap **Turn on alerts** and allow notifications — every payment arrives there with *Acknowledge*.`,
      `3. **Settings:** check your details, UPI ID and add photos of the place. **Rooms:** add photos of each room.`,
      `4. **QR Codes:** print them — one on each room door, one at reception.`,
      ``,
    ].join("\n");
    writeFileSync(`${dir}/HANDOVER.md`, sheet);
    console.log(`✔ Wrote ${dir}/HANDOVER.md — give it to the owner:\n\n${sheet}`);
  } else {
    console.log("✔ The owner's password is unchanged (use --reset-password to make a new one).");
  }

  console.log(
    [
      ``,
      `Deploy on Vercel:`,
      `  1. npx vercel link --project ${slug}   (create the project when asked)`,
      `  2. Vercel → ${slug} → Settings → Environment Variables → paste the contents of ${envFile} (Production)`,
      `  3. npx vercel deploy --prod`,
      `  4. Open ${siteUrl}/api/health — it should say {"ok":true,"rooms":${r.rooms}}`,
      ``,
    ].join("\n"),
  );
  const { prisma } = await import("../src/lib/db");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
