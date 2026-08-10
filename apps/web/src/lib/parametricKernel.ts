import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";
import type { BuildResult, ParametricDocument, RenderMesh, SketchFeature } from "@/types/parametric";

type AnySolid = BrepSolid;

function resultValue<T>(brep: Brep, result: ReturnType<Brep["cut"]> | ReturnType<Brep["fuse"]> | ReturnType<Brep["fillet"]>) {
  return brep.unwrap(result) as T;
}

function solidFromSketch(brep: Brep, sketch: SketchFeature, distance: number, symmetric: boolean): AnySolid {
  const profile = sketch.profile;
  const centerZ = symmetric ? sketch.offset : sketch.offset + distance / 2;
  if (profile.shape === "rectangle") {
    return brep.box(profile.width, profile.depth, distance, {
      centered: true,
      at: [sketch.x, sketch.y, centerZ],
    });
  }
  return brep.cylinder(profile.diameter / 2, distance, {
    centered: true,
    at: [sketch.x, sketch.y, centerZ],
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function buildParametricModel(document: ParametricDocument): Promise<BuildResult> {
  const brep = await loadBrepWithOcct();
  const sketches = new Map<string, SketchFeature>();
  const completedFeatureIds: string[] = [];
  let current: AnySolid | null = null;

  try {
    for (const feature of document.features) {
      if (feature.suppressed) continue;
      if (feature.kind === "sketch") {
        sketches.set(feature.id, feature);
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (feature.kind === "extrude") {
        const sketch = sketches.get(feature.sketchId);
        if (!sketch) throw new Error(`${feature.name}: no se encuentra el boceto de origen.`);
        if (feature.distance <= 0) throw new Error(`${feature.name}: la distancia debe ser mayor que cero.`);
        const tool = solidFromSketch(brep, sketch, feature.distance, feature.symmetric);
        if (!current || feature.operation === "new") current = tool;
        else if (feature.operation === "add") current = resultValue<AnySolid>(brep, brep.fuse(current, tool));
        else current = resultValue<AnySolid>(brep, brep.cut(current, tool));
        completedFeatureIds.push(feature.id);
        continue;
      }
      if (!current) throw new Error(`${feature.name}: primero hace falta crear un sólido.`);
      if (feature.kind === "hole") {
        if (feature.diameter <= 0) throw new Error(`${feature.name}: el diámetro debe ser mayor que cero.`);
        const bounds = brep.getBounds(current);
        const baseZ = feature.termination === "through-all" ? bounds.zMin - 1 : bounds.zMax - feature.depth;
        const height = feature.termination === "through-all" ? bounds.zMax - bounds.zMin + 2 : feature.depth + 1;
        const cutter = brep.cylinder(feature.diameter / 2, Math.max(0.01, height), { at: [feature.x, feature.y, baseZ] });
        current = resultValue<AnySolid>(brep, brep.cut(current, cutter));
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
        completedFeatureIds.push(feature.id);
      }
    }
  } catch (error) {
    return { mesh: current ? meshSolid(brep, current) : null, completedFeatureIds, warning: errorMessage(error) };
  }

  return { mesh: current ? meshSolid(brep, current) : null, completedFeatureIds, warning: null };
}

function meshSolid(brep: Brep, solid: AnySolid): RenderMesh {
  const triangles = brep.mesh(solid, { tolerance: 0.15, angularTolerance: 0.25 });
  const edgeMesh = brep.meshEdges(solid, { tolerance: 0.12, angularTolerance: 0.2 });
  const bounds = brep.getBounds(solid);
  const volumeResult = brep.measureVolume(solid);
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
  let current: AnySolid | null = null;
  for (const feature of document.features) {
    if (feature.suppressed) continue;
    if (feature.kind === "sketch") {
      sketches.set(feature.id, feature);
      continue;
    }
    if (feature.kind === "extrude") {
      const sketch = sketches.get(feature.sketchId);
      if (!sketch) throw new Error("El historial contiene una referencia de boceto rota.");
      const tool = solidFromSketch(brep, sketch, feature.distance, feature.symmetric);
      if (!current || feature.operation === "new") current = tool;
      else current = resultValue<AnySolid>(brep, feature.operation === "add" ? brep.fuse(current, tool) : brep.cut(current, tool));
      continue;
    }
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
  }
  if (!current) throw new Error("No hay ningún sólido para exportar.");
  return brep.unwrap(brep.exportSTEP(current));
}
