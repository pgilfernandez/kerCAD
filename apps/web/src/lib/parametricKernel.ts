import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";
import type { Edge } from "brepjs";
import { topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricObject, ParametricObjectRenderRecord, RenderMesh, SketchFeature } from "@/types/parametric";

type AnySolid = BrepSolid;
type CompoundShape = ReturnType<Brep["compound"]>;
type RenderableShape = AnySolid | CompoundShape;

function resultValue<T>(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]> | ReturnType<Brep["fillet"]>) {
  return brep.unwrap(result) as T;
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
  const operation = feature.transform;
  if (operation.rotation.x) solid = brep.rotate(solid, operation.rotation.x, { axis: [1, 0, 0] });
  if (operation.rotation.y) solid = brep.rotate(solid, operation.rotation.y, { axis: [0, 1, 0] });
  if (operation.rotation.z) solid = brep.rotate(solid, operation.rotation.z, { axis: [0, 0, 1] });
  if (operation.position.x || operation.position.y || operation.position.z) {
    solid = brep.translate(solid, [operation.position.x, operation.position.y, operation.position.z]);
  }
  return solid;
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

function objectRenderRecords(brep: Brep, worldSolids: Map<string, AnySolid>, objects: Map<string, ParametricObject>): ParametricObjectRenderRecord[] {
  return [...worldSolids].map(([objectId, solid]) => {
    const object = objects.get(objectId);
    return {
      objectId,
      renderId: parametricObjectRenderId(objectId),
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

function buildRenderOutput(brep: Brep, solids: Map<string, AnySolid>, objects: Map<string, ParametricObject>) {
  const worldSolids = worldObjectSolids(brep, solids, objects);
  const combined = combinedObjectShape(brep, worldSolids);
  return {
    mesh: combined ? meshShape(brep, combined) : null,
    objectRecords: objectRenderRecords(brep, worldSolids, objects),
  };
}

function applyFilletFeature(brep: Brep, document: ParametricDocument, current: AnySolid, feature: Extract<ParametricDocument["features"][number], { kind: "fillet" }>) {
  if (feature.edgeReferenceIds?.length) {
    const edges: Edge[] = [];
    for (const referenceId of feature.edgeReferenceIds) {
      const stored = document.topologyReferences.find((reference) => reference.id === referenceId);
      if (!stored) throw new Error(`${feature.name}: la arista seleccionada ya no existe.`);
      const resolution = brep.resolveRefIn(stored.reference as Parameters<Brep["resolveRefIn"]>[0], current);
      if (!resolution.ok) throw new Error(`${feature.name}: no se pudo recuperar una arista (${resolution.reason}).`);
      edges.push(resolution.entity as Edge);
    }
    return resultValue<AnySolid>(brep, brep.fillet(current, edges, feature.radius));
  }
  return resultValue<AnySolid>(brep, feature.edges === "vertical"
    ? brep.fillet(current, brep.edgeFinder().inDirection("Z"), feature.radius)
    : brep.fillet(current, feature.radius));
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
      if (feature.kind === "extrude") {
        const sketch = sketches.get(feature.sketchId);
        if (!sketch) throw new Error(`${feature.name}: no se encuentra el boceto de origen.`);
        if (feature.distance <= 0) throw new Error(`${feature.name}: la distancia debe ser mayor que cero.`);
        const objectId = feature.objectId ?? "legacy";
        lastObjectId = objectId;
        const current = solids.get(objectId) ?? null;
        const tool = solidFromSketch(brep, sketch, feature);
        if (!current) {
          if (feature.operation !== "add") throw new Error(`${feature.name}: la primera operación del objeto debe ser Añadir.`);
          solids.set(objectId, tool);
        } else if (feature.operation === "add") solids.set(objectId, resultValue<AnySolid>(brep, brep.fuse(current, tool)));
        else if (feature.operation === "cut") solids.set(objectId, resultValue<AnySolid>(brep, brep.cut(current, tool)));
        else solids.set(objectId, resultValue<AnySolid>(brep, brep.intersect(current, tool)));
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
      if (feature.kind === "hole") {
        if (feature.diameter <= 0) throw new Error(`${feature.name}: el diámetro debe ser mayor que cero.`);
        const bounds = brep.getBounds(current);
        const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
        const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
        const cutter = brep.cylinder(feature.diameter / 2, Math.max(0.01, height), { at: [feature.x, feature.y, baseZ] });
        current = resultValue<AnySolid>(brep, brep.cut(current, cutter));
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "fillet") {
        if (feature.radius <= 0) throw new Error(`${feature.name}: el radio debe ser mayor que cero.`);
        current = applyFilletFeature(brep, document, current, feature);
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      }
    }
  } catch (error) {
    return { ...buildRenderOutput(brep, solids, objects), operationContext, completedFeatureIds, warning: errorMessage(error) };
  }

  return { ...buildRenderOutput(brep, solids, objects), operationContext, completedFeatureIds, warning: null };
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
    if (feature.kind === "extrude") {
      const sketch = sketches.get(feature.sketchId);
      if (!sketch) throw new Error("El historial contiene una referencia de boceto rota.");
      const objectId = feature.objectId ?? "legacy";
      lastObjectId = objectId;
      const current = solids.get(objectId) ?? null;
      const tool = solidFromSketch(brep, sketch, feature);
      if (!current) {
        if (feature.operation !== "add") throw new Error(`${feature.name}: la primera operación del objeto debe ser Añadir.`);
        solids.set(objectId, tool);
      } else if (feature.operation === "add") solids.set(objectId, resultValue<AnySolid>(brep, brep.fuse(current, tool)));
      else if (feature.operation === "cut") solids.set(objectId, resultValue<AnySolid>(brep, brep.cut(current, tool)));
      else solids.set(objectId, resultValue<AnySolid>(brep, brep.intersect(current, tool)));
      continue;
    }
    const objectId = feature.objectId ?? lastObjectId;
    let current = solids.get(objectId) ?? null;
    if (!current) continue;
    if (feature.kind === "hole") {
      const bounds = brep.getBounds(current);
      const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
      const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
      current = resultValue<AnySolid>(brep, brep.cut(current, brep.cylinder(feature.diameter / 2, height, { at: [feature.x, feature.y, baseZ] })));
    } else current = applyFilletFeature(brep, document, current, feature);
    solids.set(objectId, current);
  }
  const result = combinedObjectShape(brep, worldObjectSolids(brep, solids, objects));
  if (!result) throw new Error("No hay ningún sólido para exportar.");
  return brep.unwrap(brep.exportSTEP(result));
}
