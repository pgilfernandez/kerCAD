import type { SketchConstraint, SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

const SKETCH_REFERENCE_POINTS: SketchPoint[] = [
  { id: "reference:origin", x: 0, z: 0 },
  { id: "reference:axis-x:start", x: -1, z: 0 },
  { id: "reference:axis-x:end", x: 1, z: 0 },
  { id: "reference:axis-y:start", x: 0, z: -1 },
  { id: "reference:axis-y:end", x: 0, z: 1 },
];

function sketchReferenceAxis(id: string): SketchSegment | null {
  if (id === "reference:axis-x") return { id, startId: "reference:axis-x:start", endId: "reference:axis-x:end", kind: "line", construction: true };
  if (id === "reference:axis-y") return { id, startId: "reference:axis-y:start", endId: "reference:axis-y:end", kind: "line", construction: true };
  return null;
}

type Variable = { key: string; get: () => number; set: (value: number) => void; locked: boolean };
type ResidualGroup = { id: string | null; values: number[] };

const EPSILON = 1e-7;

function circlePointReference(id: string) {
  const match = /^circle:(.+):(center|radius)$/.exec(id);
  return match ? { circleId: match[1], point: match[2] as "center" | "radius" } : null;
}

function pointFor(profile: SketchProfile, id: string): SketchPoint | null {
  const reference = SKETCH_REFERENCE_POINTS.find((candidate) => candidate.id === id);
  if (reference) return reference;
  const point = profile.points.find((candidate) => candidate.id === id);
  if (point) return point;
  const arc = profile.segments.find((segment) => segment.kind === "arc" && segment.center && `${segment.id}:center` === id);
  if (arc?.center) return { id, x: arc.center.x, z: arc.center.z };
  const circleReference = circlePointReference(id);
  const circle = circleReference ? profile.circles?.find((candidate) => candidate.id === circleReference.circleId) : null;
  if (!circleReference || !circle) return null;
  const angle = circle.radiusAngle ?? 0;
  return circleReference.point === "center"
    ? { id, x: circle.x, z: circle.z }
    : { id, x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius };
}

function linePoints(profile: SketchProfile, segmentId: string) {
  const segment = profile.segments.find((candidate) => candidate.id === segmentId && candidate.kind === "line") ?? sketchReferenceAxis(segmentId);
  const start = segment ? pointFor(profile, segment.startId) : null;
  const end = segment ? pointFor(profile, segment.endId) : null;
  return segment && start && end ? { segment, start, end } : null;
}

function segmentLength(profile: SketchProfile, segmentId: string) {
  const line = linePoints(profile, segmentId);
  return line ? Math.hypot(line.end.x - line.start.x, line.end.z - line.start.z) : 0;
}

function normalizedDirection(profile: SketchProfile, segmentId: string) {
  const line = linePoints(profile, segmentId);
  if (!line) return null;
  const dx = line.end.x - line.start.x;
  const dz = line.end.z - line.start.z;
  const length = Math.hypot(dx, dz);
  return length > EPSILON ? { x: dx / length, z: dz / length } : null;
}

function angleDifference(first: number, second: number) {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}

function constraintResiduals(profile: SketchProfile, constraint: SketchConstraint): number[] {
  if (constraint.kind === "horizontal" || constraint.kind === "vertical") {
    const line = linePoints(profile, constraint.segmentId);
    return line ? [constraint.kind === "horizontal" ? line.end.z - line.start.z : line.end.x - line.start.x] : [];
  }
  if (constraint.kind === "parallel" || constraint.kind === "perpendicular") {
    const first = normalizedDirection(profile, constraint.segmentIds[0]);
    const second = normalizedDirection(profile, constraint.segmentIds[1]);
    if (!first || !second) return [];
    return [constraint.kind === "parallel" ? first.x * second.z - first.z * second.x : first.x * second.x + first.z * second.z];
  }
  if (constraint.kind === "equalLength") return [segmentLength(profile, constraint.segmentIds[0]) - segmentLength(profile, constraint.segmentIds[1])];
  if (constraint.kind === "concentric" || constraint.kind === "equalRadius") {
    const circles = constraint.circleIds.map((id) => profile.circles?.find((circle) => circle.id === id));
    if (!circles[0] || !circles[1]) return [];
    return constraint.kind === "concentric" ? [circles[1].x - circles[0].x, circles[1].z - circles[0].z] : [circles[1].radius - circles[0].radius];
  }
  if (constraint.kind === "midpoint" || constraint.kind === "pointOnObject") {
    const point = pointFor(profile, constraint.pointId);
    const line = linePoints(profile, constraint.segmentId);
    if (!point || !line) return [];
    if (constraint.kind === "midpoint") return [point.x - (line.start.x + line.end.x) / 2, point.z - (line.start.z + line.end.z) / 2];
    const dx = line.end.x - line.start.x;
    const dz = line.end.z - line.start.z;
    const length = Math.hypot(dx, dz);
    return length > EPSILON ? [((point.x - line.start.x) * dz - (point.z - line.start.z) * dx) / length] : [];
  }
  if (constraint.kind === "pointOnCircle") {
    const point = pointFor(profile, constraint.pointId);
    const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
    return point && circle ? [Math.hypot(point.x - circle.x, point.z - circle.z) - circle.radius] : [];
  }
  if (constraint.kind === "pointOnArc") {
    const point = pointFor(profile, constraint.pointId);
    const arc = profile.segments.find((candidate) => candidate.id === constraint.arcId && candidate.kind === "arc" && candidate.center);
    const start = arc ? pointFor(profile, arc.startId) : null;
    return point && arc?.center && start ? [Math.hypot(point.x - arc.center.x, point.z - arc.center.z) - Math.hypot(start.x - arc.center.x, start.z - arc.center.z)] : [];
  }
  if (constraint.kind === "tangentLineCircle") {
    const line = linePoints(profile, constraint.segmentId);
    const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
    if (!line || !circle) return [];
    const dx = line.end.x - line.start.x;
    const dz = line.end.z - line.start.z;
    const length = Math.hypot(dx, dz);
    return length > EPSILON ? [Math.abs((circle.x - line.start.x) * dz - (circle.z - line.start.z) * dx) / length - circle.radius] : [];
  }
  if (constraint.kind === "tangentLineArc") {
    const line = linePoints(profile, constraint.lineId);
    const arc = profile.segments.find((candidate) => candidate.id === constraint.arcId && candidate.kind === "arc" && candidate.center);
    const start = arc ? pointFor(profile, arc.startId) : null;
    if (!line || !arc?.center || !start) return [];
    const dx = line.end.x - line.start.x;
    const dz = line.end.z - line.start.z;
    const length = Math.hypot(dx, dz);
    const radius = Math.hypot(start.x - arc.center.x, start.z - arc.center.z);
    return length > EPSILON ? [Math.abs((arc.center.x - line.start.x) * dz - (arc.center.z - line.start.z) * dx) / length - radius] : [];
  }
  if (constraint.kind === "tangentCircles") {
    const circles = constraint.circleIds.map((id) => profile.circles?.find((circle) => circle.id === id));
    return circles[0] && circles[1] ? [Math.hypot(circles[1].x - circles[0].x, circles[1].z - circles[0].z) - circles[0].radius - circles[1].radius] : [];
  }
  if (constraint.kind === "symmetric") {
    const reference = pointFor(profile, constraint.pointIds[0]);
    const target = pointFor(profile, constraint.pointIds[1]);
    const axis = linePoints(profile, constraint.segmentId);
    if (!reference || !target || !axis) return [];
    const dx = axis.end.x - axis.start.x;
    const dz = axis.end.z - axis.start.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < EPSILON) return [];
    const amount = ((reference.x - axis.start.x) * dx + (reference.z - axis.start.z) * dz) / lengthSquared;
    const projection = { x: axis.start.x + amount * dx, z: axis.start.z + amount * dz };
    return [target.x - (projection.x * 2 - reference.x), target.z - (projection.z * 2 - reference.z)];
  }
  if (constraint.kind === "coincident") {
    const first = pointFor(profile, constraint.pointIds[0]);
    const second = pointFor(profile, constraint.pointIds[1]);
    return first && second ? [second.x - first.x, second.z - first.z] : [];
  }
  if (constraint.kind === "fixed") {
    const point = pointFor(profile, constraint.pointId);
    return point ? [point.x - constraint.x, point.z - constraint.z] : [];
  }
  if (constraint.kind === "distance") {
    const line = linePoints(profile, constraint.segmentId);
    if (!line) return [];
    const dx = line.end.x - line.start.x;
    const dz = line.end.z - line.start.z;
    return [constraint.axis === "x" ? Math.abs(dx) - constraint.value : constraint.axis === "z" ? Math.abs(dz) - constraint.value : Math.hypot(dx, dz) - constraint.value];
  }
  if (constraint.kind === "radius" || constraint.kind === "diameter") {
    const circle = profile.circles?.find((candidate) => candidate.id === constraint.circleId);
    return circle ? [circle.radius - constraint.value / (constraint.kind === "diameter" ? 2 : 1)] : [];
  }
  if (constraint.kind === "arcRadius" || constraint.kind === "arcDiameter" || constraint.kind === "arcAngle") {
    const arc = profile.segments.find((segment) => segment.id === constraint.segmentId && segment.kind === "arc" && segment.center);
    const start = arc ? pointFor(profile, arc.startId) : null;
    const end = arc ? pointFor(profile, arc.endId) : null;
    if (!arc?.center || !start || !end) return [];
    const startRadius = Math.hypot(start.x - arc.center.x, start.z - arc.center.z);
    if (constraint.kind === "arcRadius" || constraint.kind === "arcDiameter") return [startRadius - constraint.value / (constraint.kind === "arcDiameter" ? 2 : 1)];
    const startAngle = Math.atan2(start.z - arc.center.z, start.x - arc.center.x);
    const endAngle = Math.atan2(end.z - arc.center.z, end.x - arc.center.x);
    const sweep = arc.clockwise !== false ? ((endAngle - startAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) : ((startAngle - endAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return [angleDifference(sweep, constraint.value * Math.PI / 180)];
  }
  if (constraint.kind === "angle") {
    const directions = constraint.segmentIds.map((id) => normalizedDirection(profile, id));
    if (!directions[0] || (constraint.segmentIds.length === 2 && !directions[1])) return [];
    const firstAngle = Math.atan2(directions[0].z, directions[0].x);
    const secondAngle = directions[1] ? Math.atan2(directions[1].z, directions[1].x) : 0;
    return [angleDifference((directions[1] ? secondAngle - firstAngle : firstAngle), constraint.value * Math.PI / 180)];
  }
  return [];
}

function residualGroups(profile: SketchProfile): ResidualGroup[] {
  const groups: ResidualGroup[] = [];
  for (const segment of profile.segments) {
    if (segment.kind === "arc" && segment.center) {
      const start = pointFor(profile, segment.startId);
      const end = pointFor(profile, segment.endId);
      if (start && end) groups.push({ id: null, values: [Math.hypot(start.x - segment.center.x, start.z - segment.center.z) - Math.hypot(end.x - segment.center.x, end.z - segment.center.z)] });
    }
  }
  for (const point of profile.points) {
    if (point.mode !== "smooth" || !point.handleIn || !point.handleOut) continue;
    const incoming = { x: point.handleIn.x - point.x, z: point.handleIn.z - point.z };
    const outgoing = { x: point.handleOut.x - point.x, z: point.handleOut.z - point.z };
    const scale = Math.max(EPSILON, Math.hypot(incoming.x, incoming.z) * Math.hypot(outgoing.x, outgoing.z));
    groups.push({ id: null, values: [(incoming.x * outgoing.z - incoming.z * outgoing.x) / scale] });
  }
  for (const constraint of profile.constraints ?? []) groups.push({ id: constraint.id, values: constraintResiduals(profile, constraint) });
  return groups;
}

function variablesFor(profile: SketchProfile, drivingPointId?: string): Variable[] {
  const variables: Variable[] = [];
  const add = (key: string, ownerId: string, get: () => number, set: (value: number) => void) => variables.push({ key, get, set, locked: ownerId === drivingPointId });
  for (const point of profile.points) {
    add(`${point.id}.x`, point.id, () => point.x, (value) => { point.x = value; });
    add(`${point.id}.z`, point.id, () => point.z, (value) => { point.z = value; });
    if (point.handleIn) {
      add(`${point.id}.handleIn.x`, `${point.id}:handleIn`, () => point.handleIn!.x, (value) => { point.handleIn!.x = value; });
      add(`${point.id}.handleIn.z`, `${point.id}:handleIn`, () => point.handleIn!.z, (value) => { point.handleIn!.z = value; });
    }
    if (point.handleOut) {
      add(`${point.id}.handleOut.x`, `${point.id}:handleOut`, () => point.handleOut!.x, (value) => { point.handleOut!.x = value; });
      add(`${point.id}.handleOut.z`, `${point.id}:handleOut`, () => point.handleOut!.z, (value) => { point.handleOut!.z = value; });
    }
  }
  for (const circle of profile.circles ?? []) {
    const centerId = `circle:${circle.id}:center`;
    const radiusId = `circle:${circle.id}:radius`;
    add(`${circle.id}.center.x`, centerId, () => circle.x, (value) => { circle.x = value; });
    add(`${circle.id}.center.z`, centerId, () => circle.z, (value) => { circle.z = value; });
    add(`${circle.id}.radius`, radiusId, () => circle.radius, (value) => { circle.radius = Math.max(0.001, value); });
  }
  for (const segment of profile.segments) {
    if (segment.kind !== "arc" || !segment.center) continue;
    add(`${segment.id}.center.x`, `${segment.id}:center`, () => segment.center!.x, (value) => { segment.center!.x = value; });
    add(`${segment.id}.center.z`, `${segment.id}:center`, () => segment.center!.z, (value) => { segment.center!.z = value; });
  }
  return variables;
}

function flatResiduals(profile: SketchProfile) {
  return residualGroups(profile).flatMap((group) => group.values);
}

function jacobian(profile: SketchProfile, variables: Variable[]) {
  const base = flatResiduals(profile);
  const matrix = Array.from({ length: base.length }, () => Array(variables.length).fill(0));
  if (!base.length || !variables.length) return { residuals: base, matrix };
  variables.forEach((variable, column) => {
    const original = variable.get();
    const step = Math.max(1e-6, Math.abs(original) * 1e-6);
    variable.set(original + step);
    const shifted = flatResiduals(profile);
    variable.set(original);
    for (let row = 0; row < base.length; row += 1) matrix[row][column] = ((shifted[row] ?? base[row]) - base[row]) / step;
  });
  return { residuals: base, matrix };
}

function matrixRank(source: number[][]) {
  if (!source.length || !source[0]?.length) return 0;
  const matrix = source.map((row) => [...row]);
  const maximum = Math.max(...matrix.flat().map(Math.abs), 0);
  const tolerance = Math.max(1e-8, maximum * Math.max(matrix.length, matrix[0].length) * 1e-7);
  let rank = 0;
  for (let column = 0; column < matrix[0].length && rank < matrix.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) <= tolerance) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column];
    for (let value = column; value < matrix[rank].length; value += 1) matrix[rank][value] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === rank) continue;
      const factor = matrix[row][column];
      if (Math.abs(factor) <= tolerance) continue;
      for (let value = column; value < matrix[row].length; value += 1) matrix[row][value] -= factor * matrix[rank][value];
    }
    rank += 1;
  }
  return rank;
}

function solveLinearSystem(matrix: number[][], values: number[]) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let value = column; value <= size; value += 1) augmented[column][value] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let value = column; value <= size; value += 1) augmented[row][value] -= factor * augmented[column][value];
    }
  }
  return augmented.map((row) => row[size]);
}

function squaredNorm(values: number[]) {
  return values.reduce((total, value) => total + value * value, 0);
}

export function refineSketchConstraintsNumerically(profile: SketchProfile, drivingPointId?: string) {
  const variables = variablesFor(profile, drivingPointId).filter((variable) => !variable.locked);
  if (!variables.length) return profile;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const currentResiduals = flatResiduals(profile);
    const currentNorm = squaredNorm(currentResiduals);
    if (!Number.isFinite(currentNorm) || currentNorm < 1e-12) break;
    const { residuals, matrix } = jacobian(profile, variables);
    const normal = Array.from({ length: variables.length }, () => Array(variables.length).fill(0));
    const right = Array(variables.length).fill(0);
    for (let row = 0; row < matrix.length; row += 1) for (let first = 0; first < variables.length; first += 1) {
      right[first] -= matrix[row][first] * residuals[row];
      for (let second = 0; second < variables.length; second += 1) normal[first][second] += matrix[row][first] * matrix[row][second];
    }
    for (let index = 0; index < variables.length; index += 1) normal[index][index] += 1e-6;
    const delta = solveLinearSystem(normal, right);
    if (!delta || delta.some((value) => !Number.isFinite(value))) break;
    const original = variables.map((variable) => variable.get());
    let accepted = false;
    for (const scale of [1, 0.5, 0.25, 0.125]) {
      variables.forEach((variable, index) => variable.set(original[index] + delta[index] * scale));
      if (squaredNorm(flatResiduals(profile)) < currentNorm) { accepted = true; break; }
    }
    if (!accepted) {
      variables.forEach((variable, index) => variable.set(original[index]));
      break;
    }
  }
  return profile;
}

export function sketchConstraintRankGain(profile: SketchProfile, candidate: SketchConstraint) {
  const variables = variablesFor(profile);
  const before = matrixRank(jacobian(profile, variables).matrix);
  const previous = profile.constraints;
  profile.constraints = [...(previous ?? []), candidate];
  const candidateResidual = constraintResiduals(profile, candidate);
  const after = matrixRank(jacobian(profile, variables).matrix);
  profile.constraints = previous;
  return { gain: after - before, residual: Math.sqrt(squaredNorm(candidateResidual)) };
}

export function analyzeSketchConstraints(profile: SketchProfile) {
  const variables = variablesFor(profile);
  const groups = residualGroups(profile);
  const { residuals, matrix } = jacobian(profile, variables);
  const rank = matrixRank(matrix);
  const degreesOfFreedom = Math.max(0, variables.length - rank);
  const maxResidual = residuals.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const conflictingConstraintIds = groups.filter((group) => group.id && group.values.some((value) => Math.abs(value) > 1e-3)).map((group) => group.id!)
  return {
    variableCount: variables.length,
    rank,
    degreesOfFreedom,
    maxResidual,
    conflictingConstraintIds,
    status: maxResidual > 1e-3 ? "over" as const : degreesOfFreedom === 0 && variables.length > 0 ? "full" as const : "under" as const,
  };
}
