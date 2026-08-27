export const PARAMETRIC_IMPORT_LIMITS = {
  projectBytes: 32 * 1024 * 1024,
  stepBytes: 64 * 1024 * 1024,
  referenceBytes: 64 * 1024 * 1024,
  svgBytes: 8 * 1024 * 1024,
  referenceTriangles: 500_000,
  objects: 10_000,
  features: 100_000,
  topologyReferences: 250_000,
} as const;

export function assertImportByteLimit(kind: "proyecto" | "STEP" | "referencia" | "SVG", byteLength: number) {
  const maximum = kind === "proyecto" ? PARAMETRIC_IMPORT_LIMITS.projectBytes : kind === "STEP" ? PARAMETRIC_IMPORT_LIMITS.stepBytes : kind === "SVG" ? PARAMETRIC_IMPORT_LIMITS.svgBytes : PARAMETRIC_IMPORT_LIMITS.referenceBytes;
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > maximum) throw new Error(`El archivo ${kind} supera el límite de ${Math.round(maximum / 1024 / 1024)} MB.`);
}
