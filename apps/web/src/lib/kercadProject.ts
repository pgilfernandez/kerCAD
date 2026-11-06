import { strFromU8, strToU8, unzip, zip, type AsyncZippable } from "fflate";
import { normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { defaultMediaTypeForSource, normalizeProjectAsset, sha256Hex } from "@/lib/projectAssets";
import type { ParametricDocument } from "@/types/parametric";
import type { ProjectAsset, ProjectAssetSourceFormat } from "@/types/sketchforge";
import { isLegacyProjectSchema } from "@/lib/legacyBrand";
import { uiText } from "@/lib/kercadI18n";

export const KERCAD_PACKAGE_SCHEMA = "org.kercad.project";
export const KERCAD_PACKAGE_VERSION = 2;
export const KERCAD_PACKAGE_MEDIA_TYPE = "application/vnd.kercad.project+zip";

export const KERCAD_PACKAGE_LIMITS = {
  archiveBytes: 256 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  manifestBytes: 1024 * 1024,
  projectBytes: 32 * 1024 * 1024,
  assetBytes: 128 * 1024 * 1024,
  entries: 1024,
} as const;

type PackageAssetRecord = {
  id: string;
  path: string;
  name: string;
  mediaType: string;
  sourceFormat: ProjectAssetSourceFormat;
  byteLength: number;
  sha256: string;
};

export type KercadPackageManifestV1 = {
  schema: typeof KERCAD_PACKAGE_SCHEMA;
  formatVersion: 1;
  minimumReaderVersion: 1;
  createdWithVersion: string;
  document: { path: "project.json"; byteLength: number; sha256: string };
  assets: PackageAssetRecord[];
};

export type KercadStepRepresentation = {
  path: "model.step";
  mediaType: "application/step";
  units: "mm";
  byteLength: number;
  sha256: string;
};

export type KercadPackageManifestV2 = Omit<KercadPackageManifestV1, "formatVersion" | "minimumReaderVersion"> & {
  formatVersion: 2;
  minimumReaderVersion: 2;
  /** Null for documents without active solid-generating operations. */
  geometry: KercadStepRepresentation | null;
};
export type KercadPackageManifest = KercadPackageManifestV1 | KercadPackageManifestV2;

export type KercadProjectPackage = {
  document: ParametricDocument;
  assets: ProjectAsset[];
  manifest: KercadPackageManifest;
  step?: Uint8Array;
};

type ArchiveFiles = Record<string, Uint8Array>;

function zipAsync(files: AsyncZippable, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level, mtime: new Date(1980, 0, 1) }, (error, data) => error ? reject(error) : resolve(data));
  });
}

function unzipAsync(bytes: Uint8Array) {
  return new Promise<ArchiveFiles>((resolve, reject) => {
    unzip(bytes, (error, files) => error ? reject(error) : resolve(files));
  });
}

function safeArchivePath(path: string) {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.startsWith("\\")
    && !/^[a-z]:/i.test(path)
    && !path.includes("\\")
    && path.split("/").every((part) => part && part !== "." && part !== "..");
}

function extensionForSource(sourceFormat: ProjectAssetSourceFormat) {
  return sourceFormat === "step" ? "step" : sourceFormat;
}

function inputBytes(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input.slice(0));
  if (!bytes.byteLength) throw new Error("The kerCAD project is empty.");
  return bytes;
}

function inspectZip(bytes: Uint8Array) {
  if (bytes.byteLength > KERCAD_PACKAGE_LIMITS.archiveBytes) throw new Error("The compressed project exceeds the 256 MB limit.");
  if (bytes.byteLength < 22) throw new Error("The file is not a valid kerCAD package.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let directoryEnd = -1;
  for (let offset = bytes.byteLength - 22, minimum = Math.max(0, bytes.byteLength - 65_557); offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      directoryEnd = offset;
      break;
    }
  }
  if (directoryEnd < 0) throw new Error("The kerCAD package does not contain a valid ZIP directory.");
  const entryCount = view.getUint16(directoryEnd + 10, true);
  const directorySize = view.getUint32(directoryEnd + 12, true);
  const directoryOffset = view.getUint32(directoryEnd + 16, true);
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error("ZIP64 packages are not supported.");
  if (!entryCount || entryCount > KERCAD_PACKAGE_LIMITS.entries) throw new Error("The package contains too many files.");
  if (directoryOffset + directorySize > bytes.byteLength) throw new Error("The package directory is truncated.");
  const names = new Set<string>();
  let expandedBytes = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("The package directory is corrupted.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error("A package entry is truncated.");
    if (flags & 1) throw new Error("Encrypted kerCAD packages are not supported.");
    if (method !== 0 && method !== 8) throw new Error("The package uses an unsupported compression method.");
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safeArchivePath(name) || names.has(name)) throw new Error("The package contains an unsafe or duplicated path.");
    const entryLimit = name === "manifest.json" ? KERCAD_PACKAGE_LIMITS.manifestBytes : name === "project.json" ? KERCAD_PACKAGE_LIMITS.projectBytes : KERCAD_PACKAGE_LIMITS.assetBytes;
    if (expanded === 0xffffffff) throw new Error("ZIP64 packages are not supported.");
    if (expanded > entryLimit) throw new Error(`File '${name}' exceeds the allowed limit.`);
    names.add(name);
    expandedBytes += expanded;
    offset = end;
  }
  if (!names.has("manifest.json") || !names.has("project.json")) throw new Error("The package is missing manifest.json or project.json.");
  if (expandedBytes > KERCAD_PACKAGE_LIMITS.expandedBytes) throw new Error("The expanded project exceeds the 512 MB limit.");
}

function isSourceFormat(value: unknown): value is ProjectAssetSourceFormat {
  return value === "svg" || value === "step" || value === "stl" || value === "obj";
}

function parseManifest(raw: unknown): KercadPackageManifest {
  if (!raw || typeof raw !== "object") throw new Error("manifest.json is invalid.");
  const manifest = raw as Partial<Omit<KercadPackageManifestV2, "formatVersion" | "minimumReaderVersion">> & { formatVersion?: number; minimumReaderVersion?: number };
  if ((manifest.schema !== KERCAD_PACKAGE_SCHEMA && !isLegacyProjectSchema(manifest.schema)) || ![1, KERCAD_PACKAGE_VERSION].includes(manifest.formatVersion ?? 0) || manifest.minimumReaderVersion !== manifest.formatVersion || typeof manifest.createdWithVersion !== "string") throw new Error("The kerCAD package version is not supported.");
  if (manifest.formatVersion === 2 && manifest.geometry !== null) {
    const geometry = manifest.geometry;
    if (!geometry || geometry.path !== "model.step" || geometry.mediaType !== "application/step" || geometry.units !== "mm" || !Number.isSafeInteger(geometry.byteLength) || geometry.byteLength <= 0 || geometry.byteLength > KERCAD_PACKAGE_LIMITS.assetBytes || !/^[a-f0-9]{64}$/.test(geometry.sha256)) throw new Error(uiText("package.invalidStep"));
  }
  if (!manifest.document || manifest.document.path !== "project.json" || !Number.isSafeInteger(manifest.document.byteLength) || manifest.document.byteLength < 0 || manifest.document.byteLength > KERCAD_PACKAGE_LIMITS.projectBytes || typeof manifest.document.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.document.sha256)) throw new Error("The document entry is invalid.");
  if (!Array.isArray(manifest.assets)) throw new Error("The asset list is invalid.");
  const ids = new Set<string>();
  const paths = new Set<string>();
  const hashes = new Set<string>();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.id !== "string" || !asset.id || ids.has(asset.id) || typeof asset.path !== "string" || !asset.path.startsWith("assets/") || !safeArchivePath(asset.path) || paths.has(asset.path)) throw new Error("The manifest contains a duplicated or invalid asset.");
    if (typeof asset.name !== "string" || typeof asset.mediaType !== "string" || !isSourceFormat(asset.sourceFormat) || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0 || asset.byteLength > KERCAD_PACKAGE_LIMITS.assetBytes || !/^[a-f0-9]{64}$/.test(asset.sha256) || hashes.has(asset.sha256)) throw new Error(`Asset '${asset.id}' is invalid.`);
    if (asset.path !== `assets/${asset.sha256}.${extensionForSource(asset.sourceFormat)}`) throw new Error(`Path for asset '${asset.id}' does not match its content.`);
    ids.add(asset.id);
    paths.add(asset.path);
    hashes.add(asset.sha256);
  }
  return { ...manifest, schema: KERCAD_PACKAGE_SCHEMA } as KercadPackageManifest;
}

export async function exportKercadProject(document: ParametricDocument, assets: ProjectAsset[] = [], compressionLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6) {
  if (!validateDocument(document)) throw new Error("The kerCAD document is invalid.");
  const snapshot = normalizeParametricDocument(structuredClone(document));
  const projectBytes = strToU8(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (projectBytes.byteLength > KERCAD_PACKAGE_LIMITS.projectBytes) throw new Error("The document exceeds the 32 MB limit.");
  const files: Record<string, Uint8Array> = { "project.json": projectBytes };
  let geometry: KercadStepRepresentation | null = null;
  const hasSolids = snapshot.features.some((feature) => !feature.suppressed && (feature.kind === "extrude" || feature.kind === "primitive" || feature.kind === "importedStep" || (feature.kind === "revolve" && feature.source === "sketch")));
  if (hasSolids) {
    let stepBytes: Uint8Array;
    try {
      const { exportParametricStep } = await import("@/lib/parametricKernel");
      // The complete project, including hidden objects and world placements;
      // never reuse an imported source STEP or a stale tessellation/cache.
      stepBytes = new Uint8Array(await (await exportParametricStep(snapshot)).arrayBuffer());
    } catch (error) {
      throw new Error(uiText("package.stepExportFailed", { reason: error instanceof Error ? error.message : String(error) }));
    }
    if (stepBytes.byteLength > KERCAD_PACKAGE_LIMITS.assetBytes) throw new Error(uiText("package.stepLimit"));
    if (!strFromU8(stepBytes.subarray(0, 64)).trimStart().startsWith("ISO-10303-21;")) throw new Error(uiText("package.invalidStep"));
    files["model.step"] = stepBytes;
    geometry = { path: "model.step", mediaType: "application/step", units: "mm", byteLength: stepBytes.byteLength, sha256: await sha256Hex(stepBytes) };
  }
  const records: PackageAssetRecord[] = [];
  const hashes = new Set<string>();
  const ids = new Set<string>();
  for (const input of assets) {
    const asset = normalizeProjectAsset(input);
    if (asset.bytes.byteLength > KERCAD_PACKAGE_LIMITS.assetBytes) throw new Error(`Asset '${asset.name}' exceeds the 128 MB limit.`);
    const sha256 = await sha256Hex(asset.bytes);
    if (hashes.has(sha256)) continue;
    if (!asset.id || ids.has(asset.id)) throw new Error(`Asset identifier '${asset.id}' is duplicated.`);
    const path = `assets/${sha256}.${extensionForSource(asset.sourceFormat)}`;
    records.push({ id: asset.id, path, name: asset.name, mediaType: asset.mediaType || defaultMediaTypeForSource(asset.sourceFormat), sourceFormat: asset.sourceFormat, byteLength: asset.bytes.byteLength, sha256 });
    files[path] = asset.bytes;
    hashes.add(sha256);
    ids.add(asset.id);
  }
  const manifest: KercadPackageManifestV2 = {
    schema: KERCAD_PACKAGE_SCHEMA,
    formatVersion: KERCAD_PACKAGE_VERSION,
    minimumReaderVersion: 2,
    createdWithVersion: "0.1.0",
    document: { path: "project.json", byteLength: projectBytes.byteLength, sha256: await sha256Hex(projectBytes) },
    assets: records.sort((a, b) => a.id.localeCompare(b.id)),
    geometry,
  };
  files["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  const bytes = await zipAsync(Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))), compressionLevel);
  inspectZip(bytes);
  return bytes;
}

export async function importKercadProject(input: ArrayBuffer | Uint8Array): Promise<KercadProjectPackage> {
  const bytes = inputBytes(input);
  inspectZip(bytes);
  let files: ArchiveFiles;
  try {
    files = await unzipAsync(bytes);
  } catch (error) {
    throw new Error(`The project could not be expanded: ${error instanceof Error ? error.message : "corrupted ZIP"}.`);
  }
  let manifestRaw: unknown;
  let documentRaw: unknown;
  try {
    manifestRaw = JSON.parse(strFromU8(files["manifest.json"]));
    documentRaw = JSON.parse(strFromU8(files["project.json"]));
  } catch {
    throw new Error("The manifest or JSON document is corrupted.");
  }
  const manifest = parseManifest(manifestRaw);
  const expectedPaths = new Set(["manifest.json", manifest.document.path, ...manifest.assets.map((asset) => asset.path)]);
  const geometry = manifest.formatVersion === 2 ? manifest.geometry : null;
  if (geometry) expectedPaths.add(geometry.path);
  if (Object.keys(files).some((path) => !expectedPaths.has(path))) throw new Error("The package contains files that are not declared in the manifest.");
  const projectBytes = files[manifest.document.path];
  if (projectBytes.byteLength !== manifest.document.byteLength || await sha256Hex(projectBytes) !== manifest.document.sha256) throw new Error("The document failed its integrity check.");
  if (!validateDocument(documentRaw)) throw new Error("project.json does not contain a compatible kerCAD document.");
  let step: Uint8Array | undefined;
  if (geometry) {
    const stepBytes = files[geometry.path];
    if (!stepBytes || stepBytes.byteLength !== geometry.byteLength || await sha256Hex(stepBytes) !== geometry.sha256) throw new Error(uiText("package.stepIntegrity"));
    if (!strFromU8(stepBytes.subarray(0, 64)).trimStart().startsWith("ISO-10303-21;")) throw new Error(uiText("package.invalidStep"));
    step = new Uint8Array(stepBytes);
  }
  const assets: ProjectAsset[] = [];
  for (const record of manifest.assets) {
    const assetBytes = files[record.path];
    if (!assetBytes || assetBytes.byteLength !== record.byteLength || await sha256Hex(assetBytes) !== record.sha256) throw new Error(`Asset '${record.name}' failed its integrity check.`);
    assets.push({ id: record.id, name: record.name, mediaType: record.mediaType, sourceFormat: record.sourceFormat, bytes: new Uint8Array(assetBytes), byteLength: assetBytes.byteLength, sha256: record.sha256 });
  }
  return { document: normalizeParametricDocument(documentRaw), assets, manifest, ...(step ? { step } : {}) };
}
