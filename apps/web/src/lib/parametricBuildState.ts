import type { ParametricDocument } from "@/types/parametric";

const PARAMETRIC_GEOMETRY_VERSION = 2;

export function parametricGeometryFingerprint(document: ParametricDocument) {
  return JSON.stringify({
    geometryVersion: PARAMETRIC_GEOMETRY_VERSION,
    objects: document.objects.map((object) => ({ id: object.id, visible: object.visible, transform: object.transform })),
    features: document.features.map(({ name: _name, ...feature }) => feature),
  });
}

export function parametricObjectColorFingerprint(document: ParametricDocument) {
  return JSON.stringify(document.objects.map((object) => [object.id, object.color]));
}

export function parametricObjectGeometryFingerprint(document: ParametricDocument, objectId: string) {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  return JSON.stringify({
    geometryVersion: PARAMETRIC_GEOMETRY_VERSION,
    object: object ? { id: object.id, visible: object.visible, transform: object.transform } : null,
    features: document.features
      .filter((feature) => feature.objectId === objectId)
      .map(({ name: _name, ...feature }) => feature),
    topologyReferences: document.topologyReferences.filter((reference) => reference.objectId === objectId),
  });
}

export function objectColorsFromFingerprint(fingerprint: string) {
  return Object.fromEntries(JSON.parse(fingerprint) as Array<[string, string]>);
}
