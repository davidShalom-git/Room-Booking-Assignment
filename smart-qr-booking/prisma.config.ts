import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need a direct (non-pooled) connection; the app itself uses the pooled DATABASE_URL.
  datasource: { url: process.env["DIRECT_DATABASE_URL"] || process.env["DATABASE_URL"] },
});
