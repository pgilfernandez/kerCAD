import type { SketchConstraint, SketchPoint, SketchProfile } from "@/types/sketchforge";

type Point = { x: number; z: number };
export type RectangleVariant = "centerRectangle" | "roundedRectangle";

export function sketchRectangle(kind: RectangleVariant, first: Point, second: Point): SketchProfile | null {
  const other = kind === "centerRectangle" ? { x: first.x * 2 - second.x, z: first.z * 2 - second.z } : first;
  const left = Math.min(other.x, second.x), right = Math.max(other.x, second.x);
  const bottom = Math.min(other.z, second.z), top = Math.max(other.z, second.z);
  if (right - left < .001 || top - bottom < .001) return null;
  const rounded = kind === "roundedRectangle";
  const radius = Math.min(right - left, top - bottom) * .15;
  const coordinates = rounded ? [
    { x: left + radius, z: bottom }, { x: right - radius, z: bottom },
    { x: right, z: bottom + radius }, { x: right, z: top - radius },
    { x: right - radius, z: top }, { x: left + radius, z: top },
    { x: left, z: top - radius }, { x: left, z: bottom + radius },
  ] : [{ x: left, z: bottom }, { x: right, z: bottom }, { x: right, z: top }, { x: left, z: top }];
  const centers = [{ x: right - radius, z: bottom + radius }, { x: right - radius, z: top - radius }, { x: left + radius, z: top - radius }, { x: left + radius, z: bottom + radius }];
  const points: SketchPoint[] = coordinates.map((point, index) => ({ ...point, id: `rectangle-point-${index}`, mode: "corner" as const }));
  const segments: SketchProfile["segments"] = points.map((point, index) => ({ id: `rectangle-segment-${index}`, startId: point.id, endId: points[(index + 1) % points.length].id, kind: rounded && index % 2 ? "arc" : "line", ...(rounded && index % 2 ? { center: centers[(index - 1) / 2], clockwise: true } : {}) }));
  const constraints: SketchConstraint[] = [];
  segments.forEach((segment, index) => {
    if (segment.kind === "line") constraints.push({ id: `rectangle-direction-${index}`, kind: (rounded ? index % 4 === 0 : index % 2 === 0) ? "horizontal" : "vertical", segmentId: segment.id });
  });
  if (rounded) {
    segments.forEach((segment, index) => {
      const next = segments[(index + 1) % segments.length];
      constraints.push({ id: `rectangle-tangent-${index}`, kind: "tangentLineArc", lineId: segment.kind === "line" ? segment.id : next.id, arcId: segment.kind === "arc" ? segment.id : next.id });
    });
    [3, 5, 7].forEach((index) => constraints.push({ id: `rectangle-equal-${index}`, kind: "equalArcRadius", arcIds: [segments[1].id, segments[index].id] }));
  } else {
    points.push({ ...first, id: "rectangle-center", mode: "corner", construction: true });
    [[0, 2], [1, 3]].forEach(([start, end], index) => {
      const diagonal = { id: `rectangle-diagonal-${index}`, startId: points[start].id, endId: points[end].id, kind: "line" as const, construction: true };
      segments.push(diagonal);
      constraints.push({ id: `rectangle-center-${index}`, kind: "midpoint", pointId: "rectangle-center", segmentId: diagonal.id, preserveCenter: true });
    });
  }
  return { points, segments, constraints };
}
