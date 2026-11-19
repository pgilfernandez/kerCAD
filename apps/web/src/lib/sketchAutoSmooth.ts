import type { SketchProfile } from "@/types/workplane";

/** Recompute automatic tangents from neighbouring anchors, not old handles. */
export function updateAutoSmoothNodes(profile: SketchProfile): SketchProfile {
  const points = new Map(profile.points.map((point) => [point.id, point]));
  for (const point of profile.points) {
    if (point.mode !== "autoSmooth") continue;
    const incoming = profile.segments.filter((segment) => segment.endId === point.id && !segment.construction);
    const outgoing = profile.segments.filter((segment) => segment.startId === point.id && !segment.construction);
    if (incoming.length > 1 || outgoing.length > 1 || [...incoming, ...outgoing].some((segment) => segment.kind === "arc")) continue;
    const previous = incoming[0] ? points.get(incoming[0].startId) : undefined;
    const next = outgoing[0] ? points.get(outgoing[0].endId) : undefined;
    if (!previous && !next) continue;
    const a = previous ? { x: point.x - previous.x, z: point.z - previous.z } : { x: next!.x - point.x, z: next!.z - point.z };
    const b = next ? { x: next.x - point.x, z: next.z - point.z } : a;
    const la = Math.hypot(a.x, a.z), lb = Math.hypot(b.x, b.z);
    let x = a.x / (la || 1) + b.x / (lb || 1), z = a.z / (la || 1) + b.z / (lb || 1);
    const length = Math.hypot(x, z);
    x = length > 1e-9 ? x / length : 0; z = length > 1e-9 ? z / length : 0;
    point.handleIn = previous ? { x: point.x - x * la / 3, z: point.z - z * la / 3 } : undefined;
    point.handleOut = next ? { x: point.x + x * lb / 3, z: point.z + z * lb / 3 } : undefined;
  }
  return profile;
}
