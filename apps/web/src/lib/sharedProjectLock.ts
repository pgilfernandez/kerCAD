import { promises as fs } from "node:fs";
import { hostname } from "node:os";

// Keep coordination across development hot reloads. The supported deployment is
// one application server per shared directory (not multiple container replicas).
const state = globalThis as typeof globalThis & { kercadSharedLocks?: Set<string> };
const activeLocks = state.kercadSharedLocks ??= new Set<string>();

function occupied() {
  return Object.assign(new Error("Shared project is being changed"), { code: "EEXIST" });
}

async function removeAbandonedLock(lockPath: string) {
  try {
    const stat = await fs.lstat(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const owner = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (owner.format !== "kercad-lock-v1" || owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      // Permission errors and reused/live PIDs must never permit takeover.
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
    }
    const current = await fs.lstat(lockPath);
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.mtimeMs !== stat.mtimeMs) return false;
    await fs.unlink(lockPath);
    return true;
  } catch { return false; }
}

export async function acquireSharedProjectLock(lockPath: string): Promise<{ release: () => Promise<void> }> {
  if (activeLocks.has(lockPath)) throw occupied();
  activeLocks.add(lockPath);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    try { handle = await fs.open(lockPath, "wx"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !await removeAbandonedLock(lockPath)) throw error;
      handle = await fs.open(lockPath, "wx");
    }
    await handle.writeFile(JSON.stringify({ format: "kercad-lock-v1", pid: process.pid, host: hostname(), createdAt: new Date().toISOString() }));
    await handle.sync();
    const ownedHandle = handle;
    let released = false;
    return { release: async () => {
      if (released) return;
      released = true;
      try {
        // Remove the file before releasing in-process ownership.
        await fs.unlink(lockPath).catch(() => undefined);
        await ownedHandle.close().catch(() => undefined);
      } finally { activeLocks.delete(lockPath); }
    } };
  } catch (error) {
    if (handle) {
      await fs.unlink(lockPath).catch(() => undefined);
      await handle.close().catch(() => undefined);
    }
    activeLocks.delete(lockPath);
    throw error;
  }
}
