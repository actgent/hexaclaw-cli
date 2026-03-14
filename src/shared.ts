import { readFile, writeFile, mkdir, access, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";

export const HOME = homedir();
export const HEXACLAW_DIR = join(HOME, ".hexaclaw");
export const ENV_FILE = join(HEXACLAW_DIR, ".env");
export const ENV_SH = join(HEXACLAW_DIR, "env.sh");
export const AUTH_FILE = join(HEXACLAW_DIR, "cloud-auth.json");
export const API_BASE = "https://api.hexaclaw.com";
export const SITE_BASE = "https://hexaclaw.com";
export const VERSION = "1.0.0";

// ── Colors ──────────────────────────────────────────────
const c = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
export const red = c("0;31");
export const green = c("0;32");
export const yellow = c("1;33");
export const blue = c("0;34");
export const cyan = c("0;36");
export const bold = c("1");
export const dim = c("2");

export const info = (msg: string) => console.log(`${cyan("  [*]")} ${msg}`);
export const ok = (msg: string) => console.log(`${green("  [+]")} ${msg}`);
export const warn = (msg: string) => console.log(`${yellow("  [!]")} ${msg}`);
export const err = (msg: string) => console.log(`${red("  [-]")} ${msg}`);
export const step = (n: string, msg: string) =>
  console.log(`\n${blue(`[${n}]`)} ${bold(msg)}`);
export const toolOk = (msg: string) => console.log(`  ${green("\u2713")} ${msg}`);
export const toolSkip = (msg: string) =>
  console.log(`  ${dim("\u00b7")} ${dim(`${msg} \u2014 not installed`)}`);

// ── File helpers ────────────────────────────────────────
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path: string): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return {};
  }
}

export async function writeJson(
  path: string,
  data: Record<string, any>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

export function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── API helpers ─────────────────────────────────────────
export async function loadApiKey(): Promise<string | null> {
  if (process.env.HEXACLAW_API_KEY) return process.env.HEXACLAW_API_KEY;
  try {
    const content = await readFile(ENV_FILE, "utf-8");
    for (const line of content.split("\n")) {
      if (line.startsWith("HEXACLAW_API_KEY=")) {
        return line.slice("HEXACLAW_API_KEY=".length).replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
  return null;
}

export async function validateKey(
  apiKey: string,
): Promise<{ tier: string; balance: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/usage`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tier: string;
      credits: { balance: number };
    };
    return { tier: data.tier, balance: data.credits?.balance ?? 0 };
  } catch {
    return null;
  }
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await mkdir(HEXACLAW_DIR, { recursive: true });

  // .env (restricted permissions — contains credentials)
  await writeFile(ENV_FILE, `HEXACLAW_API_KEY="${apiKey}"\n`);
  await chmod(ENV_FILE, 0o600);

  // env.sh (for wrapper scripts)
  const envSh = [
    "# HexaClaw — source this in wrapper scripts (not globally in shell profile)",
    `export ANTHROPIC_BASE_URL="${API_BASE}"`,
    `export ANTHROPIC_AUTH_TOKEN="${apiKey}"`,
    `export OPENAI_BASE_URL="${API_BASE}/v1"`,
    `export OPENAI_API_KEY="${apiKey}"`,
    `export HEXACLAW_API_KEY="${apiKey}"`,
    "",
  ].join("\n");
  await writeFile(ENV_SH, envSh);
}

// ── Shell helpers ───────────────────────────────────────
export function hasCommand(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Deep merge ──────────────────────────────────────────
export function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
