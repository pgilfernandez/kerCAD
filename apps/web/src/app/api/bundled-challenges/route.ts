import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGES_DIR = path.join(process.cwd(), "apps", "web", "challenges");

function safeZipName(value: string) {
  return /^[a-z0-9][a-z0-9._ -]*\.zip$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get("file");
  if (file) {
    const safeName = safeZipName(file);
    if (!safeName) return new NextResponse("Invalid challenge package name", { status: 400 });
    try {
      const packageFile = await fs.readFile(path.join(CHALLENGES_DIR, safeName));
      return new NextResponse(packageFile, { headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" } });
    } catch {
      return new NextResponse("Challenge package not found", { status: 404 });
    }
  }

  try {
    const entries = await fs.readdir(CHALLENGES_DIR, { withFileTypes: true });
    return NextResponse.json({ files: entries.filter((entry) => entry.isFile() && safeZipName(entry.name)).map((entry) => entry.name).sort((left, right) => left.localeCompare(right)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ files: [] }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Could not read bundled challenges" }, { status: 500 });
  }
}
