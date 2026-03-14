import {
  loadApiKey,
  validateKey,
  saveApiKey,
  prompt,
  ok,
  err,
  info,
  step,
  bold,
  green,
  dim,
  API_BASE,
  SITE_BASE,
} from "./shared.js";

export async function login(): Promise<void> {
  console.log(`\n${bold("HexaClaw Login")}\n`);

  // Check for existing key
  const existing = await loadApiKey();
  if (existing) {
    const masked = existing.slice(0, 12) + "..." + existing.slice(-4);
    info(`Found existing key: ${masked}`);
    const result = await validateKey(existing);
    if (result) {
      ok(
        `Already logged in (tier: ${bold(result.tier)}, balance: ${result.balance} credits)`,
      );
      const reauth = await prompt("  Re-authenticate? (y/N) ");
      if (reauth.toLowerCase() !== "y") return;
    }
  }

  // Get API key
  console.log(
    `  Get your API key at ${dim(`${SITE_BASE}/dashboard`)}\n`,
  );
  const apiKey = await prompt("  API key (hx_live_...): ");

  if (!apiKey) {
    err("No API key provided.");
    process.exit(1);
  }

  // Validate
  info("Validating...");
  const result = await validateKey(apiKey);
  if (!result) {
    err("Invalid API key.");
    process.exit(1);
  }

  // Save
  await saveApiKey(apiKey);

  console.log("");
  ok(`Logged in! (tier: ${bold(result.tier)}, balance: ${result.balance} credits)`);
  console.log("");
  info(`Run ${bold("hexaclaw setup")} to configure your AI tools.`);
  console.log("");
}
