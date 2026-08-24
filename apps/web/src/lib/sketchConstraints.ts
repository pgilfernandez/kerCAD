import type { SketchConstraint, SketchProfile } from "@/types/sketchforge";

export function sketchConstraintUsesSegment(constraint: SketchConstraint, segmentId: string) {
  return (constraint.kind === "horizontal" || constraint.kind === "vertical" || constraint.kind === "distance") && constraint.segmentId === segmentId;
}

export function sketchConstraintUsesPoint(constraint: SketchConstraint, pointId: string) {
  if (constraint.kind === "fixed") return constraint.pointId === pointId;
  if (constraint.kind === "coincident") return constraint.pointIds.includes(pointId);
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
  if (candidate.kind === "horizontal" || candidate.kind === "vertical" || candidate.kind === "distance") {
    const segment = profile.segments.find((item) => item.id === candidate.segmentId);
    if (!segment) return "La geometría seleccionada ya no existe.";
    if (coincidentSketchPoints(profile, segment.startId, segment.endId)) return "No se puede acotar ni orientar una línea cuyos extremos son coincidentes.";
    const fixed = constraints.filter((constraint) => constraint.kind === "fixed" && (constraint.pointId === segment.startId || constraint.pointId === segment.endId));
    if (fixed.length === 2) return "Los dos extremos ya están fijados; esta restricción sería redundante.";
    const onSegment = constraints.filter((constraint) => sketchConstraintUsesSegment(constraint, segment.id));
    if (candidate.kind === "horizontal") {
      if (onSegment.some((constraint) => constraint.kind === "vertical")) return "Una misma línea no puede ser horizontal y vertical.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "z")) return "Una línea horizontal no puede tener una distancia Y distinta de cero.";
    } else if (candidate.kind === "vertical") {
      if (onSegment.some((constraint) => constraint.kind === "horizontal")) return "Una misma línea no puede ser vertical y horizontal.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "x")) return "Una línea vertical no puede tener una distancia X distinta de cero.";
    } else if (candidate.kind === "distance") {
      if (candidate.axis === "x" && onSegment.some((constraint) => constraint.kind === "vertical")) return "Una línea vertical no puede tener una distancia X distinta de cero.";
      if (candidate.axis === "z" && onSegment.some((constraint) => constraint.kind === "horizontal")) return "Una línea horizontal no puede tener una distancia Y distinta de cero.";
      if (candidate.axis === "aligned" && onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis !== "aligned")) return "La longitud no puede combinarse aquí con cotas X o Y; elimina primero esas cotas.";
      if (candidate.axis !== "aligned" && onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "aligned")) return "La cota X/Y no puede combinarse aquí con una longitud; elimina primero la longitud.";
    }
  }
  if (candidate.kind === "coincident") {
    const [firstId, secondId] = candidate.pointIds;
    const segment = profile.segments.find((item) => (item.startId === firstId && item.endId === secondId) || (item.startId === secondId && item.endId === firstId));
    if (segment && constraints.some((constraint) => constraint.kind === "distance" && constraint.segmentId === segment.id)) return "No se pueden hacer coincidentes los extremos de una línea que tiene una cota de distancia.";
    const firstFixed = constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === firstId);
    const secondFixed = constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === secondId);
    if (firstFixed?.kind === "fixed" && secondFixed?.kind === "fixed" && (Math.abs(firstFixed.x - secondFixed.x) > 0.000001 || Math.abs(firstFixed.z - secondFixed.z) > 0.000001)) return "Dos puntos fijados en posiciones diferentes no pueden hacerse coincidentes.";
  }
  if (candidate.kind === "fixed") {
    for (const segment of profile.segments.filter((item) => item.startId === candidate.pointId || item.endId === candidate.pointId)) {
      const otherId = segment.startId === candidate.pointId ? segment.endId : segment.startId;
      const otherFixed = constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === otherId);
      if (otherFixed && constraints.some((constraint) => sketchConstraintUsesSegment(constraint, segment.id))) return "No se pueden fijar ambos extremos: la línea ya tiene restricciones que quedarían redundantes.";
    }
    const coincidentFixed = constraints.find((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, candidate.pointId, constraint.pointId));
    if (coincidentFixed?.kind === "fixed" && (Math.abs(coincidentFixed.x - candidate.x) > 0.000001 || Math.abs(coincidentFixed.z - candidate.z) > 0.000001)) return "Este punto coincide con otro punto fijado en una posición diferente.";
  }
  if ((candidate.kind === "distance" || candidate.kind === "radius") && (!Number.isFinite(candidate.value) || candidate.value <= 0)) return "La cota debe ser mayor que cero.";
  return null;
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

  for (const constraint of constraints) {
    if (constraint.kind !== "radius") continue;
    const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
    if (circle) circle.radius = Math.max(0.001, Math.abs(constraint.value));
  }

  for (const fixed of fixedByPoint.values()) {
    assignComponent(fixed.pointId, "x", fixed.x);
    assignComponent(fixed.pointId, "z", fixed.z);
  }
  return profile;
}
