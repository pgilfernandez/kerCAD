import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createEmptyDocument, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import type { ParametricDocument } from "@/types/parametric";

export type EducadChallengeStep = {
  id: string;
  label?: string;
  title: string;
  body: string;
  image?: string;
  values?: Array<{ label: string; value: string }>;
};

export type EducadChallenge = {
  id: string;
  title: string;
  description?: string;
  author?: string;
  categories?: string[];
  version: number;
  installedAt: number;
  cover?: string;
  steps: EducadChallengeStep[];
  workspaceDocument?: ParametricDocument;
};

export function createEmptyChallenge(): EducadChallenge {
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

function demoImage(stage: "base" | "ends" | "hole" | "done") {
  const circles = stage === "base" ? "" : `<circle cx="116" cy="108" r="32" fill="#ffc75f"/><circle cx="304" cy="108" r="32" fill="#ffc75f"/>`;
  const hole = stage === "hole" || stage === "done" ? `<circle cx="116" cy="108" r="10" fill="#f7fcff" stroke="#176d91" stroke-width="5"/>` : "";
  const finished = stage === "done" ? `<path d="M187 75h76" stroke="#ff5463" stroke-width="10" stroke-linecap="round"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="235" viewBox="0 0 420 235"><rect width="420" height="235" fill="#f8fcfd"/><g stroke="#a9e0ed" stroke-width="1"><path d="M0 25h420M0 65h420M0 105h420M0 145h420M0 185h420M0 225h420M25 0v235M65 0v235M105 0v235M145 0v235M185 0v235M225 0v235M265 0v235M305 0v235M345 0v235M385 0v235"/></g><rect x="114" y="76" width="192" height="64" rx="3" fill="#ff5463" stroke="#d9364c" stroke-width="4"/>${circles}${hole}${finished}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function createDemoChallenge(): EducadChallenge {
  return {
    id: "educad-demo-key-tag@1",
    title: "Build a Key Tag",
    description: "A short guided introduction to shapes, duplication and holes.",
    author: "eduCAD",
    categories: ["Beginner", "3D design"],
    version: 1,
    installedAt: Date.now(),
    cover: demoImage("done"),
    steps: [
      { id: "welcome", label: "BEFORE YOU START", title: "Build a Key Tag", body: "Use simple shapes to make a small key tag. Keep Snap to grid enabled while you work.", image: demoImage("done"), values: [{ label: "Snap spacing", value: "1 mm" }] },
      { id: "base", label: "STEP 1", title: "Make the middle", body: "Add a box and make it thin and long. This is the centre of the key tag.", image: demoImage("base"), values: [{ label: "Width", value: "24 mm" }, { label: "Depth", value: "10 mm" }, { label: "Height", value: "2 mm" }] },
      { id: "ends", label: "STEP 2", title: "Add the round ends", body: "Add a cylinder, resize it to the width of the box, then duplicate it for the other end.", image: demoImage("ends") },
      { id: "hole", label: "STEP 3", title: "Create the hole", body: "Add a smaller cylinder at the left end and change its mode to Hole.", image: demoImage("hole") },
      { id: "finish", label: "STEP 4", title: "Finish your key tag", body: "Check that the shapes form one clean key tag. You can now personalise it with your own dimensions.", image: demoImage("done") },
    ],
  };
}

type ChallengeManifest = {
  format: "educad-challenge";
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
    values?: Array<{ label: string; value: string }>;
  }>;
  workspace?: string;
};

const DATABASE_NAME = "educad.challenge-library";
const STORE_NAME = "challenges";
const DATABASE_VERSION = 1;
const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;

function openChallengeLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the challenge library."));
    request.onsuccess = () => resolve(request.result);
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

export async function importChallengePackage(file: File): Promise<EducadChallenge> {
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
  if (manifest.format !== "educad-challenge" || manifest.version !== 1) throw new Error("This challenge format is not supported.");
  if (!manifest.title?.trim() || !Array.isArray(manifest.steps) || manifest.steps.length === 0) throw new Error("The challenge needs a title and at least one step.");
  const steps = manifest.steps.map((step, index) => {
    if (!step?.title?.trim() || !step.body?.trim()) throw new Error(`Step ${index + 1} needs a title and instructions.`);
    return {
      id: step.id?.trim() || `step-${index + 1}`,
      label: step.label?.trim(),
      title: step.title.trim(),
      body: step.body.trim(),
      image: safeAsset(files, step.image),
      values: Array.isArray(step.values) ? step.values.filter((value) => value?.label && value?.value).map((value) => ({ label: String(value.label), value: String(value.value) })) : undefined,
    };
  });
  let workspaceDocument: ParametricDocument | undefined;
  if (manifest.workspace) {
    const normalizedPath = manifest.workspace.replace(/^\.\//, "");
    if (normalizedPath.includes("..") || normalizedPath.startsWith("/") || !files[normalizedPath]) throw new Error("The challenge workspace could not be found.");
    const parsed = JSON.parse(strFromU8(files[normalizedPath])) as unknown;
    if (!validateDocument(parsed)) throw new Error("The challenge workspace is not a valid eduCAD document.");
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

export function exportChallengePackage(challenge: EducadChallenge) {
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
  if (workspace && challenge.workspaceDocument) files[workspace] = strToU8(JSON.stringify(challenge.workspaceDocument));
  const manifest: ChallengeManifest = {
    format: "educad-challenge",
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
    return await new Promise<EducadChallenge[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error ?? new Error("Could not read installed challenges."));
      request.onsuccess = () => resolve((request.result as EducadChallenge[]).sort((a, b) => b.installedAt - a.installedAt));
    });
  } finally { database.close(); }
}

export async function saveInstalledChallenge(challenge: EducadChallenge) {
  const database = await openChallengeLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(challenge);
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
