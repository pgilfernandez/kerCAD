import { normalizeChallengeParameters, type ChallengeParameter } from "@/lib/challengeParameters";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createEmptyDocument, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import type { ParametricDocument } from "@/types/parametric";
import { isLegacyChallengeFormat } from "@/lib/legacyBrand";
import { createBrandMigrationStore, migrateLegacyLibrary } from "@/lib/libraryBrandMigration";

export type KercadChallengeStep = {
  id: string;
  label?: string;
  title: string;
  body: string;
  image?: string;
  values?: ChallengeParameter[];
};

export type KercadChallenge = {
  id: string;
  title: string;
  description?: string;
  author?: string;
  categories?: string[];
  version: number;
  installedAt: number;
  cover?: string;
  steps: KercadChallengeStep[];
  workspaceDocument?: ParametricDocument;
  /** Only untouched server-installed challenges may be replaced automatically. */
  bundledSource?: { name: string; revision: string };
};

export function createEmptyChallenge(): KercadChallenge {
  return {
    id: `challenge-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}@1`,
    title: "New challenge",
    description: "",
    categories: [],
    version: 1,
    installedAt: Date.now(),
    workspaceDocument: createEmptyDocument(),
    steps: [{ id: "step-1", label: "BEFORE YOU START", title: "First step", body: "Describe what the learner should do in this step.", values: [] }],
  };
}

export function duplicateChallenge(challenge: KercadChallenge, existing: KercadChallenge[]): KercadChallenge {
  const copy = structuredClone(challenge);
  copy.id = createEmptyChallenge().id;
  copy.installedAt = Date.now();
  delete copy.bundledSource;
  const names = new Set(existing.map((item) => item.title));
  const base = `${challenge.title} (copy)`;
  copy.title = base;
  for (let index = 2; names.has(copy.title); index += 1) copy.title = `${base} ${index}`;
  return copy;
}

type ChallengeManifest = {
  format: "kercad-challenge";
  version: number;
  id?: string;
  title: string;
  description?: string;
  author?: string;
  categories?: string[];
  cover?: string;
  steps: Array<{
    id?: string;
    label?: string;
    title: string;
    body: string;
    image?: string;
    values?: ChallengeParameter[];
  }>;
  workspace?: string;
};

const DATABASE_NAME = "kercad.challenge-library";
const STORE_NAME = "challenges";
const DATABASE_VERSION = 2;
const BUNDLE_STORE_NAME = "bundled-packages";
type InstalledBundle = { name: string; revision: string; challengeId: string };
const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;

function openChallengeLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      createBrandMigrationStore(request.result);
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(BUNDLE_STORE_NAME)) request.result.createObjectStore(BUNDLE_STORE_NAME, { keyPath: "name" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the challenge library."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      const database = request.result;
      void migrateLegacyLibrary(database, [STORE_NAME, BUNDLE_STORE_NAME]).then(() => resolve(database), (error) => { database.close(); reject(error); });
    };
  });
}

function assetMimeType(path: string) {
  const extension = path.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  return null;
}

function dataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return `data:${mime};base64,${btoa(binary)}`;
}

function safeAsset(files: Record<string, Uint8Array>, path?: string) {
  if (!path) return undefined;
  const normalized = path.replace(/^\.\//, "");
  if (normalized.includes("..") || normalized.startsWith("/")) throw new Error(`Unsafe challenge asset path: ${path}`);
  const bytes = files[normalized];
  const mime = assetMimeType(normalized);
  if (!bytes || !mime) throw new Error(`Challenge image could not be found: ${path}`);
  return dataUrl(bytes, mime);
}

function challengeId(manifest: ChallengeManifest) {
  const base = manifest.id?.trim() || manifest.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "challenge";
  return `${base}@${manifest.version}`;
}

export async function importChallengePackage(file: File): Promise<KercadChallenge> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Challenges must be installed from a .zip package.");
  if (file.size > MAX_PACKAGE_BYTES) throw new Error("The challenge package is larger than 40 MB.");
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const unpackedSize = Object.values(files).reduce((total, bytes) => total + bytes.byteLength, 0);
  if (unpackedSize > MAX_UNPACKED_BYTES) throw new Error("The unpacked challenge is larger than 80 MB.");
  const manifestBytes = files["challenge.json"];
  if (!manifestBytes) throw new Error("The ZIP must contain challenge.json at its root.");
  let manifest: ChallengeManifest;
  try { manifest = JSON.parse(strFromU8(manifestBytes)) as ChallengeManifest; }
  catch { throw new Error("challenge.json is not valid JSON."); }
  if ((manifest.format !== "kercad-challenge" && !isLegacyChallengeFormat(manifest.format)) || manifest.version !== 1) throw new Error("This challenge format is not supported.");
  if (!manifest.title?.trim() || !Array.isArray(manifest.steps) || manifest.steps.length === 0) throw new Error("The challenge needs a title and at least one step.");
  const steps = manifest.steps.map((step, index) => {
    if (!step?.title?.trim() || !step.body?.trim()) throw new Error(`Step ${index + 1} needs a title and instructions.`);
    return {
      id: step.id?.trim() || `step-${index + 1}`,
      label: step.label?.trim(),
      title: step.title.trim(),
      body: step.body.trim(),
      image: safeAsset(files, step.image),
      values: normalizeChallengeParameters(step.values),
    };
  });
  let workspaceDocument: ParametricDocument | undefined;
  if (manifest.workspace) {
    const normalizedPath = manifest.workspace.replace(/^\.\//, "");
    if (normalizedPath.includes("..") || normalizedPath.startsWith("/") || !files[normalizedPath]) throw new Error("The challenge workspace could not be found.");
    const parsed = JSON.parse(strFromU8(files[normalizedPath])) as unknown;
    if (!validateDocument(parsed)) throw new Error("The challenge workspace is not a valid kerCAD document.");
    workspaceDocument = normalizeParametricDocument(parsed);
  }
  return {
    id: challengeId(manifest),
    title: manifest.title.trim(),
    description: manifest.description?.trim(),
    author: manifest.author?.trim(),
    categories: Array.isArray(manifest.categories) ? [...new Set(manifest.categories.map((category) => String(category).trim()).filter(Boolean))].slice(0, 12) : undefined,
    version: manifest.version,
    installedAt: Date.now(),
    cover: safeAsset(files, manifest.cover) ?? steps.find((step) => step.image)?.image,
    steps,
    workspaceDocument,
  };
}

function bytesFromDataUrl(source: string) {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(source);
  if (!match) return null;
  const mime = match[1];
  const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : mime === "image/svg+xml" ? "svg" : "jpg";
  return { bytes, extension };
}

export function exportChallengePackage(challenge: KercadChallenge) {
  const files: Record<string, Uint8Array> = {};
  const imagePath = (source: string | undefined, stem: string) => {
    if (!source) return undefined;
    const asset = bytesFromDataUrl(source);
    if (!asset) return undefined;
    const path = `images/${stem}.${asset.extension}`;
    files[path] = asset.bytes;
    return path;
  };
  const steps = challenge.steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    title: step.title,
    body: step.body,
    image: imagePath(step.image, `step-${index + 1}`),
    values: step.values?.length ? step.values : undefined,
  }));
  const workspace = challenge.workspaceDocument ? "workspace.json" : undefined;
  if (workspace && challenge.workspaceDocument) files[workspace] = strToU8(JSON.stringify(normalizeParametricDocument(challenge.workspaceDocument)));
  const manifest: ChallengeManifest = {
    format: "kercad-challenge",
    version: 1,
    id: challenge.id.replace(/@\d+$/, ""),
    title: challenge.title,
    description: challenge.description,
    author: challenge.author,
    categories: challenge.categories?.length ? challenge.categories : undefined,
    cover: imagePath(challenge.cover ?? challenge.steps.find((step) => step.image)?.image, "cover"),
    steps,
    workspace,
  };
  files["challenge.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export async function listInstalledChallenges() {
  const database = await openChallengeLibrary();
  try {
    return await new Promise<KercadChallenge[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error ?? new Error("Could not read installed challenges."));
      request.onsuccess = () => resolve((request.result as KercadChallenge[]).sort((a, b) => b.installedAt - a.installedAt));
    });
  } finally { database.close(); }
}

export async function saveInstalledChallenge(challenge: KercadChallenge) {
  const database = await openChallengeLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const local = { ...challenge };
      delete local.bundledSource;
      transaction.objectStore(STORE_NAME).put(local);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not install the challenge."));
    });
  } finally { database.close(); }
}

export async function deleteInstalledChallenge(id: string) {
  const database = await openChallengeLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove the challenge."));
    });
  } finally { database.close(); }
}

async function listInstalledBundles() {
  const database = await openChallengeLibrary();
  try {
    return await new Promise<InstalledBundle[]>((resolve, reject) => {
      const request = database.transaction(BUNDLE_STORE_NAME, "readonly").objectStore(BUNDLE_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as InstalledBundle[]);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

async function installedChallengeIds() {
  const database = await openChallengeLibrary();
  try {
    return await new Promise<Set<IDBValidKey>>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(new Set(request.result));
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

function challengeContent(challenge: KercadChallenge) {
  const content: Partial<KercadChallenge> = { ...challenge };
  delete content.installedAt;
  delete content.bundledSource;
  return JSON.stringify(content);
}

async function installBundledChallenge(name: string, revision: string, challenge: KercadChallenge) {
  const database = await openChallengeLibrary();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      let updated = false;
      // Read ownership and write the challenge + receipt atomically. A local
      // edit/import during a slow download must never be overwritten.
      const transaction = database.transaction([STORE_NAME, BUNDLE_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(challenge.id);
      request.onsuccess = () => {
        const existing = request.result as KercadChallenge | undefined;
        if (!existing || existing.bundledSource?.name === name || challengeContent(existing) === challengeContent(challenge)) {
          store.put({ ...challenge, bundledSource: { name, revision } });
          updated = true;
        }
        transaction.objectStore(BUNDLE_STORE_NAME).put({ name, revision, challengeId: challenge.id } satisfies InstalledBundle);
      };
      transaction.oncomplete = () => resolve(updated);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("Could not update bundled challenge."));
    });
  } finally { database.close(); }
}

let bundledSync: Promise<boolean> | null = null;

/** One small catalog request per app load; ZIPs only for new/changed packages. */
export function syncBundledChallenges(): Promise<boolean> {
  if (bundledSync) return bundledSync;
  bundledSync = (async () => {
    const response = await fetch("/api/bundled-challenges", { cache: "no-cache" });
    if (!response.ok) return false;
    const payload = await response.json() as { packages?: unknown };
    // An older server without revision metadata must not trigger bulk downloads.
    if (!Array.isArray(payload.packages)) return false;
    const receipts = new Map((await listInstalledBundles()).map((entry) => [entry.name, entry]));
    const installedIds = await installedChallengeIds();
    let updated = false;
    for (const item of payload.packages) {
      if (!item || typeof item !== "object") continue;
      const { name, revision, size } = item as { name?: unknown; revision?: unknown; size?: unknown };
      if (typeof name !== "string" || !/^[a-z0-9][a-z0-9._ -]*\.zip$/i.test(name)
        || typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)
        || typeof size !== "number" || !Number.isFinite(size) || size < 0 || size > MAX_PACKAGE_BYTES) continue;
      const receipt = receipts.get(name);
      if (receipt?.revision === revision && installedIds.has(receipt.challengeId)) continue;
      try {
        const download = await fetch(`/api/bundled-challenges?file=${encodeURIComponent(name)}`, { cache: "no-cache" });
        if (!download.ok) continue;
        const blob = await download.blob();
        if (blob.size > MAX_PACKAGE_BYTES) continue;
        // If deployment changed while downloading, leave the old receipt intact
        // and retry on the next load instead of recording the wrong revision.
        if (download.headers.get("etag") !== `"${revision}"`) continue;
        const challenge = await importChallengePackage(new File([blob], name, { type: "application/zip" }));
        if (await installBundledChallenge(name, revision, challenge)) updated = true;
        receipts.set(name, { name, revision, challengeId: challenge.id });
        installedIds.add(challenge.id);
      } catch { /* Keep installed/local challenges if any individual ZIP fails. */ }
    }
    return updated;
  })().finally(() => { bundledSync = null; });
  return bundledSync;
}
