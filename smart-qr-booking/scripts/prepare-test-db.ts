// `npm test` runs this first (pretest): apply migrations to the TEST database only.
import "dotenv/config";
import { execSync } from "node:child_process";

const url = process.env["TEST_DATABASE_URL"];
if (!url) {
  console.error("TEST_DATABASE_URL is not set (see .env.example). Refusing to run tests against DATABASE_URL.");
  process.exit(1);
}
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
