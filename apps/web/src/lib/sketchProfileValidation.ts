import type { SketchCircle, SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type SketchOutlinePoint = Readonly<{ x: number; y: number }>;

export type SketchProfileDiagnostic = {
  code: "open" | "branch" | "duplicate" | "degenerate" | "intersection";
  severity: "error";
  message: string;
  pointIds?: string[];
  segmentIds?: string[];
  circleIds?: string[];
};

export type SketchProfileValidation = {
  valid: boolean;
  closedContourCount: number;
  diagnostics: SketchProfileDiagnostic[];
};

export type SketchOutlineIntersection = {
  outlineA: number;
  edgeA: number;
  outlineB: number;
  edgeB: number;
};

function distanceSquared(a: SketchOutlinePoint, b: SketchOutlinePoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalizedOutline(points: readonly SketchOutlinePoint[], epsilon: number) {
  const epsilonSquared = epsilon * epsilon;
  const result: SketchOutlinePoint[] = [];
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (!result.length || distanceSquared(result[result.length - 1], point) > epsilonSquared) result.push(point);
  });
  if (result.length > 1 && distanceSquared(result[0], result[result.length - 1]) <= epsilonSquared) result.pop();
  return result;
}

function orientation(a: SketchOutlinePoint, b: SketchOutlinePoint, c: SketchOutlinePoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: SketchOutlinePoint, start: SketchOutlinePoint, end: SketchOutlinePoint, epsilon: number) {
  if (Math.abs(orientation(start, end, point)) > epsilon) return false;
  return point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

function segmentsIntersect(
  a: SketchOutlinePoint,
  b: SketchOutlinePoint,
  c: SketchOutlinePoint,
  d: SketchOutlinePoint,
  epsilon: number,
) {
  if (Math.max(a.x, b.x) + epsilon < Math.min(c.x, d.x)
    || Math.max(c.x, d.x) + epsilon < Math.min(a.x, b.x)
    || Math.max(a.y, b.y) + epsilon < Math.min(c.y, d.y)
    || Math.max(c.y, d.y) + epsilon < Math.min(a.y, b.y)) {
    return false;
  }

  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const crossesAB = (abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon);
  const crossesCD = (cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon);
  if (crossesAB && crossesCD) return true;

  return (Math.abs(abC) <= epsilon && pointOnSegment(c, a, b, epsilon))
    || (Math.abs(abD) <= epsilon && pointOnSegment(d, a, b, epsilon))
    || (Math.abs(cdA) <= epsilon && pointOnSegment(a, c, d, epsilon))
    || (Math.abs(cdB) <= epsilon && pointOnSegment(b, c, d, epsilon));
}

function outlineEpsilon(outlines: readonly (readonly SketchOutlinePoint[])[]) {
  const points = outlines.flatMap((outline) => [...outline]);
  if (!points.length) return 1e-8;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return Math.max(1e-8, Math.hypot(maxX - minX, maxY - minY) * 1e-8);
}

function adjacentEdges(first: number, second: number, edgeCount: number) {
  return first === second
    || Math.abs(first - second) === 1
    || (first === 0 && second === edgeCount - 1)
    || (second === 0 && first === edgeCount - 1);
}

/**
 * Finds crossings that make closed sketch contours unsafe to triangulate.
 * Adjacent edges may share their intended endpoint; all other touching,
 * crossing, or overlapping edges are rejected.
 */
export function findSketchOutlineIntersection(outlines: readonly (readonly SketchOutlinePoint[])[]): SketchOutlineIntersection | null {
  const epsilon = outlineEpsilon(outlines);
  const clean = outlines.map((outline) => normalizedOutline(outline, epsilon));

  for (let outlineA = 0; outlineA < clean.length; outlineA += 1) {
    const a = clean[outlineA];
    if (a.length < 3) continue;
    for (let edgeA = 0; edgeA < a.length; edgeA += 1) {
      const aStart = a[edgeA];
      const aEnd = a[(edgeA + 1) % a.length];
      for (let outlineB = outlineA; outlineB < clean.length; outlineB += 1) {
        const b = clean[outlineB];
        if (b.length < 3) continue;
        const firstEdgeB = outlineA === outlineB ? edgeA + 1 : 0;
        for (let edgeB = firstEdgeB; edgeB < b.length; edgeB += 1) {
          if (outlineA === outlineB && adjacentEdges(edgeA, edgeB, a.length)) continue;
          const bStart = b[edgeB];
          const bEnd = b[(edgeB + 1) % b.length];
          if (segmentsIntersect(aStart, aEnd, bStart, bEnd, epsilon)) {
            return { outlineA, edgeA, outlineB, edgeB };
          }
        }
      }
    }
  }
  return null;
}

type SampledEntity = {
  id: string;
  kind: "segment" | "circle";
  points: SketchOutlinePoint[];
  closed: boolean;
  endpointIds: [string, string] | null;
};

function sampleSegment(segment: SketchSegment, pointById: Map<string, SketchPoint>): SampledEntity | null {
  const start = pointById.get(segment.startId);
  const end = pointById.get(segment.endId);
  if (!start || !end) return null;
  if (segment.kind === "line") return { id: segment.id, kind: "segment", points: [{ x: start.x, y: start.z }, { x: end.x, y: end.z }], closed: false, endpointIds: [start.id, end.id] };
  if (segment.kind === "arc" && segment.center) {
    const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
    const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
    const clockwise = segment.clockwise !== false;
    const sweep = clockwise ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) : -((startAngle - endAngle + Math.PI * 2) % (Math.PI * 2));
    const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
    return { id: segment.id, kind: "segment", points: Array.from({ length: steps + 1 }, (_, index) => {
      const angle = startAngle + sweep * index / steps;
      return { x: segment.center!.x + Math.cos(angle) * radius, y: segment.center!.z + Math.sin(angle) * radius };
    }), closed: false, endpointIds: [start.id, end.id] };
  }
  const first = start.handleOut ?? start;
  const second = end.handleIn ?? end;
  const steps = 24;
  return { id: segment.id, kind: "segment", points: Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * first.x + 3 * inverse * t ** 2 * second.x + t ** 3 * end.x,
      y: inverse ** 3 * start.z + 3 * inverse ** 2 * t * first.z + 3 * inverse * t ** 2 * second.z + t ** 3 * end.z,
    };
  }), closed: false, endpointIds: [start.id, end.id] };
}

function sampleCircle(circle: SketchCircle): SampledEntity {
  const steps = 64;
  return { id: circle.id, kind: "circle", closed: true, endpointIds: null, points: Array.from({ length: steps }, (_, index) => {
    const angle = index / steps * Math.PI * 2;
    return { x: circle.x + Math.cos(angle) * circle.radius, y: circle.z + Math.sin(angle) * circle.radius };
  }) };
}

function properIntersection(a: SketchOutlinePoint, b: SketchOutlinePoint, c: SketchOutlinePoint, d: SketchOutlinePoint, epsilon: number) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
}

export function validateDrawnSketchProfile(profile: SketchProfile): SketchProfileValidation {
  const diagnostics: SketchProfileDiagnostic[] = [];
  const segments = profile.segments.filter((segment) => !segment.construction);
  const circles = (profile.circles ?? []).filter((circle) => !circle.construction);
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const degree = new Map<string, number>();
  const duplicateSegments = new Map<string, string>();
  const epsilon = 1e-7;

  for (const segment of segments) {
    const start = pointById.get(segment.startId);
    const end = pointById.get(segment.endId);
    if (!start || !end || segment.startId === segment.endId || Math.hypot((end?.x ?? 0) - (start?.x ?? 0), (end?.z ?? 0) - (start?.z ?? 0)) <= epsilon) {
      diagnostics.push({ code: "degenerate", severity: "error", message: "Hay un segmento sin longitud o con referencias inválidas.", segmentIds: [segment.id], pointIds: [segment.startId, segment.endId] });
      continue;
    }
    degree.set(segment.startId, (degree.get(segment.startId) ?? 0) + 1);
    degree.set(segment.endId, (degree.get(segment.endId) ?? 0) + 1);
    const key = [segment.startId, segment.endId].sort().join(":");
    const duplicate = duplicateSegments.get(key);
    if (duplicate) diagnostics.push({ code: "duplicate", severity: "error", message: "Hay segmentos duplicados superpuestos.", segmentIds: [duplicate, segment.id] });
    else duplicateSegments.set(key, segment.id);
  }

  const openPointIds = [...degree].filter(([, count]) => count === 1).map(([id]) => id);
  const branchPointIds = [...degree].filter(([, count]) => count > 2).map(([id]) => id);
  if (openPointIds.length) diagnostics.push({ code: "open", severity: "error", message: `El perfil tiene ${openPointIds.length} extremo${openPointIds.length === 1 ? "" : "s"} abierto${openPointIds.length === 1 ? "" : "s"}.`, pointIds: openPointIds });
  if (branchPointIds.length) diagnostics.push({ code: "branch", severity: "error", message: "El perfil contiene bifurcaciones que no forman contornos válidos.", pointIds: branchPointIds });

  const duplicateCircles = new Map<string, string>();
  for (const circle of circles) {
    if (!Number.isFinite(circle.radius) || circle.radius <= epsilon) diagnostics.push({ code: "degenerate", severity: "error", message: "Hay un círculo con radio nulo.", circleIds: [circle.id] });
    const key = `${Math.round(circle.x / epsilon)}:${Math.round(circle.z / epsilon)}:${Math.round(circle.radius / epsilon)}`;
    const duplicate = duplicateCircles.get(key);
    if (duplicate) diagnostics.push({ code: "duplicate", severity: "error", message: "Hay círculos duplicados superpuestos.", circleIds: [duplicate, circle.id] });
    else duplicateCircles.set(key, circle.id);
  }

  const entities = [...segments.map((segment) => sampleSegment(segment, pointById)).filter(Boolean) as SampledEntity[], ...circles.filter((circle) => circle.radius > epsilon).map(sampleCircle)];
  const scaleEpsilon = outlineEpsilon(entities.map((entity) => entity.points));
  const reportedPairs = new Set<string>();
  for (let firstIndex = 0; firstIndex < entities.length; firstIndex += 1) {
    const first = entities[firstIndex];
    const firstEdges = first.closed ? first.points.length : first.points.length - 1;
    for (let secondIndex = firstIndex; secondIndex < entities.length; secondIndex += 1) {
      const second = entities[secondIndex];
      const secondEdges = second.closed ? second.points.length : second.points.length - 1;
      for (let edgeA = 0; edgeA < firstEdges; edgeA += 1) for (let edgeB = firstIndex === secondIndex ? edgeA + 1 : 0; edgeB < secondEdges; edgeB += 1) {
        if (firstIndex === secondIndex && adjacentEdges(edgeA, edgeB, firstEdges)) continue;
        const a = first.points[edgeA];
        const b = first.points[(edgeA + 1) % first.points.length];
        const c = second.points[edgeB];
        const d = second.points[(edgeB + 1) % second.points.length];
        if (!segmentsIntersect(a, b, c, d, scaleEpsilon)) continue;
        const sharedIds = first.endpointIds && second.endpointIds ? first.endpointIds.filter((id) => second.endpointIds?.includes(id)) : [];
        const allowedTouch = sharedIds.some((id) => {
          const point = pointById.get(id);
          if (!point) return false;
          const shared = { x: point.x, y: point.z };
          return (distanceSquared(a, shared) <= scaleEpsilon ** 2 || distanceSquared(b, shared) <= scaleEpsilon ** 2)
            && (distanceSquared(c, shared) <= scaleEpsilon ** 2 || distanceSquared(d, shared) <= scaleEpsilon ** 2);
        });
        if (allowedTouch && !properIntersection(a, b, c, d, scaleEpsilon)) continue;
        const pairKey = [first.kind + first.id, second.kind + second.id].sort().join(":");
        if (reportedPairs.has(pairKey)) continue;
        reportedPairs.add(pairKey);
        diagnostics.push({ code: "intersection", severity: "error", message: "Dos contornos se cruzan o se tocan de forma no válida.", segmentIds: [first, second].filter((entity) => entity.kind === "segment").map((entity) => entity.id), circleIds: [first, second].filter((entity) => entity.kind === "circle").map((entity) => entity.id) });
      }
    }
  }

  const visited = new Set<string>();
  let closedSegmentContours = 0;
  for (const pointId of degree.keys()) {
    if (visited.has(pointId)) continue;
    const pending = [pointId];
    let count = 0;
    let closed = true;
    while (pending.length) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      count += 1;
      if (degree.get(current) !== 2) closed = false;
      for (const segment of segments) {
        if (segment.startId === current && !visited.has(segment.endId)) pending.push(segment.endId);
        if (segment.endId === current && !visited.has(segment.startId)) pending.push(segment.startId);
      }
    }
    if (closed && count >= 3) closedSegmentContours += 1;
  }
  const closedContourCount = closedSegmentContours + circles.filter((circle) => circle.radius > epsilon).length;
  if (!closedContourCount && !diagnostics.length) diagnostics.push({ code: "open", severity: "error", message: "Dibuja al menos un contorno cerrado." });
  return { valid: diagnostics.length === 0 && closedContourCount > 0, closedContourCount, diagnostics };
}
