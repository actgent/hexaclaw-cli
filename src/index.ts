#!/usr/bin/env node

import { VERSION, bold, dim, cyan } from "./shared.js";
import { login } from "./login.js";
import { setup } from "./setup.js";
import { status } from "./status.js";
import { logout } from "./logout.js";

const HELP = `
${bold("hexaclaw")} ${dim(`v${VERSION}`)} \u2014 add AI cloud tools to all your coding assistants

${bold("Usage:")}
  hexaclaw login          Authenticate with your API key
  hexaclaw setup          Detect tools & configure MCP for each
  hexaclaw status         Show configured tools & credit balance
  hexaclaw logout         Remove stored credentials

${bold("Quick start:")}
  ${dim("npx @hexaclaw/cli login")}
  ${dim("npx @hexaclaw/cli setup")}

${bold("Supported tools:")}
  Claude Code, Cursor, Gemini CLI, Windsurf, VS Code (Copilot),
  Zed, Cline, Continue.dev, OpenClaw

${dim("Dashboard: https://hexaclaw.com/dashboard")}
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "login":
      await login();
      break;
    case "setup":
      await setup();
      break;
    case "status":
      await status();
      break;
    case "logout":
      await logout();
      break;
    case "--version":
    case "-v":
      console.log(`hexaclaw v${VERSION}`);
      break;
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
