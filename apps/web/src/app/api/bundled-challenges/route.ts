import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function challengesDirectory() {
  const configured = process.env.KERCAD_CHALLENGES_DIR?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  // Next's standalone server runs from apps/web; development runs from the repo.
  return path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
    ? path.join(cwd, "challenges")
    : path.join(cwd, "apps", "web", "challenges");
}
const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;
const revisions = new Map<string, { stamp: string; revision: string }>();
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

function cachedResponse(request: Request, body: Uint8Array | string, revision: string, contentType: string) {
  const etag = `"${revision}"`;
  const headers = { "Content-Type": contentType, "Cache-Control": "private, no-cache", ETag: etag };
  const matches = request.headers.get("if-none-match")?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag || value.trim() === "*");
  return matches ? new NextResponse(null, { status: 304, headers }) : new NextResponse(typeof body === "string" ? body : new Uint8Array(body), { headers });
}

function safeZipName(value: string) {
  return /^[a-z0-9][a-z0-9._ -]*\.zip$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  const directory = challengesDirectory();
  const file = new URL(request.url).searchParams.get("file");
  if (file) {
    const safeName = safeZipName(file);
    if (!safeName) return new NextResponse("Invalid challenge package name", { status: 400 });
    try {
      const packagePath = path.join(directory, safeName);
      const stat = await fs.lstat(packagePath);
      if (!stat.isFile() || stat.isSymbolicLink()) return new NextResponse("Challenge package not found", { status: 404 });
      if (stat.size > MAX_PACKAGE_BYTES) return new NextResponse("Challenge package exceeds the size limit", { status: 413 });
      const packageFile = await fs.readFile(packagePath);
      if (packageFile.byteLength > MAX_PACKAGE_BYTES) return new NextResponse("Challenge package exceeds the size limit", { status: 413 });
      return cachedResponse(request, packageFile, digest(packageFile), "application/zip");
    } catch {
      return new NextResponse("Challenge package not found", { status: 404 });
    }
  }

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const packages: Array<{ name: string; size: number; revision: string }> = [];
    const activePaths = new Set<string>();
    for (const entry of entries.filter((entry) => entry.isFile() && safeZipName(entry.name)).sort((a, b) => a.name.localeCompare(b.name))) {
      const packagePath = path.join(directory, entry.name);
      try {
        const stat = await fs.lstat(packagePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PACKAGE_BYTES) continue;
        activePaths.add(packagePath);
        const stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`;
        let cached = revisions.get(packagePath);
        if (cached?.stamp !== stamp) {
          const bytes = await fs.readFile(packagePath);
          if (bytes.byteLength > MAX_PACKAGE_BYTES) continue;
          cached = { stamp, revision: digest(bytes) };
          revisions.set(packagePath, cached);
        }
        packages.push({ name: entry.name, size: stat.size, revision: cached.revision });
      } catch { /* A removed/unreadable ZIP must not hide the remaining catalog. */ }
    }
    for (const cachedPath of revisions.keys()) if (!activePaths.has(cachedPath)) revisions.delete(cachedPath);
    // Keep filenames for older clients; new clients compare content revisions.
    const body = JSON.stringify({ files: packages.map((entry) => entry.name), packages });
    return cachedResponse(request, body, digest(body), "application/json");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      revisions.clear();
      const body = JSON.stringify({ files: [], packages: [] });
      return cachedResponse(request, body, digest(body), "application/json");
    }
    return NextResponse.json({ error: "Could not read bundled challenges" }, { status: 500 });
  }
}
