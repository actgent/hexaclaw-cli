import { join } from "node:path";
import { platform } from "node:os";
import {
  HOME,
  loadApiKey,
  validateKey,
  readJson,
  fileExists,
  hasCommand,
  info,
  bold,
  dim,
  green,
  red,
  yellow,
} from "./shared.js";

const IS_MAC = platform() === "darwin";

interface ToolStatus {
  name: string;
  installed: boolean;
  configured: boolean;
  configPath: string;
}

async function checkTool(
  name: string,
  configPath: string,
  check: () => Promise<boolean> | boolean,
  mcpKey: string = "mcpServers",
): Promise<ToolStatus> {
  const installed = await check();
  let configured = false;
  if (installed && (await fileExists(configPath))) {
    const config = await readJson(configPath);
    const servers = config[mcpKey] || {};
    configured = !!servers.hexaclaw;
  }
  return { name, installed, configured, configPath };
}

export async function status(): Promise<void> {
  console.log(`\n${bold("HexaClaw Status")}\n`);

  // Auth
  const apiKey = await loadApiKey();
  if (!apiKey) {
    console.log(`  Auth:    ${red("Not logged in")}`);
    console.log(`\n  Run ${bold("hexaclaw login")} to authenticate.\n`);
    return;
  }

  const result = await validateKey(apiKey);
  if (result) {
    console.log(
      `  Auth:    ${green("Logged in")} (tier: ${bold(result.tier)}, balance: ${result.balance} credits)`,
    );
  } else {
    console.log(`  Auth:    ${yellow("Key invalid/expired")}`);
  }

  // Tools
  console.log(`\n  ${bold("Tools:")}\n`);

  const tools: ToolStatus[] = [];

  // Claude Code stores MCP config in .claude.json (via `claude mcp add`) or settings.json
  const claudeJsonPath = join(HOME, ".claude.json");
  const claudeSettingsPath = join(HOME, ".claude", "settings.json");
  let claudeConfigured = false;
  const claudeInstalled =
    hasCommand("claude") || (await fileExists(join(HOME, ".claude")));
  if (claudeInstalled) {
    // Check .claude.json first (primary), then settings.json (fallback)
    const claudeJson = await readJson(claudeJsonPath);
    const mcpServers = claudeJson.mcpServers || {};
    if (mcpServers.hexaclaw) {
      claudeConfigured = true;
    } else {
      const settings = await readJson(claudeSettingsPath);
      const settingsMcp = settings.mcpServers || {};
      if (settingsMcp.hexaclaw) claudeConfigured = true;
    }
  }
  tools.push({
    name: "Claude Code",
    installed: claudeInstalled,
    configured: claudeConfigured,
    configPath: claudeJsonPath,
  });

  tools.push(
    await checkTool(
      "Cursor",
      join(HOME, ".cursor", "mcp.json"),
      async () =>
        (await fileExists(join(HOME, ".cursor"))) ||
        (IS_MAC && (await fileExists("/Applications/Cursor.app"))),
    ),
  );

  tools.push(
    await checkTool(
      "Gemini CLI",
      join(HOME, ".gemini", "settings.json"),
      () => hasCommand("gemini") || fileExists(join(HOME, ".gemini")),
    ),
  );

  tools.push(
    await checkTool(
      "Windsurf",
      join(HOME, ".codeium", "windsurf", "mcp_config.json"),
      async () =>
        (await fileExists(join(HOME, ".codeium", "windsurf"))) ||
        (IS_MAC && (await fileExists("/Applications/Windsurf.app"))),
    ),
  );

  tools.push(
    await checkTool(
      "VS Code",
      join(HOME, ".vscode", "mcp.json"),
      async () =>
        hasCommand("code") ||
        (await fileExists(join(HOME, ".vscode"))) ||
        (IS_MAC &&
          (await fileExists("/Applications/Visual Studio Code.app"))),
      "servers",
    ),
  );

  tools.push(
    await checkTool(
      "Zed",
      join(HOME, ".config", "zed", "settings.json"),
      () =>
        hasCommand("zed") || fileExists(join(HOME, ".config", "zed")),
      "context_servers",
    ),
  );

  // Cline — special path
  const clineDir = IS_MAC
    ? join(
        HOME,
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
      )
    : join(
        HOME,
        ".config",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
      );
  tools.push(
    await checkTool(
      "Cline",
      join(clineDir, "settings", "cline_mcp_settings.json"),
      () => fileExists(clineDir),
    ),
  );

  tools.push(
    await checkTool(
      "Continue.dev",
      join(HOME, ".continue", "mcpServers", "hexaclaw.json"),
      () => fileExists(join(HOME, ".continue")),
    ),
  );

  tools.push(
    await checkTool(
      "OpenClaw",
      join(HOME, ".openclaw", "mcp-servers.json"),
      () =>
        hasCommand("openclaw") || fileExists(join(HOME, ".openclaw")),
    ),
  );

  for (const t of tools) {
    const status = !t.installed
      ? dim("not installed")
      : t.configured
        ? green("configured \u2713")
        : yellow("installed, not configured");
    console.log(`  ${t.name.padEnd(16)} ${status}`);
  }

  const cfgCount = tools.filter((t) => t.configured).length;
  const instCount = tools.filter((t) => t.installed).length;
  console.log("");
  if (instCount > cfgCount) {
    info(
      `${instCount - cfgCount} tool(s) installed but not configured. Run ${bold("hexaclaw setup")}.`,
    );
  }
  console.log("");
}
