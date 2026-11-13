import type { ParametricDocument, SketchFeature } from "@/types/parametric";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";

function canBeProfile(sketch: SketchFeature) {
  if (sketch.suppressed || sketch.generatedPath) return false;
  const profile = sketch.profile;
  if (profile.shape === "rectangle") return profile.width > 0 && profile.depth > 0;
  if (profile.shape === "circle") return profile.diameter > 0;
  return validateDrawnSketchProfile(profile.geometry).valid;
}

function canBePath(sketch: SketchFeature) {
  if (sketch.suppressed) return false;
  if (sketch.generatedPath || sketch.profile.shape !== "drawn") return true;
  const profile = sketch.profile.geometry;
  const validation = validateDrawnSketchProfile(profile);
  if (validation.diagnostics.some((diagnostic) => diagnostic.code !== "open")) return false;
  const circles = (profile.circles ?? []).filter((circle) => !circle.construction);
  const segments = profile.segments.filter((segment) => !segment.construction);
  if (circles.length) return circles.length === 1 && !segments.length;
  if (!segments.length) return false;
  // One connected, unbranched chain, rather than several disconnected paths.
  const adjacency = new Map<string, string[]>();
  for (const segment of segments) {
    adjacency.set(segment.startId, [...(adjacency.get(segment.startId) ?? []), segment.endId]);
    adjacency.set(segment.endId, [...(adjacency.get(segment.endId) ?? []), segment.startId]);
  }
  const visited = new Set<string>();
  const pending = [segments[0].startId];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(adjacency.get(id) ?? []).filter((next) => !visited.has(next)));
  }
  return visited.size === adjacency.size;
}

/** Inspect immediate neighbours in the visible operation hierarchy: next first.
 * Infer roles from geometry; when both are closed, retain oldest-as-path. */
export function adjacentSweepSketchPair(document: ParametricDocument, selected: SketchFeature): { path: SketchFeature; profile: SketchFeature } | null {
  const operations = document.features.filter((feature) => feature.objectId === selected.objectId && (feature.kind !== "sketch" || feature.purpose === "user"));
  const index = operations.findIndex((feature) => feature.id === selected.id);
  if (index < 0 || selected.suppressed) return null;
  for (const neighbourIndex of [index + 1, index - 1]) {
    const neighbour = operations[neighbourIndex];
    if (neighbour?.kind !== "sketch" || neighbour.suppressed) continue;
    const [older, newer] = neighbourIndex < index ? [neighbour, selected] : [selected, neighbour];
    if (canBePath(older) && canBeProfile(newer)) return { path: older, profile: newer };
    if (canBePath(newer) && canBeProfile(older)) return { path: newer, profile: older };
  }
  return null;
}
