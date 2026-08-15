import type { ParametricDocument } from "@/types/parametric";

export function parametricGeometryFingerprint(document: ParametricDocument) {
  return JSON.stringify({
    objects: document.objects.map((object) => ({ id: object.id, visible: object.visible, transform: object.transform })),
    features: document.features.map(({ name: _name, ...feature }) => feature),
  });
}

export function parametricObjectColorFingerprint(document: ParametricDocument) {
  return JSON.stringify(document.objects.map((object) => [object.id, object.color]));
}

export function objectColorsFromFingerprint(fingerprint: string) {
  return Object.fromEntries(JSON.parse(fingerprint) as Array<[string, string]>);
}
