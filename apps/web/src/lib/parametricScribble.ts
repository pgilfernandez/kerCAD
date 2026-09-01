import { createLocalId } from "@/lib/localIds";
import type { SketchProfile } from "@/types/sketchforge";

export type ScribblePoint = { x: number; z: number };

function distanceToSegment(point: ScribblePoint, start: ScribblePoint, end: ScribblePoint) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) return Math.hypot(point.x - start.x, point.z - start.z);
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - start.x - amount * dx, point.z - start.z - amount * dz);
}

function simplify(points: ScribblePoint[], tolerance: number): ScribblePoint[] {
  if (points.length <= 2) return points;
  let farthest = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points.at(-1)!);
    if (distance > farthest) { farthest = distance; splitIndex = index; }
  }
  if (farthest <= tolerance) return [points[0], points.at(-1)!];
  return [...simplify(points.slice(0, splitIndex + 1), tolerance).slice(0, -1), ...simplify(points.slice(splitIndex), tolerance)];
}

export function simplifyScribbleContour(points: ScribblePoint[], smoothing = 0.8) {
  const cleaned = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z) > 0.05);
  if (cleaned.length < 3) throw new Error("Draw a longer contour before releasing the pointer.");
  const closed = Math.hypot(cleaned[0].x - cleaned.at(-1)!.x, cleaned[0].z - cleaned.at(-1)!.z) < 0.05 ? cleaned.slice(0, -1) : cleaned;
  const simplified = simplify([...closed, closed[0]], Math.max(0.05, smoothing)).slice(0, -1);
  if (simplified.length < 3) throw new Error("El trazo no encierra una superficie reconocible.");
  return simplified;
}

export function appendScribbleContour(profile: SketchProfile, rawPoints: ScribblePoint[], smoothing = 0.8, smooth = false): SketchProfile {
  const contour = simplifyScribbleContour(rawPoints, smoothing);
  const points = contour.map((point, index) => {
    if (!smooth) return { id: createLocalId("scribble-point"), ...point, mode: "corner" as const };
    const previous = contour[(index - 1 + contour.length) % contour.length];
    const next = contour[(index + 1) % contour.length];
    const tangent = { x: (next.x - previous.x) / 6, z: (next.z - previous.z) / 6 };
    return {
      id: createLocalId("scribble-point"),
      ...point,
      mode: "smooth" as const,
      handleIn: { x: point.x - tangent.x, z: point.z - tangent.z },
      handleOut: { x: point.x + tangent.x, z: point.z + tangent.z },
    };
  });
  const segments = points.map((point, index) => ({ id: createLocalId("scribble-segment"), kind: smooth ? "smooth" as const : "line" as const, startId: point.id, endId: points[(index + 1) % points.length].id }));
  return {
    ...profile,
    points: [...profile.points, ...points],
    segments: [...profile.segments, ...segments],
    generator: { kind: "scribble", smoothing, smooth },
  };
}
