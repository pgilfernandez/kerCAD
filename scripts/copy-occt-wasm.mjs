// Stages the occt-wasm runtime (Emscripten glue + 22 MB WASM) into the web app's
// public/ folder so the STEP exporter can load it lazily at runtime. The kernel is
// imported via a webpackIgnore dynamic import from /occt/, deliberately bypassing
// the Next.js bundler — Emscripten glue does not survive bundling. The copied files
// are gitignored; this script runs before dev/build to recreate them from the package.
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "occt-wasm", "dist");

if (!existsSync(src)) {
  console.error(`[copy-occt-wasm] occt-wasm not installed at ${src}. Run \`npm install\` first.`);
  process.exit(1);
}

// Version the entire module tree: index.js dynamically imports its glue, so
// versioning only the top-level URL could mix old glue with a new WASM binary.
const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
const { version } = lock.packages["node_modules/occt-wasm"];
const dest = join(root, "apps", "web", "public", "occt", version);

await mkdir(dest, { recursive: true });

const entries = await readdir(src);
const wanted = entries.filter((name) => name.endsWith(".js") || name.endsWith(".wasm"));
await Promise.all(wanted.map((name) => cp(join(src, name), join(dest, name))));

console.log(`[copy-occt-wasm] staged ${wanted.length} files into apps/web/public/occt/${version}/`);
