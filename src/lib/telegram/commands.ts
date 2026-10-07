import type { BotCommand } from "grammy/types";

// Single source for the command menu (scripts/telegram-setup.ts) and the /help text.
export const COMMANDS: BotCommand[] = [
  { command: "start", description: "Register and see what I do" },
  { command: "connect", description: "Connect your Gmail (read-only)" },
  { command: "sync", description: "Check Gmail for new job emails now" },
  { command: "status", description: "Your applications at a glance" },
  { command: "dashboard", description: "Open your dashboard in the browser" },
  { command: "pending", description: "Show cards waiting for you; continue your review" },
  { command: "disconnect", description: "Stop reading your Gmail (keeps your tracker)" },
  { command: "delete_my_data", description: "Erase everything I store about you" },
  { command: "help", description: "What I can do and how approvals work" },
];
