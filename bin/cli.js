#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliTs = resolve(__dirname, "./cli.ts");

function parseNode(v) {
  const [maj, min, pat] = v.split(".").map(Number);
  return { maj, min, pat };
}
const { maj, min } = parseNode(process.versions.node);

// Node >=20.6 or >=18.19 should use --import=tsx/esm (loader flag deprecated)
// Older Node uses --loader tsx.
const args = [cliTs, ...process.argv.slice(2)];
let spawnArgs;
if ((maj > 20) || (maj === 20 && min >= 6) || (maj === 18 && min >= 19)) {
  spawnArgs = ["--import", "tsx/esm", ...args];
} else {
  spawnArgs = ["--loader", "tsx", ...args];
}

const child = spawn(process.execPath, spawnArgs, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Failed to launch CLI with tsx:", err?.message || err);
  process.exit(1);
});
