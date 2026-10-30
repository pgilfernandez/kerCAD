import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "apps/web", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
let pending;
let generating = false;
let queued = false;

function regenerate() {
  if (generating) { queued = true; return; }
  generating = true;
  const generationProcess = spawn(process.execPath, [path.join(root, "scripts/i18n.mjs")], { cwd: root, stdio: "inherit" });
  generationProcess.on("exit", () => {
    generating = false;
    if (queued) { queued = false; regenerate(); }
  });
}

// A new catalog updates the imported registry, which Next reloads automatically.
const watcher = watch(path.join(root, "apps/web/src/locales"), (_event, filename) => {
  if (!filename?.endsWith(".json")) return;
  clearTimeout(pending);
  pending = setTimeout(regenerate, 150);
});
const stop = (signal) => { watcher.close(); clearTimeout(pending); next.kill(signal); };
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
next.on("exit", (code) => { watcher.close(); clearTimeout(pending); process.exitCode = code ?? 0; });
next.on("error", (error) => { console.error(error); stop("SIGTERM"); process.exitCode = 1; });
