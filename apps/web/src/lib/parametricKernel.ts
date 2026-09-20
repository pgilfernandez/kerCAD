import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";
import { shellWithCorners } from "@/lib/shellKernel";
import type { AlignmentItem, AlignmentTarget } from "@/lib/parametricAlignment";
import { parametricReferenceRenderRecords } from "@/lib/parametricReferenceImport";
import type { Edge, Face } from "brepjs";
import { parametricObjectFeaturePrefixFingerprint, parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
import { topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import { combineProfileSolids, extrudePlanarProfile, facesFromPlanarProfile, type PlanarBrepLoop } from "@/lib/profileBrep";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference, PrimitiveFeature, RenderMesh, SketchFeature } from "@/types/parametric";

type AnySolid = BrepSolid;
type CompoundShape = ReturnType<Brep["compound"]>;
type RenderableShape = AnySolid | CompoundShape;
type OperationSolidState = { before: AnySolid | null; after: AnySolid; added?: AnySolid | null; removed?: AnySolid | null };
type CachedObjectSolid = { fingerprint: string; solid: AnySolid };
type CachedFeatureSolid = { fingerprint: string; objectId: string; solid: AnySolid; state?: OperationSolidState };

// This cache lives inside the long-running main build worker. B-Rep handles stay
// in that worker and are discarded automatically if cancellation restarts it.
const cachedObjectSolids = new Map<string, CachedObjectSolid>();
const cachedFeatureSolids = new Map<string, CachedFeatureSolid>();

function resultValue<T>(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]> | ReturnType<Brep["fillet"]>) {
  return brep.unwrap(result) as T;
}

function refinedBooleanSolid(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]>) {
  return brep.unwrap(brep.simplify(resultValue<AnySolid>(brep, result))) as AnySolid;
}

function drawnSketchFaces(brep: Brep, sketch: SketchFeature): Face[] {
  if (sketch.profile.shape !== "drawn") throw new Error(`${sketch.name}: profile is not a drawn sketch.`);
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
    if (currentId !== startId || path.length < 3) throw new Error(`${sketch.name}: close the profile before using it in a 3D operation.`);
    paths.push(path);
  }
  const loops: PlanarBrepLoop[] = [...paths.map((path) => {
    const polygon = path.map(({ fromId }) => {
      const point = points.get(fromId);
      if (!point) throw new Error(`${sketch.name}: sketch contains incomplete references.`);
      return { x: point.x, y: point.z };
    });
    const edges = path.map(({ segment, fromId, toId }) => {
      const from = points.get(fromId);
      const to = points.get(toId);
      if (!from || !to) throw new Error(`${sketch.name}: sketch contains incomplete references.`);
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
    return { polygon, payload: { wire: wire as PlanarBrepLoop["payload"]["wire"] } };
  }), ...(profile.circles ?? []).filter((circle) => !circle.construction && circle.radius > 0).map((circle) => {
    const polygon = Array.from({ length: 64 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return { x: circle.x + Math.cos(angle) * circle.radius, y: circle.z + Math.sin(angle) * circle.radius };
    });
    const edge = brep.circle(circle.radius, { at: [circle.x, circle.z, 0] });
    const wire = brep.unwrap(brep.wireLoop([edge]));
    return { polygon, payload: { wire: wire as PlanarBrepLoop["payload"]["wire"] } };
  })];
  return facesFromPlanarProfile(brep, loops, sketch.name);
}

function solidFromSketch(brep: Brep, sketch: SketchFeature, feature: ExtrudeFeature): AnySolid {
  const profile = sketch.profile;
  if (profile.shape === "drawn") {
    const solid = applySketchTransform(brep, extrudePlanarProfile(brep, drawnSketchFaces(brep, sketch), feature.distance, feature.symmetric), sketch);
    return applyOperationTransform(brep, solid, feature.transform);
  }
  const extrusionLength = Math.abs(feature.distance);
  const centerZ = feature.symmetric ? 0 : Math.sign(feature.distance) * extrusionLength / 2;
  let solid: AnySolid;
  if (profile.shape === "rectangle") {
    solid = brep.box(profile.width, profile.depth, extrusionLength, {
      centered: true,
      at: [0, 0, centerZ],
    });
  } else {
    solid = brep.cylinder(profile.diameter / 2, extrusionLength, {
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
  const triangulated = brep.unwrap(brep.polyhedron(points, faces)) as AnySolid;
  return brep.unwrap(brep.simplify(triangulated)) as AnySolid;
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
    throw new Error(`${feature.name}: all dimensions must be greater than zero.`);
  }
  if (feature.primitive === "cone" && (feature.topRadius ?? 0) < 0) {
    throw new Error(`${feature.name}: top radius cannot be negative.`);
  }
  if (feature.primitive === "tube" && ((feature.innerRadius ?? 0) <= 0 || (feature.innerRadius ?? 0) >= feature.width / 2)) {
    throw new Error(`${feature.name}: inner radius must be greater than zero and smaller than outer radius.`);
  }
  if (feature.primitive === "torus" && ((feature.tubeRadius ?? 0) <= 0 || (feature.majorRadius ?? 0) <= (feature.tubeRadius ?? 0))) {
    throw new Error(`${feature.name}: major radius must be greater than tube radius.`);
  }
  if (feature.primitive === "gear" && ((feature.toothDepth ?? 0) <= 0 || (feature.toothDepth ?? 0) >= feature.width / 2 || (feature.boreRadius ?? 0) >= feature.width / 2 - (feature.toothDepth ?? 0))) {
    throw new Error(`${feature.name}: tooth depth and bore radius do not fit within the outer radius.`);
  }
  let solid: AnySolid;
  if (feature.primitive === "roundedBox") {
    const cornerRadius = feature.cornerRadius ?? 3;
    if (cornerRadius <= 0 || cornerRadius >= Math.min(feature.width, feature.depth) / 2) throw new Error(`${feature.name}: radius must be smaller than half the width and depth.`);
    solid = brep.sketchRoundedRectangle(feature.width, feature.depth, cornerRadius).extrude(feature.height) as AnySolid;
  } else if (feature.primitive === "cone") {
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
  } else if (feature.primitive === "sphere") {
    solid = brep.ellipsoid(feature.width / 2, feature.depth / 2, feature.height / 2, { at: [0, 0, 0] });
  } else {
    throw new Error(`${feature.name}: primitive shape is not implemented.`);
  }
  return applyOperationTransform(brep, solid, feature.transform);
}

async function solidFromImportedStep(brep: Brep, feature: Extract<ParametricDocument["features"][number], { kind: "importedStep" }>): Promise<AnySolid> {
  const imported = await brep.importSTEP(new Blob([feature.stepText]));
  if (!imported.ok) throw new Error(`${feature.name}: STEP B-Rep could not be rebuilt (${String(imported.error.message ?? imported.error)}).`);
  if (brep.mesh(imported.value).vertices.length < 9) throw new Error(`${feature.name}: STEP file does not contain solid geometry.`);
  return imported.value as unknown as AnySolid;
}

function applyBooleanOperation(
  brep: Brep,
  current: AnySolid | null,
  tool: AnySolid,
  feature: Pick<ExtrudeFeature | PrimitiveFeature, "name" | "operation">,
) {
  if (!current) {
    if (feature.operation !== "add") throw new Error(`${feature.name}: the first operation in an object must use Add mode.`);
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

type Direction3 = [number, number, number];

function rotateDirection(direction: Direction3, rotation: { x: number; y: number; z: number }): Direction3 {
  let [x, y, z] = direction;
  for (const [angle, axis] of [[rotation.x, "x"], [rotation.y, "y"], [rotation.z, "z"]] as const) {
    if (!angle) continue;
    const radians = angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    if (axis === "x") [y, z] = [y * cosine - z * sine, y * sine + z * cosine];
    if (axis === "y") [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];
    if (axis === "z") [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
  }
  return [x, y, z];
}

function isTextOnlySketch(sketch: SketchFeature) {
  if (sketch.profile.shape !== "drawn") return false;
  const profile = sketch.profile.geometry;
  if (profile.generator?.kind === "text") return true;
  const contourSegments = profile.segments.filter((segment) => !segment.construction);
  return contourSegments.length > 0 && contourSegments.every((segment) => Boolean(segment.generatedTextId));
}

function textExtrusionDirections(document: ParametricDocument, objectId: string, object?: ParametricObject) {
  const sketches = new Map(document.features.filter((feature): feature is SketchFeature => feature.kind === "sketch").map((sketch) => [sketch.id, sketch]));
  const directions: Direction3[] = [];
  let containsOtherSolidGeometry = false;
  for (const feature of document.features.filter((candidate) => !candidate.suppressed && candidate.objectId === objectId)) {
    if (feature.kind === "extrude") {
      const sketch = sketches.get(feature.sketchId);
      if (!sketch || !isTextOnlySketch(sketch)) {
        containsOtherSolidGeometry = true;
        continue;
      }
      let direction = rotateDirection([0, 0, 1], sketch.rotation);
      direction = rotateDirection(direction, feature.transform.rotation);
      if (object) {
        direction = [direction[0] * object.transform.scale.x, direction[1] * object.transform.scale.y, direction[2] * object.transform.scale.z];
        direction = rotateDirection(direction, object.transform.rotation);
      }
      const length = Math.hypot(...direction) || 1;
      directions.push([direction[0] / length, direction[1] / length, direction[2] / length]);
      continue;
    }
    if (feature.kind === "primitive" || feature.kind === "importedStep" || feature.kind === "faceExtrude" || feature.kind === "revolve" || feature.kind === "objectBoolean") containsOtherSolidGeometry = true;
  }
  return containsOtherSolidGeometry ? [] : directions;
}

function objectRenderMetadata(document: ParametricDocument, objectId: string, objects: Map<string, ParametricObject>): Omit<ParametricObjectRenderRecord, "mesh"> {
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
  };
}

type MeshShapeOptions = { tolerance: number; angularTolerance: number };

export type StlTessellationQuality = "low" | "medium" | "high" | "veryHigh";

const STL_TESSELLATION: Record<StlTessellationQuality, MeshShapeOptions> = {
  low: { tolerance: 0.4, angularTolerance: 0.5 },
  medium: { tolerance: 0.15, angularTolerance: 0.25 },
  high: { tolerance: 0.06, angularTolerance: 0.12 },
  veryHigh: { tolerance: 0.02, angularTolerance: 0.05 },
};

function objectRenderRecords(brep: Brep, document: ParametricDocument, worldSolids: Map<string, AnySolid>, objects: Map<string, ParametricObject>, omittedObjectIds: Set<string>, meshOptions?: MeshShapeOptions): ParametricObjectRenderRecord[] {
  return [...worldSolids]
    .filter(([objectId]) => !omittedObjectIds.has(objectId))
    .map(([objectId, solid]) => {
      const object = objects.get(objectId);
      return {
        ...objectRenderMetadata(document, objectId, objects),
        mesh: meshShape(brep, solid, textExtrusionDirections(document, objectId, object), meshOptions),
      };
    });
}

function buildRenderOutput(brep: Brep, document: ParametricDocument, solids: Map<string, AnySolid>, objects: Map<string, ParametricObject>, reusedObjectIds: Set<string>, incrementalRender: boolean, meshOptions?: MeshShapeOptions, includeCombinedMesh = true, renderMeshes = true, outputObjectIds?: ReadonlySet<string>) {
  if (!renderMeshes) return { mesh: null, objectRecords: [] };
  // Filter only the output, after reconstructing the complete dependency graph.
  // Unselected bodies need neither world-space copies nor tessellation.
  const outputSolids = outputObjectIds === undefined ? solids : new Map([...solids].filter(([id]) => outputObjectIds.has(id)));
  const worldSolids = worldObjectSolids(brep, outputSolids, objects);
  const combined = incrementalRender || !includeCombinedMesh ? null : combinedObjectShape(brep, worldSolids);
  return {
    mesh: combined ? meshShape(brep, combined, [], meshOptions) : null,
    objectRecords: objectRenderRecords(brep, document, worldSolids, objects, incrementalRender ? reusedObjectIds : new Set(), meshOptions),
    renderDelta: incrementalRender ? {
      reusedObjectIds: [...reusedObjectIds].filter((objectId) => worldSolids.has(objectId)),
      activeObjects: [...worldSolids.keys()].map((objectId) => objectRenderMetadata(document, objectId, objects)),
    } : undefined,
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
  if (stored.reference.hint.entityType !== "face") throw new Error(`${featureName}: reference is not a face.`);
  const candidates = brep.getFaces(current);
  const hint = stored.reference.hint;
  const space = topologyReferenceSpace(document, stored.objectId);
  // Object placement does not alter the local B-Rep identity. Prefer the
  // stable topology id before comparing world-space geometric hints, which
  // may legitimately move when the containing object is transformed.
  let face = hint.topologyId === undefined
    ? undefined
    : candidates.find((candidate) => brep.getHashCode(candidate) === hint.topologyId) as Face | undefined;
  if (!face && hint.centroid && hint.area !== undefined) {
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
  }
  if (face) return face;
  const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
  if (!resolution.ok) throw new Error(`${featureName}: face could not be recovered (${resolution.reason}).`);
  return resolution.entity as Face;
}

function resolveStoredEdge(brep: Brep, document: ParametricDocument, current: AnySolid, stored: ParametricTopologyReference, featureName: string) {
  if (stored.reference.hint.entityType !== "edge") throw new Error(`${featureName}: reference is not an edge.`);
  const candidates = brep.getEdges(current) as Edge[];
  const hint = stored.reference.hint;
  const space = topologyReferenceSpace(document, stored.objectId);
  let edge = hint.topologyId === undefined
    ? undefined
    : candidates.find((candidate) => brep.getHashCode(candidate) === hint.topologyId);
  if (!edge && hint.midpoint) {
    const target = space.point(hint.midpoint);
    const targetLength = hint.length === undefined ? 1 : hint.length / space.lengthScale;
    const nearest = candidates.map((candidate) => {
      const midpoint = brep.curvePointAt(candidate, 0.5);
      const length = brep.unwrapOr(brep.measureLength(candidate), targetLength);
      return { candidate, score: (Math.hypot(midpoint[0] - target[0], midpoint[1] - target[1], midpoint[2] - target[2]) + Math.abs(length - targetLength)) / Math.max(1, targetLength) };
    }).sort((a, b) => a.score - b.score)[0];
    if (nearest && nearest.score <= 0.35) edge = nearest.candidate;
  }
  if (edge) return edge;
  const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
  if (!resolution.ok) throw new Error(`${featureName}: edge could not be recovered (${resolution.reason}).`);
  return resolution.entity as Edge;
}

function applyFilletFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "fillet" }>) {
  const selectionReferenceIds = feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [];
  if (selectionReferenceIds.length) {
    const edges: Edge[] = [];
    for (const referenceId of selectionReferenceIds) {
      const stored = document.topologyReferences.find((reference) => reference.id === referenceId);
      if (!stored) throw new Error(`${feature.name}: selection no longer exists.`);
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
  if (!stored || stored.reference.hint.entityType !== "face") throw new Error(`${feature.name}: selected face no longer exists.`);
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
    if (!stored || stored.reference.hint.entityType !== "face") throw new Error(`${feature.name}: an open face no longer exists.`);
    return resolveStoredFace(brep, document, current, stored, feature.name);
  });
  if (faces.length === 0) throw new Error(`${feature.name}: select at least one face to open.`);
  return resultValue<AnySolid>(brep, shellWithCorners(brep, current, faces as Parameters<Brep["shell"]>[1], feature.thickness, feature.cornerType));
}

function sketchRevolveAxis(sketch: SketchFeature, segmentId: string, featureName: string) {
  if (sketch.profile.shape !== "drawn") throw new Error(`${featureName}: the selected sketch does not contain editable edges.`);
  const segment = sketch.profile.geometry.segments.find((candidate) => candidate.id === segmentId);
  const start = segment ? sketch.profile.geometry.points.find((point) => point.id === segment.startId) : null;
  const end = segment ? sketch.profile.geometry.points.find((point) => point.id === segment.endId) : null;
  const straight = segment && (segment.kind === "line" || (!segment.kind && !start?.handleOut && !end?.handleIn));
  if (!straight || !start || !end) throw new Error(`${featureName}: the sketch axis must be a straight edge.`);
  const localDirection: Direction3 = [end.x - start.x, end.z - start.z, 0];
  if (Math.hypot(...localDirection) < 1e-8) throw new Error(`${featureName}: the sketch axis has zero length.`);
  const rotatedPoint = rotateDirection([start.x, start.z, 0], sketch.rotation);
  const direction = rotateDirection(localDirection, sketch.rotation);
  const length = Math.hypot(...direction) || 1;
  return {
    at: [rotatedPoint[0] + sketch.x, rotatedPoint[1] + sketch.y, rotatedPoint[2] + sketch.offset] as [number, number, number],
    axis: [direction[0] / length, direction[1] / length, direction[2] / length] as [number, number, number],
  };
}

function applyRevolveFeature(brep: Brep, document: ParametricDocument, current: AnySolid | null, feature: Extract<ParametricDocument["features"][number], { kind: "revolve" }>) {
  let sourceSketch: SketchFeature | null = null;
  let faces: Face[];
  if (feature.source === "sketch") {
    const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === feature.sketchId);
    if (!sketch) throw new Error(`${feature.name}: selected sketch no longer exists.`);
    sourceSketch = sketch;
    faces = facesFromSketch(brep, sketch);
  } else {
    if (!current) throw new Error(`${feature.name}: a face-based revolve requires an existing solid.`);
    const stored = document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId);
    if (!stored || stored.reference.hint.entityType !== "face") throw new Error(`${feature.name}: selected face no longer exists.`);
    faces = [resolveStoredFace(brep, document, current, stored, feature.name)];
  }
  let axis: [number, number, number] = feature.axis === "x" ? [1, 0, 0] : feature.axis === "y" ? [0, 1, 0] : [0, 0, 1];
  let at: [number, number, number] = [0, 0, 0];
  if (feature.axis === "edge") {
    if (sourceSketch && feature.sketchAxisSegmentId) {
      ({ axis, at } = sketchRevolveAxis(sourceSketch, feature.sketchAxisSegmentId, feature.name));
    } else {
      if (!current) throw new Error(`${feature.name}: selected axis no longer exists.`);
      const axisReference = document.topologyReferences.find((reference) => reference.id === feature.axisReferenceId);
      if (!axisReference || axisReference.reference.hint.entityType !== "edge" || !axisReference.reference.hint.midpoint || !axisReference.reference.hint.direction) throw new Error(`${feature.name}: selected axis no longer exists.`);
      resolveStoredEdge(brep, document, current, axisReference, feature.name);
      const space = topologyReferenceSpace(document, axisReference.objectId);
      at = space.point(axisReference.reference.hint.midpoint);
      axis = space.direction(axisReference.reference.hint.direction);
    }
  }
  const tool = combineProfileSolids(brep, faces.map((face) => brep.unwrap(brep.revolve(face as Parameters<Brep["revolve"]>[0], { axis, at, angle: feature.angle * Math.PI / 180 })) as AnySolid));
  return applyBooleanOperation(brep, current, tool, feature);
}

function applyMirrorFeature(brep: Brep, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "mirror" }>) {
  const fallbackNormal: [number, number, number] = feature.axis === "x" ? [1, 0, 0] : feature.axis === "y" ? [0, 1, 0] : [0, 0, 1];
  const customNormal = feature.planeNormal;
  const normalLength = customNormal ? Math.hypot(customNormal.x, customNormal.y, customNormal.z) : 0;
  const normal: [number, number, number] = customNormal && normalLength > 1e-8
    ? [customNormal.x / normalLength, customNormal.y / normalLength, customNormal.z / normalLength]
    : fallbackNormal;
  const origin = feature.planeOrigin ?? { x: 0, y: 0, z: 0 };
  const shifted = origin.x || origin.y || origin.z ? brep.translate(current, [-origin.x, -origin.y, -origin.z]) as AnySolid : current;
  let mirrored = brep.mirror(shifted, { normal }) as AnySolid;
  if (origin.x || origin.y || origin.z) mirrored = brep.translate(mirrored, [origin.x, origin.y, origin.z]) as AnySolid;
  return feature.duplicate ? refinedBooleanSolid(brep, brep.fuse(current, mirrored)) : mirrored;
}

function applyLinearPatternFeature(brep: Brep, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "linearPattern" }>, sourceState?: OperationSolidState) {
  let result = current;
  if (feature.source === "feature" && !sourceState) throw new Error(`${feature.name}: source operation is no longer available.`);
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
  if (feature.source === "feature" && !sourceState) throw new Error(`${feature.name}: source operation is no longer available.`);
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
  // Reuse the tool when both objects share coordinates, avoiding a redundant
  // native identity transform of cached geometry during repeated rebuilds.
  if (elements.every((value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) < 1e-12)) return solid;
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

async function buildParametricModelInternal(document: ParametricDocument, contextFeatureId: string | null, stopAtContext: boolean, incrementalRender = false, meshOptions?: MeshShapeOptions, includeCombinedMesh = true, renderMeshes = true, outputObjectIds?: ReadonlySet<string>): Promise<BuildResult> {
  const brep = await loadBrepWithOcct();
  const sketches = new Map(document.features.filter((feature): feature is SketchFeature => feature.kind === "sketch" && !feature.suppressed).map((feature) => [feature.id, feature]));
  const objects = new Map(document.objects.map((object) => [object.id, object]));
  const completedFeatureIds: string[] = [];
  const solids = new Map<string, AnySolid>();
  const operationStates = new Map<string, OperationSolidState>();
  const featureSolidSnapshots = new Map<string, { objectId: string; solid: AnySolid }>();
  const prefixFingerprints = new Map<string, string>();
  const prefixFingerprint = (objectId: string, featureId: string) => {
    const cacheKey = `${objectId}:${featureId}`;
    const existing = prefixFingerprints.get(cacheKey);
    if (existing) return existing;
    const fingerprint = parametricObjectFeaturePrefixFingerprint(document, objectId, featureId);
    prefixFingerprints.set(cacheKey, fingerprint);
    return fingerprint;
  };
  let operationContext: BuildResult["operationContext"] = null;
  let activeFeatureId: string | null = null;
  let lastObjectId = "legacy";
  const reuseObjectCache = contextFeatureId === null && !stopAtContext;
  const reusableObjectIds = new Set<string>();
  const reusablePrefixFeatureIds = new Set<string>();
  if (reuseObjectCache) {
    for (const object of document.objects) {
      const cached = cachedObjectSolids.get(object.id);
      if (cached?.fingerprint === parametricObjectGeometryFingerprint(document, object.id)) {
        solids.set(object.id, cached.solid);
        reusableObjectIds.add(object.id);
        continue;
      }
      const objectFeatures = document.features.filter((feature) => feature.objectId === object.id);
      for (let index = objectFeatures.length - 1; index >= 0; index -= 1) {
        const feature = objectFeatures[index];
        const featureCache = cachedFeatureSolids.get(feature.id);
        if (!featureCache || featureCache.objectId !== object.id || featureCache.fingerprint !== prefixFingerprint(object.id, feature.id)) continue;
        solids.set(object.id, featureCache.solid);
        for (const prefixFeature of objectFeatures.slice(0, index + 1)) {
          reusablePrefixFeatureIds.add(prefixFeature.id);
          const prefixCache = cachedFeatureSolids.get(prefixFeature.id);
          if (prefixCache?.fingerprint === prefixFingerprint(object.id, prefixFeature.id) && prefixCache.state) operationStates.set(prefixFeature.id, prefixCache.state);
        }
        break;
      }
    }
  }

  try {
    for (const feature of topologicallySortedParametricFeatures(document)) {
      if (feature.suppressed) continue;
      activeFeatureId = feature.id;
      if (feature.objectId && reusableObjectIds.has(feature.objectId)) {
        if (feature.kind !== "sketch") lastObjectId = feature.objectId;
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (reusablePrefixFeatureIds.has(feature.id)) {
        if (feature.kind !== "sketch" && feature.objectId) lastObjectId = feature.objectId;
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "sketch") {
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "importedStep") {
        const objectId = feature.objectId ?? "legacy";
        if (solids.has(objectId)) throw new Error(`${feature.name}: imported STEP must be the first operation in the object.`);
        lastObjectId = objectId;
        const result = await solidFromImportedStep(brep, feature);
        solids.set(objectId, result);
        operationStates.set(feature.id, { before: null, after: result });
        featureSolidSnapshots.set(feature.id, { objectId, solid: result });
        completedFeatureIds.push(feature.id);
        if (feature.id === contextFeatureId) {
          operationContext = {
            featureId: feature.id,
            objectId,
            color: objects.get(objectId)?.color ?? "#d41721",
            mesh: meshShape(brep, applyObjectTransform(brep, result, objects.get(objectId))),
          };
          if (stopAtContext) return { mesh: null, objectRecords: [], operationContext, completedFeatureIds, failedFeatureId: null, warning: null };
        }
        continue;
      }
      if (feature.kind === "extrude" || feature.kind === "primitive") {
        const sketch = feature.kind === "extrude" ? sketches.get(feature.sketchId) : null;
        if (feature.kind === "extrude" && !sketch) throw new Error(`${feature.name}: source sketch could not be found.`);
        if (feature.kind === "extrude" && Math.abs(feature.distance) <= 1e-8) throw new Error(`${feature.name}: distance must not be zero.`);
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
        featureSolidSnapshots.set(feature.id, { objectId, solid: result });
        completedFeatureIds.push(feature.id);
        if (feature.id === contextFeatureId) {
          const selectedResult = solids.get(objectId);
          operationContext = selectedResult ? {
            featureId: feature.id,
            objectId,
            color: objects.get(objectId)?.color ?? "#d41721",
            mesh: meshShape(brep, applyObjectTransform(brep, selectedResult, objects.get(objectId))),
          } : null;
          if (stopAtContext) return { mesh: null, objectRecords: [], operationContext, completedFeatureIds, failedFeatureId: null, warning: null };
        }
        continue;
      }
      const objectId = feature.objectId ?? lastObjectId;
      let current = solids.get(objectId) ?? null;
      if (!current && feature.kind === "revolve") {
        if (Math.abs(feature.angle) < 1 || Math.abs(feature.angle) > 360) throw new Error(`${feature.name}: angle must be between -360 and 360 degrees and cannot be zero.`);
        current = applyRevolveFeature(brep, document, null, feature);
        solids.set(objectId, current);
        operationStates.set(feature.id, { before: null, after: current });
        featureSolidSnapshots.set(feature.id, { objectId, solid: current });
        completedFeatureIds.push(feature.id);
        if (feature.id === contextFeatureId) {
          operationContext = {
            featureId: feature.id,
            objectId,
            color: objects.get(objectId)?.color ?? "#d41721",
            mesh: meshShape(brep, applyObjectTransform(brep, current, objects.get(objectId))),
          };
          if (stopAtContext) return { mesh: null, objectRecords: [], operationContext, completedFeatureIds, failedFeatureId: null, warning: null };
        }
        continue;
      }
      if (!current) throw new Error(`${feature.name}: create a solid first.`);
      const previousSolid = current;
      const selectionMesh = feature.id === contextFeatureId ? meshShape(brep, applyObjectTransform(brep, current, objects.get(objectId))) : undefined;
      if (feature.kind === "hole") {
        if (feature.diameter <= 0) throw new Error(`${feature.name}: diameter must be greater than zero.`);
        const bounds = brep.getBounds(current);
        const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
        const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
        const cutter = brep.cylinder(feature.diameter / 2, Math.max(0.01, height), { at: [feature.x, feature.y, baseZ] });
        current = refinedBooleanSolid(brep, brep.cut(current, cutter));
        solids.set(objectId, current);
        operationStates.set(feature.id, { before: previousSolid, after: current, added: null, removed: cutter });
        featureSolidSnapshots.set(feature.id, { objectId, solid: current });
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "fillet") {
        if (feature.radius <= 0) throw new Error(`${feature.name}: radius must be greater than zero.`);
        current = applyFilletFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "faceExtrude") {
        if (feature.distance <= 0) throw new Error(`${feature.name}: length must be greater than zero.`);
        current = applyFaceExtrudeFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "shell") {
        if (feature.thickness <= 0) throw new Error(`${feature.name}: thickness must be greater than zero.`);
        current = applyShellFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "revolve") {
        if (Math.abs(feature.angle) < 1 || Math.abs(feature.angle) > 360) throw new Error(`${feature.name}: angle must be between -360 and 360 degrees and cannot be zero.`);
        current = applyRevolveFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "mirror") {
        current = applyMirrorFeature(brep, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "linearPattern") {
        if (feature.count < 2 || feature.count > 50) throw new Error(`${feature.name}: count must be between 2 and 50.`);
        if (Math.abs(feature.spacing) < 0.01) throw new Error(`${feature.name}: spacing cannot be zero.`);
        const sourceState = feature.source === "feature" && feature.sourceFeatureId ? operationStates.get(feature.sourceFeatureId) : undefined;
        current = applyLinearPatternFeature(brep, current, feature, sourceState);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "polarPattern") {
        if (feature.count < 2 || feature.count > 50) throw new Error(`${feature.name}: count must be between 2 and 50.`);
        if (Math.abs(feature.angle) < 0.1 || Math.abs(feature.angle) > 360) throw new Error(`${feature.name}: angle must be between -360 and 360 degrees and cannot be zero.`);
        const sourceState = feature.source === "feature" && feature.sourceFeatureId ? operationStates.get(feature.sourceFeatureId) : undefined;
        current = applyPolarPatternFeature(brep, current, feature, sourceState);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      } else if (feature.kind === "objectBoolean") {
        const sourceSolid = solids.get(feature.sourceObjectId);
        const sourceObject = objects.get(feature.sourceObjectId);
        const targetObject = objects.get(objectId);
        if (!sourceSolid || !sourceObject || !targetObject) throw new Error(`${feature.name}: reference object is no longer available.`);
        if (feature.sourceObjectId === objectId) throw new Error(`${feature.name}: an object cannot be combined with itself.`);
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
      featureSolidSnapshots.set(feature.id, { objectId, solid: current });
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
        if (stopAtContext) return { mesh: null, objectRecords: [], operationContext, completedFeatureIds, failedFeatureId: null, warning: null };
      }
    }
  } catch (error) {
    return { ...buildRenderOutput(brep, document, solids, objects, reusableObjectIds, incrementalRender, meshOptions, includeCombinedMesh, renderMeshes, outputObjectIds), operationContext, completedFeatureIds, failedFeatureId: activeFeatureId, warning: errorMessage(error) };
  }

  if (reuseObjectCache) {
    const activeObjectIds = new Set(document.objects.map((object) => object.id));
    const activeFeatureIds = new Set(document.features.map((feature) => feature.id));
    for (const objectId of cachedObjectSolids.keys()) if (!activeObjectIds.has(objectId)) cachedObjectSolids.delete(objectId);
    for (const featureId of cachedFeatureSolids.keys()) if (!activeFeatureIds.has(featureId)) cachedFeatureSolids.delete(featureId);
    for (const [featureId, snapshot] of featureSolidSnapshots) {
      cachedFeatureSolids.set(featureId, {
        fingerprint: prefixFingerprint(snapshot.objectId, featureId),
        objectId: snapshot.objectId,
        solid: snapshot.solid,
        state: operationStates.get(featureId),
      });
    }
    for (const [objectId, solid] of solids) {
      if (!activeObjectIds.has(objectId)) continue;
      cachedObjectSolids.set(objectId, {
        fingerprint: parametricObjectGeometryFingerprint(document, objectId),
        solid,
      });
    }
  }

  return { ...buildRenderOutput(brep, document, solids, objects, reusableObjectIds, incrementalRender, meshOptions, includeCombinedMesh, renderMeshes, outputObjectIds), operationContext, completedFeatureIds, failedFeatureId: null, warning: null };
}

export function buildParametricModel(document: ParametricDocument, incrementalRender = false): Promise<BuildResult> {
  return buildParametricModelInternal(document, null, false, incrementalRender);
}

export async function buildParametricStlMeshes(document: ParametricDocument, quality: StlTessellationQuality, objectIds?: readonly string[]): Promise<RenderMesh[]> {
  const selected = objectIds === undefined ? undefined : new Set(objectIds);
  const result = await buildParametricModelInternal(document, null, false, false, STL_TESSELLATION[quality], false, true, selected);
  if (result.failedFeatureId || result.warning) throw new Error(result.warning ?? "The model could not be tessellated for STL export.");
  return result.objectRecords.map((record) => record.mesh);
}

export async function buildParametricOperationContext(document: ParametricDocument, featureId: string): Promise<BuildResult["operationContext"]> {
  return (await buildParametricModelInternal(document, featureId, true)).operationContext;
}

export function omitParallelRenderEdges(
  lines: Float32Array,
  groups: Array<{ start: number; count: number; edgeId: number }>,
  directions: Direction3[],
) {
  if (!directions.length || !groups.length) return { edges: lines, edgeGroups: groups.map((group) => ({ ...group })) };
  const retained: number[] = [];
  const edgeGroups: Array<{ start: number; count: number; edgeId: number }> = [];
  for (const group of groups) {
    const start = group.start * 3;
    const end = (group.start + group.count) * 3;
    const parallel = directions.some((direction) => {
      let hasLength = false;
      for (let offset = start; offset + 5 < end; offset += 6) {
        const x = lines[offset + 3] - lines[offset];
        const y = lines[offset + 4] - lines[offset + 1];
        const z = lines[offset + 5] - lines[offset + 2];
        const length = Math.hypot(x, y, z);
        if (length <= 1e-7) continue;
        hasLength = true;
        const cosine = Math.abs((x * direction[0] + y * direction[1] + z * direction[2]) / length);
        if (cosine < 0.9999) return false;
      }
      return hasLength;
    });
    if (parallel) continue;
    edgeGroups.push({ start: retained.length / 3, count: group.count, edgeId: group.edgeId });
    for (let offset = start; offset < end; offset += 1) retained.push(lines[offset]);
  }
  return { edges: new Float32Array(retained), edgeGroups };
}

function meshShape(brep: Brep, shape: RenderableShape, omittedEdgeDirections: Direction3[] = [], options: MeshShapeOptions = { tolerance: 0.15, angularTolerance: 0.25 }): RenderMesh {
  const triangles = brep.mesh(shape, options);
  const edgeMesh = brep.meshEdges(shape, { tolerance: Math.min(0.12, options.tolerance), angularTolerance: Math.min(0.2, options.angularTolerance) });
  const displayEdges = omitParallelRenderEdges(edgeMesh.lines, edgeMesh.edgeGroups, omittedEdgeDirections);
  const bounds = brep.getBounds(shape);
  const volumeResult = brep.measureVolume(shape);
  return {
    // The kernel may expose views backed by reusable WASM memory. Build results
    // are transferred out of the CAD worker, which detaches their ArrayBuffers;
    // keeping those views here would therefore poison a later incremental mesh
    // of the same solid (a sketch-only history change is a common trigger).
    positions: new Float32Array(triangles.vertices),
    normals: new Float32Array(triangles.normals),
    indices: new Uint32Array(triangles.triangles),
    edges: new Float32Array(displayEdges.edges),
    faceGroups: triangles.faceGroups.map((group) => ({ ...group })),
    edgeGroups: displayEdges.edgeGroups,
    metrics: {
      width: bounds.xMax - bounds.xMin,
      depth: bounds.yMax - bounds.yMin,
      height: bounds.zMax - bounds.zMin,
      volume: brep.unwrapOr(volumeResult, 0),
    },
  };
}

export async function exportParametricStep(document: ParametricDocument, objectIds?: readonly string[]): Promise<Blob> {
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
    if (feature.kind === "importedStep") {
      const objectId = feature.objectId ?? "legacy";
      if (solids.has(objectId)) throw new Error(`${feature.name}: imported STEP must be the first operation in the object.`);
      lastObjectId = objectId;
      const result = await solidFromImportedStep(brep, feature);
      solids.set(objectId, result);
      operationStates.set(feature.id, { before: null, after: result });
      continue;
    }
    if (feature.kind === "extrude" || feature.kind === "primitive") {
      const sketch = feature.kind === "extrude" ? sketches.get(feature.sketchId) : null;
      if (feature.kind === "extrude" && !sketch) throw new Error("The history contains a broken sketch reference.");
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
      if (!sourceSolid || !sourceObject || !targetObject) throw new Error(`${feature.name}: reference object is no longer available.`);
      current = applyObjectBooleanFeature(brep, current, solidInTargetObjectSpace(brep, sourceSolid, sourceObject, targetObject), feature);
    }
    solids.set(objectId, current);
    if (!operationStates.has(feature.id)) operationStates.set(feature.id, { before: previousSolid, after: current });
  }
  // Resolve the complete history before selecting output bodies, preserving
  // cross-object boolean dependencies and each body's world transform.
  const selected = objectIds === undefined ? null : new Set(objectIds);
  const outputSolids = selected ? new Map([...solids].filter(([id]) => selected.has(id))) : solids;
  const result = combinedObjectShape(brep, worldObjectSolids(brep, outputSolids, objects));
  if (!result) throw new Error("There is no solid to export.");
  return brep.unwrap(brep.exportSTEP(result));
}

/** Support distance of the actual CAD solid, measured in the active plane frame. */
export async function parametricAlignmentTargets(document: ParametricDocument, selection: AlignmentItem[], onTarget?: (target: AlignmentTarget) => void): Promise<AlignmentTarget[]> {
  const brep = await loadBrepWithOcct();
  let modelBuilt = false;
  const ensureModel = async () => {
    if (modelBuilt) return;
    // Build the solid history only; tessellate selected operands below, once.
    const result = await buildParametricModelInternal(document, null, false, false, undefined, false, false);
    if (result.failedFeatureId || result.warning) throw new Error(result.warning ?? "The model could not be rebuilt.");
    modelBuilt = true;
  };
  const selectedObjects = new Set(selection.filter(item => item.kind === "object").map(item => item.id));
  const targets: AlignmentTarget[] = [];
  const pendingMeshes: Array<{ target: AlignmentTarget; world: RenderableShape }> = [];
  const referenceRecords = parametricReferenceRenderRecords(document);
  for (const item of selection) {
    const feature = item.kind === "feature" ? document.features.find(candidate => candidate.id === item.id) : undefined;
    if (feature && selectedObjects.has(feature.objectId ?? "")) continue;
    const object = document.objects.find(candidate => candidate.id === (item.kind === "object" ? item.id : feature?.objectId));
    if (!object || !object.visible || feature?.suppressed) continue;
    const reference = item.kind === "object" ? referenceRecords.find(record => record.objectId === item.id) : undefined;
    if (reference) {
      const min = { x: Infinity, y: Infinity, z: Infinity };
      const max = { x: -Infinity, y: -Infinity, z: -Infinity };
      const positions = reference.mesh.positions;
      for (let index = 0; index < positions.length; index += 3) {
        for (const [offset, axis] of (["x", "y", "z"] as const).entries()) {
          min[axis] = Math.min(min[axis], positions[index + offset]);
          max[axis] = Math.max(max[axis], positions[index + offset]);
        }
      }
      if (![...Object.values(min), ...Object.values(max)].every(Number.isFinite)) throw new Error("Invalid alignment bounding box.");
      targets.push({ ...item, objectId: object.id, movable: !object.locked, min, max, mesh: reference.mesh });
      onTarget?.(targets[targets.length - 1]);
      continue;
    }
    let solid: RenderableShape | undefined;
    if (item.kind === "object") { await ensureModel(); solid = cachedObjectSolids.get(object.id)?.solid; }
    else if (feature?.kind === "primitive") solid = solidFromPrimitive(brep, feature);
    else if (feature?.kind === "sketch") solid = brep.compound(facesFromSketch(brep, feature));
    else if (feature?.kind === "extrude") {
      const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.id === feature.sketchId && candidate.kind === "sketch");
      if (sketch) solid = solidFromSketch(brep, sketch, feature);
    } else if (feature) { await ensureModel(); solid = cachedFeatureSolids.get(feature.id)?.solid; }
    if (!solid) throw new Error(`${feature?.name ?? object.name}: no geometry is available for alignment.`);
    const world = applyObjectTransform(brep, solid, object);
    const bounds = brep.getBounds(world);
    const min = { x: bounds.xMin, y: bounds.yMin, z: bounds.zMin };
    const max = { x: bounds.xMax, y: bounds.yMax, z: bounds.zMax };
    if (![...Object.values(min), ...Object.values(max)].every(Number.isFinite)) throw new Error("Invalid alignment bounding box.");
    const target: AlignmentTarget = { ...item, objectId: object.id, movable: !object.locked && (item.kind === "object" || feature?.kind === "primitive" || feature?.kind === "extrude" || feature?.kind === "sketch" && feature.purpose === "user"), min, max };
    targets.push(target);
    pendingMeshes.push({ target, world });
    // Bounds are enough to draw the box and arrows. Publish all of them before
    // tessellating any of the detailed picking meshes.
    onTarget?.(target);
  }
  for (const { target, world } of pendingMeshes) {
    target.mesh = meshShape(brep, world);
    onTarget?.(target);
  }
  return targets;
}

export async function parametricDropToWorkplaneDeltas(document: ParametricDocument, selection: Array<{ id: string; kind: "object" | "feature" }>) {
  const brep = await loadBrepWithOcct();
  const selectedObjects = new Set(selection.filter(item => item.kind === "object").map(item => item.id));
  if (selectedObjects.size) {
    const result = await buildParametricModel(document);
    if (result.failedFeatureId || result.warning) throw new Error(result.warning ?? "The model could not be rebuilt.");
  }
  const { origin, xAxis, yAxis, normal } = document.workplane;
  const dot = (a: typeof normal, b: typeof normal) => a.x * b.x + a.y * b.y + a.z * b.z;
  const deltas: Array<{ id: string; kind: "object" | "feature"; delta: { x: number; y: number; z: number } }> = [];
  for (const item of selection) {
    const feature = item.kind === "feature" ? document.features.find(candidate => candidate.id === item.id) : undefined;
    if (feature && selectedObjects.has(feature.objectId ?? "")) continue;
    const object = document.objects.find(candidate => candidate.id === (item.kind === "object" ? item.id : feature?.objectId));
    if (!object || object.locked) continue;
    let solid: RenderableShape | undefined;
    if (item.kind === "object") solid = cachedObjectSolids.get(object.id)?.solid;
    else if (feature && !feature.suppressed) {
      if (feature.kind === "primitive") solid = solidFromPrimitive(brep, feature);
      else if (feature.kind === "sketch" && feature.purpose === "user") solid = brep.compound(facesFromSketch(brep, feature));
      else if (feature.kind === "extrude") {
        const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.id === feature.sketchId && candidate.kind === "sketch");
        if (sketch) solid = solidFromSketch(brep, sketch, feature);
      }
    }
    if (!solid) throw new Error(`${feature?.name ?? object.name}: no independently movable solid is available.`);
    const world = applyObjectTransform(brep, solid, object);
    const inPlane = brep.unwrap(brep.applyMatrix(world, {
      linear: [xAxis.x, xAxis.y, xAxis.z, yAxis.x, yAxis.y, yAxis.z, normal.x, normal.y, normal.z],
      translation: [-dot(xAxis, origin), -dot(yAxis, origin), -dot(normal, origin)],
    }));
    const distance = brep.getBounds(inPlane).zMin;
    if (!Number.isFinite(distance)) throw new Error("The selected geometry has no valid bounding box.");
    if (Math.abs(distance) > 1e-7) deltas.push({ ...item, delta: { x: -distance * normal.x, y: -distance * normal.y, z: -distance * normal.z } });
  }
  return deltas;
}
