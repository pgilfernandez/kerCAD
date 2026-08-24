import type { SketchConstraint, SketchProfile } from "@/types/sketchforge";

export function sketchConstraintUsesSegment(constraint: SketchConstraint, segmentId: string) {
  return (constraint.kind === "horizontal" || constraint.kind === "vertical") && constraint.segmentId === segmentId;
}

export function sketchConstraintUsesPoint(constraint: SketchConstraint, pointId: string) {
  if (constraint.kind === "fixed") return constraint.pointId === pointId;
  if (constraint.kind === "coincident") return constraint.pointIds.includes(pointId);
  return false;
}

export function solveSketchConstraints(profile: SketchProfile, drivingPointId?: string) {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const segmentById = new Map(profile.segments.map((segment) => [segment.id, segment]));
  const constraints = profile.constraints ?? [];
  const neighbors = new Map(profile.points.map((point) => [point.id, [] as string[]]));
  for (const constraint of constraints) {
    if (constraint.kind !== "coincident") continue;
    neighbors.get(constraint.pointIds[0])?.push(constraint.pointIds[1]);
    neighbors.get(constraint.pointIds[1])?.push(constraint.pointIds[0]);
  }

  const componentByPoint = new Map<string, string[]>();
  for (const point of profile.points) {
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
      const startDrives = startFixed || (!endFixed && (driven.has(start.id) || !driven.has(end.id)));
      const axis = constraint.kind === "horizontal" ? "z" : "x";
      if (startDrives) assignComponent(end.id, axis, start[axis]);
      else assignComponent(start.id, axis, end[axis]);
      (componentByPoint.get(startDrives ? end.id : start.id) ?? []).forEach((id) => driven.add(id));
    }
  }

  for (const fixed of fixedByPoint.values()) {
    assignComponent(fixed.pointId, "x", fixed.x);
    assignComponent(fixed.pointId, "z", fixed.z);
  }
  return profile;
}
