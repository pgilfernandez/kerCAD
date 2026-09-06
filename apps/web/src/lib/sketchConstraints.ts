import type { SketchConstraint, SketchPoint, SketchProfile } from "@/types/sketchforge";
import { refineSketchConstraintsNumerically, sketchConstraintRankGain } from "@/lib/sketchConstraintAnalysis";

export const SKETCH_ORIGIN_POINT_ID = "reference:origin";
export const SKETCH_X_AXIS_ID = "reference:axis-x";
export const SKETCH_Y_AXIS_ID = "reference:axis-y";
const SKETCH_X_AXIS_START_ID = "reference:axis-x:start";
const SKETCH_X_AXIS_END_ID = "reference:axis-x:end";
const SKETCH_Y_AXIS_START_ID = "reference:axis-y:start";
const SKETCH_Y_AXIS_END_ID = "reference:axis-y:end";

export const SKETCH_REFERENCE_POINTS: SketchPoint[] = [
  { id: SKETCH_ORIGIN_POINT_ID, x: 0, z: 0 },
  { id: SKETCH_X_AXIS_START_ID, x: -1, z: 0 },
  { id: SKETCH_X_AXIS_END_ID, x: 1, z: 0 },
  { id: SKETCH_Y_AXIS_START_ID, x: 0, z: -1 },
  { id: SKETCH_Y_AXIS_END_ID, x: 0, z: 1 },
];

export const SKETCH_REFERENCE_AXES = [
  { id: SKETCH_X_AXIS_ID, startId: SKETCH_X_AXIS_START_ID, endId: SKETCH_X_AXIS_END_ID, kind: "line" as const, construction: true },
  { id: SKETCH_Y_AXIS_ID, startId: SKETCH_Y_AXIS_START_ID, endId: SKETCH_Y_AXIS_END_ID, kind: "line" as const, construction: true },
];

export function sketchReferenceAxis(id: string) {
  return SKETCH_REFERENCE_AXES.find((axis) => axis.id === id) ?? null;
}

function sketchLine(profile: SketchProfile, id: string) {
  return profile.segments.find((segment) => segment.id === id && segment.kind === "line") ?? sketchReferenceAxis(id);
}

export function circleSketchPointId(circleId: string, point: "center" | "radius") {
  return `circle:${circleId}:${point}`;
}

export function arcSketchPointId(segmentId: string) {
  return `${segmentId}:center`;
}

function circleSketchPointReference(id: string) {
  const match = /^circle:(.+):(center|radius)$/.exec(id);
  return match ? { circleId: match[1], point: match[2] as "center" | "radius" } : null;
}

export function sketchConstraintPoint(profile: SketchProfile, id: string): SketchPoint | null {
  const reference = SKETCH_REFERENCE_POINTS.find((candidate) => candidate.id === id);
  if (reference) return { ...reference };
  const point = profile.points.find((candidate) => candidate.id === id);
  if (point) return point;
  const arc = profile.segments.find((segment) => segment.kind === "arc" && segment.center && arcSketchPointId(segment.id) === id);
  if (arc?.center) return { id, x: arc.center.x, z: arc.center.z };
  const circleReference = circleSketchPointReference(id);
  const circle = circleReference ? profile.circles?.find((candidate) => candidate.id === circleReference.circleId) : null;
  if (!circleReference || !circle) return null;
  const angle = circle.radiusAngle ?? 0;
  return circleReference.point === "center"
    ? { id, x: circle.x, z: circle.z }
    : { id, x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius };
}

export function sketchConstraintUsesSegment(constraint: SketchConstraint, segmentId: string) {
  if (constraint.kind === "angle" || constraint.kind === "parallel" || constraint.kind === "perpendicular" || constraint.kind === "equalLength") return constraint.segmentIds.includes(segmentId);
  if (constraint.kind === "arcRadius" || constraint.kind === "arcDiameter" || constraint.kind === "arcAngle") return constraint.segmentId === segmentId;
  if (constraint.kind === "midpoint" || constraint.kind === "pointOnObject") return constraint.segmentId === segmentId;
  if (constraint.kind === "pointOnArc") return constraint.arcId === segmentId;
  if (constraint.kind === "tangentLineCircle" || constraint.kind === "symmetric") return constraint.segmentId === segmentId;
  if (constraint.kind === "tangentLineArc") return constraint.lineId === segmentId || constraint.arcId === segmentId;
  return (constraint.kind === "horizontal" || constraint.kind === "vertical" || constraint.kind === "distance") && constraint.segmentId === segmentId;
}

export function sketchConstraintUsesPoint(constraint: SketchConstraint, pointId: string) {
  if (constraint.kind === "fixed") return constraint.pointId === pointId;
  if (constraint.kind === "coincident") return constraint.pointIds.includes(pointId);
  if (constraint.kind === "concentric") return constraint.circleIds.some((circleId) => circleSketchPointId(circleId, "center") === pointId);
  if (constraint.kind === "midpoint" || constraint.kind === "pointOnObject") return constraint.pointId === pointId;
  if (constraint.kind === "pointOnCircle" || constraint.kind === "pointOnArc") return constraint.pointId === pointId;
  if (constraint.kind === "symmetric") return constraint.pointIds.includes(pointId);
  if (constraint.kind === "tangentLineCircle") return circleSketchPointId(constraint.circleId, "center") === pointId;
  if (constraint.kind === "tangentLineArc") return arcSketchPointId(constraint.arcId) === pointId;
  if (constraint.kind === "tangentCircles") return constraint.circleIds.some((circleId) => circleSketchPointId(circleId, "center") === pointId);
  return false;
}

function coincidentSketchPoints(profile: SketchProfile, firstId: string, secondId: string) {
  if (firstId === secondId) return true;
  const reached = new Set<string>();
  const pending = [firstId];
  while (pending.length) {
    const id = pending.pop();
    if (!id || reached.has(id)) continue;
    reached.add(id);
    for (const constraint of profile.constraints ?? []) {
      if (constraint.kind !== "coincident" || !constraint.pointIds.includes(id)) continue;
      const neighbor = constraint.pointIds[0] === id ? constraint.pointIds[1] : constraint.pointIds[0];
      if (neighbor === secondId) return true;
      pending.push(neighbor);
    }
  }
  return false;
}

export function sketchConstraintConflict(profile: SketchProfile, candidate: SketchConstraint) {
  const constraints = profile.constraints ?? [];
  if (candidate.kind === "tangentLineCircle") {
    const segment = sketchLine(profile, candidate.segmentId);
    const circle = profile.circles?.find((item) => item.id === candidate.circleId);
    if (!segment || !circle) return "Tangency requires a valid straight line and circle.";
    const centerId = circleSketchPointId(circle.id, "center");
    if (constraints.some((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, centerId, constraint.pointId))) return "The circle center is fixed; release it before applying tangency.";
  }
  if (candidate.kind === "tangentLineArc") {
    const line = sketchLine(profile, candidate.lineId);
    const arc = profile.segments.find((item) => item.id === candidate.arcId && item.kind === "arc" && item.center);
    if (!line || !arc?.center) return "Tangency requires a valid straight line and arc.";
    const centerId = arcSketchPointId(arc.id);
    if (constraints.some((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, centerId, constraint.pointId))) return "The arc center is fixed; release it before applying tangency.";
  }
  if (candidate.kind === "tangentCircles") {
    const circles = candidate.circleIds.map((id) => profile.circles?.find((circle) => circle.id === id));
    if (candidate.circleIds[0] === candidate.circleIds[1] || circles.some((circle) => !circle)) return "Tangency requires two different circles.";
    const fixedCenters = candidate.circleIds.map((circleId) => constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === circleSketchPointId(circleId, "center")));
    if (fixedCenters.every(Boolean) && circles[0] && circles[1]) {
      const distance = Math.hypot(circles[1].x - circles[0].x, circles[1].z - circles[0].z);
      if (Math.abs(distance - circles[0].radius - circles[1].radius) > 0.000001) return "Both centers are fixed and the circles are not tangent.";
    }
  }
  if (candidate.kind === "symmetric") {
    const [firstId, secondId] = candidate.pointIds;
    const first = sketchConstraintPoint(profile, firstId);
    const second = sketchConstraintPoint(profile, secondId);
    const axis = sketchLine(profile, candidate.segmentId);
    if (firstId === secondId || !first || !second || !axis) return "Symmetry requires two different points and a straight line as its axis.";
    if ([axis.startId, axis.endId].includes(firstId) || [axis.startId, axis.endId].includes(secondId)) return "Axis points cannot also be used as symmetric points.";
    const fixed = candidate.pointIds.map((pointId) => constraints.some((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, pointId, constraint.pointId)));
    if (fixed.every(Boolean)) return "Both points are fixed; release one before applying symmetry.";
  }
  if (candidate.kind === "midpoint" || candidate.kind === "pointOnObject") {
    const point = sketchConstraintPoint(profile, candidate.pointId);
    const segment = sketchLine(profile, candidate.segmentId);
    if (!point || !segment) return "The relation requires a valid point and straight line.";
    if (segment.startId === candidate.pointId || segment.endId === candidate.pointId) return candidate.kind === "midpoint" ? "A line endpoint cannot also be its midpoint." : "The endpoint already belongs to the line.";
    if (constraints.some((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, candidate.pointId, constraint.pointId))) return "The point is fixed; release it before applying this relation.";
  }
  if (candidate.kind === "pointOnCircle") {
    const point = sketchConstraintPoint(profile, candidate.pointId);
    const circle = profile.circles?.find((item) => item.id === candidate.circleId);
    if (!point || !circle) return "The relation requires a valid point and circle.";
    if ([circleSketchPointId(circle.id, "center"), circleSketchPointId(circle.id, "radius")].includes(candidate.pointId)) return "A circle control point already belongs to that circle.";
    if (constraints.some((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, candidate.pointId, constraint.pointId))) return "The point is fixed; release it before applying this relation.";
  }
  if (candidate.kind === "pointOnArc") {
    const point = sketchConstraintPoint(profile, candidate.pointId);
    const arc = profile.segments.find((item) => item.id === candidate.arcId && item.kind === "arc" && item.center);
    if (!point || !arc?.center) return "The relation requires a valid point and arc.";
    if ([arc.startId, arc.endId, arcSketchPointId(arc.id)].includes(candidate.pointId)) return "This point already belongs to that arc.";
    if (constraints.some((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, candidate.pointId, constraint.pointId))) return "The point is fixed; release it before applying this relation.";
  }
  if (candidate.kind === "equalLength") {
    const segments = candidate.segmentIds.map((id) => sketchLine(profile, id));
    if (candidate.segmentIds[0] === candidate.segmentIds[1] || segments.some((segment) => !segment)) return "Equality requires two different straight lines.";
    const lengths = candidate.segmentIds.map((segmentId) => constraints.find((constraint) => constraint.kind === "distance" && constraint.segmentId === segmentId && constraint.axis === "aligned"));
    if (lengths[0]?.kind === "distance" && lengths[1]?.kind === "distance" && Math.abs(lengths[0].value - lengths[1].value) > 0.000001) return "The lines have different length dimensions.";
  }
  if (candidate.kind === "concentric" || candidate.kind === "equalRadius") {
    const circles = candidate.circleIds.map((id) => profile.circles?.find((circle) => circle.id === id));
    if (candidate.circleIds[0] === candidate.circleIds[1] || circles.some((circle) => !circle)) return "The relation requires two different circles.";
    if (candidate.kind === "concentric") {
      const fixed = candidate.circleIds.map((circleId) => constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === circleSketchPointId(circleId, "center")));
      if (fixed[0]?.kind === "fixed" && fixed[1]?.kind === "fixed" && (Math.abs(fixed[0].x - fixed[1].x) > 0.000001 || Math.abs(fixed[0].z - fixed[1].z) > 0.000001)) return "The centers are fixed at different positions.";
    } else {
      const radii = candidate.circleIds.map((circleId) => constraints.find((constraint): constraint is Extract<SketchConstraint, { kind: "radius" | "diameter" }> => (constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === circleId));
      const values = radii.map((constraint) => constraint && (constraint.kind === "diameter" ? constraint.value / 2 : constraint.value));
      if (values[0] != null && values[1] != null && Math.abs(values[0] - values[1]) > 0.000001) return "The circles have different radius dimensions.";
    }
  }
  if (candidate.kind === "parallel" || candidate.kind === "perpendicular") {
    const [firstId, secondId] = candidate.segmentIds;
    if (firstId === secondId) return "Select two different lines.";
    const segments = candidate.segmentIds.map((id) => sketchLine(profile, id));
    if (segments.some((segment) => !segment)) return "The relation requires two valid straight lines.";
    const samePair = (constraint: Extract<SketchConstraint, { kind: "parallel" | "perpendicular" }>) => constraint.segmentIds.every((id) => candidate.segmentIds.includes(id));
    const opposite = candidate.kind === "parallel" ? "perpendicular" : "parallel";
    if (constraints.some((constraint) => constraint.kind === opposite && samePair(constraint))) return `The same lines cannot be both ${candidate.kind === "parallel" ? "parallel and perpendicular" : "perpendicular and parallel"}.`;
    if (constraints.some((constraint) => constraint.kind === "angle" && candidate.segmentIds.every((id) => constraint.segmentIds.includes(id)))) return "Remove the angular dimension between these lines first.";
    const fullyFixed = segments.map((segment) => segment && [segment.startId, segment.endId].every((id) => constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === id)));
    if (fullyFixed.every(Boolean)) return "Both lines are fully fixed and cannot be reoriented.";
  }
  if (candidate.kind === "horizontal" || candidate.kind === "vertical" || candidate.kind === "distance") {
    const segment = sketchLine(profile, candidate.segmentId);
    if (!segment) return "The selected geometry no longer exists.";
    if (sketchReferenceAxis(segment.id)) return "Reference axes already have a fixed direction and cannot receive this constraint.";
    if (coincidentSketchPoints(profile, segment.startId, segment.endId)) return "A line with coincident endpoints cannot be dimensioned or oriented.";
    const fixed = constraints.filter((constraint) => constraint.kind === "fixed" && (constraint.pointId === segment.startId || constraint.pointId === segment.endId));
    if (fixed.length === 2) return "Both endpoints are already fixed; this constraint would be redundant.";
    const onSegment = constraints.filter((constraint) => sketchConstraintUsesSegment(constraint, segment.id));
    if (candidate.kind === "horizontal") {
      if (onSegment.some((constraint) => constraint.kind === "vertical")) return "The same line cannot be both horizontal and vertical.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "z")) return "A horizontal line cannot have a non-zero Y distance.";
      if (onSegment.some((constraint) => constraint.kind === "angle")) return "Remove this line's angular dimension first.";
    } else if (candidate.kind === "vertical") {
      if (onSegment.some((constraint) => constraint.kind === "horizontal")) return "The same line cannot be both vertical and horizontal.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "x")) return "A vertical line cannot have a non-zero X distance.";
      if (onSegment.some((constraint) => constraint.kind === "angle")) return "Remove this line's angular dimension first.";
    } else if (candidate.kind === "distance") {
      if (candidate.axis === "x" && onSegment.some((constraint) => constraint.kind === "vertical")) return "A vertical line cannot have a non-zero X distance.";
      if (candidate.axis === "z" && onSegment.some((constraint) => constraint.kind === "horizontal")) return "A horizontal line cannot have a non-zero Y distance.";
      if (candidate.axis === "aligned" && onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis !== "aligned")) return "Length cannot be combined here with X or Y dimensions; remove those dimensions first.";
      if (candidate.axis !== "aligned" && onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "aligned")) return "An X/Y dimension cannot be combined here with a length; remove the length first.";
      if (candidate.axis !== "aligned" && onSegment.some((constraint) => constraint.kind === "angle")) return "An X/Y dimension cannot be combined with an angular dimension on the same line.";
    }
  }
  if (candidate.kind === "coincident") {
    const [firstId, secondId] = candidate.pointIds;
    const firstCirclePoint = circleSketchPointReference(firstId);
    const secondCirclePoint = circleSketchPointReference(secondId);
    if (firstCirclePoint && secondCirclePoint && firstCirclePoint.circleId === secondCirclePoint.circleId && firstCirclePoint.point !== secondCirclePoint.point) return "A circle center cannot coincide with its own radius point.";
    const segment = profile.segments.find((item) => (item.startId === firstId && item.endId === secondId) || (item.startId === secondId && item.endId === firstId));
    if (segment && constraints.some((constraint) => constraint.kind === "distance" && constraint.segmentId === segment.id)) return "The endpoints of a dimensioned line cannot be made coincident.";
    const firstFixed = constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === firstId);
    const secondFixed = constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === secondId);
    if (firstFixed?.kind === "fixed" && secondFixed?.kind === "fixed" && (Math.abs(firstFixed.x - secondFixed.x) > 0.000001 || Math.abs(firstFixed.z - secondFixed.z) > 0.000001)) return "Two points fixed at different positions cannot be made coincident.";
  }
  if (candidate.kind === "fixed") {
    const circlePoint = circleSketchPointReference(candidate.pointId);
    if (circlePoint?.point === "radius" && constraints.some((constraint) => (constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === circlePoint.circleId)) return "The radius point cannot be fixed while the circle has a radius or diameter dimension.";
    for (const segment of profile.segments.filter((item) => item.startId === candidate.pointId || item.endId === candidate.pointId)) {
      const otherId = segment.startId === candidate.pointId ? segment.endId : segment.startId;
      const otherFixed = constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === otherId);
      if (otherFixed && constraints.some((constraint) => sketchConstraintUsesSegment(constraint, segment.id))) return "Both endpoints cannot be fixed because the line already has constraints that would become redundant.";
    }
    const coincidentFixed = constraints.find((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, candidate.pointId, constraint.pointId));
    if (coincidentFixed?.kind === "fixed" && (Math.abs(coincidentFixed.x - candidate.x) > 0.000001 || Math.abs(coincidentFixed.z - candidate.z) > 0.000001)) return "This point coincides with another point fixed at a different position.";
  }
  if (candidate.kind === "angle") {
    for (const segmentId of candidate.segmentIds) {
      const onSegment = constraints.filter((constraint) => sketchConstraintUsesSegment(constraint, segmentId));
      if (onSegment.some((constraint) => constraint.kind === "angle")) return "The line already participates in an angular dimension; remove that dimension first.";
      if (onSegment.some((constraint) => constraint.kind === "horizontal" || constraint.kind === "vertical")) return "An angular dimension cannot be combined with a horizontal or vertical orientation on the same line.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis !== "aligned")) return "An angular dimension cannot be combined with X/Y dimensions on the same line.";
      if (onSegment.some((constraint) => constraint.kind === "parallel" || constraint.kind === "perpendicular")) return "Remove this line's parallel or perpendicular relation first.";
    }
  }
  if (candidate.kind === "radius" || candidate.kind === "diameter") {
    const opposite = candidate.kind === "radius" ? "diameter" : "radius";
    if (constraints.some((constraint) => constraint.kind === opposite && constraint.circleId === candidate.circleId)) return `The circle already has a ${opposite === "radius" ? "radius" : "diameter"} constraint; remove that dimension first.`;
    if (constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === circleSketchPointId(candidate.circleId, "radius"))) return "Remove the fixed constraint from the radius point first.";
  }
  if (candidate.kind === "arcRadius" || candidate.kind === "arcDiameter" || candidate.kind === "arcAngle") {
    const arc = profile.segments.find((segment) => segment.id === candidate.segmentId && segment.kind === "arc" && segment.center);
    if (!arc) return "The dimension requires a valid arc.";
    if (candidate.kind === "arcRadius" || candidate.kind === "arcDiameter") {
      const opposite = candidate.kind === "arcRadius" ? "arcDiameter" : "arcRadius";
      if (constraints.some((constraint) => constraint.kind === opposite && constraint.segmentId === candidate.segmentId)) return `The arc already has a ${opposite === "arcRadius" ? "radius" : "diameter"} constraint; remove that dimension first.`;
    }
    if (candidate.kind === "arcAngle" && (candidate.value <= 0 || candidate.value >= 360)) return "The arc angle must be between 0° and 360°.";
  }
  if ((candidate.kind === "distance" || candidate.kind === "radius" || candidate.kind === "diameter" || candidate.kind === "arcRadius" || candidate.kind === "arcDiameter") && (!Number.isFinite(candidate.value) || candidate.value <= 0)) return "The dimension must be greater than zero.";
  if (candidate.kind === "arcAngle" && !Number.isFinite(candidate.value)) return "The angle must be a valid number.";
  if (candidate.kind === "angle" && !Number.isFinite(candidate.value)) return "The angle must be a valid number.";
  const numerical = sketchConstraintRankGain(profile, candidate);
  if (numerical.gain === 0) return numerical.residual > 1e-3
    ? "This constraint is incompatible with the existing constraints."
    : "This constraint is redundant because the geometry is already defined that way.";
  return null;
}

export function solveSketchConstraints(profile: SketchProfile, drivingPointId?: string) {
  const constraints = profile.constraints ?? [];
  for (const constraint of constraints) {
    if (constraint.kind !== "radius" && constraint.kind !== "diameter") continue;
    const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
    if (circle) circle.radius = Math.max(0.001, Math.abs(constraint.value) / (constraint.kind === "diameter" ? 2 : 1));
  }
  for (const constraint of constraints) {
    if (constraint.kind !== "arcRadius" && constraint.kind !== "arcDiameter") continue;
    const arc = profile.segments.find((segment) => segment.id === constraint.segmentId && segment.kind === "arc" && segment.center);
    const start = arc ? profile.points.find((point) => point.id === arc.startId) : null;
    const end = arc ? profile.points.find((point) => point.id === arc.endId) : null;
    if (!arc?.center || !start || !end) continue;
    const radius = Math.max(0.001, Math.abs(constraint.value) / (constraint.kind === "arcDiameter" ? 2 : 1));
    const startAngle = Math.atan2(start.z - arc.center.z, start.x - arc.center.x);
    const endAngle = Math.atan2(end.z - arc.center.z, end.x - arc.center.x);
    start.x = arc.center.x + Math.cos(startAngle) * radius;
    start.z = arc.center.z + Math.sin(startAngle) * radius;
    end.x = arc.center.x + Math.cos(endAngle) * radius;
    end.z = arc.center.z + Math.sin(endAngle) * radius;
  }
  for (const constraint of constraints) {
    if (constraint.kind !== "arcAngle") continue;
    const arc = profile.segments.find((segment) => segment.id === constraint.segmentId && segment.kind === "arc" && segment.center);
    const start = arc ? profile.points.find((point) => point.id === arc.startId) : null;
    const end = arc ? profile.points.find((point) => point.id === arc.endId) : null;
    if (!arc?.center || !start || !end) continue;
    const radius = Math.max(0.001, Math.hypot(start.x - arc.center.x, start.z - arc.center.z));
    const startAngle = Math.atan2(start.z - arc.center.z, start.x - arc.center.x);
    const sweep = Math.min(359.999, Math.max(0.001, Math.abs(constraint.value))) * Math.PI / 180;
    const endAngle = startAngle + (arc.clockwise !== false ? 1 : -1) * sweep;
    end.x = arc.center.x + Math.cos(endAngle) * radius;
    end.z = arc.center.z + Math.sin(endAngle) * radius;
  }
  for (const constraint of constraints) {
    if (constraint.kind !== "equalRadius") continue;
    let reference = profile.circles?.find((circle) => circle.id === constraint.circleIds[0]);
    let target = profile.circles?.find((circle) => circle.id === constraint.circleIds[1]);
    if (!reference || !target) continue;
    const targetDriven = drivingPointId === circleSketchPointId(target.id, "radius");
    const referenceDriven = drivingPointId === circleSketchPointId(reference.id, "radius");
    const targetDimensioned = constraints.some((candidate) => (candidate.kind === "radius" || candidate.kind === "diameter") && candidate.circleId === target?.id);
    const referenceDimensioned = constraints.some((candidate) => (candidate.kind === "radius" || candidate.kind === "diameter") && candidate.circleId === reference?.id);
    if (targetDriven || (targetDimensioned && !referenceDriven && !referenceDimensioned)) [reference, target] = [target, reference];
    target.radius = reference.radius;
  }
  const virtualPoints = [
    ...SKETCH_REFERENCE_POINTS.map((point) => ({ ...point })),
    ...(profile.circles ?? []).flatMap((circle) => [circleSketchPointId(circle.id, "center"), circleSketchPointId(circle.id, "radius")].map((id) => sketchConstraintPoint(profile, id)).filter(Boolean) as SketchPoint[]),
    ...profile.segments.filter((segment) => segment.kind === "arc" && segment.center).map((segment) => ({ id: arcSketchPointId(segment.id), x: segment.center!.x, z: segment.center!.z })),
  ];
  const allPoints = [...profile.points, ...virtualPoints];
  const pointById = new Map(allPoints.map((point) => [point.id, point]));
  const segmentById = new Map([...profile.segments, ...SKETCH_REFERENCE_AXES].map((segment) => [segment.id, segment]));
  const neighbors = new Map(allPoints.map((point) => [point.id, [] as string[]]));
  for (const constraint of constraints) {
    const ids = constraint.kind === "coincident" ? constraint.pointIds
      : constraint.kind === "concentric" ? constraint.circleIds.map((circleId) => circleSketchPointId(circleId, "center")) as [string, string]
      : null;
    if (!ids) continue;
    neighbors.get(ids[0])?.push(ids[1]);
    neighbors.get(ids[1])?.push(ids[0]);
  }

  const componentByPoint = new Map<string, string[]>();
  for (const point of allPoints) {
    if (componentByPoint.has(point.id)) continue;
    const component: string[] = [];
    const pending = [point.id];
    while (pending.length) {
      const id = pending.pop();
      if (!id || componentByPoint.has(id)) continue;
      componentByPoint.set(id, component);
      component.push(id);
      neighbors.get(id)?.forEach((neighbor) => pending.push(neighbor));
    }
  }

  const fixedByPoint = new Map(constraints.filter((constraint): constraint is Extract<SketchConstraint, { kind: "fixed" }> => constraint.kind === "fixed").map((constraint) => [constraint.pointId, constraint]));
  for (const point of SKETCH_REFERENCE_POINTS) fixedByPoint.set(point.id, { id: `fixed:${point.id}`, kind: "fixed", pointId: point.id, x: point.x, z: point.z });
  const driven = new Set(drivingPointId ? componentByPoint.get(drivingPointId) ?? [drivingPointId] : []);
  const assignComponent = (pointId: string, axis: "x" | "z", value: number) => {
    const component = componentByPoint.get(pointId) ?? [pointId];
    const fixed = component.map((id) => fixedByPoint.get(id)).find(Boolean);
    const resolved = fixed ? fixed[axis] : value;
    for (const id of component) {
      const point = pointById.get(id);
      if (point) point[axis] = resolved;
    }
  };

  for (const component of new Set(componentByPoint.values())) {
    const fixed = component.map((id) => fixedByPoint.get(id)).find(Boolean);
    const source = fixed ? pointById.get(fixed.pointId) : drivingPointId && component.includes(drivingPointId) ? pointById.get(drivingPointId) : pointById.get(component[0]);
    if (!source) continue;
    assignComponent(component[0], "x", fixed?.x ?? source.x);
    assignComponent(component[0], "z", fixed?.z ?? source.z);
  }

  const directional = constraints.filter((constraint): constraint is Extract<SketchConstraint, { kind: "horizontal" | "vertical" }> => constraint.kind === "horizontal" || constraint.kind === "vertical");
  for (let pass = 0; pass < Math.max(1, directional.length); pass += 1) {
    for (const constraint of directional) {
      const segment = segmentById.get(constraint.segmentId);
      if (!segment || segment.kind !== "line") continue;
      const start = pointById.get(segment.startId);
      const end = pointById.get(segment.endId);
      if (!start || !end) continue;
      const startFixed = (componentByPoint.get(start.id) ?? [start.id]).some((id) => fixedByPoint.has(id));
      const endFixed = (componentByPoint.get(end.id) ?? [end.id]).some((id) => fixedByPoint.has(id));
      const startDriven = driven.has(start.id);
      const endDriven = driven.has(end.id);
      const moveStart = endFixed || (!startFixed && startDriven && !endDriven);
      const axis = constraint.kind === "horizontal" ? "z" : "x";
      if (moveStart) assignComponent(start.id, axis, end[axis]);
      else assignComponent(end.id, axis, start[axis]);
    }
  }

  const dimensions = constraints.filter((constraint): constraint is Extract<SketchConstraint, { kind: "distance" }> => constraint.kind === "distance");
  for (let pass = 0; pass < Math.max(1, dimensions.length); pass += 1) {
    for (const constraint of dimensions) {
      const segment = segmentById.get(constraint.segmentId);
      const start = segment ? pointById.get(segment.startId) : null;
      const end = segment ? pointById.get(segment.endId) : null;
      if (!segment || !start || !end) continue;
      const startFixed = (componentByPoint.get(start.id) ?? [start.id]).some((id) => fixedByPoint.has(id));
      const endFixed = (componentByPoint.get(end.id) ?? [end.id]).some((id) => fixedByPoint.has(id));
      const moveStart = endFixed || (!startFixed && driven.has(start.id) && !driven.has(end.id));
      const anchor = moveStart ? end : start;
      const moving = moveStart ? start : end;
      const value = Math.max(0.001, Math.abs(constraint.value));
      const dx = moving.x - anchor.x;
      const dz = moving.z - anchor.z;
      if (constraint.axis === "x") {
        const sign = Math.sign(dx) || (moveStart ? -1 : 1);
        assignComponent(moving.id, "x", anchor.x + sign * value);
      } else if (constraint.axis === "z") {
        const sign = Math.sign(dz) || (moveStart ? -1 : 1);
        assignComponent(moving.id, "z", anchor.z + sign * value);
      } else {
        const length = Math.hypot(dx, dz);
        const unitX = length > 0.000001 ? dx / length : moveStart ? -1 : 1;
        const unitZ = length > 0.000001 ? dz / length : 0;
        assignComponent(moving.id, "x", anchor.x + unitX * value);
        assignComponent(moving.id, "z", anchor.z + unitZ * value);
      }
    }
  }

  const equalLengths = constraints.filter((constraint): constraint is Extract<SketchConstraint, { kind: "equalLength" }> => constraint.kind === "equalLength");
  for (let pass = 0; pass < Math.max(1, equalLengths.length); pass += 1) {
    for (const constraint of equalLengths) {
      let reference = segmentById.get(constraint.segmentIds[0]);
      let target = segmentById.get(constraint.segmentIds[1]);
      if (!reference || !target) continue;
      const isDriven = (segment: NonNullable<typeof reference>) => driven.has(segment.startId) || driven.has(segment.endId);
      const isFullyFixed = (segment: NonNullable<typeof reference>) => [segment.startId, segment.endId].every((id) => (componentByPoint.get(id) ?? [id]).some((pointId) => fixedByPoint.has(pointId)));
      if (isDriven(target) || (isFullyFixed(target) && !isDriven(reference) && !isFullyFixed(reference))) [reference, target] = [target, reference];
      const referenceStart = pointById.get(reference.startId);
      const referenceEnd = pointById.get(reference.endId);
      const targetStart = pointById.get(target.startId);
      const targetEnd = pointById.get(target.endId);
      if (!referenceStart || !referenceEnd || !targetStart || !targetEnd) continue;
      const length = Math.max(0.001, Math.hypot(referenceEnd.x - referenceStart.x, referenceEnd.z - referenceStart.z));
      const dx = targetEnd.x - targetStart.x;
      const dz = targetEnd.z - targetStart.z;
      const currentLength = Math.hypot(dx, dz);
      const unitX = currentLength > 0.000001 ? dx / currentLength : 1;
      const unitZ = currentLength > 0.000001 ? dz / currentLength : 0;
      const startFixed = (componentByPoint.get(targetStart.id) ?? [targetStart.id]).some((id) => fixedByPoint.has(id));
      const endFixed = (componentByPoint.get(targetEnd.id) ?? [targetEnd.id]).some((id) => fixedByPoint.has(id));
      const moveStart = endFixed || (!startFixed && driven.has(targetStart.id) && !driven.has(targetEnd.id));
      if (moveStart) {
        assignComponent(targetStart.id, "x", targetEnd.x - unitX * length);
        assignComponent(targetStart.id, "z", targetEnd.z - unitZ * length);
      } else {
        assignComponent(targetEnd.id, "x", targetStart.x + unitX * length);
        assignComponent(targetEnd.id, "z", targetStart.z + unitZ * length);
      }
    }
  }

  const pointRelations = constraints.filter((constraint): constraint is Extract<SketchConstraint, { kind: "midpoint" | "pointOnObject" | "pointOnCircle" | "pointOnArc" }> => constraint.kind === "midpoint" || constraint.kind === "pointOnObject" || constraint.kind === "pointOnCircle" || constraint.kind === "pointOnArc");
  const applyPointRelations = () => {
    for (const constraint of pointRelations) {
      const point = pointById.get(constraint.pointId);
      if (!point) continue;
      if (constraint.kind === "pointOnCircle") {
        const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
        if (!circle) continue;
        const dx = point.x - circle.x;
        const dz = point.z - circle.z;
        const length = Math.hypot(dx, dz);
        assignComponent(point.id, "x", circle.x + (length > 0.000001 ? dx / length : 1) * circle.radius);
        assignComponent(point.id, "z", circle.z + (length > 0.000001 ? dz / length : 0) * circle.radius);
        continue;
      }
      if (constraint.kind === "pointOnArc") {
        const arc = segmentById.get(constraint.arcId);
        const start = arc ? pointById.get(arc.startId) : null;
        const end = arc ? pointById.get(arc.endId) : null;
        if (!arc || arc.kind !== "arc" || !arc.center || !start || !end) continue;
        const dx = point.x - arc.center.x;
        const dz = point.z - arc.center.z;
        const length = Math.hypot(dx, dz);
        const radius = Math.hypot(start.x - arc.center.x, start.z - arc.center.z);
        const fullTurn = Math.PI * 2;
        const startAngle = Math.atan2(start.z - arc.center.z, start.x - arc.center.x);
        const endAngle = Math.atan2(end.z - arc.center.z, end.x - arc.center.x);
        const candidateAngle = length > 0.000001 ? Math.atan2(dz, dx) : startAngle;
        const directedDistance = (from: number, to: number) => arc.clockwise !== false
          ? ((to - from) % fullTurn + fullTurn) % fullTurn
          : ((from - to) % fullTurn + fullTurn) % fullTurn;
        const sweep = directedDistance(startAngle, endAngle);
        const withinArc = directedDistance(startAngle, candidateAngle) <= sweep + 0.000001;
        const angle = withinArc ? candidateAngle
          : Math.abs(Math.atan2(Math.sin(candidateAngle - startAngle), Math.cos(candidateAngle - startAngle)))
            <= Math.abs(Math.atan2(Math.sin(candidateAngle - endAngle), Math.cos(candidateAngle - endAngle))) ? startAngle : endAngle;
        assignComponent(point.id, "x", arc.center.x + Math.cos(angle) * radius);
        assignComponent(point.id, "z", arc.center.z + Math.sin(angle) * radius);
        continue;
      }
      const segment = segmentById.get(constraint.segmentId);
      const start = segment ? pointById.get(segment.startId) : null;
      const end = segment ? pointById.get(segment.endId) : null;
      if (!point || !segment || segment.kind !== "line" || !start || !end) continue;
      let x = (start.x + end.x) / 2;
      let z = (start.z + end.z) / 2;
      if (constraint.kind === "pointOnObject") {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > 0.000001 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)) : 0;
        x = start.x + dx * t;
        z = start.z + dz * t;
      }
      assignComponent(point.id, "x", x);
      assignComponent(point.id, "z", z);
    }
  };

  const angularDistance = (first: number, second: number) => Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
  const pairRelations = constraints.filter((constraint): constraint is Extract<SketchConstraint, { kind: "parallel" | "perpendicular" }> => constraint.kind === "parallel" || constraint.kind === "perpendicular");
  for (let pass = 0; pass < Math.max(1, pairRelations.length); pass += 1) {
    for (const constraint of pairRelations) {
      let reference = segmentById.get(constraint.segmentIds[0]);
      let target = segmentById.get(constraint.segmentIds[1]);
      if (!reference || !target) continue;
      const segmentFullyFixed = (segment: NonNullable<typeof reference>) => [segment.startId, segment.endId].every((id) => (componentByPoint.get(id) ?? [id]).some((pointId) => fixedByPoint.has(pointId)));
      if (segmentFullyFixed(target) && !segmentFullyFixed(reference)) [reference, target] = [target, reference];
      const referenceStart = pointById.get(reference.startId);
      const referenceEnd = pointById.get(reference.endId);
      const targetStart = pointById.get(target.startId);
      const targetEnd = pointById.get(target.endId);
      if (!referenceStart || !referenceEnd || !targetStart || !targetEnd) continue;
      const referenceAngle = Math.atan2(referenceEnd.z - referenceStart.z, referenceEnd.x - referenceStart.x);
      const currentAngle = Math.atan2(targetEnd.z - targetStart.z, targetEnd.x - targetStart.x);
      const candidates = constraint.kind === "parallel"
        ? [referenceAngle, referenceAngle + Math.PI]
        : [referenceAngle + Math.PI / 2, referenceAngle - Math.PI / 2];
      const targetAngle = candidates.sort((first, second) => angularDistance(first, currentAngle) - angularDistance(second, currentAngle))[0];
      const length = Math.max(0.001, Math.hypot(targetEnd.x - targetStart.x, targetEnd.z - targetStart.z));
      const startFixed = (componentByPoint.get(targetStart.id) ?? [targetStart.id]).some((id) => fixedByPoint.has(id));
      const endFixed = (componentByPoint.get(targetEnd.id) ?? [targetEnd.id]).some((id) => fixedByPoint.has(id));
      const moveStart = endFixed || (!startFixed && driven.has(targetStart.id) && !driven.has(targetEnd.id));
      if (moveStart) {
        assignComponent(targetStart.id, "x", targetEnd.x - Math.cos(targetAngle) * length);
        assignComponent(targetStart.id, "z", targetEnd.z - Math.sin(targetAngle) * length);
      } else {
        assignComponent(targetEnd.id, "x", targetStart.x + Math.cos(targetAngle) * length);
        assignComponent(targetEnd.id, "z", targetStart.z + Math.sin(targetAngle) * length);
      }
    }
  }

  for (const constraint of constraints) {
    if (constraint.kind !== "angle") continue;
    const first = segmentById.get(constraint.segmentIds[0]);
    const second = constraint.segmentIds[1] ? segmentById.get(constraint.segmentIds[1]) : null;
    const target = second ?? first;
    if (!first || !target) continue;
    const referenceStart = pointById.get(first.startId);
    const referenceEnd = pointById.get(first.endId);
    const targetStart = pointById.get(target.startId);
    const targetEnd = pointById.get(target.endId);
    if (!referenceStart || !referenceEnd || !targetStart || !targetEnd) continue;
    const baseAngle = second ? Math.atan2(referenceEnd.z - referenceStart.z, referenceEnd.x - referenceStart.x) : 0;
    const targetAngle = baseAngle + constraint.value * Math.PI / 180;
    const length = Math.max(0.001, Math.hypot(targetEnd.x - targetStart.x, targetEnd.z - targetStart.z));
    const startFixed = (componentByPoint.get(targetStart.id) ?? [targetStart.id]).some((id) => fixedByPoint.has(id));
    const endFixed = (componentByPoint.get(targetEnd.id) ?? [targetEnd.id]).some((id) => fixedByPoint.has(id));
    const moveStart = endFixed || (!startFixed && driven.has(targetStart.id) && !driven.has(targetEnd.id));
    if (moveStart) {
      assignComponent(targetStart.id, "x", targetEnd.x - Math.cos(targetAngle) * length);
      assignComponent(targetStart.id, "z", targetEnd.z - Math.sin(targetAngle) * length);
    } else {
      assignComponent(targetEnd.id, "x", targetStart.x + Math.cos(targetAngle) * length);
      assignComponent(targetEnd.id, "z", targetStart.z + Math.sin(targetAngle) * length);
    }
  }

  applyPointRelations();

  for (const constraint of constraints) {
    if (constraint.kind === "tangentLineCircle") {
      const segment = segmentById.get(constraint.segmentId);
      const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
      const start = segment ? pointById.get(segment.startId) : null;
      const end = segment ? pointById.get(segment.endId) : null;
      const center = circle ? pointById.get(circleSketchPointId(circle.id, "center")) : null;
      if (!segment || segment.kind !== "line" || !circle || !start || !end || !center) continue;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.000001) continue;
      const unitX = dx / length;
      const unitZ = dz / length;
      const projection = (center.x - start.x) * unitX + (center.z - start.z) * unitZ;
      const baseX = start.x + projection * unitX;
      const baseZ = start.z + projection * unitZ;
      const normalX = -unitZ;
      const normalZ = unitX;
      const side = Math.sign((center.x - baseX) * normalX + (center.z - baseZ) * normalZ) || 1;
      assignComponent(center.id, "x", baseX + normalX * circle.radius * side);
      assignComponent(center.id, "z", baseZ + normalZ * circle.radius * side);
    }
    if (constraint.kind === "tangentLineArc") {
      const line = segmentById.get(constraint.lineId);
      const arc = segmentById.get(constraint.arcId);
      const start = line ? pointById.get(line.startId) : null;
      const end = line ? pointById.get(line.endId) : null;
      const arcStart = arc ? pointById.get(arc.startId) : null;
      const center = arc ? pointById.get(arcSketchPointId(arc.id)) : null;
      if (!line || line.kind !== "line" || !arc || arc.kind !== "arc" || !arc.center || !start || !end || !arcStart || !center) continue;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const radius = Math.hypot(arcStart.x - center.x, arcStart.z - center.z);
      if (length < 0.000001 || radius < 0.000001) continue;
      const unitX = dx / length;
      const unitZ = dz / length;
      const projection = (center.x - start.x) * unitX + (center.z - start.z) * unitZ;
      const baseX = start.x + projection * unitX;
      const baseZ = start.z + projection * unitZ;
      const normalX = -unitZ;
      const normalZ = unitX;
      const side = Math.sign((center.x - baseX) * normalX + (center.z - baseZ) * normalZ) || 1;
      assignComponent(center.id, "x", baseX + normalX * radius * side);
      assignComponent(center.id, "z", baseZ + normalZ * radius * side);
    }
    if (constraint.kind === "tangentCircles") {
      let reference = profile.circles?.find((circle) => circle.id === constraint.circleIds[0]);
      let target = profile.circles?.find((circle) => circle.id === constraint.circleIds[1]);
      if (!reference || !target) continue;
      const referenceId = circleSketchPointId(reference.id, "center");
      const targetId = circleSketchPointId(target.id, "center");
      const targetFixed = (componentByPoint.get(targetId) ?? [targetId]).some((id) => fixedByPoint.has(id));
      const referenceFixed = (componentByPoint.get(referenceId) ?? [referenceId]).some((id) => fixedByPoint.has(id));
      if (driven.has(referenceId) || (targetFixed && !referenceFixed)) [reference, target] = [target, reference];
      const referenceCenter = pointById.get(circleSketchPointId(reference.id, "center"));
      const targetCenter = pointById.get(circleSketchPointId(target.id, "center"));
      if (!referenceCenter || !targetCenter) continue;
      const dx = targetCenter.x - referenceCenter.x;
      const dz = targetCenter.z - referenceCenter.z;
      const distance = Math.hypot(dx, dz);
      const unitX = distance > 0.000001 ? dx / distance : 1;
      const unitZ = distance > 0.000001 ? dz / distance : 0;
      const tangentDistance = reference.radius + target.radius;
      assignComponent(targetCenter.id, "x", referenceCenter.x + unitX * tangentDistance);
      assignComponent(targetCenter.id, "z", referenceCenter.z + unitZ * tangentDistance);
    }
    if (constraint.kind === "symmetric") {
      let reference = pointById.get(constraint.pointIds[0]);
      let target = pointById.get(constraint.pointIds[1]);
      const axis = segmentById.get(constraint.segmentId);
      const axisStart = axis ? pointById.get(axis.startId) : null;
      const axisEnd = axis ? pointById.get(axis.endId) : null;
      if (!reference || !target || !axis || axis.kind !== "line" || !axisStart || !axisEnd) continue;
      const targetFixed = (componentByPoint.get(target.id) ?? [target.id]).some((id) => fixedByPoint.has(id));
      const referenceFixed = (componentByPoint.get(reference.id) ?? [reference.id]).some((id) => fixedByPoint.has(id));
      if (driven.has(reference.id) || (targetFixed && !referenceFixed)) [reference, target] = [target, reference];
      const dx = axisEnd.x - axisStart.x;
      const dz = axisEnd.z - axisStart.z;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared < 0.000001) continue;
      const projection = ((reference.x - axisStart.x) * dx + (reference.z - axisStart.z) * dz) / lengthSquared;
      const projectionX = axisStart.x + projection * dx;
      const projectionZ = axisStart.z + projection * dz;
      assignComponent(target.id, "x", projectionX * 2 - reference.x);
      assignComponent(target.id, "z", projectionZ * 2 - reference.z);
    }
  }

  for (const fixed of fixedByPoint.values()) {
    assignComponent(fixed.pointId, "x", fixed.x);
    assignComponent(fixed.pointId, "z", fixed.z);
  }
  for (const circle of profile.circles ?? []) {
    const centerId = circleSketchPointId(circle.id, "center");
    const radiusId = circleSketchPointId(circle.id, "radius");
    const center = pointById.get(centerId);
    const radiusPoint = pointById.get(radiusId);
    if (!center || !radiusPoint) continue;
    const centerReferenced = drivingPointId === centerId || constraints.some((constraint) => sketchConstraintUsesPoint(constraint, centerId));
    const radiusReferenced = drivingPointId === radiusId || constraints.some((constraint) => sketchConstraintUsesPoint(constraint, radiusId));
    if (centerReferenced) {
      circle.x = center.x;
      circle.z = center.z;
    }
    if (radiusReferenced) {
      circle.radius = Math.max(0.001, Math.hypot(radiusPoint.x - center.x, radiusPoint.z - center.z));
      circle.radiusAngle = Math.atan2(radiusPoint.z - center.z, radiusPoint.x - center.x);
    }
  }
  for (const arc of profile.segments.filter((segment) => segment.kind === "arc" && segment.center)) {
    const centerId = arcSketchPointId(arc.id);
    const center = pointById.get(centerId);
    if (!center || (drivingPointId !== centerId && !constraints.some((constraint) => sketchConstraintUsesPoint(constraint, centerId)))) continue;
    arc.center = { x: center.x, z: center.z };
  }
  return refineSketchConstraintsNumerically(profile, drivingPointId);
}
