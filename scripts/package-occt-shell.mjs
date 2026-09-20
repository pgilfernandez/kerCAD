// Package the patched runtime with the unmodified upstream TypeScript wrapper.
import { mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2]);
const temp = await mkdtemp(join(tmpdir(), "educad-occt-package-"));
execFileSync("npm", ["pack", "occt-wasm@3.6.1", "--pack-destination", temp], { stdio: "inherit" });
execFileSync("tar", ["-xzf", join(temp, "occt-wasm-3.6.1.tgz"), "-C", temp]);
const pkg = join(temp, "package");
for (const name of ["occt-wasm.js", "occt-wasm.wasm"]) await cp(join(source, "dist", name), join(pkg, "dist", name));
for (const name of ["LICENSE", "LICENSE-APACHE", "LICENSE-MIT"]) await cp(join(source, name), join(pkg, name));
for (const name of ["LICENSE_LGPL_21.txt", "OCCT_LGPL_EXCEPTION.txt"]) await cp(join(source, "occt", name), join(pkg, name));
const manifestPath = join(pkg, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = "3.6.1+educad.1";
manifest.files = [...manifest.files, "LICENSE*", "OCCT_LGPL_EXCEPTION.txt"];
// The published base package has prepack paths that refer to its source checkout.
delete manifest.scripts;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
execFileSync("npm", ["pack", "--pack-destination", join(root, "vendor", "occt-wasm-shell")], { cwd: pkg, stdio: "inherit" });
