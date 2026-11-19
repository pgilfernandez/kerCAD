import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { configuredAdminKey, normalizeAdminSlug } from "@/lib/adminAccess";
import { clearSharedProjects } from "@/lib/clearSharedProjects";

export const metricEvents = ["project", "challenge", "documentation", "overview", "donate", "donateGithub", "donatePaypal", "github"] as const;
type Event = typeof metricEvents[number];
type State = { enabled?: boolean; sponsorPopupEnabled?: boolean; sharedProjectsEnabled?: boolean; sharedProjectsDirectory?: string; adminSlug?: string; adminPasswordHash?: string; since: string; counts: Record<Event, number>; bytes: number; visitors: string[]; checkpoints?: Record<string, { bytes: number; at: number }> };
type Runtime = { state: State | null; queue: Promise<unknown>; sessions: Map<string, { at: number; touched: number; bytes: number }>; seen: Set<string> };
const globalStore = globalThis as typeof globalThis & { kercadMetrics?: Runtime };
const store = globalStore.kercadMetrics ??= { state: null, queue: Promise.resolve(), sessions: new Map(), seen: new Set() };
const file = path.join(process.env.KERCAD_METRICS_DIR ?? path.join(process.cwd(), ".local-data", "admin"), "metrics.json");
const defaultSharedProjectsDirectory = path.join(process.cwd(), ".local-data", "shared-projects");
async function state() {
  if (store.state) return store.state;
  try { store.state = JSON.parse(await fs.readFile(file, "utf8")) as State; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    store.state = { since: new Date().toISOString(), counts: Object.fromEntries(metricEvents.map((key) => [key, 0])) as State["counts"], bytes: 0, visitors: [] };
  }
  return store.state;
}
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = store.queue.then(task); store.queue = result.catch(() => {}); return result;
}
export function readAdminSlug() {
  return serial(async () => normalizeAdminSlug((await state()).adminSlug ?? "") ?? "admin");
}

export function readAdminPasswordHash() {
  return serial(async () => (await state()).adminPasswordHash);
}

export async function adminPasswordRequired() {
  return Boolean(configuredAdminKey()) || (await readAdminPasswordHash()) !== undefined;
}

export function initializeAdminPassword(adminPasswordHash: string) {
  return serial(async () => {
    const current = await state();
    if (configuredAdminKey() || current.adminPasswordHash !== undefined) return false;
    const data = { ...current, adminPasswordHash };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
    store.state = data;
    return true;
  });
}

export function removeAdminPassword(expectedHash: string) {
  return serial(async () => {
    const current = await state();
    if (configuredAdminKey() || current.adminPasswordHash !== expectedHash) return false;
    const data = { ...current };
    delete data.adminPasswordHash;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
    store.state = data;
    return true;
  });
}

export function setAdminSlug(adminSlug: string, expectedPasswordHash: string | undefined) {
  return serial(async () => {
    const current = await state();
    if (current.adminPasswordHash !== expectedPasswordHash) return false;
    const data = { ...current, adminSlug };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
    store.state = data;
    return true;
  });
}

export function readTelemetryEnabled() {
  return serial(async () => (await state()).enabled === true);
}
export function recordMetrics(input: { visitor: string; session: string; bytes: number; event?: Event; id?: string; active: boolean }) {
  return serial(async () => {
    const data = await state();
    if (data.enabled !== true) return;
    const now = Date.now();
    const previous = store.sessions.get(input.session);
    data.checkpoints ??= {};
    const previousBytes = previous?.bytes ?? data.checkpoints[input.session]?.bytes ?? 0;
    data.bytes += Math.max(0, input.bytes - previousBytes);
    data.checkpoints[input.session] = { bytes: Math.max(previousBytes, input.bytes), at: now };
    store.sessions.set(input.session, { at: input.active ? now : 0, touched: now, bytes: Math.max(previousBytes, input.bytes) });
    if (!data.visitors.includes(input.visitor)) data.visitors.push(input.visitor);
    if (input.event && input.id && !store.seen.has(input.id)) {
      data.counts[input.event] = (data.counts[input.event] ?? 0) + 1; store.seen.add(input.id);
      if (store.seen.size > 20000) store.seen.delete(store.seen.values().next().value!);
    }
    for (const [key, session] of store.sessions) if (now - session.touched > 3600000) store.sessions.delete(key);
    for (const [key, checkpoint] of Object.entries(data.checkpoints)) if (now - checkpoint.at > 7 * 86400000) delete data.checkpoints[key];
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
  });
}
export function readMetrics(includeDirectory = false) {
  return serial(async () => {
    const data = await state();
    const shared = sharedProjectsSettings(data);
    return { enabled: data.enabled === true, sponsorPopupEnabled: data.sponsorPopupEnabled !== false, sharedProjectsConfigured: true, sharedProjectsEnabled: shared.enabled, ...(includeDirectory ? { sharedProjectsDirectory: data.sharedProjectsDirectory ?? "", sharedProjectsEffectiveDirectory: shared.directory } : {}), since: data.since, counts: data.counts, bytes: data.bytes, visitors: data.visitors.length, active: data.enabled ? [...store.sessions.values()].filter((session) => Date.now() - session.at < 90000).length : 0 };
  });
}
export function readSponsorPopupEnabled() {
  return serial(async () => (await state()).sponsorPopupEnabled !== false);
}

function setFeatureEnabled(key: "sponsorPopupEnabled" | "sharedProjectsEnabled", enabled: boolean) {
  return serial(async () => {
    const data = { ...await state(), [key]: enabled };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
    store.state = data;
  });
}

export const setSponsorPopupEnabled = (enabled: boolean) => setFeatureEnabled("sponsorPopupEnabled", enabled);
export const setSharedProjectsEnabled = (enabled: boolean) => setFeatureEnabled("sharedProjectsEnabled", enabled);

function sharedProjectsSettings(data: State) {
  const configured = data.sharedProjectsDirectory ?? (process.env.KERCAD_SHARED_PROJECTS_DIR ?? process.env.SKETCHFORGE_SHARED_PROJECTS_DIR)?.trim();
  return {
    directory: configured ? path.resolve(configured) : defaultSharedProjectsDirectory,
    enabled: data.sharedProjectsEnabled ?? Boolean(configured),
  };
}

export async function enabledSharedProjectsDirectory() {
  return serial(async () => {
    const shared = sharedProjectsSettings(await state());
    return shared.enabled ? shared.directory : null;
  }).catch(() => null);
}

export function deleteSharedProjects(expectedDirectory: string | null, expectedPasswordHash: string | undefined) {
  return serial(async () => {
    const data = await state();
    const { directory, enabled } = sharedProjectsSettings(data);
    if (enabled || data.adminPasswordHash !== expectedPasswordHash) return null;
    if (expectedDirectory !== null && directory !== expectedDirectory) return null;
    return clearSharedProjects(directory);
  });
}

export async function setSharedProjectsDirectory(value: string, expectedPasswordHash: string | undefined) {
  let directory: string | undefined;
  if (value) {
    if (!path.isAbsolute(value) || value.includes("\0")) return "invalid";
    try {
      const resolved = await fs.realpath(value);
      if (resolved === path.parse(resolved).root || !(await fs.stat(resolved)).isDirectory()) return "invalid";
      await fs.access(resolved, constants.R_OK | constants.W_OK | constants.X_OK);
      directory = resolved;
    } catch { return "invalid"; }
  }
  return serial(async () => {
    const current = await state();
    if (current.adminPasswordHash !== expectedPasswordHash) return "conflict";
    const data = { ...current, sharedProjectsDirectory: directory };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
    store.state = data;
    return "saved";
  });
}
export function setMetricsEnabled(enabled: boolean) {
  return serial(async () => {
    const data = await state(); data.enabled = enabled;
    if (!enabled) store.sessions.clear();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data)); await fs.rename(`${file}.tmp`, file);
  });
}
