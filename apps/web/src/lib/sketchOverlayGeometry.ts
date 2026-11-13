import type { SketchFeature } from "@/types/parametric";
import { generatedPathPoints } from "@/lib/parametricPaths";

export function sketchOverlayPositions(feature: SketchFeature, zOffset = .025) {
  const positions: number[] = [];
  if (feature.generatedPath) {
    const points = generatedPathPoints(feature.generatedPath);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    return positions;
  }
  const addPolyline = (points: Array<{ x: number; y: number }>) => {
    for (let index = 1; index < points.length; index += 1) positions.push(points[index - 1].x, points[index - 1].y, zOffset, points[index].x, points[index].y, zOffset);
  };
  if (feature.profile.shape === "rectangle") {
    const halfWidth = feature.profile.width / 2;
    const halfDepth = feature.profile.depth / 2;
    addPolyline([{ x: -halfWidth, y: -halfDepth }, { x: halfWidth, y: -halfDepth }, { x: halfWidth, y: halfDepth }, { x: -halfWidth, y: halfDepth }, { x: -halfWidth, y: -halfDepth }]);
    return positions;
  }
  if (feature.profile.shape === "circle") {
    const radius = feature.profile.diameter / 2;
    const radiusY = feature.profile.elliptical ? feature.profile.radius2 ?? radius : radius;
    addPolyline(Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radiusY };
    }));
    return positions;
  }
  const profile = feature.profile.geometry;
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  for (const segment of profile.segments.filter((candidate) => !candidate.construction)) {
    const start = pointById.get(segment.startId);
    const end = pointById.get(segment.endId);
    if (!start || !end) continue;
    if (segment.kind === "arc" && segment.center) {
      const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
      const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
      const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
      const positive = segment.clockwise !== false;
      const sweep = positive ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) : -((startAngle - endAngle + Math.PI * 2) % (Math.PI * 2));
      const divisions = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
      addPolyline(Array.from({ length: divisions + 1 }, (_, index) => {
        const angle = startAngle + sweep * index / divisions;
        return { x: segment.center!.x + Math.cos(angle) * radius, y: segment.center!.z + Math.sin(angle) * radius };
      }));
      continue;
    }
    if (segment.kind !== "line" && start.handleOut && end.handleIn) {
      addPolyline(Array.from({ length: 25 }, (_, index) => {
        const amount = index / 24;
        const inverse = 1 - amount;
        return {
          x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * start.handleOut!.x + 3 * inverse * amount ** 2 * end.handleIn!.x + amount ** 3 * end.x,
          y: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * start.handleOut!.z + 3 * inverse * amount ** 2 * end.handleIn!.z + amount ** 3 * end.z,
        };
      }));
      continue;
    }
    addPolyline([{ x: start.x, y: start.z }, { x: end.x, y: end.z }]);
  }
  for (const circle of (profile.circles ?? []).filter((candidate) => !candidate.construction)) {
    addPolyline(Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return { x: circle.x + Math.cos(angle) * circle.radius, y: circle.z + Math.sin(angle) * circle.radius };
    }));
  }
  return positions;
}
