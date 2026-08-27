import { strFromU8, strToU8, unzip, zip, type AsyncZippable } from "fflate";
import { normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { defaultMediaTypeForSource, normalizeProjectAsset, sha256Hex } from "@/lib/projectAssets";
import type { ParametricDocument } from "@/types/parametric";
import type { ProjectAsset, ProjectAssetSourceFormat } from "@/types/sketchforge";

export const EDUCAD_PACKAGE_SCHEMA = "org.educad.project";
export const EDUCAD_PACKAGE_VERSION = 1;
export const EDUCAD_PACKAGE_MEDIA_TYPE = "application/vnd.educad.project+zip";

export const EDUCAD_PACKAGE_LIMITS = {
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

export type EducadPackageManifestV1 = {
  schema: typeof EDUCAD_PACKAGE_SCHEMA;
  formatVersion: 1;
  minimumReaderVersion: 1;
  createdWithVersion: string;
  document: { path: "project.json"; byteLength: number; sha256: string };
  assets: PackageAssetRecord[];
};

export type EducadProjectPackage = {
  document: ParametricDocument;
  assets: ProjectAsset[];
  manifest: EducadPackageManifestV1;
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
  if (!bytes.byteLength) throw new Error("El proyecto eduCAD está vacío.");
  return bytes;
}

function inspectZip(bytes: Uint8Array) {
  if (bytes.byteLength > EDUCAD_PACKAGE_LIMITS.archiveBytes) throw new Error("El proyecto supera el límite comprimido de 256 MB.");
  if (bytes.byteLength < 22) throw new Error("El archivo no es un paquete eduCAD válido.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let directoryEnd = -1;
  for (let offset = bytes.byteLength - 22, minimum = Math.max(0, bytes.byteLength - 65_557); offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      directoryEnd = offset;
      break;
    }
  }
  if (directoryEnd < 0) throw new Error("El paquete eduCAD no contiene un directorio ZIP válido.");
  const entryCount = view.getUint16(directoryEnd + 10, true);
  const directorySize = view.getUint32(directoryEnd + 12, true);
  const directoryOffset = view.getUint32(directoryEnd + 16, true);
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error("Los paquetes ZIP64 no son compatibles.");
  if (!entryCount || entryCount > EDUCAD_PACKAGE_LIMITS.entries) throw new Error("El paquete contiene demasiados archivos.");
  if (directoryOffset + directorySize > bytes.byteLength) throw new Error("El directorio del paquete está truncado.");
  const names = new Set<string>();
  let expandedBytes = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("El directorio del paquete está dañado.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error("Una entrada del paquete está truncada.");
    if (flags & 1) throw new Error("Los paquetes eduCAD cifrados no son compatibles.");
    if (method !== 0 && method !== 8) throw new Error("El paquete usa una compresión no compatible.");
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safeArchivePath(name) || names.has(name)) throw new Error("El paquete contiene una ruta insegura o duplicada.");
    const entryLimit = name === "manifest.json" ? EDUCAD_PACKAGE_LIMITS.manifestBytes : name === "project.json" ? EDUCAD_PACKAGE_LIMITS.projectBytes : EDUCAD_PACKAGE_LIMITS.assetBytes;
    if (expanded === 0xffffffff) throw new Error("Los paquetes ZIP64 no son compatibles.");
    if (expanded > entryLimit) throw new Error(`El archivo '${name}' supera el límite permitido.`);
    names.add(name);
    expandedBytes += expanded;
    offset = end;
  }
  if (!names.has("manifest.json") || !names.has("project.json")) throw new Error("Al paquete le faltan manifest.json o project.json.");
  if (expandedBytes > EDUCAD_PACKAGE_LIMITS.expandedBytes) throw new Error("El proyecto supera el límite expandido de 512 MB.");
}

function isSourceFormat(value: unknown): value is ProjectAssetSourceFormat {
  return value === "svg" || value === "step" || value === "stl" || value === "obj";
}

function parseManifest(raw: unknown): EducadPackageManifestV1 {
  if (!raw || typeof raw !== "object") throw new Error("manifest.json no es válido.");
  const manifest = raw as Partial<EducadPackageManifestV1>;
  if (manifest.schema !== EDUCAD_PACKAGE_SCHEMA || manifest.formatVersion !== EDUCAD_PACKAGE_VERSION || manifest.minimumReaderVersion !== 1 || typeof manifest.createdWithVersion !== "string") throw new Error("La versión del paquete eduCAD no es compatible.");
  if (!manifest.document || manifest.document.path !== "project.json" || !Number.isSafeInteger(manifest.document.byteLength) || manifest.document.byteLength < 0 || manifest.document.byteLength > EDUCAD_PACKAGE_LIMITS.projectBytes || typeof manifest.document.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.document.sha256)) throw new Error("La entrada del documento no es válida.");
  if (!Array.isArray(manifest.assets)) throw new Error("La lista de recursos no es válida.");
  const ids = new Set<string>();
  const paths = new Set<string>();
  const hashes = new Set<string>();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.id !== "string" || !asset.id || ids.has(asset.id) || typeof asset.path !== "string" || !asset.path.startsWith("assets/") || !safeArchivePath(asset.path) || paths.has(asset.path)) throw new Error("El manifiesto contiene un recurso duplicado o no válido.");
    if (typeof asset.name !== "string" || typeof asset.mediaType !== "string" || !isSourceFormat(asset.sourceFormat) || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0 || asset.byteLength > EDUCAD_PACKAGE_LIMITS.assetBytes || !/^[a-f0-9]{64}$/.test(asset.sha256) || hashes.has(asset.sha256)) throw new Error(`El recurso '${asset.id}' no es válido.`);
    if (asset.path !== `assets/${asset.sha256}.${extensionForSource(asset.sourceFormat)}`) throw new Error(`La ruta del recurso '${asset.id}' no coincide con su contenido.`);
    ids.add(asset.id);
    paths.add(asset.path);
    hashes.add(asset.sha256);
  }
  return manifest as EducadPackageManifestV1;
}

export async function exportEducadProject(document: ParametricDocument, assets: ProjectAsset[] = [], compressionLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6) {
  if (!validateDocument(document)) throw new Error("El documento eduCAD no es válido.");
  const projectBytes = strToU8(`${JSON.stringify(document, null, 2)}\n`);
  if (projectBytes.byteLength > EDUCAD_PACKAGE_LIMITS.projectBytes) throw new Error("El documento supera el límite de 32 MB.");
  const files: Record<string, Uint8Array> = { "project.json": projectBytes };
  const records: PackageAssetRecord[] = [];
  const hashes = new Set<string>();
  const ids = new Set<string>();
  for (const input of assets) {
    const asset = normalizeProjectAsset(input);
    if (asset.bytes.byteLength > EDUCAD_PACKAGE_LIMITS.assetBytes) throw new Error(`El recurso '${asset.name}' supera el límite de 128 MB.`);
    const sha256 = await sha256Hex(asset.bytes);
    if (hashes.has(sha256)) continue;
    if (!asset.id || ids.has(asset.id)) throw new Error(`El identificador de recurso '${asset.id}' está duplicado.`);
    const path = `assets/${sha256}.${extensionForSource(asset.sourceFormat)}`;
    records.push({ id: asset.id, path, name: asset.name, mediaType: asset.mediaType || defaultMediaTypeForSource(asset.sourceFormat), sourceFormat: asset.sourceFormat, byteLength: asset.bytes.byteLength, sha256 });
    files[path] = asset.bytes;
    hashes.add(sha256);
    ids.add(asset.id);
  }
  const manifest: EducadPackageManifestV1 = {
    schema: EDUCAD_PACKAGE_SCHEMA,
    formatVersion: EDUCAD_PACKAGE_VERSION,
    minimumReaderVersion: 1,
    createdWithVersion: "0.1.0",
    document: { path: "project.json", byteLength: projectBytes.byteLength, sha256: await sha256Hex(projectBytes) },
    assets: records.sort((a, b) => a.id.localeCompare(b.id)),
  };
  files["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  return zipAsync(Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))), compressionLevel);
}

export async function importEducadProject(input: ArrayBuffer | Uint8Array): Promise<EducadProjectPackage> {
  const bytes = inputBytes(input);
  inspectZip(bytes);
  let files: ArchiveFiles;
  try {
    files = await unzipAsync(bytes);
  } catch (error) {
    throw new Error(`No se ha podido expandir el proyecto: ${error instanceof Error ? error.message : "ZIP dañado"}.`);
  }
  let manifestRaw: unknown;
  let documentRaw: unknown;
  try {
    manifestRaw = JSON.parse(strFromU8(files["manifest.json"]));
    documentRaw = JSON.parse(strFromU8(files["project.json"]));
  } catch {
    throw new Error("El manifiesto o el documento JSON están dañados.");
  }
  const manifest = parseManifest(manifestRaw);
  const expectedPaths = new Set(["manifest.json", manifest.document.path, ...manifest.assets.map((asset) => asset.path)]);
  if (Object.keys(files).some((path) => !expectedPaths.has(path))) throw new Error("El paquete contiene archivos que no están declarados en el manifiesto.");
  const projectBytes = files[manifest.document.path];
  if (projectBytes.byteLength !== manifest.document.byteLength || await sha256Hex(projectBytes) !== manifest.document.sha256) throw new Error("El documento no supera la comprobación de integridad.");
  if (!validateDocument(documentRaw)) throw new Error("project.json no contiene un documento eduCAD compatible.");
  const assets: ProjectAsset[] = [];
  for (const record of manifest.assets) {
    const assetBytes = files[record.path];
    if (!assetBytes || assetBytes.byteLength !== record.byteLength || await sha256Hex(assetBytes) !== record.sha256) throw new Error(`El recurso '${record.name}' no supera la comprobación de integridad.`);
    assets.push({ id: record.id, name: record.name, mediaType: record.mediaType, sourceFormat: record.sourceFormat, bytes: new Uint8Array(assetBytes), byteLength: assetBytes.byteLength, sha256: record.sha256 });
  }
  return { document: normalizeParametricDocument(documentRaw), assets, manifest };
}
