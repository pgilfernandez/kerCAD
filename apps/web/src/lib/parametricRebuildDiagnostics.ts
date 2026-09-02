import type { EducadTranslationKey } from "@/lib/educadI18n";
import type { ParametricFeature } from "@/types/parametric";

const FEATURE_SUGGESTIONS: Record<ParametricFeature["kind"], EducadTranslationKey> = {
  sketch: "rebuild.suggestion.sketch",
  extrude: "rebuild.suggestion.extrude",
  primitive: "rebuild.suggestion.primitive",
  importedStep: "rebuild.suggestion.importedStep",
  hole: "rebuild.suggestion.hole",
  fillet: "rebuild.suggestion.fillet",
  faceExtrude: "rebuild.suggestion.faceExtrude",
  shell: "rebuild.suggestion.shell",
  revolve: "rebuild.suggestion.revolve",
  mirror: "rebuild.suggestion.mirror",
  linearPattern: "rebuild.suggestion.linearPattern",
  polarPattern: "rebuild.suggestion.polarPattern",
  objectBoolean: "rebuild.suggestion.objectBoolean",
};

export function parametricRebuildSuggestion(feature: ParametricFeature | null | undefined, warning: string | null): EducadTranslationKey {
  const normalized = warning?.toLowerCase() ?? "";
  if (/no longer exist|reference|selected (?:face|edge|axis)/.test(normalized)) return "rebuild.suggestion.topology";
  if (/first operation|create a solid first/.test(normalized)) return "rebuild.suggestion.base";
  return feature ? FEATURE_SUGGESTIONS[feature.kind] : "rebuild.suggestion.generic";
}
