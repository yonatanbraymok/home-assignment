import { loginLink } from "@/lib/auth/tokens";
import { db } from "@/lib/db";

// Local development: the sign-in link /dashboard would send, but for this machine's APP_URL. The
// bot runs in production, so its /dashboard links open production. Signs in as the admin
// (ADMIN_TELEGRAM_USER_ID), or as another Telegram id: npm run dev:login -- 123456789
async function main() {
  const telegramId = process.argv[2] ?? process.env.ADMIN_TELEGRAM_USER_ID;
  if (!telegramId) throw new Error("Pass a Telegram user id, or set ADMIN_TELEGRAM_USER_ID");
  const user = await db.user.findUnique({ where: { telegramUserId: BigInt(telegramId) }, select: { id: true, displayName: true } });
  if (!user) throw new Error(`No user with Telegram id ${telegramId}: send /start to the bot first`);
  console.log(`Sign in as ${user.displayName ?? telegramId} (works once, within 10 minutes):\n${loginLink(user.id)}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
