import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "./env";

// Runtime connection goes through Supabase's transaction pooler (DATABASE_URL).
// Migrations use DIRECT_URL via prisma.config.ts.
function createClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }) });
}

// Reuse one client across hot reloads in dev so we don't exhaust pooler connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

// For interactive transactions. Prisma's 5 s default was too tight on a slow round trip to the
// database (seen from a laptop far from it): the card or the tap failed and had to be retried.
export const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
