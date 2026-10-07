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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
