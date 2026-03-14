import { unlink } from "node:fs/promises";
import {
  ENV_FILE,
  ENV_SH,
  AUTH_FILE,
  fileExists,
  ok,
  info,
  bold,
} from "./shared.js";

export async function logout(): Promise<void> {
  console.log(`\n${bold("HexaClaw Logout")}\n`);

  let removed = 0;
  for (const file of [ENV_FILE, ENV_SH, AUTH_FILE]) {
    if (await fileExists(file)) {
      await unlink(file);
      removed++;
    }
  }

  if (removed > 0) {
    ok("Credentials removed.");
    info(
      "MCP configs in your tools still reference HexaClaw but will fail without auth.",
    );
    info(`Run ${bold("hexaclaw login")} to re-authenticate.`);
  } else {
    info("No credentials found. Already logged out.");
  }
  console.log("");
}
