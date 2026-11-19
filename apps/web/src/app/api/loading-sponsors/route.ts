import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readSponsorPopupEnabled } from "@/lib/adminMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const enabled = await readSponsorPopupEnabled().catch(() => true);
  const headers = { "Cache-Control": "no-store" };
  if (!enabled || new URL(request.url).searchParams.has("status")) return NextResponse.json({ enabled, images: [] }, { headers });
  const cwd = process.cwd();
  const webRoot = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
    ? cwd : path.join(cwd, "apps", "web");
  const directory = path.join(webRoot, "public", "assets", "kercad", "sponsors");
  let images: string[] = [];
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    images = (await Promise.all(entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && /\.(?:avif|webp|png|jpe?g|gif|svg)$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        try {
          const stat = await fs.lstat(path.join(directory, entry.name));
          if (!stat.isFile() || stat.isSymbolicLink()) return null;
          return `/assets/kercad/sponsors/${encodeURIComponent(entry.name)}?v=${stat.size}-${Math.trunc(stat.mtimeMs)}`;
        } catch { return null; }
      }))).filter((src): src is string => src !== null);
  } catch { /* An absent sponsor folder must not prevent opening projects. */ }
  return NextResponse.json({ enabled, images }, { headers });
}
