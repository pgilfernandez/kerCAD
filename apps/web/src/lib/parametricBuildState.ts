import type { ParametricDocument } from "@/types/parametric";
import type { ParametricFeature } from "@/types/parametric";

function geometryFeature({ name: _name, ...feature }: ParametricFeature) {
  if (feature.kind === "sketch") delete feature.annotations;
  return feature;
}

const PARAMETRIC_GEOMETRY_VERSION = 7;

function dependentObjectIds(document: ParametricDocument, objectId: string, rootFeatures = document.features.filter((feature) => feature.objectId === objectId)) {
  const featureObject = new Map(document.features.map((feature) => [feature.id, feature.objectId]));
  const visited = new Set<string>([objectId]);
  const pending = [objectId];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    const features = current === objectId ? rootFeatures : document.features.filter((candidate) => candidate.objectId === current);
    for (const feature of features) {
      for (const dependency of feature.dependencies ?? []) {
        const dependencyObjectId = dependency.type === "object" ? dependency.id : featureObject.get(dependency.id);
        if (!dependencyObjectId || visited.has(dependencyObjectId)) continue;
        visited.add(dependencyObjectId);
        pending.push(dependencyObjectId);
      }
    }
  }
  visited.delete(objectId);
  return [...visited].sort();
}

function objectDependencyState(document: ParametricDocument, dependencyIds: string[]) {
  return dependencyIds.map((dependencyId) => ({
    object: document.objects.find((candidate) => candidate.id === dependencyId)
      ? { id: dependencyId, transform: document.objects.find((candidate) => candidate.id === dependencyId)!.transform }
      : null,
    features: document.features.filter((feature) => feature.objectId === dependencyId).map(geometryFeature),
    topologyReferences: document.topologyReferences.filter((reference) => reference.objectId === dependencyId),
  }));
}

export function parametricGeometryFingerprint(document: ParametricDocument) {
  return JSON.stringify({
    geometryVersion: PARAMETRIC_GEOMETRY_VERSION,
    objects: document.objects.map((object) => ({ id: object.id, transform: object.transform })),
    features: document.features.map(geometryFeature),
    topologyReferences: document.topologyReferences,
  });
}

export function parametricObjectColorFingerprint(document: ParametricDocument) {
  return JSON.stringify(document.objects.map((object) => [object.id, object.color]));
}

export function parametricObjectGeometryFingerprint(document: ParametricDocument, objectId: string) {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  const dependencyIds = dependentObjectIds(document, objectId);
  return JSON.stringify({
    geometryVersion: PARAMETRIC_GEOMETRY_VERSION,
    object: object ? { id: object.id, transform: object.transform } : null,
    features: document.features
      .filter((feature) => feature.objectId === objectId)
      .map(geometryFeature),
    topologyReferences: document.topologyReferences.filter((reference) => reference.objectId === objectId),
    dependencies: objectDependencyState(document, dependencyIds),
  });
}

export function parametricObjectFeaturePrefixFingerprint(document: ParametricDocument, objectId: string, throughFeatureId: string) {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  const objectFeatures = document.features.filter((feature) => feature.objectId === objectId);
  const throughIndex = objectFeatures.findIndex((feature) => feature.id === throughFeatureId);
  const features = throughIndex < 0 ? [] : objectFeatures.slice(0, throughIndex + 1);
  const loftSketchIds = new Set(features.flatMap((feature) => feature.kind === "extrude" && feature.endSketchId ? [feature.sketchId, feature.endSketchId] : []));
  const dependencyIds = dependentObjectIds(document, objectId, features);
  const referenceIds = new Set(features.flatMap((feature) => {
    if (feature.kind === "fillet") return [...(feature.edgeReferenceIds ?? []), ...(feature.selectionReferenceIds ?? [])];
    if (feature.kind === "faceExtrude") return [feature.faceReferenceId];
    if (feature.kind === "shell") return feature.faceReferenceIds;
    if (feature.kind === "revolve") return [feature.faceReferenceId, feature.axisReferenceId].filter((id): id is string => Boolean(id));
    return [];
  }));
  return JSON.stringify({
    geometryVersion: PARAMETRIC_GEOMETRY_VERSION,
    object: object ? { id: object.id, transform: object.transform } : null,
    features: features.map(geometryFeature),
    loftProfiles: document.features.filter((feature) => loftSketchIds.has(feature.id)).map(geometryFeature),
    topologyReferences: document.topologyReferences.filter((reference) => reference.objectId === objectId && referenceIds.has(reference.id)),
    dependencies: objectDependencyState(document, dependencyIds),
  });
}

export function objectColorsFromFingerprint(fingerprint: string) {
  return Object.fromEntries(JSON.parse(fingerprint) as Array<[string, string]>);
}
