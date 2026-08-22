import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";
import type { Edge, Face } from "brepjs";
import { parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
import { topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricObject, ParametricObjectRenderRecord, PrimitiveFeature, RenderMesh, SketchFeature } from "@/types/parametric";

type AnySolid = BrepSolid;
type CompoundShape = ReturnType<Brep["compound"]>;
type RenderableShape = AnySolid | CompoundShape;

function resultValue<T>(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]> | ReturnType<Brep["fillet"]>) {
  return brep.unwrap(result) as T;
}

function refinedBooleanSolid(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]>) {
  return brep.unwrap(brep.simplify(resultValue<AnySolid>(brep, result))) as AnySolid;
}

function solidFromSketch(brep: Brep, sketch: SketchFeature, feature: ExtrudeFeature): AnySolid {
  const profile = sketch.profile;
  const centerZ = feature.symmetric ? sketch.offset : sketch.offset + feature.distance / 2;
  let solid: AnySolid;
  if (profile.shape === "rectangle") {
    solid = brep.box(profile.width, profile.depth, feature.distance, {
      centered: true,
      at: [sketch.x, sketch.y, centerZ],
    });
  } else {
    solid = brep.cylinder(profile.diameter / 2, feature.distance, {
      centered: true,
      at: [sketch.x, sketch.y, centerZ],
    });
  }
  return applyOperationTransform(brep, solid, feature.transform);
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

function applyObjectTransform(brep: Brep, solid: AnySolid, object?: ParametricObject): AnySolid {
  if (!object) return solid;
  const { position, rotation, scale } = object.transform;
  if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
    solid = brep.unwrap(brep.applyMatrix(solid, {
      linear: [scale.x, 0, 0, 0, scale.y, 0, 0, 0, scale.z],
      translation: [0, 0, 0],
    })) as AnySolid;
  }
  if (rotation.x) solid = brep.rotate(solid, rotation.x, { axis: [1, 0, 0] });
  if (rotation.y) solid = brep.rotate(solid, rotation.y, { axis: [0, 1, 0] });
  if (rotation.z) solid = brep.rotate(solid, rotation.z, { axis: [0, 0, 1] });
  if (position.x || position.y || position.z) solid = brep.translate(solid, [position.x, position.y, position.z]);
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

function worldObjectSolids(brep: Brep, solids: Map<string, AnySolid>, objects: Map<string, ParametricObject>) {
  return new Map([...solids].map(([objectId, solid]) => [objectId, applyObjectTransform(brep, solid, objects.get(objectId))]));
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
  const worldSolids = worldObjectSolids(brep, solids, objects);
  const combined = combinedObjectShape(brep, worldSolids);
  return {
    mesh: combined ? meshShape(brep, combined) : null,
    objectRecords: objectRenderRecords(brep, document, worldSolids, objects),
  };
}

function applyFilletFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "fillet" }>) {
  const selectionReferenceIds = feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [];
  if (selectionReferenceIds.length) {
    const edges: Edge[] = [];
    const object = document.objects.find((candidate) => candidate.id === feature.objectId);
    const localPoint = (point: [number, number, number]) => {
      if (!object) return point;
      let [x, y, z] = [point[0] - object.transform.position.x, point[1] - object.transform.position.y, point[2] - object.transform.position.z];
      for (const [angle, axis] of [[-object.transform.rotation.z, "z"], [-object.transform.rotation.y, "y"], [-object.transform.rotation.x, "x"]] as const) {
        const radians = angle * Math.PI / 180;
        const cosine = Math.cos(radians);
        const sine = Math.sin(radians);
        if (axis === "z") [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
        if (axis === "y") [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];
        if (axis === "x") [y, z] = [y * cosine - z * sine, y * sine + z * cosine];
      }
      return [x / object.transform.scale.x, y / object.transform.scale.y, z / object.transform.scale.z] as [number, number, number];
    };
    for (const referenceId of selectionReferenceIds) {
      const stored = document.topologyReferences.find((reference) => reference.id === referenceId);
      if (!stored) throw new Error(`${feature.name}: la selección ya no existe.`);
      if (stored.reference.hint.entityType === "face") {
        const faces = brep.getFaces(current);
        const topologyId = stored.reference.hint.topologyId;
        let face = topologyId === undefined ? undefined : faces.find((candidate) => brep.getHashCode(candidate) === topologyId);
        if (!face) {
          const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
          if (!resolution.ok) throw new Error(`${feature.name}: no se pudo recuperar una cara (${resolution.reason}).`);
          face = resolution.entity as Face;
        }
        edges.push(...brep.getEdges(face) as Edge[]);
        continue;
      }
      const candidates = brep.getEdges(current) as Edge[];
      const topologyId = stored.reference.hint.topologyId;
      let edge = topologyId === undefined ? undefined : candidates.find((candidate) => brep.getHashCode(candidate) === topologyId);
      if (!edge && stored.reference.hint.entityType === "edge" && stored.reference.hint.midpoint) {
        const target = localPoint(stored.reference.hint.midpoint);
        const averageScale = object ? (Math.abs(object.transform.scale.x) + Math.abs(object.transform.scale.y) + Math.abs(object.transform.scale.z)) / 3 : 1;
        const targetLength = stored.reference.hint.length === undefined ? 1 : stored.reference.hint.length / Math.max(0.0001, averageScale);
        const nearest = candidates.map((candidate) => {
          const midpoint = brep.curvePointAt(candidate, 0.5);
          const midpointDistance = Math.hypot(midpoint[0] - target[0], midpoint[1] - target[1], midpoint[2] - target[2]);
          const length = brep.unwrapOr(brep.measureLength(candidate), targetLength);
          return { candidate, score: (midpointDistance + Math.abs(length - targetLength)) / Math.max(1, targetLength) };
        }).sort((a, b) => a.score - b.score)[0];
        if (nearest && nearest.score <= 0.35) edge = nearest.candidate;
      }
      if (!edge) {
        const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
        if (!resolution.ok) throw new Error(`${feature.name}: no se pudo recuperar una arista (${resolution.reason}).`);
        edge = resolution.entity as Edge;
      }
      edges.push(edge);
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
  const faces = brep.getFaces(current);
  const topologyId = stored.reference.hint.topologyId;
  let face = topologyId === undefined ? undefined : faces.find((candidate) => brep.getHashCode(candidate) === topologyId);
  if (!face) {
    const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
    if (!resolution.ok) throw new Error(`${feature.name}: no se pudo recuperar la cara (${resolution.reason}).`);
    face = resolution.entity as Face;
  }
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

async function buildParametricModelInternal(document: ParametricDocument, contextFeatureId: string | null, stopAtContext: boolean): Promise<BuildResult> {
  const brep = await loadBrepWithOcct();
  const sketches = new Map<string, SketchFeature>();
  const objects = new Map(document.objects.map((object) => [object.id, object]));
  const completedFeatureIds: string[] = [];
  const solids = new Map<string, AnySolid>();
  let operationContext: BuildResult["operationContext"] = null;
  let lastObjectId = "legacy";

  try {
    for (const feature of topologicallySortedParametricFeatures(document)) {
      if (feature.suppressed) continue;
      if (feature.objectId && objects.get(feature.objectId)?.visible === false) continue;
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
        solids.set(objectId, applyBooleanOperation(brep, current, tool, feature));
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
      const selectionMesh = feature.id === contextFeatureId ? meshShape(brep, applyObjectTransform(brep, current, objects.get(objectId))) : undefined;
      if (feature.kind === "hole") {
        if (feature.diameter <= 0) throw new Error(`${feature.name}: el diámetro debe ser mayor que cero.`);
        const bounds = brep.getBounds(current);
        const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
        const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
        const cutter = brep.cylinder(feature.diameter / 2, Math.max(0.01, height), { at: [feature.x, feature.y, baseZ] });
        current = refinedBooleanSolid(brep, brep.cut(current, cutter));
        solids.set(objectId, current);
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
      }
      if (feature.id === contextFeatureId) {
        const selectedResult = solids.get(objectId);
        operationContext = selectedResult ? {
          featureId: feature.id,
          objectId,
          color: objects.get(objectId)?.color ?? "#d41721",
          mesh: meshShape(brep, applyObjectTransform(brep, selectedResult, objects.get(objectId))),
          selectionMesh,
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
      solids.set(objectId, applyBooleanOperation(brep, current, tool, feature));
      continue;
    }
    const objectId = feature.objectId ?? lastObjectId;
    let current = solids.get(objectId) ?? null;
    if (!current) continue;
    if (feature.kind === "hole") {
      const bounds = brep.getBounds(current);
      const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
      const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
      current = refinedBooleanSolid(brep, brep.cut(current, brep.cylinder(feature.diameter / 2, height, { at: [feature.x, feature.y, baseZ] })));
    } else if (feature.kind === "fillet") current = applyFilletFeature(brep, document, current, feature);
    else current = applyFaceExtrudeFeature(brep, document, current, feature);
    solids.set(objectId, current);
  }
  const result = combinedObjectShape(brep, worldObjectSolids(brep, solids, objects));
  if (!result) throw new Error("No hay ningún sólido para exportar.");
  return brep.unwrap(brep.exportSTEP(result));
}
