import type { BotCommand } from "grammy/types";

// Single source for the command menu (scripts/telegram-setup.ts) and the /help text.
export const COMMANDS: BotCommand[] = [
  { command: "start", description: "Register and see what I do" },
  { command: "help", description: "What I can do and how approvals work" },
];
