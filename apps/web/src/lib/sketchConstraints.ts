import type { SketchConstraint, SketchPoint, SketchProfile } from "@/types/sketchforge";

export function circleSketchPointId(circleId: string, point: "center" | "radius") {
  return `circle:${circleId}:${point}`;
}

function circleSketchPointReference(id: string) {
  const match = /^circle:(.+):(center|radius)$/.exec(id);
  return match ? { circleId: match[1], point: match[2] as "center" | "radius" } : null;
}

export function sketchConstraintPoint(profile: SketchProfile, id: string): SketchPoint | null {
  const point = profile.points.find((candidate) => candidate.id === id);
  if (point) return point;
  const reference = circleSketchPointReference(id);
  const circle = reference ? profile.circles?.find((candidate) => candidate.id === reference.circleId) : null;
  if (!reference || !circle) return null;
  const angle = circle.radiusAngle ?? 0;
  return reference.point === "center"
    ? { id, x: circle.x, z: circle.z }
    : { id, x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius };
}

export function sketchConstraintUsesSegment(constraint: SketchConstraint, segmentId: string) {
  if (constraint.kind === "angle" || constraint.kind === "parallel" || constraint.kind === "perpendicular") return constraint.segmentIds.includes(segmentId);
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
  if (candidate.kind === "parallel" || candidate.kind === "perpendicular") {
    const [firstId, secondId] = candidate.segmentIds;
    if (firstId === secondId) return "Selecciona dos líneas diferentes.";
    const segments = candidate.segmentIds.map((id) => profile.segments.find((segment) => segment.id === id && segment.kind === "line"));
    if (segments.some((segment) => !segment)) return "La relación requiere dos líneas rectas válidas.";
    const samePair = (constraint: Extract<SketchConstraint, { kind: "parallel" | "perpendicular" }>) => constraint.segmentIds.every((id) => candidate.segmentIds.includes(id));
    const opposite = candidate.kind === "parallel" ? "perpendicular" : "parallel";
    if (constraints.some((constraint) => constraint.kind === opposite && samePair(constraint))) return `Las mismas líneas no pueden ser ${candidate.kind === "parallel" ? "paralelas y perpendiculares" : "perpendiculares y paralelas"}.`;
    if (constraints.some((constraint) => constraint.kind === "angle" && candidate.segmentIds.every((id) => constraint.segmentIds.includes(id)))) return "Elimina primero la cota angular entre estas líneas.";
    const fullyFixed = segments.map((segment) => segment && [segment.startId, segment.endId].every((id) => constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === id)));
    if (fullyFixed.every(Boolean)) return "Las dos líneas están completamente fijadas y no pueden reorientarse.";
  }
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
      if (onSegment.some((constraint) => constraint.kind === "angle")) return "Elimina primero la cota angular de esta línea.";
    } else if (candidate.kind === "vertical") {
      if (onSegment.some((constraint) => constraint.kind === "horizontal")) return "Una misma línea no puede ser vertical y horizontal.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "x")) return "Una línea vertical no puede tener una distancia X distinta de cero.";
      if (onSegment.some((constraint) => constraint.kind === "angle")) return "Elimina primero la cota angular de esta línea.";
    } else if (candidate.kind === "distance") {
      if (candidate.axis === "x" && onSegment.some((constraint) => constraint.kind === "vertical")) return "Una línea vertical no puede tener una distancia X distinta de cero.";
      if (candidate.axis === "z" && onSegment.some((constraint) => constraint.kind === "horizontal")) return "Una línea horizontal no puede tener una distancia Y distinta de cero.";
      if (candidate.axis === "aligned" && onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis !== "aligned")) return "La longitud no puede combinarse aquí con cotas X o Y; elimina primero esas cotas.";
      if (candidate.axis !== "aligned" && onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis === "aligned")) return "La cota X/Y no puede combinarse aquí con una longitud; elimina primero la longitud.";
      if (candidate.axis !== "aligned" && onSegment.some((constraint) => constraint.kind === "angle")) return "Una cota X/Y no puede combinarse con una cota angular en la misma línea.";
    }
  }
  if (candidate.kind === "coincident") {
    const [firstId, secondId] = candidate.pointIds;
    const firstCirclePoint = circleSketchPointReference(firstId);
    const secondCirclePoint = circleSketchPointReference(secondId);
    if (firstCirclePoint && secondCirclePoint && firstCirclePoint.circleId === secondCirclePoint.circleId && firstCirclePoint.point !== secondCirclePoint.point) return "El centro de un círculo no puede coincidir con su propio punto de radio.";
    const segment = profile.segments.find((item) => (item.startId === firstId && item.endId === secondId) || (item.startId === secondId && item.endId === firstId));
    if (segment && constraints.some((constraint) => constraint.kind === "distance" && constraint.segmentId === segment.id)) return "No se pueden hacer coincidentes los extremos de una línea que tiene una cota de distancia.";
    const firstFixed = constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === firstId);
    const secondFixed = constraints.find((constraint) => constraint.kind === "fixed" && constraint.pointId === secondId);
    if (firstFixed?.kind === "fixed" && secondFixed?.kind === "fixed" && (Math.abs(firstFixed.x - secondFixed.x) > 0.000001 || Math.abs(firstFixed.z - secondFixed.z) > 0.000001)) return "Dos puntos fijados en posiciones diferentes no pueden hacerse coincidentes.";
  }
  if (candidate.kind === "fixed") {
    const circlePoint = circleSketchPointReference(candidate.pointId);
    if (circlePoint?.point === "radius" && constraints.some((constraint) => (constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === circlePoint.circleId)) return "El punto radial no puede fijarse mientras el círculo tenga una cota de radio o diámetro.";
    for (const segment of profile.segments.filter((item) => item.startId === candidate.pointId || item.endId === candidate.pointId)) {
      const otherId = segment.startId === candidate.pointId ? segment.endId : segment.startId;
      const otherFixed = constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === otherId);
      if (otherFixed && constraints.some((constraint) => sketchConstraintUsesSegment(constraint, segment.id))) return "No se pueden fijar ambos extremos: la línea ya tiene restricciones que quedarían redundantes.";
    }
    const coincidentFixed = constraints.find((constraint) => constraint.kind === "fixed" && coincidentSketchPoints(profile, candidate.pointId, constraint.pointId));
    if (coincidentFixed?.kind === "fixed" && (Math.abs(coincidentFixed.x - candidate.x) > 0.000001 || Math.abs(coincidentFixed.z - candidate.z) > 0.000001)) return "Este punto coincide con otro punto fijado en una posición diferente.";
  }
  if (candidate.kind === "angle") {
    for (const segmentId of candidate.segmentIds) {
      const onSegment = constraints.filter((constraint) => sketchConstraintUsesSegment(constraint, segmentId));
      if (onSegment.some((constraint) => constraint.kind === "angle")) return "La línea ya participa en una cota angular; elimina primero esa cota.";
      if (onSegment.some((constraint) => constraint.kind === "horizontal" || constraint.kind === "vertical")) return "Una cota angular no puede combinarse con una orientación horizontal o vertical en la misma línea.";
      if (onSegment.some((constraint) => constraint.kind === "distance" && constraint.axis !== "aligned")) return "Una cota angular no puede combinarse con cotas X/Y en la misma línea.";
      if (onSegment.some((constraint) => constraint.kind === "parallel" || constraint.kind === "perpendicular")) return "Elimina primero la relación paralela o perpendicular de esta línea.";
    }
  }
  if (candidate.kind === "radius" || candidate.kind === "diameter") {
    const opposite = candidate.kind === "radius" ? "diameter" : "radius";
    if (constraints.some((constraint) => constraint.kind === opposite && constraint.circleId === candidate.circleId)) return `El círculo ya está restringido por ${opposite === "radius" ? "radio" : "diámetro"}; elimina primero esa cota.`;
    if (constraints.some((constraint) => constraint.kind === "fixed" && constraint.pointId === circleSketchPointId(candidate.circleId, "radius"))) return "Elimina primero la restricción fija del punto radial.";
  }
  if ((candidate.kind === "distance" || candidate.kind === "radius" || candidate.kind === "diameter") && (!Number.isFinite(candidate.value) || candidate.value <= 0)) return "La cota debe ser mayor que cero.";
  if (candidate.kind === "angle" && !Number.isFinite(candidate.value)) return "El ángulo debe ser un número válido.";
  return null;
}

export function solveSketchConstraints(profile: SketchProfile, drivingPointId?: string) {
  const constraints = profile.constraints ?? [];
  for (const constraint of constraints) {
    if (constraint.kind !== "radius" && constraint.kind !== "diameter") continue;
    const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
    if (circle) circle.radius = Math.max(0.001, Math.abs(constraint.value) / (constraint.kind === "diameter" ? 2 : 1));
  }
  const virtualPoints = (profile.circles ?? []).flatMap((circle) => [circleSketchPointId(circle.id, "center"), circleSketchPointId(circle.id, "radius")].map((id) => sketchConstraintPoint(profile, id)).filter(Boolean) as SketchPoint[]);
  const allPoints = [...profile.points, ...virtualPoints];
  const pointById = new Map(allPoints.map((point) => [point.id, point]));
  const segmentById = new Map(profile.segments.map((segment) => [segment.id, segment]));
  const neighbors = new Map(allPoints.map((point) => [point.id, [] as string[]]));
  for (const constraint of constraints) {
    if (constraint.kind !== "coincident") continue;
    neighbors.get(constraint.pointIds[0])?.push(constraint.pointIds[1]);
    neighbors.get(constraint.pointIds[1])?.push(constraint.pointIds[0]);
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
  return profile;
}
