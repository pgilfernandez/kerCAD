import type { ParametricFeature } from "@/types/parametric";

export function torusSweepAngle(angle?: number): number {
  return typeof angle === "number" && Number.isFinite(angle) ? Math.min(360, Math.max(0, angle)) : 360;
}
export function isEmptyTorus(feature: ParametricFeature): boolean {
  return feature.kind === "primitive" && feature.primitive === "torus" && torusSweepAngle(feature.angle) === 0;
}
