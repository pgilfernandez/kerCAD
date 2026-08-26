import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";
import type { Edge, Face } from "brepjs";
import { parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
import { topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference, PrimitiveFeature, RenderMesh, SketchFeature } from "@/types/parametric";

type AnySolid = BrepSolid;
type CompoundShape = ReturnType<Brep["compound"]>;
type RenderableShape = AnySolid | CompoundShape;
type OperationSolidState = { before: AnySolid | null; after: AnySolid; added?: AnySolid | null; removed?: AnySolid | null };

function resultValue<T>(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]> | ReturnType<Brep["fillet"]>) {
  return brep.unwrap(result) as T;
}

function refinedBooleanSolid(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]>) {
  return brep.unwrap(brep.simplify(resultValue<AnySolid>(brep, result))) as AnySolid;
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    if ((current.y > point.y) !== (prior.y > point.y) && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) inside = !inside;
  }
  return inside;
}

function drawnSketchFaces(brep: Brep, sketch: SketchFeature): Face[] {
  if (sketch.profile.shape !== "drawn") throw new Error(`${sketch.name}: el perfil no es un boceto dibujado.`);
  const profile = sketch.profile.geometry;
  const points = new Map(profile.points.map((point) => [point.id, point]));
  const unused = new Map(profile.segments.filter((segment) => !segment.construction).map((segment) => [segment.id, segment]));
  const paths: Array<Array<{ segment: (typeof profile.segments)[number]; fromId: string; toId: string }>> = [];

  while (unused.size) {
    const first = unused.values().next().value;
    if (!first) break;
    const startId = first.startId;
    let currentId = startId;
    const path: Array<{ segment: (typeof profile.segments)[number]; fromId: string; toId: string }> = [];
    while (true) {
      const next = [...unused.values()].find((segment) => segment.startId === currentId || segment.endId === currentId);
      if (!next) break;
      unused.delete(next.id);
      const toId = next.startId === currentId ? next.endId : next.startId;
      path.push({ segment: next, fromId: currentId, toId });
      currentId = toId;
      if (currentId === startId) break;
    }
    if (currentId !== startId || path.length < 3) throw new Error(`${sketch.name}: cierra el perfil antes de usarlo en una operación 3D.`);
    paths.push(path);
  }
  const loops = [...paths.map((path) => {
    const polygon = path.map(({ fromId }) => {
      const point = points.get(fromId);
      if (!point) throw new Error(`${sketch.name}: el boceto contiene referencias incompletas.`);
      return { x: point.x, y: point.z };
    });
    const edges = path.map(({ segment, fromId, toId }) => {
      const from = points.get(fromId);
      const to = points.get(toId);
      if (!from || !to) throw new Error(`${sketch.name}: el boceto contiene referencias incompletas.`);
      const fromVec: [number, number, number] = [from.x, from.z, 0];
      const toVec: [number, number, number] = [to.x, to.z, 0];
      if (segment.kind === "arc" && segment.center) {
        const radius = Math.hypot(from.x - segment.center.x, from.z - segment.center.z);
        const startAngle = Math.atan2(from.z - segment.center.z, from.x - segment.center.x) * 180 / Math.PI;
        let endAngle = Math.atan2(to.z - segment.center.z, to.x - segment.center.x) * 180 / Math.PI;
        const forward = segment.startId === fromId;
        const positive = forward ? segment.clockwise !== false : segment.clockwise === false;
        if (positive) while (endAngle <= startAngle) endAngle += 360;
        else while (endAngle >= startAngle) endAngle -= 360;
        return brep.unwrap(brep.ellipseArc(radius, radius, startAngle, endAngle, { at: [segment.center.x, segment.center.z, 0] })) as Edge;
      }
      if (segment.kind === "line" || (!from.handleIn && !from.handleOut && !to.handleIn && !to.handleOut)) return brep.line(fromVec, toVec);
      const forward = segment.startId === fromId;
      const firstHandle = forward ? from.handleOut : from.handleIn;
      const secondHandle = forward ? to.handleIn : to.handleOut;
      if (!firstHandle || !secondHandle) return brep.line(fromVec, toVec);
      return brep.unwrap(brep.bezier([
        fromVec,
        [firstHandle.x, firstHandle.z, 0],
        [secondHandle.x, secondHandle.z, 0],
        toVec,
      ])) as Edge;
    });
    const wire = brep.unwrap(brep.wireLoop(edges));
    const area = Math.abs(polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2);
    return { wire, polygon, area, depth: 0 };
  }), ...(profile.circles ?? []).filter((circle) => !circle.construction && circle.radius > 0).map((circle) => {
    const polygon = Array.from({ length: 64 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return { x: circle.x + Math.cos(angle) * circle.radius, y: circle.z + Math.sin(angle) * circle.radius };
    });
    const edge = brep.circle(circle.radius, { at: [circle.x, circle.z, 0] });
    const wire = brep.unwrap(brep.wireLoop([edge]));
    return { wire, polygon, area: Math.PI * circle.radius ** 2, depth: 0 };
  })];
  if (!loops.length) throw new Error(`${sketch.name}: dibuja al menos un contorno cerrado.`);
  for (const loop of loops) loop.depth = loops.filter((candidate) => candidate !== loop && candidate.area > loop.area && pointInPolygon(loop.polygon[0], candidate.polygon)).length;
  const outerLoops = loops.filter((loop) => loop.depth % 2 === 0);
  return outerLoops.map((outer) => {
    const holes = loops.filter((candidate) => candidate.depth === outer.depth + 1 && pointInPolygon(candidate.polygon[0], outer.polygon));
    return brep.unwrap(brep.face(outer.wire as Parameters<Brep["face"]>[0], holes.map((hole) => hole.wire) as Parameters<Brep["face"]>[1])) as Face;
  });
}

function combineSketchSolids(brep: Brep, solids: AnySolid[]) {
  if (!solids.length) throw new Error("El boceto no contiene ninguna región rellena.");
  return solids.slice(1).reduce((current, solid) => refinedBooleanSolid(brep, brep.fuse(current, solid)), solids[0]);
}

function solidFromSketch(brep: Brep, sketch: SketchFeature, feature: ExtrudeFeature): AnySolid {
  const profile = sketch.profile;
  if (profile.shape === "drawn") {
    const solids = drawnSketchFaces(brep, sketch).map((sourceFace) => {
      const face = feature.symmetric ? brep.translate(sourceFace, [0, 0, -feature.distance / 2]) as Face : sourceFace;
      return brep.unwrap(brep.extrude(face as Parameters<Brep["extrude"]>[0], feature.distance)) as AnySolid;
    });
    const solid = applySketchTransform(brep, combineSketchSolids(brep, solids), sketch);
    return applyOperationTransform(brep, solid, feature.transform);
  }
  const centerZ = feature.symmetric ? 0 : feature.distance / 2;
  let solid: AnySolid;
  if (profile.shape === "rectangle") {
    solid = brep.box(profile.width, profile.depth, feature.distance, {
      centered: true,
      at: [0, 0, centerZ],
    });
  } else {
    solid = brep.cylinder(profile.diameter / 2, feature.distance, {
      centered: true,
      at: [0, 0, centerZ],
    });
  }
  return applyOperationTransform(brep, applySketchTransform(brep, solid, sketch), feature.transform);
}

function facesFromSketch(brep: Brep, sketch: SketchFeature): Face[] {
  if (sketch.profile.shape === "drawn") return drawnSketchFaces(brep, sketch).map((face) => applySketchTransform(brep, face, sketch));
  if (sketch.profile.shape === "rectangle") {
    const halfWidth = sketch.profile.width / 2;
    const halfDepth = sketch.profile.depth / 2;
    const face = brep.unwrap(brep.polygon([
      [-halfWidth, -halfDepth, 0],
      [halfWidth, -halfDepth, 0],
      [halfWidth, halfDepth, 0],
      [-halfWidth, halfDepth, 0],
    ])) as Face;
    return [applySketchTransform(brep, face, sketch)];
  }
  const edge = brep.circle(sketch.profile.diameter / 2, { at: [0, 0, 0] });
  const wire = brep.unwrap(brep.wireLoop([edge]));
  return [applySketchTransform(brep, brep.unwrap(brep.face(wire as Parameters<Brep["face"]>[0])) as Face, sketch)];
}

function applySketchTransform<T extends AnySolid | Face>(brep: Brep, shape: T, sketch: SketchFeature): T {
  let transformed = shape;
  if (sketch.rotation.x) transformed = brep.rotate(transformed as AnySolid, sketch.rotation.x, { axis: [1, 0, 0] }) as unknown as T;
  if (sketch.rotation.y) transformed = brep.rotate(transformed as AnySolid, sketch.rotation.y, { axis: [0, 1, 0] }) as unknown as T;
  if (sketch.rotation.z) transformed = brep.rotate(transformed as AnySolid, sketch.rotation.z, { axis: [0, 0, 1] }) as unknown as T;
  if (sketch.x || sketch.y || sketch.offset) transformed = brep.translate(transformed as AnySolid, [sketch.x, sketch.y, sketch.offset]) as unknown as T;
  return transformed;
}

function applyOperationTransform(brep: Brep, solid: AnySolid, operation: ExtrudeFeature["transform"]): AnySolid {
  if (operation.rotation.x) solid = brep.rotate(solid, operation.rotation.x, { axis: [1, 0, 0] });
  if (operation.rotation.y) solid = brep.rotate(solid, operation.rotation.y, { axis: [0, 1, 0] });
  if (operation.rotation.z) solid = brep.rotate(solid, operation.rotation.z, { axis: [0, 0, 1] });
  if (operation.position.x || operation.position.y || operation.position.z) {
    solid = brep.translate(solid, [operation.position.x, operation.position.y, operation.position.z]);
  }
  return solid;
}

function polyhedronSolid(brep: Brep, points: Array<[number, number, number]>, faces: number[][]): AnySolid {
  return brep.unwrap(brep.polyhedron(points, faces)) as AnySolid;
}

function angularPrimitiveSolid(brep: Brep, feature: PrimitiveFeature): AnySolid {
  const halfWidth = feature.width / 2;
  const halfDepth = feature.depth / 2;
  if (feature.primitive === "pyramid") {
    return polyhedronSolid(brep, [
      [-halfWidth, -halfDepth, 0], [halfWidth, -halfDepth, 0], [halfWidth, halfDepth, 0], [-halfWidth, halfDepth, 0], [0, 0, feature.height],
    ], [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]);
  }
  if (feature.primitive === "wedge") {
    return polyhedronSolid(brep, [
      [-halfWidth, -halfDepth, 0], [halfWidth, -halfDepth, 0], [halfWidth, halfDepth, 0], [-halfWidth, halfDepth, 0],
      [-halfWidth, -halfDepth, feature.height], [-halfWidth, halfDepth, feature.height],
    ], [[0, 3, 2, 1], [0, 1, 4], [3, 5, 2], [0, 4, 5, 3], [1, 2, 5, 4]]);
  }
  return polyhedronSolid(brep, [
    [-halfWidth, -halfDepth, 0], [halfWidth, -halfDepth, 0], [-halfWidth, halfDepth, 0], [halfWidth, halfDepth, 0],
    [0, -halfDepth, feature.height], [0, halfDepth, feature.height],
  ], [[0, 2, 3, 1], [0, 1, 4], [2, 5, 3], [0, 4, 5, 2], [1, 3, 5, 4]]);
}

function roundRoofSolid(brep: Brep, feature: PrimitiveFeature): AnySolid {
  const unitCylinder = brep.cylinder(1, feature.depth, { axis: [0, 1, 0], at: [0, -feature.depth / 2, 0] });
  const ellipticalCylinder = brep.unwrap(brep.applyMatrix(unitCylinder, {
    linear: [feature.width / 2, 0, 0, 0, 1, 0, 0, 0, feature.height],
    translation: [0, 0, 0],
  })) as AnySolid;
  const clip = brep.box(feature.width + 2, feature.depth + 2, feature.height + 1, { centered: true, at: [0, 0, (feature.height + 1) / 2] });
  return refinedBooleanSolid(brep, brep.intersect(ellipticalCylinder, clip));
}

function polygonPrismSolid(brep: Brep, feature: PrimitiveFeature): AnySolid {
  const sides = Math.min(32, Math.max(3, Math.round(feature.sides ?? 6)));
  const radius = feature.width / 2;
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = index / sides * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0] as [number, number, number];
  });
  const face = brep.unwrap(brep.polygon(points));
  return brep.unwrap(brep.extrude(face, feature.height)) as AnySolid;
}

function educationalGearSolid(brep: Brep, feature: PrimitiveFeature): AnySolid {
  const outerRadius = feature.width / 2;
  const toothDepth = Math.min(outerRadius - 0.2, Math.max(0.2, feature.toothDepth ?? 2.5));
  const rootRadius = outerRadius - toothDepth;
  const teeth = Math.min(64, Math.max(6, Math.round(feature.teeth ?? 12)));
  const toothWidth = Math.max(0.2, Math.PI * 2 * rootRadius / teeth * 0.48);
  const shapes: AnySolid[] = [brep.cylinder(rootRadius, feature.height, { at: [0, 0, 0] })];
  for (let index = 0; index < teeth; index += 1) {
    const tooth = brep.box(toothWidth, toothDepth + 0.2, feature.height, {
      centered: true,
      at: [0, rootRadius + toothDepth / 2 - 0.1, feature.height / 2],
    });
    shapes.push(brep.rotate(tooth, index * 360 / teeth, { axis: [0, 0, 1] }));
  }
  let gear = brep.unwrap(brep.fuseAll(shapes, { simplify: true })) as AnySolid;
  const boreRadius = Math.min(rootRadius - 0.1, Math.max(0, feature.boreRadius ?? 3));
  if (boreRadius > 0) {
    const bore = brep.cylinder(boreRadius, feature.height + 2, { at: [0, 0, -1] });
    gear = refinedBooleanSolid(brep, brep.cut(gear, bore));
  }
  return gear;
}

function solidFromPrimitive(brep: Brep, feature: PrimitiveFeature): AnySolid {
  if (feature.width <= 0 || feature.depth <= 0 || feature.height <= 0) {
    throw new Error(`${feature.name}: todas las dimensiones deben ser mayores que cero.`);
  }
  if (feature.primitive === "cone" && (feature.topRadius ?? 0) < 0) {
    throw new Error(`${feature.name}: el radio superior no puede ser negativo.`);
  }
  if (feature.primitive === "tube" && ((feature.innerRadius ?? 0) <= 0 || (feature.innerRadius ?? 0) >= feature.width / 2)) {
    throw new Error(`${feature.name}: el radio interior debe ser mayor que cero y menor que el exterior.`);
  }
  if (feature.primitive === "torus" && ((feature.tubeRadius ?? 0) <= 0 || (feature.majorRadius ?? 0) <= (feature.tubeRadius ?? 0))) {
    throw new Error(`${feature.name}: el radio mayor debe ser mayor que el radio del tubo.`);
  }
  if (feature.primitive === "gear" && ((feature.toothDepth ?? 0) <= 0 || (feature.toothDepth ?? 0) >= feature.width / 2 || (feature.boreRadius ?? 0) >= feature.width / 2 - (feature.toothDepth ?? 0))) {
    throw new Error(`${feature.name}: la profundidad de diente y el radio del eje no caben en el radio exterior.`);
  }
  let solid: AnySolid;
  if (feature.primitive === "cone") {
    solid = brep.cone(feature.width / 2, feature.topRadius ?? 0, feature.height, { at: [0, 0, 0] });
  } else if (feature.primitive === "tube") {
    const outer = brep.cylinder(feature.width / 2, feature.height, { at: [0, 0, 0] });
    const inner = brep.cylinder(feature.innerRadius ?? 0, feature.height + 2, { at: [0, 0, -1] });
    solid = refinedBooleanSolid(brep, brep.cut(outer, inner));
  } else if (feature.primitive === "halfSphere") {
    const ellipsoid = brep.ellipsoid(feature.width / 2, feature.depth / 2, feature.height, { at: [0, 0, 0] });
    const clip = brep.box(feature.width + 2, feature.depth + 2, feature.height + 1, { centered: true, at: [0, 0, (feature.height + 1) / 2] });
    solid = refinedBooleanSolid(brep, brep.intersect(ellipsoid, clip));
  } else if (feature.primitive === "torus") {
    const tubeRadius = feature.tubeRadius ?? 4;
    solid = brep.torus(feature.majorRadius ?? 12, tubeRadius, { at: [0, 0, 0] });
  } else if (feature.primitive === "pyramid" || feature.primitive === "wedge" || feature.primitive === "roof") {
    solid = angularPrimitiveSolid(brep, feature);
  } else if (feature.primitive === "roundRoof") {
    solid = roundRoofSolid(brep, feature);
  } else if (feature.primitive === "polygon") {
    solid = polygonPrismSolid(brep, feature);
  } else if (feature.primitive === "gear") {
    solid = educationalGearSolid(brep, feature);
  } else {
    solid = brep.ellipsoid(feature.width / 2, feature.depth / 2, feature.height / 2, { at: [0, 0, 0] });
  }
  return applyOperationTransform(brep, solid, feature.transform);
}

function applyBooleanOperation(
  brep: Brep,
  current: AnySolid | null,
  tool: AnySolid,
  feature: Pick<ExtrudeFeature | PrimitiveFeature, "name" | "operation">,
) {
  if (!current) {
    if (feature.operation !== "add") throw new Error(`${feature.name}: la primera operación del objeto debe ser Añadir.`);
    return tool;
  }
  if (feature.operation === "add") return refinedBooleanSolid(brep, brep.fuse(current, tool));
  if (feature.operation === "cut") return refinedBooleanSolid(brep, brep.cut(current, tool));
  return refinedBooleanSolid(brep, brep.intersect(current, tool));
}

function applyObjectTransform<T extends RenderableShape>(brep: Brep, solid: T, object?: ParametricObject): T {
  if (!object) return solid;
  const { position, rotation, scale } = object.transform;
  if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
    solid = brep.unwrap(brep.applyMatrix(solid, {
      linear: [scale.x, 0, 0, 0, scale.y, 0, 0, 0, scale.z],
      translation: [0, 0, 0],
    })) as T;
  }
  if (rotation.x) solid = brep.rotate(solid, rotation.x, { axis: [1, 0, 0] }) as T;
  if (rotation.y) solid = brep.rotate(solid, rotation.y, { axis: [0, 1, 0] }) as T;
  if (rotation.z) solid = brep.rotate(solid, rotation.z, { axis: [0, 0, 1] }) as T;
  if (position.x || position.y || position.z) solid = brep.translate(solid, [position.x, position.y, position.z]) as T;
  return solid;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function combinedObjectShape(brep: Brep, solids: Map<string, AnySolid>): RenderableShape | null {
  const values = [...solids.values()];
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return brep.compound(values);
}

export function parametricObjectRenderId(objectId: string) {
  return `object:${objectId}`;
}

function worldObjectSolids(brep: Brep, solids: Map<string, AnySolid>, objects: Map<string, ParametricObject>, visibleOnly = false) {
  return new Map([...solids]
    .filter(([objectId]) => !visibleOnly || objects.get(objectId)?.visible !== false)
    .map(([objectId, solid]) => [objectId, applyObjectTransform(brep, solid, objects.get(objectId))]));
}

function objectRenderRecords(brep: Brep, document: ParametricDocument, worldSolids: Map<string, AnySolid>, objects: Map<string, ParametricObject>): ParametricObjectRenderRecord[] {
  return [...worldSolids].map(([objectId, solid]) => {
    const object = objects.get(objectId);
    return {
      objectId,
      renderId: parametricObjectRenderId(objectId),
      geometryFingerprint: parametricObjectGeometryFingerprint(document, objectId),
      color: object?.color ?? "#d41721",
      worldTransform: structuredClone(object?.transform ?? {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }),
      mesh: meshShape(brep, solid),
    };
  });
}

function buildRenderOutput(brep: Brep, document: ParametricDocument, solids: Map<string, AnySolid>, objects: Map<string, ParametricObject>) {
  const worldSolids = worldObjectSolids(brep, solids, objects, true);
  const combined = combinedObjectShape(brep, worldSolids);
  return {
    mesh: combined ? meshShape(brep, combined) : null,
    objectRecords: objectRenderRecords(brep, document, worldSolids, objects),
  };
}

function topologyReferenceSpace(document: ParametricDocument, objectId?: string) {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  const rotateInverse = (value: [number, number, number]) => {
    let [x, y, z] = value;
    if (object) for (const [angle, axis] of [[-object.transform.rotation.z, "z"], [-object.transform.rotation.y, "y"], [-object.transform.rotation.x, "x"]] as const) {
      const radians = angle * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      if (axis === "z") [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
      if (axis === "y") [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];
      if (axis === "x") [y, z] = [y * cosine - z * sine, y * sine + z * cosine];
    }
    return [x, y, z] as [number, number, number];
  };
  const averageScale = object ? (Math.abs(object.transform.scale.x) + Math.abs(object.transform.scale.y) + Math.abs(object.transform.scale.z)) / 3 : 1;
  return {
    point: (point: [number, number, number]) => {
      const translated: [number, number, number] = object ? [point[0] - object.transform.position.x, point[1] - object.transform.position.y, point[2] - object.transform.position.z] : point;
      const rotated = rotateInverse(translated);
      return object ? [rotated[0] / object.transform.scale.x, rotated[1] / object.transform.scale.y, rotated[2] / object.transform.scale.z] as [number, number, number] : rotated;
    },
    direction: (direction: [number, number, number]) => {
      const rotated = rotateInverse(direction);
      const length = Math.hypot(rotated[0], rotated[1], rotated[2]) || 1;
      return [rotated[0] / length, rotated[1] / length, rotated[2] / length] as [number, number, number];
    },
    lengthScale: Math.max(0.0001, averageScale),
    areaScale: Math.max(0.0001, averageScale * averageScale),
  };
}

function resolveStoredFace(brep: Brep, document: ParametricDocument, current: AnySolid, stored: ParametricTopologyReference, featureName: string) {
  if (stored.reference.hint.entityType !== "face") throw new Error(`${featureName}: la referencia no es una cara.`);
  const candidates = brep.getFaces(current);
  const hint = stored.reference.hint;
  const space = topologyReferenceSpace(document, stored.objectId);
  let face: Face | undefined;
  if (hint.centroid && hint.area !== undefined) {
    const targetCenter = space.point(hint.centroid);
    const targetArea = hint.area / space.areaScale;
    const targetNormal = hint.normal ? space.direction(hint.normal) : null;
    const nearest = candidates.map((candidate) => {
      const center = brep.faceCenter(candidate as Parameters<Brep["faceCenter"]>[0]);
      const area = brep.unwrapOr(brep.measureArea(candidate), targetArea);
      const centerDistance = Math.hypot(center[0] - targetCenter[0], center[1] - targetCenter[1], center[2] - targetCenter[2]) / Math.max(1, Math.sqrt(Math.abs(targetArea)));
      const areaDifference = Math.abs(area - targetArea) / Math.max(1, Math.abs(targetArea));
      const normalDifference = targetNormal ? (() => { const normal = brep.normalAt(candidate as Parameters<Brep["normalAt"]>[0]); return 1 - Math.abs(normal[0] * targetNormal[0] + normal[1] * targetNormal[1] + normal[2] * targetNormal[2]); })() : 0;
      return { candidate, score: centerDistance + areaDifference + normalDifference };
    }).sort((a, b) => a.score - b.score)[0];
    if (nearest && nearest.score <= 0.5) face = nearest.candidate as Face;
  } else if (hint.topologyId !== undefined) face = candidates.find((candidate) => brep.getHashCode(candidate) === hint.topologyId) as Face | undefined;
  if (face) return face;
  const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
  if (!resolution.ok) throw new Error(`${featureName}: no se pudo recuperar una cara (${resolution.reason}).`);
  return resolution.entity as Face;
}

function resolveStoredEdge(brep: Brep, document: ParametricDocument, current: AnySolid, stored: ParametricTopologyReference, featureName: string) {
  if (stored.reference.hint.entityType !== "edge") throw new Error(`${featureName}: la referencia no es una arista.`);
  const candidates = brep.getEdges(current) as Edge[];
  const hint = stored.reference.hint;
  const space = topologyReferenceSpace(document, stored.objectId);
  let edge: Edge | undefined;
  if (hint.midpoint) {
    const target = space.point(hint.midpoint);
    const targetLength = hint.length === undefined ? 1 : hint.length / space.lengthScale;
    const nearest = candidates.map((candidate) => {
      const midpoint = brep.curvePointAt(candidate, 0.5);
      const length = brep.unwrapOr(brep.measureLength(candidate), targetLength);
      return { candidate, score: (Math.hypot(midpoint[0] - target[0], midpoint[1] - target[1], midpoint[2] - target[2]) + Math.abs(length - targetLength)) / Math.max(1, targetLength) };
    }).sort((a, b) => a.score - b.score)[0];
    if (nearest && nearest.score <= 0.35) edge = nearest.candidate;
  } else if (hint.topologyId !== undefined) edge = candidates.find((candidate) => brep.getHashCode(candidate) === hint.topologyId);
  if (edge) return edge;
  const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
  if (!resolution.ok) throw new Error(`${featureName}: no se pudo recuperar una arista (${resolution.reason}).`);
  return resolution.entity as Edge;
}

function applyFilletFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "fillet" }>) {
  const selectionReferenceIds = feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [];
  if (selectionReferenceIds.length) {
    const edges: Edge[] = [];
    for (const referenceId of selectionReferenceIds) {
      const stored = document.topologyReferences.find((reference) => reference.id === referenceId);
      if (!stored) throw new Error(`${feature.name}: la selección ya no existe.`);
      if (stored.reference.hint.entityType === "face") {
        const face = resolveStoredFace(brep, document, current, stored, feature.name);
        edges.push(...brep.getEdges(face) as Edge[]);
        continue;
      }
      edges.push(resolveStoredEdge(brep, document, current, stored, feature.name));
    }
    const uniqueEdges = [...new Map(edges.map((edge) => [brep.getHashCode(edge), edge])).values()];
    return resultValue<AnySolid>(brep, feature.treatment === "chamfer" ? brep.chamfer(current, uniqueEdges, feature.radius) : brep.fillet(current, uniqueEdges, feature.radius));
  }
  const selection = feature.edges === "vertical" ? brep.edgeFinder().inDirection("Z") : undefined;
  return resultValue<AnySolid>(brep, feature.treatment === "chamfer"
    ? selection ? brep.chamfer(current, selection, feature.radius) : brep.chamfer(current, feature.radius)
    : selection ? brep.fillet(current, selection, feature.radius) : brep.fillet(current, feature.radius));
}

function applyFaceExtrudeFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "faceExtrude" }>) {
  const stored = document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId);
  if (!stored || stored.reference.hint.entityType !== "face") throw new Error(`${feature.name}: la cara seleccionada ya no existe.`);
  const face = resolveStoredFace(brep, document, current, stored, feature.name);
  const normal = stored.reference.hint.normal ?? [0, 0, 1];
  const object = document.objects.find((candidate) => candidate.id === feature.objectId);
  let [x, y, z] = normal;
  if (object) {
    for (const [angle, axis] of [[-object.transform.rotation.z, "z"], [-object.transform.rotation.y, "y"], [-object.transform.rotation.x, "x"]] as const) {
      const radians = angle * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      if (axis === "z") [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
      if (axis === "y") [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];
      if (axis === "x") [y, z] = [y * cosine - z * sine, y * sine + z * cosine];
    }
  }
  const length = Math.hypot(x, y, z) || 1;
  const sign = feature.operation === "cut" ? -1 : 1;
  const vector: [number, number, number] = [x / length * feature.distance * sign, y / length * feature.distance * sign, z / length * feature.distance * sign];
  const tool = brep.unwrap(brep.extrude(face as Parameters<Brep["extrude"]>[0], vector)) as AnySolid;
  return feature.operation === "cut" ? refinedBooleanSolid(brep, brep.cut(current, tool)) : refinedBooleanSolid(brep, brep.fuse(current, tool));
}

function applyShellFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "shell" }>) {
  const faces = feature.faceReferenceIds.map((referenceId) => {
    const stored = document.topologyReferences.find((reference) => reference.id === referenceId);
    if (!stored || stored.reference.hint.entityType !== "face") throw new Error(`${feature.name}: una cara abierta ya no existe.`);
    return resolveStoredFace(brep, document, current, stored, feature.name);
  });
  if (faces.length === 0) throw new Error(`${feature.name}: selecciona al menos una cara para abrir.`);
  return resultValue<AnySolid>(brep, brep.shell(current, faces as Parameters<Brep["shell"]>[1], feature.thickness));
}

function applyRevolveFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "revolve" }>) {
  let faces: Face[];
  if (feature.source === "sketch") {
    const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === feature.sketchId);
    if (!sketch) throw new Error(`${feature.name}: el boceto seleccionado ya no existe.`);
    faces = facesFromSketch(brep, sketch);
  } else {
    const stored = document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId);
    if (!stored || stored.reference.hint.entityType !== "face") throw new Error(`${feature.name}: la cara seleccionada ya no existe.`);
    faces = [resolveStoredFace(brep, document, current, stored, feature.name)];
  }
  let axis: [number, number, number] = feature.axis === "x" ? [1, 0, 0] : feature.axis === "y" ? [0, 1, 0] : [0, 0, 1];
  let at: [number, number, number] = [0, 0, 0];
  if (feature.axis === "edge") {
    const axisReference = document.topologyReferences.find((reference) => reference.id === feature.axisReferenceId);
    if (!axisReference || axisReference.reference.hint.entityType !== "edge" || !axisReference.reference.hint.midpoint || !axisReference.reference.hint.direction) throw new Error(`${feature.name}: el eje seleccionado ya no existe.`);
    resolveStoredEdge(brep, document, current, axisReference, feature.name);
    const space = topologyReferenceSpace(document, axisReference.objectId);
    at = space.point(axisReference.reference.hint.midpoint);
    axis = space.direction(axisReference.reference.hint.direction);
  }
  const tool = combineSketchSolids(brep, faces.map((face) => brep.unwrap(brep.revolve(face as Parameters<Brep["revolve"]>[0], { axis, at, angle: feature.angle * Math.PI / 180 })) as AnySolid));
  return applyBooleanOperation(brep, current, tool, feature);
}

function applyMirrorFeature(brep: Brep, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "mirror" }>) {
  const normal: [number, number, number] = feature.axis === "x" ? [1, 0, 0] : feature.axis === "y" ? [0, 1, 0] : [0, 0, 1];
  const mirrored = brep.mirror(current, { normal }) as AnySolid;
  return feature.duplicate ? refinedBooleanSolid(brep, brep.fuse(current, mirrored)) : mirrored;
}

function applyLinearPatternFeature(brep: Brep, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "linearPattern" }>, sourceState?: OperationSolidState) {
  let result = current;
  if (feature.source === "feature" && !sourceState) throw new Error(`${feature.name}: la operación de origen ya no está disponible.`);
  const added = feature.source === "body"
    ? current
    : sourceState!.added !== undefined
      ? sourceState!.added
      : sourceState!.before
        ? resultValue<AnySolid>(brep, brep.cut(sourceState!.after, sourceState!.before))
        : sourceState!.after;
  const removed = feature.source === "feature"
    ? sourceState!.removed !== undefined
      ? sourceState!.removed
      : sourceState!.before
        ? resultValue<AnySolid>(brep, brep.cut(sourceState!.before, sourceState!.after))
        : null
    : null;
  for (let index = 1; index < feature.count; index += 1) {
    const distance = feature.spacing * index;
    const offset: [number, number, number] = feature.axis === "x" ? [distance, 0, 0] : feature.axis === "y" ? [0, distance, 0] : [0, 0, distance];
    if (added && !brep.isEmpty(added)) result = refinedBooleanSolid(brep, brep.fuse(result, brep.translate(added, offset) as AnySolid));
    if (removed && !brep.isEmpty(removed)) result = refinedBooleanSolid(brep, brep.cut(result, brep.translate(removed, offset) as AnySolid));
  }
  return result;
}

function applyPolarPatternFeature(brep: Brep, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "polarPattern" }>, sourceState?: OperationSolidState) {
  let result = current;
  if (feature.source === "feature" && !sourceState) throw new Error(`${feature.name}: la operación de origen ya no está disponible.`);
  const added = feature.source === "body"
    ? current
    : sourceState!.added !== undefined
      ? sourceState!.added
      : sourceState!.before
        ? resultValue<AnySolid>(brep, brep.cut(sourceState!.after, sourceState!.before))
        : sourceState!.after;
  const removed = feature.source === "feature"
    ? sourceState!.removed !== undefined
      ? sourceState!.removed
      : sourceState!.before
        ? resultValue<AnySolid>(brep, brep.cut(sourceState!.before, sourceState!.after))
        : null
    : null;
  const closesCircle = feature.equalSpacing && Math.abs(feature.angle) >= 359.999;
  const angleStep = feature.equalSpacing ? feature.angle / (closesCircle ? feature.count : feature.count - 1) : feature.angle;
  const axis: [number, number, number] = feature.axis === "x" ? [1, 0, 0] : feature.axis === "y" ? [0, 1, 0] : [0, 0, 1];
  for (let index = 1; index < feature.count; index += 1) {
    const angle = angleStep * index;
    if (added && !brep.isEmpty(added)) result = refinedBooleanSolid(brep, brep.fuse(result, brep.rotate(added, angle, { axis }) as AnySolid));
    if (removed && !brep.isEmpty(removed)) result = refinedBooleanSolid(brep, brep.cut(result, brep.rotate(removed, angle, { axis }) as AnySolid));
  }
  return result;
}

function solidInTargetObjectSpace(brep: Brep, solid: AnySolid, source: ParametricObject, target: ParametricObject) {
  const relative = parametricTransformMatrix(target.transform).invert().multiply(parametricTransformMatrix(source.transform));
  const elements = relative.elements;
  return brep.unwrap(brep.applyMatrix(solid, {
    linear: [elements[0], elements[4], elements[8], elements[1], elements[5], elements[9], elements[2], elements[6], elements[10]],
    translation: [elements[12], elements[13], elements[14]],
  })) as AnySolid;
}

function applyObjectBooleanFeature(brep: Brep, current: AnySolid, source: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "objectBoolean" }>) {
  if (feature.operation === "add") return refinedBooleanSolid(brep, brep.fuse(current, source));
  if (feature.operation === "cut") return refinedBooleanSolid(brep, brep.cut(current, source));
  return refinedBooleanSolid(brep, brep.intersect(current, source));
}

async function buildParametricModelInternal(document: ParametricDocument, contextFeatureId: string | null, stopAtContext: boolean): Promise<BuildResult> {
  const brep = await loadBrepWithOcct();
  const sketches = new Map<string, SketchFeature>();
  const objects = new Map(document.objects.map((object) => [object.id, object]));
  const completedFeatureIds: string[] = [];
  const solids = new Map<string, AnySolid>();
  const operationStates = new Map<string, OperationSolidState>();
  let operationContext: BuildResult["operationContext"] = null;
  let lastObjectId = "legacy";

  try {
    for (const feature of topologicallySortedParametricFeatures(document)) {
      if (feature.suppressed) continue;
      if (feature.kind === "sketch") {
        sketches.set(feature.id, feature);
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "extrude" || feature.kind === "primitive") {
        const sketch = feature.kind === "extrude" ? sketches.get(feature.sketchId) : null;
        if (feature.kind === "extrude" && !sketch) throw new Error(`${feature.name}: no se encuentra el boceto de origen.`);
        if (feature.kind === "extrude" && feature.distance <= 0) throw new Error(`${feature.name}: la distancia debe ser mayor que cero.`);
        const objectId = feature.objectId ?? "legacy";
        lastObjectId = objectId;
        const current = solids.get(objectId) ?? null;
        const tool = feature.kind === "primitive" ? solidFromPrimitive(brep, feature) : solidFromSketch(brep, sketch!, feature);
        const result = applyBooleanOperation(brep, current, tool, feature);
        solids.set(objectId, result);
        operationStates.set(feature.id, {
          before: current,
          after: result,
          ...(feature.operation === "add" ? { added: tool, removed: null } : feature.operation === "cut" ? { added: null, removed: tool } : {}),
        });
        completedFeatureIds.push(feature.id);
        if (feature.id === contextFeatureId) {
          const selectedResult = solids.get(objectId);
          operationContext = selectedResult ? {
            featureId: feature.id,
            objectId,
            color: objects.get(objectId)?.color ?? "#d41721",
            mesh: meshShape(brep, applyObjectTransform(brep, selectedResult, objects.get(objectId))),
          } : null;
          if (stopAtContext) return { mesh: null, objectRecords: [], operationContext, completedFeatureIds, warning: null };
        }
        continue;
      }
      const objectId = feature.objectId ?? lastObjectId;
      let current = solids.get(objectId) ?? null;
      if (!current) throw new Error(`${feature.name}: primero hace falta crear un sólido.`);
      const previousSolid = current;
      const selectionMesh = feature.id === contextFeatureId ? meshShape(brep, applyObjectTransform(brep, current, objects.get(objectId))) : undefined;
      if (feature.kind === "hole") {
        if (feature.diameter <= 0) throw new Error(`${feature.name}: el diámetro debe ser mayor que cero.`);
        const bounds = brep.getBounds(current);
        const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
        const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
        const cutter = brep.cylinder(feature.diameter / 2, Math.max(0.01, height), { at: [feature.x, feature.y, baseZ] });
        current = refinedBooleanSolid(brep, brep.cut(current, cutter));
        solids.set(objectId, current);
        operationStates.set(feature.id, { before: previousSolid, after: current, added: null, removed: cutter });
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "fillet") {
        if (feature.radius <= 0) throw new Error(`${feature.name}: el radio debe ser mayor que cero.`);
        current = applyFilletFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "faceExtrude") {
        if (feature.distance <= 0) throw new Error(`${feature.name}: la longitud debe ser mayor que cero.`);
        current = applyFaceExtrudeFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "shell") {
        if (feature.thickness <= 0) throw new Error(`${feature.name}: el espesor debe ser mayor que cero.`);
        current = applyShellFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "revolve") {
        if (Math.abs(feature.angle) < 1 || Math.abs(feature.angle) > 360) throw new Error(`${feature.name}: el ángulo debe estar entre -360 y 360 grados y no puede ser cero.`);
        current = applyRevolveFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "mirror") {
        current = applyMirrorFeature(brep, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "linearPattern") {
        if (feature.count < 2 || feature.count > 50) throw new Error(`${feature.name}: la cantidad debe estar entre 2 y 50.`);
        if (Math.abs(feature.spacing) < 0.01) throw new Error(`${feature.name}: la separación no puede ser cero.`);
        const sourceState = feature.source === "feature" && feature.sourceFeatureId ? operationStates.get(feature.sourceFeatureId) : undefined;
        current = applyLinearPatternFeature(brep, current, feature, sourceState);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "polarPattern") {
        if (feature.count < 2 || feature.count > 50) throw new Error(`${feature.name}: la cantidad debe estar entre 2 y 50.`);
        if (Math.abs(feature.angle) < 0.1 || Math.abs(feature.angle) > 360) throw new Error(`${feature.name}: el ángulo debe estar entre -360 y 360 grados y no puede ser cero.`);
        const sourceState = feature.source === "feature" && feature.sourceFeatureId ? operationStates.get(feature.sourceFeatureId) : undefined;
        current = applyPolarPatternFeature(brep, current, feature, sourceState);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "objectBoolean") {
        const sourceSolid = solids.get(feature.sourceObjectId);
        const sourceObject = objects.get(feature.sourceObjectId);
        const targetObject = objects.get(objectId);
        if (!sourceSolid || !sourceObject || !targetObject) throw new Error(`${feature.name}: el objeto de referencia ya no está disponible.`);
        if (feature.sourceObjectId === objectId) throw new Error(`${feature.name}: un objeto no puede combinarse consigo mismo.`);
        const tool = solidInTargetObjectSpace(brep, sourceSolid, sourceObject, targetObject);
        current = applyObjectBooleanFeature(brep, current, tool, feature);
        solids.set(objectId, current);
        operationStates.set(feature.id, {
          before: previousSolid,
          after: current,
          ...(feature.operation === "add" ? { added: tool, removed: null } : feature.operation === "cut" ? { added: null, removed: tool } : {}),
        });
        completedFeatureIds.push(feature.id);
      }
      if (!operationStates.has(feature.id)) operationStates.set(feature.id, { before: previousSolid, after: current });
      if (feature.id === contextFeatureId) {
        const selectedResult = solids.get(objectId);
        const removedMaterial = feature.kind === "fillet" || feature.kind === "shell" || (feature.kind === "faceExtrude" && feature.operation === "cut") || (feature.kind === "revolve" && feature.operation !== "add") || (feature.kind === "objectBoolean" && feature.operation !== "add");
        let detail: RenderableShape | null = null;
        if (selectedResult && feature.kind === "fillet") {
          const changedRegions = [
            resultValue<AnySolid>(brep, brep.cut(previousSolid, selectedResult)),
            resultValue<AnySolid>(brep, brep.cut(selectedResult, previousSolid)),
          ].filter((shape) => !brep.isEmpty(shape));
          detail = changedRegions.length === 1 ? changedRegions[0] : changedRegions.length > 1 ? brep.compound(changedRegions) : null;
        } else if (selectedResult) {
          detail = resultValue<AnySolid>(brep, removedMaterial ? brep.cut(previousSolid, selectedResult) : brep.cut(selectedResult, previousSolid));
        }
        operationContext = selectedResult ? {
          featureId: feature.id,
          objectId,
          color: objects.get(objectId)?.color ?? "#d41721",
          mesh: meshShape(brep, applyObjectTransform(brep, selectedResult, objects.get(objectId))),
          selectionMesh,
          detailMesh: detail ? meshShape(brep, applyObjectTransform(brep, detail, objects.get(objectId))) : undefined,
          detailColor: feature.kind === "shell" || (feature.kind === "faceExtrude" && feature.operation === "cut") ? "red" : "green",
        } : null;
        if (stopAtContext) return { mesh: null, objectRecords: [], operationContext, completedFeatureIds, warning: null };
      }
    }
  } catch (error) {
    return { ...buildRenderOutput(brep, document, solids, objects), operationContext, completedFeatureIds, warning: errorMessage(error) };
  }

  return { ...buildRenderOutput(brep, document, solids, objects), operationContext, completedFeatureIds, warning: null };
}

export function buildParametricModel(document: ParametricDocument): Promise<BuildResult> {
  return buildParametricModelInternal(document, null, false);
}

export async function buildParametricOperationContext(document: ParametricDocument, featureId: string): Promise<BuildResult["operationContext"]> {
  return (await buildParametricModelInternal(document, featureId, true)).operationContext;
}

function meshShape(brep: Brep, shape: RenderableShape): RenderMesh {
  const triangles = brep.mesh(shape, { tolerance: 0.15, angularTolerance: 0.25 });
  const edgeMesh = brep.meshEdges(shape, { tolerance: 0.12, angularTolerance: 0.2 });
  const bounds = brep.getBounds(shape);
  const volumeResult = brep.measureVolume(shape);
  return {
    positions: triangles.vertices,
    normals: triangles.normals,
    indices: triangles.triangles,
    edges: edgeMesh.lines,
    faceGroups: triangles.faceGroups.map((group) => ({ ...group })),
    edgeGroups: edgeMesh.edgeGroups.map((group) => ({ ...group })),
    metrics: {
      width: bounds.xMax - bounds.xMin,
      depth: bounds.yMax - bounds.yMin,
      height: bounds.zMax - bounds.zMin,
      volume: brep.unwrapOr(volumeResult, 0),
    },
  };
}

export async function exportParametricStep(document: ParametricDocument): Promise<Blob> {
  const brep = await loadBrepWithOcct();
  const sketches = new Map<string, SketchFeature>();
  const objects = new Map(document.objects.map((object) => [object.id, object]));
  const solids = new Map<string, AnySolid>();
  const operationStates = new Map<string, OperationSolidState>();
  let lastObjectId = "legacy";
  for (const feature of topologicallySortedParametricFeatures(document)) {
    if (feature.suppressed) continue;
    if (feature.kind === "sketch") {
      sketches.set(feature.id, feature);
      continue;
    }
    if (feature.kind === "extrude" || feature.kind === "primitive") {
      const sketch = feature.kind === "extrude" ? sketches.get(feature.sketchId) : null;
      if (feature.kind === "extrude" && !sketch) throw new Error("El historial contiene una referencia de boceto rota.");
      const objectId = feature.objectId ?? "legacy";
      lastObjectId = objectId;
      const current = solids.get(objectId) ?? null;
      const tool = feature.kind === "primitive" ? solidFromPrimitive(brep, feature) : solidFromSketch(brep, sketch!, feature);
      const result = applyBooleanOperation(brep, current, tool, feature);
      solids.set(objectId, result);
      operationStates.set(feature.id, {
        before: current,
        after: result,
        ...(feature.operation === "add" ? { added: tool, removed: null } : feature.operation === "cut" ? { added: null, removed: tool } : {}),
      });
      continue;
    }
    const objectId = feature.objectId ?? lastObjectId;
    let current = solids.get(objectId) ?? null;
    if (!current) continue;
    const previousSolid = current;
    if (feature.kind === "hole") {
      const bounds = brep.getBounds(current);
      const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
      const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
      const cutter = brep.cylinder(feature.diameter / 2, height, { at: [feature.x, feature.y, baseZ] });
      current = refinedBooleanSolid(brep, brep.cut(current, cutter));
      operationStates.set(feature.id, { before: previousSolid, after: current, added: null, removed: cutter });
    } else if (feature.kind === "fillet") current = applyFilletFeature(brep, document, current, feature);
    else if (feature.kind === "faceExtrude") current = applyFaceExtrudeFeature(brep, document, current, feature);
    else if (feature.kind === "shell") current = applyShellFeature(brep, document, current, feature);
    else if (feature.kind === "revolve") current = applyRevolveFeature(brep, document, current, feature);
    else if (feature.kind === "mirror") current = applyMirrorFeature(brep, current, feature);
    else if (feature.kind === "linearPattern") current = applyLinearPatternFeature(brep, current, feature, feature.source === "feature" && feature.sourceFeatureId ? operationStates.get(feature.sourceFeatureId) : undefined);
    else if (feature.kind === "polarPattern") current = applyPolarPatternFeature(brep, current, feature, feature.source === "feature" && feature.sourceFeatureId ? operationStates.get(feature.sourceFeatureId) : undefined);
    else {
      const sourceSolid = solids.get(feature.sourceObjectId);
      const sourceObject = objects.get(feature.sourceObjectId);
      const targetObject = objects.get(objectId);
      if (!sourceSolid || !sourceObject || !targetObject) throw new Error(`${feature.name}: el objeto de referencia ya no está disponible.`);
      current = applyObjectBooleanFeature(brep, current, solidInTargetObjectSpace(brep, sourceSolid, sourceObject, targetObject), feature);
    }
    solids.set(objectId, current);
    if (!operationStates.has(feature.id)) operationStates.set(feature.id, { before: previousSolid, after: current });
  }
  const result = combinedObjectShape(brep, worldObjectSolids(brep, solids, objects));
  if (!result) throw new Error("No hay ningún sólido para exportar.");
  return brep.unwrap(brep.exportSTEP(result));
}
