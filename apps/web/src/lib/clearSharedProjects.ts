import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROJECT_FILE_PATTERN } from "@/lib/legacyBrand";
import { acquireSharedProjectLock } from "@/lib/sharedProjectLock";
import { forgetSharedRevision } from "@/lib/sharedProjectRevision";

export async function clearSharedProjects(directory: string) {
  const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
  const root = await fs.realpath(directory).catch((error) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (!root) return { deleted: 0, failed: 0 };
  if (root === path.parse(root).root) throw new Error("Refusing to clear the filesystem root");
  const files = await fs.readdir(root, { withFileTypes: true });
  const sidecars = await Promise.all([[".authors", ".json"], [".thumbnails", ".jpg"]].map(async ([folder, suffix]) => {
    const dir = path.join(root, folder);
    const stat = await fs.lstat(dir).catch(() => null);
    const entries = stat?.isDirectory() ? await fs.readdir(dir, { withFileTypes: true }).catch(() => []) : [];
    return { dir, suffix, entries };
  }));
  let deleted = 0;
  let failed = 0;
  for (const entry of files) {
    if (!entry.isFile() || !PROJECT_FILE_PATTERN.test(entry.name)) continue;
    const file = path.join(root, entry.name);
    let lock: Awaited<ReturnType<typeof acquireSharedProjectLock>> | undefined;
    try {
      lock = await acquireSharedProjectLock(`${file}.lock`);
      if (!(await fs.lstat(file)).isFile()) { failed++; continue; }
      await fs.unlink(file);
      forgetSharedRevision(file);
      if (directory !== root) forgetSharedRevision(path.join(directory, entry.name));
      deleted++;
      const prefix = `${createHash("sha256").update(entry.name).digest("hex")}-`;
      for (const { dir, suffix, entries } of sidecars) {
        for (const sidecar of entries) {
          if (sidecar.isFile() && sidecar.name.startsWith(prefix) && sidecar.name.endsWith(suffix)) {
            await fs.unlink(path.join(dir, sidecar.name)).catch(() => undefined);
          }
        }
      }
    } catch (error) {
      if (!isMissing(error)) failed++;
    } finally {
      await lock?.release();
    }
  }
  return { deleted, failed };
}
