import { createHash } from "node:crypto";
import { constants, promises as fs, type Stats } from "node:fs";

type Revision = { stat: Stats; revision: string };
type CachedRevision = { signature: string; revision: string };
const maximumEntries = 512;
const cache = new Map<string, CachedRevision>();
const pending = new Map<string, Promise<Revision | null>>();

function signature(stat: Stats) {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}

export function forgetSharedRevision(filePath: string) {
  cache.delete(filePath);
}

export function rememberSharedRevision(filePath: string, stat: Stats, revision: string) {
  cache.delete(filePath);
  cache.set(filePath, { signature: signature(stat), revision });
  while (cache.size > maximumEntries) cache.delete(cache.keys().next().value!);
}

async function readRevision(filePath: string): Promise<Revision | null> {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const cached = cache.get(filePath);
    if (cached?.signature === signature(stat)) {
      rememberSharedRevision(filePath, stat, cached.revision);
      return { stat, revision: cached.revision };
    }
    // Hash in bounded chunks, keeping the same descriptor throughout the read.
    // This avoids loading every large project into memory for the dashboard.
    const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile()) return null;
      const hash = createHash("sha256");
      const buffer = Buffer.allocUnsafe(64 * 1024);
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead));
      }
      const after = await handle.stat();
      const current = await fs.lstat(filePath);
      if (signature(before) !== signature(after) || signature(after) !== signature(current)) return null;
      const revision = hash.digest("hex");
      rememberSharedRevision(filePath, after, revision);
      return { stat: after, revision };
    } finally { await handle.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ELOOP") { forgetSharedRevision(filePath); return null; }
    throw error;
  }
}

/** Listing/preview optimization only. Mutations still verify file bytes under lock. */
export async function sharedProjectRevision(filePath: string) {
  const existing = pending.get(filePath);
  if (existing) return existing;
  const request = readRevision(filePath);
  pending.set(filePath, request);
  try { return await request; }
  finally { if (pending.get(filePath) === request) pending.delete(filePath); }
}
