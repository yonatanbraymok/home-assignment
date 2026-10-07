-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

-- DropEnum
DROP TYPE "UserRole";


-- Lock every table away from Supabase's Data API (the anon/authenticated roles).
-- The app connects as the table owner (postgres), which RLS doesn't restrict,
-- so RLS with no policies blocks the Data API without affecting the app.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StatusProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LlmUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Tables created by later migrations shouldn't be granted to those roles either.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
