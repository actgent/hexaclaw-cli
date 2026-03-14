#!/usr/bin/env node
/**
 * End-to-end MCP tool test — spawns the hexaclaw-mcp-server,
 * performs the JSON-RPC handshake, then calls real tools.
 */
import { spawn } from "node:child_process";

const API_KEY = process.env.HEXACLAW_API_KEY;
if (!API_KEY) { console.error("HEXACLAW_API_KEY required"); process.exit(1); }

// Use local build if MCP_SERVER_PATH is set, otherwise npx
const mcpPath = process.env.MCP_SERVER_PATH;
const cmd = mcpPath ? "node" : "npx";
const args = mcpPath ? [mcpPath] : ["-y", "hexaclaw-mcp-server"];
const server = spawn(cmd, args, {
  env: { ...process.env, HEXACLAW_API_KEY: API_KEY, HEXACLAW_API_BASE: "https://api.hexaclaw.com" },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let msgId = 0;
const pending = new Map();

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  // MCP uses newline-delimited JSON
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});

server.stderr.on("data", (d) => {
  const s = d.toString();
  if (!s.includes("npm warn") && !s.includes("npx")) process.stderr.write(s);
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
    pending.set(id, (msg) => { clearTimeout(timeout); resolve(msg); });
    const req = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    server.stdin.write(req + "\n");
  });
}

function callTool(name, args) {
  return send("tools/call", { name, arguments: args });
}

const GREEN = "\x1b[0;32m", RED = "\x1b[0;31m", YELLOW = "\x1b[1;33m", NC = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
let pass = 0, fail = 0;

function ok(name, detail = "") { console.log(`  ${GREEN}PASS${NC}  ${name}${detail ? ` ${DIM}(${detail})${NC}` : ""}`); pass++; }
function bad(name, detail = "") { console.log(`  ${RED}FAIL${NC}  ${name}${detail ? ` ${DIM}(${detail})${NC}` : ""}`); fail++; }
function skip(name, reason) { console.log(`  ${YELLOW}SKIP${NC}  ${name} ${DIM}(${reason})${NC}`); }

async function run() {
  console.log(`\n${BOLD}MCP Tool End-to-End Tests${NC}\n`);

  // 1. Initialize
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "hexaclaw-test", version: "1.0.0" },
  });
  if (init.result?.serverInfo) {
    ok("initialize", `${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  } else {
    bad("initialize", JSON.stringify(init.error || init).slice(0, 100));
    process.exit(1);
  }

  // Send initialized notification
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // 2. List tools
  const toolsList = await send("tools/list");
  const tools = toolsList.result?.tools || [];
  const toolNames = tools.map(t => t.name);
  if (tools.length >= 15) {
    ok("tools/list", `${tools.length} tools: ${toolNames.join(", ")}`);
  } else {
    bad("tools/list", `only ${tools.length} tools`);
  }

  // 3. hexaclaw_credits
  try {
    const credits = await callTool("hexaclaw_credits", {});
    const text = credits.result?.content?.[0]?.text || "";
    if (text.includes("balance") || text.includes("credits") || text.includes("tier")) {
      ok("hexaclaw_credits", text.slice(0, 80));
    } else {
      bad("hexaclaw_credits", text.slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_credits", e.message); }

  // 4. hexaclaw_models
  try {
    const models = await callTool("hexaclaw_models", {});
    const text = models.result?.content?.[0]?.text || "";
    if (text.includes("gemini") || text.includes("gpt") || text.includes("claude")) {
      const count = (text.match(/\n/g) || []).length;
      ok("hexaclaw_models", `${count}+ models listed`);
    } else {
      bad("hexaclaw_models", text.slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_models", e.message); }

  // 5. hexaclaw_search
  try {
    const search = await callTool("hexaclaw_search", { query: "HexaClaw AI tools", limit: 3 });
    const text = search.result?.content?.[0]?.text || "";
    if (text.length > 50) {
      ok("hexaclaw_search", `${text.length} chars returned`);
    } else {
      bad("hexaclaw_search", text.slice(0, 100) || JSON.stringify(search.error || search).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_search", e.message); }

  // 6. hexaclaw_scrape
  try {
    const scrape = await callTool("hexaclaw_scrape", { url: "https://example.com" });
    const text = scrape.result?.content?.[0]?.text || "";
    if (text.includes("Example Domain") || text.length > 100) {
      ok("hexaclaw_scrape", `${text.length} chars scraped`);
    } else {
      bad("hexaclaw_scrape", text.slice(0, 100) || JSON.stringify(scrape.error).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_scrape", e.message); }

  // 7. hexaclaw_read
  try {
    const read = await callTool("hexaclaw_read", { url: "https://example.com" });
    const text = read.result?.content?.[0]?.text || "";
    if (text.length > 50) {
      ok("hexaclaw_read", `${text.length} chars`);
    } else {
      bad("hexaclaw_read", text.slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_read", e.message); }

  // 8. hexaclaw_chat
  try {
    const chat = await callTool("hexaclaw_chat", {
      model: "gemini-2.5-flash",
      message: "Reply with just the word PONG",
    });
    const text = chat.result?.content?.[0]?.text || "";
    if (text.toLowerCase().includes("pong")) {
      ok("hexaclaw_chat", text.trim().slice(0, 50));
    } else if (text.length > 0) {
      ok("hexaclaw_chat", `got response: ${text.trim().slice(0, 50)}`);
    } else {
      bad("hexaclaw_chat", JSON.stringify(chat.error || chat.result).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_chat", e.message); }

  // 9. hexaclaw_generate_image
  try {
    const img = await callTool("hexaclaw_generate_image", {
      prompt: "A small red cube on a white background, minimalist",
      model: "imagen4",
    });
    const content = img.result?.content || [];
    const hasImage = content.some(c => c.type === "image" || (c.type === "text" && (c.text || "").includes("http")));
    const text = content.find(c => c.type === "text")?.text || "";
    if (hasImage || text.includes("http") || text.includes("generated")) {
      ok("hexaclaw_generate_image", text.slice(0, 80) || "image returned");
    } else {
      bad("hexaclaw_generate_image", text.slice(0, 100) || JSON.stringify(img.error || img.result).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_generate_image", e.message); }

  // 10. hexaclaw_tts
  try {
    const tts = await callTool("hexaclaw_tts", {
      input: "Hello world",
      voice: "alloy",
    });
    const content = tts.result?.content || [];
    const text = content.find(c => c.type === "text")?.text || "";
    if (text.includes("http") || text.includes("audio") || text.includes("generated") || content.length > 0) {
      ok("hexaclaw_tts", text.slice(0, 80) || "audio returned");
    } else {
      bad("hexaclaw_tts", text.slice(0, 100) || JSON.stringify(tts.error || tts.result).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_tts", e.message); }

  // 11. hexaclaw_embeddings
  try {
    const emb = await callTool("hexaclaw_embeddings", {
      input: "test embedding",
    });
    const text = emb.result?.content?.[0]?.text || "";
    if (text.includes("dimension") || text.includes("[") || text.includes("embedding")) {
      ok("hexaclaw_embeddings", text.slice(0, 80));
    } else {
      bad("hexaclaw_embeddings", text.slice(0, 100) || JSON.stringify(emb.error).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_embeddings", e.message); }

  // 12. hexaclaw_memory_store + hexaclaw_memory_search
  try {
    const store = await callTool("hexaclaw_memory_store", {
      situation: "testing hexaclaw mcp tools on tart vm",
      outcome: "all tools working correctly",
    });
    const storeText = store.result?.content?.[0]?.text || "";
    if (storeText.length > 0 && !store.error) {
      ok("hexaclaw_memory_store", storeText.slice(0, 80));
    } else {
      bad("hexaclaw_memory_store", storeText.slice(0, 100) || JSON.stringify(store.error).slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_memory_store", e.message); }

  try {
    const search = await callTool("hexaclaw_memory_search", {
      query: "hexaclaw mcp tools",
    });
    const text = search.result?.content?.[0]?.text || "";
    if (text.length > 10) {
      ok("hexaclaw_memory_search", text.slice(0, 80));
    } else {
      bad("hexaclaw_memory_search", text.slice(0, 100));
    }
  } catch (e) { bad("hexaclaw_memory_search", e.message); }

  // Summary
  console.log(`\n  ${BOLD}Results: ${GREEN}${pass} passed${NC}, ${RED}${fail} failed${NC}\n`);

  server.kill();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); server.kill(); process.exit(1); });
