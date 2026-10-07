import { getBot } from "@/lib/telegram/bot";

// Local development only: receive updates by long polling instead of the webhook.
async function main() {
  const bot = getBot();
  const { url } = await bot.api.getWebhookInfo();
  if (url && !process.argv.includes("--drop-webhook")) {
    console.error(
      `A webhook is set (${url}). Polling would remove it and production would stop receiving updates.\n` +
        "Re-run with --drop-webhook if that's what you want.",
    );
    process.exit(1);
  }
  bot.catch((err) => console.error("update failed:", err.message));
  await bot.start({ onStart: (me) => console.log(`Polling as @${me.username}. Ctrl+C to stop.`) });
}

main();
