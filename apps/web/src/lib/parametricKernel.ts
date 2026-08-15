import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricObject, RenderMesh, SketchFeature } from "@/types/parametric";

type AnySolid = BrepSolid;
type CompoundShape = ReturnType<Brep["compound"]>;
type RenderableShape = AnySolid | CompoundShape;

function resultValue<T>(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["intersect"]> | ReturnType<Brep["fillet"]>) {
  return brep.unwrap(result) as T;
}

function solidFromSketch(brep: Brep, sketch: SketchFeature, feature: ExtrudeFeature, object?: ParametricObject): AnySolid {
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

function objectRenderMeshes(brep: Brep, solids: Map<string, AnySolid>, objects: Map<string, ParametricObject>) {
  return [...solids].map(([objectId, solid]) => ({
    objectId,
    color: objects.get(objectId)?.color ?? "#d41721",
    mesh: meshShape(brep, solid),
  }));
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
    for (const feature of document.features) {
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
        if (feature.id === contextFeatureId && current) {
          operationContext = {
            featureId: feature.id,
            objectId,
            color: objects.get(objectId)?.color ?? "#d41721",
            mesh: meshShape(brep, current),
          };
        }
        if (feature.id === contextFeatureId && stopAtContext) {
          return { mesh: null, objectMeshes: [], operationContext, completedFeatureIds, warning: null };
        }
        const tool = solidFromSketch(brep, sketch, feature, feature.objectId ? objects.get(feature.objectId) : undefined);
        if (!current) {
          if (feature.operation !== "add") throw new Error(`${feature.name}: la primera operación del objeto debe ser Añadir.`);
          solids.set(objectId, tool);
        } else if (feature.operation === "add") solids.set(objectId, resultValue<AnySolid>(brep, brep.fuse(current, tool)));
        else if (feature.operation === "cut") solids.set(objectId, resultValue<AnySolid>(brep, brep.cut(current, tool)));
        else solids.set(objectId, resultValue<AnySolid>(brep, brep.intersect(current, tool)));
        completedFeatureIds.push(feature.id);
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
        if (feature.edges === "vertical") {
          current = resultValue<AnySolid>(brep, brep.fillet(current, brep.edgeFinder().inDirection("Z"), feature.radius));
        } else {
          current = resultValue<AnySolid>(brep, brep.fillet(current, feature.radius));
        }
        solids.set(objectId, current);
        completedFeatureIds.push(feature.id);
      }
    }
  } catch (error) {
    const partial = combinedObjectShape(brep, solids);
    return { mesh: partial ? meshShape(brep, partial) : null, objectMeshes: objectRenderMeshes(brep, solids, objects), operationContext, completedFeatureIds, warning: errorMessage(error) };
  }

  const result = combinedObjectShape(brep, solids);
  return { mesh: result ? meshShape(brep, result) : null, objectMeshes: objectRenderMeshes(brep, solids, objects), operationContext, completedFeatureIds, warning: null };
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
  for (const feature of document.features) {
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
      const tool = solidFromSketch(brep, sketch, feature, feature.objectId ? objects.get(feature.objectId) : undefined);
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
    } else {
      current = resultValue<AnySolid>(brep, feature.edges === "vertical"
        ? brep.fillet(current, brep.edgeFinder().inDirection("Z"), feature.radius)
        : brep.fillet(current, feature.radius));
    }
    solids.set(objectId, current);
  }
  const result = combinedObjectShape(brep, solids);
  if (!result) throw new Error("No hay ningún sólido para exportar.");
  return brep.unwrap(brep.exportSTEP(result));
}
