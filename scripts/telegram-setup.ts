import { getBot } from "@/lib/telegram/bot";
import { COMMANDS } from "@/lib/telegram/commands";

// Sets the bot's command menu. With --webhook, also points Telegram at APP_URL.
async function main() {
  const bot = getBot();
  await bot.api.setMyCommands(COMMANDS);
  console.log("Commands set:", COMMANDS.map((c) => `/${c.command}`).join(" "));

  if (process.argv.includes("--webhook")) {
    const appUrl = process.env.APP_URL;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!appUrl || !secret) throw new Error("APP_URL and TELEGRAM_WEBHOOK_SECRET are required for --webhook");
    const url = new URL("/api/telegram/webhook", appUrl).toString();
    await bot.api.setWebhook(url, { secret_token: secret, allowed_updates: ["message", "callback_query"] });
    console.log("Webhook set:", url);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
