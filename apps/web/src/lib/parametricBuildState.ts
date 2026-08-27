import type { ParametricDocument } from "@/types/parametric";

const PARAMETRIC_GEOMETRY_VERSION = 3;

function dependentObjectIds(document: ParametricDocument, objectId: string) {
  const featureObject = new Map(document.features.map((feature) => [feature.id, feature.objectId]));
  const visited = new Set<string>([objectId]);
  const pending = [objectId];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    for (const feature of document.features.filter((candidate) => candidate.objectId === current)) {
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

export function parametricGeometryFingerprint(document: ParametricDocument) {
  return JSON.stringify({
    geometryVersion: PARAMETRIC_GEOMETRY_VERSION,
    objects: document.objects.map((object) => ({ id: object.id, visible: object.visible, transform: object.transform })),
    features: document.features.map(({ name: _name, ...feature }) => feature),
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
    object: object ? { id: object.id, visible: object.visible, transform: object.transform } : null,
    features: document.features
      .filter((feature) => feature.objectId === objectId)
      .map(({ name: _name, ...feature }) => feature),
    topologyReferences: document.topologyReferences.filter((reference) => reference.objectId === objectId),
    dependencies: dependencyIds.map((dependencyId) => ({
      object: document.objects.find((candidate) => candidate.id === dependencyId)
        ? { id: dependencyId, transform: document.objects.find((candidate) => candidate.id === dependencyId)!.transform }
        : null,
      features: document.features.filter((feature) => feature.objectId === dependencyId).map(({ name: _name, ...feature }) => feature),
      topologyReferences: document.topologyReferences.filter((reference) => reference.objectId === dependencyId),
    })),
  });
}

export function objectColorsFromFingerprint(fingerprint: string) {
  return Object.fromEntries(JSON.parse(fingerprint) as Array<[string, string]>);
}
