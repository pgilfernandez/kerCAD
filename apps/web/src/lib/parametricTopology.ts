import * as THREE from "three";
import type { ParametricDocument, ParametricFeature, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference } from "@/types/parametric";
import { exactEdgeRegion, exactFaceRegion } from "@/lib/viewportGeometry";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";

export class ParametricTopologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParametricTopologyError";
  }
}

export function transformParametricObjectTopologyHints(
  document: ParametricDocument,
  objectId: string,
  previousTransform: ParametricObject["transform"],
) {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  if (!object) return;
  const previousMatrix = parametricTransformMatrix(previousTransform);
  const nextMatrix = parametricTransformMatrix(object.transform);
  const delta = nextMatrix.clone().multiply(previousMatrix.invert());
  const directionMatrix = new THREE.Matrix3().setFromMatrix4(delta);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(delta);
  const previousScale = (Math.abs(previousTransform.scale.x) + Math.abs(previousTransform.scale.y) + Math.abs(previousTransform.scale.z)) / 3;
  const nextScale = (Math.abs(object.transform.scale.x) + Math.abs(object.transform.scale.y) + Math.abs(object.transform.scale.z)) / 3;
  const lengthRatio = nextScale / Math.max(0.0001, previousScale);
  const transformPoint = (point: [number, number, number]) => {
    const value = new THREE.Vector3(...point).applyMatrix4(delta);
    return [value.x, value.y, value.z] as [number, number, number];
  };
  const transformDirection = (direction: [number, number, number], matrix: THREE.Matrix3) => {
    const value = new THREE.Vector3(...direction).applyMatrix3(matrix).normalize();
    return [value.x, value.y, value.z] as [number, number, number];
  };
  for (const stored of document.topologyReferences) {
    if (stored.objectId !== objectId) continue;
    const hint = stored.reference.hint;
    if (hint.entityType === "face") {
      if (hint.centroid) hint.centroid = transformPoint(hint.centroid);
      if (hint.normal) hint.normal = transformDirection(hint.normal, normalMatrix);
      if (hint.area !== undefined) hint.area *= lengthRatio * lengthRatio;
    } else {
      if (hint.midpoint) hint.midpoint = transformPoint(hint.midpoint);
      if (hint.direction) hint.direction = transformDirection(hint.direction, directionMatrix);
      if (hint.length !== undefined) hint.length *= lengthRatio;
    }
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

export function parametricTopologySelectionsMatch(left: ParametricTopologyReference, right: ParametricTopologyReference) {
  if (left.objectId !== right.objectId) return false;
  const leftHint = left.reference.hint;
  const rightHint = right.reference.hint;
  if (leftHint.entityType !== rightHint.entityType) return false;
  if (leftHint.entityType === "face" && rightHint.entityType === "face") {
    if (leftHint.topologyId !== undefined && rightHint.topologyId !== undefined) {
      return leftHint.topologyId === rightHint.topologyId
        && (leftHint.originId === undefined || rightHint.originId === undefined || leftHint.originId === rightHint.originId);
    }
    if (!leftHint.centroid || !rightHint.centroid) return false;
    return Math.hypot(...leftHint.centroid.map((value, index) => value - rightHint.centroid![index])) <= 1e-5;
  }
  if (leftHint.entityType === "edge" && rightHint.entityType === "edge") {
    if (leftHint.topologyId !== undefined && rightHint.topologyId !== undefined) return leftHint.topologyId === rightHint.topologyId;
    if (!leftHint.midpoint || !rightHint.midpoint) return false;
    return Math.hypot(...leftHint.midpoint.map((value, index) => value - rightHint.midpoint![index])) <= 1e-5;
  }
  return false;
}

export function parametricTopologyEditingSourceFeature(document: ParametricDocument, featureId: string): ParametricFeature | null {
  const target = document.features.find((feature) => feature.id === featureId);
  if (!target?.objectId) return null;
  const operations = document.features.filter((feature) => feature.objectId === target.objectId && feature.kind !== "sketch");
  const targetIndex = operations.findIndex((feature) => feature.id === featureId);
  return targetIndex > 0 ? operations[targetIndex - 1] : null;
}

export function recoverParametricTopologyReferenceInRecords(reference: ParametricTopologyReference, records: readonly ParametricObjectRenderRecord[]) {
  const record = records.find((candidate) => candidate.objectId === reference.objectId);
  if (!record) return null;
  const hint = reference.reference.hint;
  if (hint.entityType === "face") {
    const groups = record.mesh.faceGroups ?? [];
    const exact = hint.topologyId === undefined ? undefined : groups.find((group) => group.faceId === hint.topologyId
      && (hint.originId === undefined || group.origin === hint.originId));
    if (exact) return reference;
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
  if (hint.topologyId !== undefined && groups.some((group) => group.edgeId === hint.topologyId)) return reference;
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
    if (!isParametricTopologyReference(reference)) throw new ParametricTopologyError("The project contains an invalid face or edge reference.");
    if (references.has(reference.id)) throw new ParametricTopologyError(`Topological reference ${reference.id} is duplicated.`);
    if (!objectIds.has(reference.objectId)) throw new ParametricTopologyError(`${reference.name}: source object no longer exists.`);
    const source = featureById.get(reference.sourceFeatureId);
    if (!source) throw new ParametricTopologyError(`${reference.name}: source operation no longer exists.`);
    if (source.objectId !== reference.objectId) throw new ParametricTopologyError(`${reference.name}: source operation belongs to another object.`);
    references.set(reference.id, reference);
  }
  for (const feature of document.features) {
    if (feature.kind === "revolve" && feature.source === "sketch") {
      const sketch = feature.sketchId ? featureById.get(feature.sketchId) : null;
      if (!sketch || sketch.kind !== "sketch") throw new ParametricTopologyError(`${feature.name}: referenced sketch no longer exists.`);
      if (feature.objectId && sketch.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: sketch belongs to another object.`);
      if (feature.axis === "edge") {
        const axisReference = feature.axisReferenceId ? references.get(feature.axisReferenceId) : null;
        if (!axisReference || axisReference.reference.hint.entityType !== "edge") throw new ParametricTopologyError(`${feature.name}: the edge used as the axis is missing.`);
        if (feature.objectId && axisReference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: axis belongs to another object.`);
      }
      continue;
    }
    if (feature.kind === "faceExtrude" || feature.kind === "revolve") {
      if (!feature.faceReferenceId) throw new ParametricTopologyError(`${feature.name}: referenced face no longer exists.`);
      const reference = references.get(feature.faceReferenceId);
      if (!reference) throw new ParametricTopologyError(`${feature.name}: referenced face no longer exists.`);
      if (reference.reference.hint.entityType !== "face") throw new ParametricTopologyError(`${feature.name}: selected reference is not a face.`);
      if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: face belongs to another object.`);
      if (feature.kind === "revolve" && feature.axis === "edge") {
        const axisReference = feature.axisReferenceId ? references.get(feature.axisReferenceId) : null;
        if (!axisReference || axisReference.reference.hint.entityType !== "edge") throw new ParametricTopologyError(`${feature.name}: the edge used as the axis is missing.`);
        if (feature.objectId && axisReference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: axis belongs to another object.`);
      }
      continue;
    }
    if (feature.kind === "shell") {
      for (const referenceId of feature.faceReferenceIds) {
        const reference = references.get(referenceId);
        if (!reference) throw new ParametricTopologyError(`${feature.name}: a referenced face no longer exists.`);
        if (reference.reference.hint.entityType !== "face") throw new ParametricTopologyError(`${feature.name}: selected reference is not a face.`);
        if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: face belongs to another object.`);
      }
      continue;
    }
    if (feature.kind !== "fillet") continue;
    const selectionIds = feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [];
    for (const referenceId of selectionIds) {
      const reference = references.get(referenceId);
      if (!reference) throw new ParametricTopologyError(`${feature.name}: referenced entity no longer exists.`);
      if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: selection belongs to another object.`);
    }
  }
}

export function recoverParametricTopologyReference(
  stored: ParametricTopologyReference,
  replacement: ParametricTopologyReference["reference"],
): ParametricTopologyReference {
  return { ...stored, reference: structuredClone(replacement) };
}
