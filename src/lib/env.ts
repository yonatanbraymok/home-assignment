export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Public base URL of the app, used for OAuth redirects and links sent in Telegram. */
export function appUrl(path = "/"): string {
  return new URL(path, requireEnv("APP_URL")).toString();
}
