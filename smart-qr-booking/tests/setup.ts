// Loaded by `npm test` via `tsx --import`. Points the app at the test database
// and loads .env so local runs need no exported variables.
import "dotenv/config";

if (process.env["TEST_DATABASE_URL"]) {
  process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
}
process.env["SESSION_SECRET"] ||= "test-session-secret-test-session-secret";
process.env["ADMIN_PASSWORD"] ||= "test-admin-password";
