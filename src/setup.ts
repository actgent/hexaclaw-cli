import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { platform } from "node:os";
import {
  HOME,
  HEXACLAW_DIR,
  API_BASE,
  loadApiKey,
  validateKey,
  readJson,
  writeJson,
  fileExists,
  hasCommand,
  deepMerge,
  ok,
  err,
  info,
  step,
  toolOk,
  toolSkip,
  bold,
  dim,
  green,
} from "./shared.js";
import { execSync } from "node:child_process";

let configured = 0;
let skipped = 0;

const IS_MAC = platform() === "darwin";

// ── MCP entry builder ───────────────────────────────────
function mcpEntry(apiKey: string, extra?: Record<string, any>) {
  return {
    command: "npx",
    args: ["-y", "hexaclaw-mcp-server"],
    env: {
      HEXACLAW_API_KEY: apiKey,
      HEXACLAW_API_BASE: API_BASE,
    },
    ...extra,
  };
}

// ── Tool configurators ──────────────────────────────────

async function setupClaudeCode(apiKey: string): Promise<void> {
  const dir = join(HOME, ".claude");
  if (!hasCommand("claude") && !(await fileExists(dir))) {
    toolSkip("Claude Code");
    skipped++;
    return;
  }

  // Use `claude mcp add` if the CLI is available (writes to .claude.json which Claude actually reads)
  let usedClaudeCli = false;
  if (hasCommand("claude")) {
    try {
      // Remove existing first (ignore errors if not present)
      execSync("claude mcp remove hexaclaw -s user 2>/dev/null || true", {
        stdio: "ignore",
      });
      // Use spawn-style args to avoid shell injection — API key passed via -e flag
      // with proper quoting to prevent shell interpretation
      const safeKey = apiKey.replace(/'/g, "'\\''");
      const safeBase = API_BASE.replace(/'/g, "'\\''");
      execSync(
        `claude mcp add hexaclaw -s user -e 'HEXACLAW_API_KEY=${safeKey}' -e 'HEXACLAW_API_BASE=${safeBase}' -- hexaclaw-mcp-server`,
        { stdio: "ignore" },
      );
      usedClaudeCli = true;
    } catch {
      // Fall back to settings.json if CLI fails
    }
  }

  if (!usedClaudeCli) {
    // No CLI or CLI failed — write to settings.json as fallback
    const settingsPath = join(dir, "settings.json");
    const settings = await readJson(settingsPath);
    const mcpServers = (settings.mcpServers || {}) as Record<string, any>;
    mcpServers.hexaclaw = mcpEntry(apiKey);
    settings.mcpServers = mcpServers;
    await writeJson(settingsPath, settings);
  }

  // CLAUDE.md
  const claudeMd = join(dir, "CLAUDE.md");
  const block = `# HexaClaw Cloud Services

You have access to HexaClaw tools via MCP. Use these tools when the user needs:
- **Web search**: \`hexaclaw_search\` (1 credit)
- **Page reading**: \`hexaclaw_read\` or \`hexaclaw_scrape\` (1-2 credits)
- **Image generation**: \`hexaclaw_generate_image\` (1-10 credits)
- **Video generation**: \`hexaclaw_generate_video\` (5-40 credits)
- **Audio/TTS**: \`hexaclaw_generate_audio\` / \`hexaclaw_tts\` (1-3 credits)
- **Browser automation**: \`hexaclaw_browser\` (2 credits/min)
- **Vector storage**: \`hexaclaw_vector_upsert\` / \`hexaclaw_vector_query\`
- **Memory**: \`hexaclaw_memory_store\` / \`hexaclaw_memory_search\`
- **Email**: \`hexaclaw_send_email\` (1 credit)
- **Credits check**: \`hexaclaw_credits\` (free)
- **Model list**: \`hexaclaw_models\` (free)

Check credit balance with \`hexaclaw_credits\` before expensive operations.`;

  let existing = "";
  try {
    existing = await readFile(claudeMd, "utf-8");
  } catch {}
  if (!existing.includes("HexaClaw Cloud Services")) {
    await mkdir(dir, { recursive: true });
    await writeFile(claudeMd, existing ? existing + "\n\n" + block : block);
  }

  toolOk(
    usedClaudeCli
      ? "Claude Code \u2014 claude mcp add + CLAUDE.md"
      : "Claude Code \u2014 ~/.claude/settings.json + CLAUDE.md",
  );
  configured++;
}

async function setupCursor(apiKey: string): Promise<void> {
  const dir = join(HOME, ".cursor");
  if (
    !(await fileExists(dir)) &&
    !(IS_MAC && (await fileExists("/Applications/Cursor.app")))
  ) {
    toolSkip("Cursor");
    skipped++;
    return;
  }

  const mcpPath = join(dir, "mcp.json");
  const config = await readJson(mcpPath);
  const mcpServers = (config.mcpServers || {}) as Record<string, any>;
  mcpServers.hexaclaw = mcpEntry(apiKey);
  config.mcpServers = mcpServers;
  await writeJson(mcpPath, config);

  // Cursor rules
  const rulesDir = join(dir, "rules");
  await mkdir(rulesDir, { recursive: true });
  await writeFile(
    join(rulesDir, "hexaclaw.mdc"),
    `# HexaClaw Cloud Services

You have access to HexaClaw tools via MCP:
- **hexaclaw_search** \u2014 Web search (1 credit)
- **hexaclaw_scrape** \u2014 Scrape URL to markdown (2 credits)
- **hexaclaw_generate_image** \u2014 Image generation (1-10 credits)
- **hexaclaw_generate_video** \u2014 Video generation (5-40 credits)
- **hexaclaw_generate_audio** \u2014 Audio/music (3 credits)
- **hexaclaw_tts** \u2014 Text to speech (1-2 credits)
- **hexaclaw_browser** \u2014 Cloud browser (2 credits/min)
- **hexaclaw_send_email** \u2014 Send email (1 credit)
- **hexaclaw_vector_upsert** / **hexaclaw_vector_query** \u2014 Vector storage
- **hexaclaw_memory_store** / **hexaclaw_memory_search** \u2014 Memory
- **hexaclaw_chat** \u2014 Chat with any LLM
- **hexaclaw_credits** \u2014 Check balance (free)
`,
  );

  toolOk("Cursor \u2014 ~/.cursor/mcp.json + rules");
  configured++;
}

async function setupGeminiCli(apiKey: string): Promise<void> {
  const dir = join(HOME, ".gemini");
  if (!hasCommand("gemini") && !(await fileExists(dir))) {
    toolSkip("Gemini CLI");
    skipped++;
    return;
  }

  const settingsPath = join(dir, "settings.json");
  const settings = await readJson(settingsPath);
  const mcpServers = (settings.mcpServers || {}) as Record<string, any>;
  mcpServers.hexaclaw = mcpEntry(apiKey);
  settings.mcpServers = mcpServers;
  await writeJson(settingsPath, settings);

  toolOk("Gemini CLI \u2014 ~/.gemini/settings.json");
  configured++;
}

async function setupWindsurf(apiKey: string): Promise<void> {
  const dir = join(HOME, ".codeium", "windsurf");
  if (
    !(await fileExists(dir)) &&
    !(IS_MAC && (await fileExists("/Applications/Windsurf.app")))
  ) {
    toolSkip("Windsurf");
    skipped++;
    return;
  }

  await mkdir(dir, { recursive: true });
  const configPath = join(dir, "mcp_config.json");
  const config = await readJson(configPath);
  const mcpServers = (config.mcpServers || {}) as Record<string, any>;
  mcpServers.hexaclaw = mcpEntry(apiKey);
  config.mcpServers = mcpServers;
  await writeJson(configPath, config);

  toolOk("Windsurf \u2014 ~/.codeium/windsurf/mcp_config.json");
  configured++;
}

async function setupVSCode(apiKey: string): Promise<void> {
  const dir = join(HOME, ".vscode");
  let detected = false;
  if (hasCommand("code")) detected = true;
  else if (IS_MAC && (await fileExists("/Applications/Visual Studio Code.app")))
    detected = true;
  else if (await fileExists(dir)) detected = true;

  if (!detected) {
    toolSkip("VS Code (Copilot)");
    skipped++;
    return;
  }

  // VS Code uses "servers" key with explicit "type" field
  const mcpPath = join(dir, "mcp.json");
  const config = await readJson(mcpPath);
  const servers = (config.servers || {}) as Record<string, any>;
  servers.hexaclaw = mcpEntry(apiKey, { type: "stdio" });
  config.servers = servers;
  await writeJson(mcpPath, config);

  toolOk("VS Code (Copilot) \u2014 ~/.vscode/mcp.json");
  configured++;
}

async function setupZed(apiKey: string): Promise<void> {
  const dir = join(HOME, ".config", "zed");
  if (!hasCommand("zed") && !(await fileExists(dir))) {
    toolSkip("Zed");
    skipped++;
    return;
  }

  await mkdir(dir, { recursive: true });
  const settingsPath = join(dir, "settings.json");
  const settings = await readJson(settingsPath);
  const contextServers = (settings.context_servers || {}) as Record<
    string,
    any
  >;
  contextServers.hexaclaw = {
    command: {
      path: "npx",
      args: ["-y", "hexaclaw-mcp-server"],
      env: {
        HEXACLAW_API_KEY: apiKey,
        HEXACLAW_API_BASE: API_BASE,
      },
    },
    settings: {},
  };
  settings.context_servers = contextServers;
  await writeJson(settingsPath, settings);

  toolOk("Zed \u2014 ~/.config/zed/settings.json");
  configured++;
}

async function setupCline(apiKey: string): Promise<void> {
  let dir: string;
  if (IS_MAC) {
    dir = join(
      HOME,
      "Library",
      "Application Support",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
    );
  } else {
    dir = join(
      HOME,
      ".config",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
    );
  }

  // Check if parent (extension dir) exists, or if extension is installed
  const extensionDir = dirname(dir);
  let detected = await fileExists(extensionDir);
  if (!detected && hasCommand("code")) {
    try {
      const out = execSync("code --list-extensions 2>/dev/null", {
        encoding: "utf-8",
      });
      if (out.toLowerCase().includes("claude-dev")) detected = true;
    } catch {}
  }

  if (!detected) {
    toolSkip("Cline");
    skipped++;
    return;
  }

  await mkdir(dir, { recursive: true });
  const configPath = join(dir, "cline_mcp_settings.json");
  const config = await readJson(configPath);
  const mcpServers = (config.mcpServers || {}) as Record<string, any>;
  mcpServers.hexaclaw = mcpEntry(apiKey, {
    disabled: false,
    autoApprove: [],
  });
  config.mcpServers = mcpServers;
  await writeJson(configPath, config);

  toolOk("Cline \u2014 cline_mcp_settings.json");
  configured++;
}

async function setupContinue(apiKey: string): Promise<void> {
  const dir = join(HOME, ".continue");
  if (!(await fileExists(dir))) {
    toolSkip("Continue.dev");
    skipped++;
    return;
  }

  // Drop-in JSON file in .continue/mcpServers/
  const mcpDir = join(dir, "mcpServers");
  await mkdir(mcpDir, { recursive: true });
  await writeJson(join(mcpDir, "hexaclaw.json"), {
    mcpServers: {
      hexaclaw: mcpEntry(apiKey),
    },
  });

  toolOk("Continue.dev \u2014 ~/.continue/mcpServers/hexaclaw.json");
  configured++;
}

async function setupOpenClaw(apiKey: string): Promise<void> {
  const dir = join(HOME, ".openclaw");
  if (!hasCommand("openclaw") && !(await fileExists(dir))) {
    toolSkip("OpenClaw");
    skipped++;
    return;
  }

  await mkdir(dir, { recursive: true });

  // MCP server
  const mcpPath = join(dir, "mcp-servers.json");
  const mcpConfig = await readJson(mcpPath);
  mcpConfig.hexaclaw = mcpEntry(apiKey);
  await writeJson(mcpPath, mcpConfig);

  // Model provider config
  const configPath = join(dir, "openclaw.json");
  const config = await readJson(configPath);
  deepMerge(config, {
    agents: { defaults: { model: "hexaclaw-cloud/gemini-2.5-flash" } },
    gateway: { mode: "local" },
    models: {
      providers: {
        "hexaclaw-cloud": {
          baseUrl: `${API_BASE}/v1`,
          apiKey: apiKey,
          api: "openai-completions",
          models: [
            { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", api: "openai-completions", contextWindow: 1048576, maxTokens: 65536 },
            { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", api: "openai-completions", contextWindow: 1048576, maxTokens: 65536 },
            { id: "gpt-4.1-mini", name: "GPT 4.1 Mini", api: "openai-completions", contextWindow: 128000 },
            { id: "gpt-4.1", name: "GPT 4.1", api: "openai-completions", contextWindow: 128000 },
            { id: "gpt-4.1-nano", name: "GPT 4.1 Nano", api: "openai-completions", contextWindow: 128000 },
            { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", api: "openai-completions", contextWindow: 200000 },
            { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", api: "openai-completions", contextWindow: 200000 },
            { id: "deepseek-chat", name: "DeepSeek Chat", api: "openai-completions", contextWindow: 128000 },
            { id: "deepseek-reasoner", name: "DeepSeek Reasoner", api: "openai-completions", contextWindow: 128000 },
          ],
        },
      },
    },
  });
  await writeJson(configPath, config);

  // Skills
  const skillsDir = join(dir, "skills", "hexaclaw", "hexaclaw-tools");
  await mkdir(skillsDir, { recursive: true });
  await writeFile(
    join(skillsDir, "SKILL.md"),
    `---
name: hexaclaw-tools
description: "HexaClaw cloud tools: web search, image/video/audio gen, browser, vectors, email"
---
# HexaClaw Tools
Use HexaClaw MCP tools for: hexaclaw_search (1cr), hexaclaw_scrape (2cr), hexaclaw_generate_image (1-10cr), hexaclaw_generate_video (5-40cr), hexaclaw_generate_audio (3cr), hexaclaw_tts (1-2cr), hexaclaw_browser (2cr/min), hexaclaw_send_email (1cr), hexaclaw_vector_upsert, hexaclaw_vector_query, hexaclaw_memory_store, hexaclaw_memory_search, hexaclaw_credits (free), hexaclaw_models (free). Check credits before expensive ops.
`,
  );

  toolOk("OpenClaw \u2014 mcp-servers.json + openclaw.json + skills");
  configured++;
}

// ── Main ────────────────────────────────────────────────
export async function setup(): Promise<void> {
  step("1/2", "Checking authentication...");

  const apiKey = await loadApiKey();
  if (!apiKey) {
    err("Not logged in. Run `hexaclaw login` first.");
    process.exit(1);
  }

  const result = await validateKey(apiKey);
  if (!result) {
    err("API key is invalid or expired. Run `hexaclaw login` to re-authenticate.");
    process.exit(1);
  }
  ok(
    `Authenticated (tier: ${bold(result.tier)}, balance: ${result.balance} credits)`,
  );

  step("2/2", "Detecting & configuring AI tools...");
  console.log("");

  configured = 0;
  skipped = 0;

  await setupClaudeCode(apiKey);
  await setupCursor(apiKey);
  await setupGeminiCli(apiKey);
  await setupWindsurf(apiKey);
  await setupVSCode(apiKey);
  await setupZed(apiKey);
  await setupCline(apiKey);
  await setupContinue(apiKey);
  await setupOpenClaw(apiKey);

  console.log("");
  console.log(
    bold("=".repeat(51)),
  );
  console.log("");
  console.log(`  ${green(bold("Setup complete!"))}`);
  console.log("");
  console.log(
    `  Tools: ${bold(String(configured))} configured, ${dim(`${skipped} not installed`)}`,
  );
  console.log(`  MCP:   ${dim("hexaclaw-mcp-server (19 tools)")}`);
  console.log("");
  if (configured === 0) {
    console.log(
      `  ${dim("No tools detected. Install Claude Code, Cursor, Gemini CLI,")}`,
    );
    console.log(
      `  ${dim("Windsurf, VS Code, Zed, or OpenClaw, then run setup again.")}`,
    );
  } else {
    console.log(
      `  ${dim("Your AI tools now have: web search, image/video/audio gen,")}`,
    );
    console.log(
      `  ${dim("browser automation, vector storage, memory, email")}`,
    );
  }
  console.log("");
}
