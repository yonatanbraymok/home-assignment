import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The Prisma CLI doesn't load env files on its own; Next.js uses .env.local.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // CLI commands (migrate, db pull) use the session pooler.
  // The app itself connects through the transaction pooler (DATABASE_URL) in src/lib/db.ts.
  datasource: { url: process.env.DIRECT_URL },
});
