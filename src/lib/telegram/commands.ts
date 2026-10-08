import type { BotCommand } from "grammy/types";

// Single source for the command menu (scripts/telegram-setup.ts) and the /help text.
export const COMMANDS: BotCommand[] = [
  { command: "start", description: "Get started" },
  { command: "connect", description: "Connect your Gmail (read-only)" },
  { command: "sync", description: "Check for new job emails now" },
  { command: "status", description: "Your applications at a glance" },
  { command: "dashboard", description: "Open your dashboard in the browser" },
  { command: "demo", description: "Try me with sample emails (no Gmail needed)" },
  { command: "pending", description: "Cards waiting for you" },
  { command: "disconnect", description: "Stop reading your Gmail (keeps your tracker)" },
  { command: "delete_my_data", description: "Erase everything I store about you" },
  { command: "help", description: "How it works" },
];
