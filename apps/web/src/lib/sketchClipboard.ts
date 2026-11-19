import type { SketchSelection } from "@/components/SketchWorkspace";
import type { SketchConstraint, SketchProfile } from "@/types/workplane";

export function copySketchSelection(profile: SketchProfile, selection: SketchSelection): SketchProfile | null {
  if (!selection) return null;
  const pointIds = new Set(selection.kind === "point" ? [selection.id] : selection.kind === "multiple" ? selection.pointIds : []);
  const segmentIds = new Set(selection.kind === "segment" ? [selection.id] : selection.kind === "arcPoint" ? [selection.segmentId] : selection.kind === "multiple" ? selection.segmentIds : []);
  const circleIds = new Set(selection.kind === "circle" ? [selection.id] : selection.kind === "circlePoint" ? [selection.circleId] : selection.kind === "multiple" ? selection.circleIds ?? [] : []);
  const imageIds = new Set(selection.kind === "image" ? [selection.id] : selection.kind === "multiple" ? selection.imageIds ?? [] : []);
  for (const circle of profile.circles ?? []) {
    if (pointIds.has(`circle:${circle.id}:center`) || pointIds.has(`circle:${circle.id}:radius`)) circleIds.add(circle.id);
  }
  for (const segment of profile.segments) {
    if (pointIds.has(`${segment.id}:center`)) segmentIds.add(segment.id);
    if (segmentIds.has(segment.id)) { pointIds.add(segment.startId); pointIds.add(segment.endId); }
  }
  const points = profile.points.filter((point) => pointIds.has(point.id));
  const segments = profile.segments.filter((segment) => segmentIds.has(segment.id) || (pointIds.has(segment.startId) && pointIds.has(segment.endId)));
  const circles = (profile.circles ?? []).filter((circle) => circleIds.has(circle.id));
  const images = (profile.images ?? []).filter((image) => imageIds.has(image.id));
  if (!points.length && !circles.length && !images.length) return null;
  const included = new Set([...points, ...segments, ...circles, ...images].map((entity) => entity.id));
  circles.forEach((circle) => { included.add(`circle:${circle.id}:center`); included.add(`circle:${circle.id}:radius`); });
  segments.forEach((segment) => { if (segment.center) included.add(`${segment.id}:center`); });
  const constraints = (profile.constraints ?? []).filter((constraint) => Object.entries(constraint).every(([key, value]) => {
    if (key === "id" || (!key.endsWith("Id") && !key.endsWith("Ids"))) return true;
    return (Array.isArray(value) ? value : [value]).every((id) => typeof id === "string" && included.has(id));
  }));
  return structuredClone({ points, segments, circles, images, constraints });
}

export function pasteSketchSelection(source: SketchProfile, makeId: (kind: string) => string, offset: number): SketchProfile {
  const ids = new Map<string, string>();
  for (const point of source.points) ids.set(point.id, makeId("point"));
  for (const segment of source.segments) ids.set(segment.id, makeId("segment"));
  for (const circle of source.circles ?? []) ids.set(circle.id, makeId("circle"));
  for (const image of source.images ?? []) ids.set(image.id, makeId("image"));
  for (const circle of source.circles ?? []) for (const part of ["center", "radius"]) ids.set(`circle:${circle.id}:${part}`, `circle:${ids.get(circle.id)}:${part}`);
  for (const segment of source.segments) ids.set(`${segment.id}:center`, `${ids.get(segment.id)}:center`);
  const move = (point: { x: number; z: number }) => ({ x: point.x + offset, z: point.z + offset });
  const remap = (value: unknown): unknown => typeof value === "string" ? ids.get(value) ?? value
    : Array.isArray(value) ? value.map(remap)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)])) : value;
  return {
    points: source.points.map((point) => ({ ...point, ...move(point), id: ids.get(point.id)!, handleIn: point.handleIn ? move(point.handleIn) : undefined, handleOut: point.handleOut ? move(point.handleOut) : undefined })),
    segments: source.segments.map((segment) => ({ ...segment, id: ids.get(segment.id)!, startId: ids.get(segment.startId)!, endId: ids.get(segment.endId)!, center: segment.center ? move(segment.center) : undefined })),
    circles: source.circles?.map((circle) => ({ ...circle, ...move(circle), id: ids.get(circle.id)! })),
    images: source.images?.map((image) => ({ ...image, ...move(image), id: ids.get(image.id)! })),
    constraints: source.constraints?.map((constraint) => ({ ...(remap(constraint) as SketchConstraint), id: makeId("constraint"), ...(constraint.kind === "fixed" ? move(constraint) : {}) })),
  };
}
