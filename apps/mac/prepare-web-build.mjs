#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [sourceArgument, targetArgument] = process.argv.slice(2);
if (!sourceArgument || !targetArgument) {
  console.error("Usage: prepare-web-build.mjs SOURCE_WEB_DIR TARGET_WEB_DIR");
  process.exit(2);
}

const sourceDirectory = path.resolve(sourceArgument);
const targetDirectory = path.resolve(targetArgument);
if (sourceDirectory === targetDirectory || !targetDirectory.includes(`${path.sep}apps${path.sep}mac${path.sep}.cache${path.sep}`)) {
  throw new Error(`Refusing to replace unsafe staging directory: ${targetDirectory}`);
}

await rm(targetDirectory, { recursive: true, force: true });
await mkdir(path.dirname(targetDirectory), { recursive: true });
await cp(sourceDirectory, targetDirectory, {
  recursive: true,
  filter(source) {
    const relative = path.relative(sourceDirectory, source);
    return !relative.split(path.sep).some((part) => part === ".next" || part === ".next-dev" || part === ".next-export");
  },
});

// Stage the current application unchanged. The legacy MCP editor is not part
// of kerCAD's parametric workflow and must not be patched into a desktop build.
console.log(`[mac-build] prepared isolated kerCAD web source at ${targetDirectory}`);
