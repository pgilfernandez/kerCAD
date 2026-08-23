import type { ParametricDocument, ParametricObjectRenderRecord, ParametricTopologyReference } from "@/types/parametric";
import { exactEdgeRegion, exactFaceRegion } from "@/lib/viewportGeometry";

export class ParametricTopologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParametricTopologyError";
  }
}

function finiteVector(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function isParametricTopologyReference(value: unknown): value is ParametricTopologyReference {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<ParametricTopologyReference>;
  if (typeof stored.id !== "string" || typeof stored.name !== "string" || typeof stored.objectId !== "string" || typeof stored.sourceFeatureId !== "string") return false;
  const reference = stored.reference as ParametricTopologyReference["reference"] | undefined;
  if (!reference || typeof reference.origin !== "string" || !reference.hint) return false;
  if (reference.hint.entityType === "face") {
    return "role" in reference && typeof reference.role === "string"
      && (reference.hint.normal === undefined || finiteVector(reference.hint.normal))
      && (reference.hint.centroid === undefined || finiteVector(reference.hint.centroid))
      && (reference.hint.area === undefined || Number.isFinite(reference.hint.area))
      && (reference.hint.topologyId === undefined || Number.isInteger(reference.hint.topologyId))
      && (reference.hint.originId === undefined || Number.isInteger(reference.hint.originId));
  }
  return reference.hint.entityType === "edge"
    && "faceRoles" in reference
    && Array.isArray(reference.faceRoles)
    && reference.faceRoles.length === 2
    && reference.faceRoles.every((role) => typeof role === "string")
    && (reference.hint.midpoint === undefined || finiteVector(reference.hint.midpoint))
    && (reference.hint.length === undefined || Number.isFinite(reference.hint.length))
    && (reference.hint.topologyId === undefined || Number.isInteger(reference.hint.topologyId));
}

export function parametricTopologyReferenceIsAvailable(reference: ParametricTopologyReference, records: readonly ParametricObjectRenderRecord[]) {
  return recoverParametricTopologyReferenceInRecords(reference, records) !== null;
}

export function recoverParametricTopologyReferenceInRecords(reference: ParametricTopologyReference, records: readonly ParametricObjectRenderRecord[]) {
  const record = records.find((candidate) => candidate.objectId === reference.objectId);
  if (!record) return null;
  const hint = reference.reference.hint;
  if (hint.entityType === "face") {
    const groups = record.mesh.faceGroups ?? [];
    const candidates = groups.flatMap((group) => {
      const region = exactFaceRegion(record.mesh.positions, record.mesh.indices, group.start / 3, groups);
      if (!region) return [];
      if (!hint.centroid || hint.area === undefined || !hint.normal) return group.faceId === hint.topologyId ? [{ group, score: 0 }] : [];
      const scale = Math.max(1, Math.sqrt(Math.abs(hint.area)));
      const centerDistance = Math.hypot(region.centroid.x - hint.centroid[0], region.centroid.y - hint.centroid[1], region.centroid.z - hint.centroid[2]) / scale;
      const areaDifference = Math.abs(region.area - hint.area) / Math.max(1, Math.abs(hint.area));
      const normalAgreement = Math.abs(region.normal.x * hint.normal[0] + region.normal.y * hint.normal[1] + region.normal.z * hint.normal[2]);
      return [{ group, score: centerDistance + areaDifference + (1 - normalAgreement) }];
    }).sort((a, b) => a.score - b.score);
    const match = candidates[0];
    if (!match || match.score > 0.25) return null;
    if (hint.topologyId === match.group.faceId && hint.originId === match.group.origin) return reference;
    const recovered = structuredClone(reference);
    if (recovered.reference.hint.entityType === "face") {
      recovered.reference.hint.topologyId = match.group.faceId;
      recovered.reference.hint.originId = match.group.origin;
    }
    return recovered;
  }
  const groups = record.mesh.edgeGroups ?? [];
  const candidates = groups.flatMap((group) => {
    const region = exactEdgeRegion(record.mesh.edges, group.start, groups);
    if (!region) return [];
    if (!hint.midpoint || hint.length === undefined) return group.edgeId === hint.topologyId ? [{ group, score: 0 }] : [];
    const scale = Math.max(1, Math.abs(hint.length));
    const midpointDistance = Math.hypot(region.midpoint.x - hint.midpoint[0], region.midpoint.y - hint.midpoint[1], region.midpoint.z - hint.midpoint[2]) / scale;
    const lengthDifference = Math.abs(region.length - hint.length) / scale;
    return [{ group, score: midpointDistance + lengthDifference }];
  }).sort((a, b) => a.score - b.score);
  const match = candidates[0];
  if (!match || match.score > 0.25) return null;
  if (hint.topologyId === match.group.edgeId) return reference;
  const recovered = structuredClone(reference);
  if (recovered.reference.hint.entityType === "edge") recovered.reference.hint.topologyId = match.group.edgeId;
  return recovered;
}

export function assertValidParametricTopology(document: ParametricDocument) {
  const objectIds = new Set(document.objects.map((object) => object.id));
  const featureById = new Map(document.features.map((feature) => [feature.id, feature]));
  const references = new Map<string, ParametricTopologyReference>();
  for (const reference of document.topologyReferences) {
    if (!isParametricTopologyReference(reference)) throw new ParametricTopologyError("El proyecto contiene una referencia de cara o arista no válida.");
    if (references.has(reference.id)) throw new ParametricTopologyError(`La referencia topológica ${reference.id} está duplicada.`);
    if (!objectIds.has(reference.objectId)) throw new ParametricTopologyError(`${reference.name}: el objeto de origen ya no existe.`);
    const source = featureById.get(reference.sourceFeatureId);
    if (!source) throw new ParametricTopologyError(`${reference.name}: la operación de origen ya no existe.`);
    if (source.objectId !== reference.objectId) throw new ParametricTopologyError(`${reference.name}: la operación de origen pertenece a otro objeto.`);
    references.set(reference.id, reference);
  }
  for (const feature of document.features) {
    if (feature.kind === "faceExtrude" || feature.kind === "revolve") {
      const reference = references.get(feature.faceReferenceId);
      if (!reference) throw new ParametricTopologyError(`${feature.name}: la cara referenciada ya no existe.`);
      if (reference.reference.hint.entityType !== "face") throw new ParametricTopologyError(`${feature.name}: la referencia seleccionada no es una cara.`);
      if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: la cara pertenece a otro objeto.`);
      continue;
    }
    if (feature.kind === "shell") {
      for (const referenceId of feature.faceReferenceIds) {
        const reference = references.get(referenceId);
        if (!reference) throw new ParametricTopologyError(`${feature.name}: una cara referenciada ya no existe.`);
        if (reference.reference.hint.entityType !== "face") throw new ParametricTopologyError(`${feature.name}: la referencia seleccionada no es una cara.`);
        if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: la cara pertenece a otro objeto.`);
      }
      continue;
    }
    if (feature.kind !== "fillet") continue;
    const selectionIds = feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [];
    for (const referenceId of selectionIds) {
      const reference = references.get(referenceId);
      if (!reference) throw new ParametricTopologyError(`${feature.name}: la entidad referenciada ya no existe.`);
      if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: la selección pertenece a otro objeto.`);
    }
  }
}

export function recoverParametricTopologyReference(
  stored: ParametricTopologyReference,
  replacement: ParametricTopologyReference["reference"],
): ParametricTopologyReference {
  return { ...stored, reference: structuredClone(replacement) };
}
