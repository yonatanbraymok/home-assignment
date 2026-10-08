import { spawnSync } from "node:child_process";

// Runs the evals one after another and prints a summary. `npm run evals` runs the ones that make no
// model calls; `npm run evals -- --all` adds the ones that do (about $0.05 in all). Evals with HTTP
// checks need the app at APP_URL (npm run dev); without it those checks are skipped, and said so.

type Eval = { name: string; file?: string; model: boolean; http?: "optional" | "required"; what: string };

const EVALS: Eval[] = [
  { name: "approval", file: "approval-safety", model: false, what: "only the owner's tap changes data; stale, expired and double taps don't" },
  { name: "review", model: false, what: "the first sync is reviewed one card at a time" },
  { name: "account", model: false, what: "/disconnect and /delete_my_data" },
  { name: "budget", model: false, what: "both monthly caps, levels and notices" },
  { name: "dashboard", model: false, http: "optional", what: "sign-in links, sessions, each user sees only their data" },
  { name: "classifier", model: true, what: "24 labelled emails: category and verbatim evidence" },
  { name: "chat", model: true, what: "answers from the data, and says so when the data can't answer" },
  { name: "mcp", model: true, http: "required", what: "MCP tools: read-only, scoped to the token, grounded briefs" },
  { name: "demo", model: true, what: "the sample inbox through the real agent" },
  { name: "bot", model: true, what: "the Telegram bot end to end, as a reviewer uses it" },
];

async function appIsUp(): Promise<boolean> {
  try {
    return (await fetch(new URL("/api/health", process.env.APP_URL), { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}

async function main() {
  const all = process.argv.includes("--all");
  const up = await appIsUp();
  if (!up) console.log(`○ Nothing answers at ${process.env.APP_URL}: HTTP checks are skipped (npm run dev to include them).\n`);
  const results: { name: string; status: "passed" | "failed" | "skipped"; seconds: number; note?: string }[] = [];

  for (const e of EVALS) {
    if (e.model && !all) {
      results.push({ name: e.name, status: "skipped", seconds: 0, note: "calls the model: run with --all" });
      continue;
    }
    if (e.http === "required" && !up) {
      results.push({ name: e.name, status: "skipped", seconds: 0, note: "needs the app running" });
      continue;
    }
    console.log(`▶ eval:${e.name}: ${e.what}`);
    const started = Date.now();
    const run = spawnSync("npx", ["tsx", `evals/${e.file ?? e.name}.ts`], {
      env: { ...process.env, ...(e.http === "optional" && !up ? { EVAL_SKIP_HTTP: "1" } : {}) },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const output = `${run.stdout}${run.stderr}`;
    const passed = run.status === 0;
    // The checks it ticked off, or the end of the output when it failed.
    const lines = output.split("\n");
    for (const line of passed ? lines.filter((l) => /^[✔○]/.test(l) || /\d+\/\d+ passed/.test(l)) : lines.slice(-40)) console.log(`  ${line}`);
    results.push({ name: e.name, status: passed ? "passed" : "failed", seconds: Math.round((Date.now() - started) / 1000) });
  }

  console.log("\nSummary");
  for (const r of results) {
    const mark = r.status === "passed" ? "✔" : r.status === "failed" ? "✖" : "○";
    console.log(`  ${mark} eval:${r.name.padEnd(11)} ${r.status}${r.status === "skipped" ? ` (${r.note})` : ` in ${r.seconds}s`}`);
  }
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(failed ? `\n${failed} failed` : "\nAll run evals passed");
  process.exitCode = failed ? 1 : 0;
}

main();
