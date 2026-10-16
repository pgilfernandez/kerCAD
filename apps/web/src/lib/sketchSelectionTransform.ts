import type { SketchSelection } from "@/components/SketchWorkspace";
import type { SketchProfile } from "@/types/sketchforge";
import { solveSketchConstraints } from "@/lib/sketchConstraints";

export type SketchSelectionBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type SketchTransformHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";
type Point = { x: number; z: number };

function entities(profile: SketchProfile, selection: NonNullable<SketchSelection>) {
  const points = new Set(selection.kind === "point" ? [selection.id] : selection.kind === "multiple" ? selection.pointIds : []);
  const segments = new Set(selection.kind === "segment" ? [selection.id] : selection.kind === "multiple" ? selection.segmentIds : []);
  const circles = new Set(selection.kind === "circle" ? [selection.id] : selection.kind === "circlePoint" ? [selection.circleId] : selection.kind === "multiple" ? selection.circleIds ?? [] : []);
  const arcCenters = new Set(selection.kind === "arcPoint" ? [selection.segmentId] : []);
  for (const id of points) {
    const circle = /^circle:(.+):(center|radius)$/.exec(id);
    if (circle) circles.add(circle[1]);
    if (id.endsWith(":center")) arcCenters.add(id.slice(0, -7));
  }
  for (const segment of profile.segments) if (segments.has(segment.id)) { points.add(segment.startId); points.add(segment.endId); }
  for (const segment of profile.segments) if (points.has(segment.startId) && points.has(segment.endId)) segments.add(segment.id);
  return { points, segments, circles, arcCenters };
}

export function sketchSelectionBounds(profile: SketchProfile, selection: SketchSelection): SketchSelectionBounds | null {
  if (!selection) return null;
  const selected = entities(profile, selection);
  const samples: Point[] = profile.points.filter((point) => selected.points.has(point.id));
  const byId = new Map(profile.points.map((point) => [point.id, point]));
  for (const segment of profile.segments) {
    if (selected.arcCenters.has(segment.id) && segment.center) samples.push(segment.center);
    if (!selected.segments.has(segment.id)) continue;
    const start = byId.get(segment.startId), end = byId.get(segment.endId);
    if (!start || !end) continue;
    if (segment.kind === "arc" && segment.center) {
      const center = segment.center, radius = Math.hypot(start.x - center.x, start.z - center.z);
      const a = Math.atan2(start.z - center.z, start.x - center.x), b = Math.atan2(end.z - center.z, end.x - center.x);
      const sign = segment.clockwise !== false ? 1 : -1;
      const sweep = ((b - a) * sign + Math.PI * 2) % (Math.PI * 2);
      for (let i = 0; i <= 64; i++) { const angle = a + sign * sweep * i / 64; samples.push({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius }); }
    } else if (segment.kind !== "line" && start.handleOut && end.handleIn) {
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        samples.push({ x: u ** 3 * start.x + 3 * u ** 2 * t * start.handleOut.x + 3 * u * t ** 2 * end.handleIn.x + t ** 3 * end.x, z: u ** 3 * start.z + 3 * u ** 2 * t * start.handleOut.z + 3 * u * t ** 2 * end.handleIn.z + t ** 3 * end.z });
      }
    }
  }
  for (const circle of profile.circles ?? []) if (selected.circles.has(circle.id)) samples.push({ x: circle.x - circle.radius, z: circle.z - circle.radius }, { x: circle.x + circle.radius, z: circle.z + circle.radius });
  if (!samples.length) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of samples) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z); }
  return { minX, maxX, minZ, maxZ };
}

export function transformSketchSelection(profile: SketchProfile, selection: NonNullable<SketchSelection>, bounds: SketchSelectionBounds, handle: SketchTransformHandle, origin: Point, current: Point, shift = false, pivot?: Point): SketchProfile {
  const selected = entities(profile, selection);
  const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  let sx = 1, sz = 1, angle = 0;
  const anchor = { ...(pivot ?? center) };
  if (handle === "rotate") {
    angle = Math.atan2(current.z - anchor.z, current.x - anchor.x) - Math.atan2(origin.z - anchor.z, origin.x - anchor.x);
    const step = (shift ? 15 : 1) * Math.PI / 180;
    angle = Math.round(angle / step) * step;
  } else {
    const width = bounds.maxX - bounds.minX, height = bounds.maxZ - bounds.minZ;
    if ((handle.includes("e") || handle.includes("w")) && width > 1e-8) {
      const distance = (handle.includes("e") ? bounds.maxX : bounds.minX) - anchor.x;
      sx = Math.max(.001, 1 + (current.x - origin.x) / (Math.abs(distance) > 1e-8 ? distance : handle.includes("e") ? width : -width));
    }
    if ((handle.includes("n") || handle.includes("s")) && height > 1e-8) {
      const distance = (handle.includes("n") ? bounds.maxZ : bounds.minZ) - anchor.z;
      sz = Math.max(.001, 1 + (current.z - origin.z) / (Math.abs(distance) > 1e-8 ? distance : handle.includes("n") ? height : -height));
    }
    // Circular arcs/circles remain circular rather than silently becoming invalid
    // ellipses. Shift also preserves proportions for unrestricted geometry.
    const circular = selected.circles.size > 0 || profile.segments.some((segment) => selected.segments.has(segment.id) && segment.kind === "arc");
    if (circular || shift && handle.length === 2) { const factor = Math.abs(sx - 1) >= Math.abs(sz - 1) ? sx : sz; sx = sz = factor; }
  }
  const transform = (point: Point): Point => {
    const x = (point.x - anchor.x) * sx, z = (point.z - anchor.z) * sz;
    return { x: anchor.x + x * Math.cos(angle) - z * Math.sin(angle), z: anchor.z + x * Math.sin(angle) + z * Math.cos(angle) };
  };
  const next = structuredClone(profile);
  for (const point of next.points) if (selected.points.has(point.id)) {
    Object.assign(point, transform(point));
    if (point.handleIn) point.handleIn = transform(point.handleIn);
    if (point.handleOut) point.handleOut = transform(point.handleOut);
  }
  for (const segment of next.segments) if (segment.center && (selected.segments.has(segment.id) || selected.arcCenters.has(segment.id))) segment.center = transform(segment.center);
  for (const circle of next.circles ?? []) if (selected.circles.has(circle.id)) {
    const beforeAngle = circle.radiusAngle ?? 0;
    Object.assign(circle, transform(circle)); circle.radius *= Math.abs(sx); circle.radiusAngle = beforeAngle + angle;
  }
  return solveSketchConstraints(next);
}
