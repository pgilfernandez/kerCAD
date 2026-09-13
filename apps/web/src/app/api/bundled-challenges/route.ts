import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function challengesDirectory() {
  const configured = process.env.EDUCAD_CHALLENGES_DIR?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  // Next's standalone server runs from apps/web; development runs from the repo.
  return path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
    ? path.join(cwd, "challenges")
    : path.join(cwd, "apps", "web", "challenges");
}
const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;

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
      return new NextResponse(packageFile, { headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" } });
    } catch {
      return new NextResponse("Challenge package not found", { status: 404 });
    }
  }

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return NextResponse.json({ files: entries.filter((entry) => entry.isFile() && safeZipName(entry.name)).map((entry) => entry.name).sort((left, right) => left.localeCompare(right)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ files: [] }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Could not read bundled challenges" }, { status: 500 });
  }
}
