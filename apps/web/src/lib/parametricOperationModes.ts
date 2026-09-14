import type { ParametricDocument, ParametricFeature } from "@/types/parametric";

/** Sketches and suppressed steps do not supply a solid for a boolean operation. */
export function hasPreviousSolidOperation(document: ParametricDocument, featureId: string) {
  const index = document.features.findIndex(feature => feature.id === featureId);
  if (index < 0) return false;
  const feature = document.features[index];
  return document.features.slice(0, index).some(previous => previous.objectId === feature.objectId
    && !previous.suppressed && previous.kind !== "sketch");
}

export function requiresAddOperation(document: ParametricDocument, feature: ParametricFeature) {
  return "operation" in feature && !hasPreviousSolidOperation(document, feature.id);
}
