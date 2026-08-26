import { circleSketchPointId, sketchConstraintUsesPoint, sketchConstraintUsesSegment } from "@/lib/sketchConstraints";
import type { SketchCircle, SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

type PlanePoint = { x: number; z: number };
type TrimTarget = { kind: "segment" | "circle"; id: string };
type TrimResult = { profile: SketchProfile; trimmed: boolean; message: string };

const EPSILON = 1e-5;
const TAU = Math.PI * 2;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function positiveAngle(value: number) {
  return ((value % TAU) + TAU) % TAU;
}

function cloneProfile(profile: SketchProfile): SketchProfile {
  return {
    ...profile,
    points: profile.points.map((point) => ({ ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined })),
    segments: profile.segments.map((segment) => ({ ...segment, center: segment.center ? { ...segment.center } : undefined })),
    circles: (profile.circles ?? []).map((circle) => ({ ...circle })),
    images: (profile.images ?? []).map((image) => ({ ...image })),
    constraints: (profile.constraints ?? []).map((constraint) => ({ ...constraint })),
  };
}

function cubicPoint(start: SketchPoint, first: PlanePoint, second: PlanePoint, end: SketchPoint, amount: number): PlanePoint {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * end.x,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * end.z,
  };
}

function segmentPolyline(segment: SketchSegment, pointById: Map<string, SketchPoint>): PlanePoint[] {
  const start = pointById.get(segment.startId);
  const end = pointById.get(segment.endId);
  if (!start || !end) return [];
  if (segment.kind === "arc" && segment.center) {
    const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
    const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
    const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
    const forward = segment.clockwise !== false;
    const sweep = forward ? positiveAngle(endAngle - startAngle) : positiveAngle(startAngle - endAngle);
    const steps = Math.max(8, Math.ceil(sweep / (Math.PI / 48)));
    return Array.from({ length: steps + 1 }, (_, index) => {
      const angle = startAngle + (forward ? 1 : -1) * sweep * index / steps;
      return { x: segment.center!.x + Math.cos(angle) * radius, z: segment.center!.z + Math.sin(angle) * radius };
    });
  }
  if ((segment.kind === "bezier" || segment.kind === "smooth") && start.handleOut && end.handleIn) {
    return Array.from({ length: 65 }, (_, index) => cubicPoint(start, start.handleOut!, end.handleIn!, end, index / 64));
  }
  return [{ x: start.x, z: start.z }, { x: end.x, z: end.z }];
}

function circlePolyline(circle: SketchCircle): PlanePoint[] {
  return Array.from({ length: 129 }, (_, index) => {
    const angle = TAU * index / 128;
    return { x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius };
  });
}

function lineIntersection(firstStart: PlanePoint, firstEnd: PlanePoint, secondStart: PlanePoint, secondEnd: PlanePoint) {
  const firstX = firstEnd.x - firstStart.x;
  const firstZ = firstEnd.z - firstStart.z;
  const secondX = secondEnd.x - secondStart.x;
  const secondZ = secondEnd.z - secondStart.z;
  const denominator = firstX * secondZ - firstZ * secondX;
  if (Math.abs(denominator) < EPSILON) return null;
  const offsetX = secondStart.x - firstStart.x;
  const offsetZ = secondStart.z - firstStart.z;
  const firstAmount = (offsetX * secondZ - offsetZ * secondX) / denominator;
  const secondAmount = (offsetX * firstZ - offsetZ * firstX) / denominator;
  if (firstAmount < -EPSILON || firstAmount > 1 + EPSILON || secondAmount < -EPSILON || secondAmount > 1 + EPSILON) return null;
  return { amount: clamp01(firstAmount), point: { x: firstStart.x + firstX * firstAmount, z: firstStart.z + firstZ * firstAmount } };
}

function circleLineIntersections(center: PlanePoint, radius: number, start: PlanePoint, end: PlanePoint): PlanePoint[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const fx = start.x - center.x;
  const fz = start.z - center.z;
  const a = dx * dx + dz * dz;
  if (a < EPSILON) return [];
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((amount, index, values) => amount >= -EPSILON && amount <= 1 + EPSILON && (index === 0 || Math.abs(amount - values[0]) > EPSILON))
    .map((amount) => ({ x: start.x + dx * amount, z: start.z + dz * amount }));
}

function otherPolylines(profile: SketchProfile, target: TrimTarget) {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  return [
    ...profile.segments.filter((segment) => target.kind !== "segment" || segment.id !== target.id).map((segment) => segmentPolyline(segment, pointById)),
    ...(profile.circles ?? []).filter((circle) => target.kind !== "circle" || circle.id !== target.id).map(circlePolyline),
  ].filter((points) => points.length >= 2);
}

function uniqueParameters(values: number[]) {
  return values.sort((a, b) => a - b).filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > 1e-4);
}

function constraintUsesCircle(profile: SketchProfile, circleId: string) {
  const virtualIds = [circleSketchPointId(circleId, "center"), circleSketchPointId(circleId, "radius")];
  return (constraint: NonNullable<SketchProfile["constraints"]>[number]) => {
    if ((constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === circleId) return true;
    if ((constraint.kind === "concentric" || constraint.kind === "equalRadius" || constraint.kind === "tangentCircles") && constraint.circleIds.includes(circleId)) return true;
    if (constraint.kind === "tangentLineCircle" && constraint.circleId === circleId) return true;
    return virtualIds.some((pointId) => sketchConstraintUsesPoint(constraint, pointId));
  };
}

function existingOrNewPoint(profile: SketchProfile, point: PlanePoint, createId: (prefix: string) => string) {
  const existing = profile.points.find((candidate) => Math.hypot(candidate.x - point.x, candidate.z - point.z) <= 1e-4);
  if (existing) return existing.id;
  const created: SketchPoint = { id: createId("point"), ...point, mode: "corner" };
  profile.points.push(created);
  return created.id;
}

function intervalAt(parameters: number[], clicked: number) {
  const boundaries = uniqueParameters([0, ...parameters.filter((value) => value > EPSILON && value < 1 - EPSILON), 1]);
  if (boundaries.length <= 2) return null;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (clicked >= boundaries[index] - EPSILON && clicked <= boundaries[index + 1] + EPSILON) return { start: boundaries[index], end: boundaries[index + 1] };
  }
  return null;
}

function trimSegment(profile: SketchProfile, segment: SketchSegment, click: PlanePoint, createId: (prefix: string) => string): TrimResult {
  const start = profile.points.find((point) => point.id === segment.startId);
  const end = profile.points.find((point) => point.id === segment.endId);
  if (!start || !end) return { profile, trimmed: false, message: "La geometría seleccionada ya no existe." };
  if (segment.kind !== "line" && segment.kind !== "arc") return { profile, trimmed: false, message: "El recorte de curvas Bézier y suaves se añadirá en el siguiente bloque del bocetador." };

  const polylines = otherPolylines(profile, { kind: "segment", id: segment.id });
  let clickedParameter = 0;
  const intersections: number[] = [];
  const pointAt = (amount: number): PlanePoint => {
    if (segment.kind === "arc" && segment.center) {
      const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
      const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
      const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
      const forward = segment.clockwise !== false;
      const sweep = forward ? positiveAngle(endAngle - startAngle) : positiveAngle(startAngle - endAngle);
      const angle = startAngle + (forward ? 1 : -1) * sweep * amount;
      return { x: segment.center.x + Math.cos(angle) * radius, z: segment.center.z + Math.sin(angle) * radius };
    }
    return { x: start.x + (end.x - start.x) * amount, z: start.z + (end.z - start.z) * amount };
  };

  if (segment.kind === "arc" && segment.center) {
    const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
    const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
    const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
    const forward = segment.clockwise !== false;
    const sweep = forward ? positiveAngle(endAngle - startAngle) : positiveAngle(startAngle - endAngle);
    const parameterFor = (point: PlanePoint) => (forward ? positiveAngle(Math.atan2(point.z - segment.center!.z, point.x - segment.center!.x) - startAngle) : positiveAngle(startAngle - Math.atan2(point.z - segment.center!.z, point.x - segment.center!.x))) / Math.max(EPSILON, sweep);
    clickedParameter = clamp01(parameterFor(click));
    for (const polyline of polylines) for (let index = 1; index < polyline.length; index += 1) {
      for (const point of circleLineIntersections(segment.center, radius, polyline[index - 1], polyline[index])) {
        const amount = parameterFor(point);
        if (amount >= -EPSILON && amount <= 1 + EPSILON) intersections.push(clamp01(amount));
      }
    }
  } else {
    const lengthSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2;
    clickedParameter = lengthSquared > EPSILON ? clamp01(((click.x - start.x) * (end.x - start.x) + (click.z - start.z) * (end.z - start.z)) / lengthSquared) : 0;
    for (const polyline of polylines) for (let index = 1; index < polyline.length; index += 1) {
      const hit = lineIntersection(start, end, polyline[index - 1], polyline[index]);
      if (hit) intersections.push(hit.amount);
    }
  }

  const interval = intervalAt(intersections, clickedParameter);
  if (!interval) return { profile, trimmed: false, message: "Esta geometría necesita al menos una intersección interior para poder recortarse." };
  const next = cloneProfile(profile);
  next.segments = next.segments.filter((candidate) => candidate.id !== segment.id);
  next.constraints = (next.constraints ?? []).filter((constraint) => !sketchConstraintUsesSegment(constraint, segment.id));
  const addFragment = (from: number, to: number) => {
    if (to - from <= EPSILON) return;
    const startId = from <= EPSILON ? segment.startId : existingOrNewPoint(next, pointAt(from), createId);
    const endId = to >= 1 - EPSILON ? segment.endId : existingOrNewPoint(next, pointAt(to), createId);
    next.segments.push({ ...segment, id: createId(segment.kind === "arc" ? "arc" : "segment"), startId, endId, center: segment.center ? { ...segment.center } : undefined });
  };
  addFragment(0, interval.start);
  addFragment(interval.end, 1);
  return { profile: next, trimmed: true, message: "Tramo recortado." };
}

function trimCircle(profile: SketchProfile, circle: SketchCircle, click: PlanePoint, createId: (prefix: string) => string): TrimResult {
  const parameters: number[] = [];
  for (const polyline of otherPolylines(profile, { kind: "circle", id: circle.id })) for (let index = 1; index < polyline.length; index += 1) {
    for (const point of circleLineIntersections(circle, circle.radius, polyline[index - 1], polyline[index])) parameters.push(positiveAngle(Math.atan2(point.z - circle.z, point.x - circle.x)) / TAU);
  }
  const boundaries = uniqueParameters(parameters).filter((value) => value >= 0 && value < 1);
  if (boundaries.length < 2) return { profile, trimmed: false, message: "El círculo necesita dos intersecciones diferentes para poder recortarse." };
  const clicked = positiveAngle(Math.atan2(click.z - circle.z, click.x - circle.x)) / TAU;
  let intervalStart = boundaries[boundaries.length - 1];
  let intervalEnd = boundaries[0] + 1;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (clicked >= boundaries[index] && clicked <= boundaries[index + 1]) {
      intervalStart = boundaries[index];
      intervalEnd = boundaries[index + 1];
      break;
    }
  }
  if (clicked < boundaries[0] || clicked > boundaries[boundaries.length - 1]) intervalEnd = boundaries[0] + 1;
  const remainingStart = intervalEnd % 1;
  const remainingEnd = intervalStart;
  const pointAt = (amount: number) => ({ x: circle.x + Math.cos(amount * TAU) * circle.radius, z: circle.z + Math.sin(amount * TAU) * circle.radius });
  const next = cloneProfile(profile);
  next.circles = (next.circles ?? []).filter((candidate) => candidate.id !== circle.id);
  next.constraints = (next.constraints ?? []).filter((constraint) => !constraintUsesCircle(profile, circle.id)(constraint));
  const startId = existingOrNewPoint(next, pointAt(remainingStart), createId);
  const endId = existingOrNewPoint(next, pointAt(remainingEnd), createId);
  next.segments.push({ id: createId("arc"), startId, endId, kind: "arc", center: { x: circle.x, z: circle.z }, clockwise: true, construction: circle.construction });
  return { profile: next, trimmed: true, message: "Tramo circular recortado y convertido en arco editable." };
}

export function trimSketchGeometry(profile: SketchProfile, target: TrimTarget, click: PlanePoint, createId: (prefix: string) => string): TrimResult {
  if (target.kind === "segment") {
    const segment = profile.segments.find((candidate) => candidate.id === target.id);
    return segment ? trimSegment(profile, segment, click, createId) : { profile, trimmed: false, message: "La geometría seleccionada ya no existe." };
  }
  const circle = profile.circles?.find((candidate) => candidate.id === target.id);
  return circle ? trimCircle(profile, circle, click, createId) : { profile, trimmed: false, message: "El círculo seleccionado ya no existe." };
}
