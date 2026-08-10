import { createExtrudeFeature, createSketchFeature } from "@/lib/parametricDocument";
import type { ViewportSelection } from "@/components/ParametricViewport";
import type { ParametricDocument, ParametricFeature, SketchFeature } from "@/types/parametric";
import type { WorkplaneShape } from "@/types/sketchforge";

export type SupportedPrimitive = "box" | "cylinder";

export function sketchForExtrude(document: ParametricDocument, feature: ParametricFeature | null) {
  if (!feature || feature.kind !== "extrude") return null;
  return document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === feature.sketchId) ?? null;
}

export function objectFeatures(document: ParametricDocument) {
  return document.features.filter((feature) => feature.kind === "extrude" || feature.kind === "hole");
}

export function addPrimitive(
  document: ParametricDocument,
  kind: SupportedPrimitive,
  position: { x: number; y: number },
) {
  const count = objectFeatures(document).length + 1;
  const sketch = createSketchFeature(kind === "box" ? "rectangle" : "circle", count);
  sketch.name = `Boceto de ${kind === "box" ? "Caja" : "Cilindro"}`;
  sketch.x = position.x;
  sketch.y = position.y;
  if (sketch.profile.shape === "rectangle") {
    sketch.profile.width = 20;
    sketch.profile.depth = 20;
  } else {
    sketch.profile.diameter = 20;
  }
  const extrusion = createExtrudeFeature(sketch.id, count, objectFeatures(document).length > 0);
  extrusion.name = kind === "box" ? "Caja" : "Cilindro";
  extrusion.distance = 20;
  extrusion.operation = objectFeatures(document).length === 0 ? "new" : "add";
  document.features.push(sketch, extrusion);
  return extrusion.id;
}

export function deleteParametricObject(document: ParametricDocument, id: string) {
  const feature = document.features.find((candidate) => candidate.id === id);
  if (!feature) return;
  const sketchId = feature.kind === "extrude" ? feature.sketchId : null;
  document.features = document.features.filter((candidate) => candidate.id !== id && candidate.id !== sketchId);
}

export function duplicateParametricObject(document: ParametricDocument, id: string) {
  const feature = document.features.find((candidate) => candidate.id === id);
  if (!feature) return null;
  if (feature.kind === "hole") {
    const clone = structuredClone(feature);
    clone.id = `${feature.id}-copy-${Date.now().toString(36)}`;
    clone.name = `${feature.name} copia`;
    clone.x += 10;
    clone.y += 10;
    document.features.push(clone);
    return clone.id;
  }
  if (feature.kind !== "extrude") return null;
  const sketch = sketchForExtrude(document, feature);
  if (!sketch) return null;
  const sketchClone = structuredClone(sketch);
  const featureClone = structuredClone(feature);
  sketchClone.id = `${sketch.id}-copy-${Date.now().toString(36)}`;
  sketchClone.name = `${sketch.name} copia`;
  sketchClone.x += 10;
  sketchClone.y += 10;
  featureClone.id = `${feature.id}-copy-${Date.now().toString(36)}`;
  featureClone.sketchId = sketchClone.id;
  featureClone.name = `${feature.name} copia`;
  if (featureClone.operation === "new") featureClone.operation = "add";
  document.features.push(sketchClone, featureClone);
  return featureClone.id;
}

export function workplaneShapeForObject(document: ParametricDocument, id: string | null): WorkplaneShape | null {
  const feature = document.features.find((candidate) => candidate.id === id) ?? null;
  if (!feature) return null;
  if (feature.kind === "hole") {
    return {
      id: feature.id,
      name: feature.name,
      kind: "cylinder",
      color: document.color,
      hole: true,
      x: feature.x,
      z: feature.y,
      elevation: 0,
      size: feature.diameter,
      width: feature.diameter,
      depth: feature.diameter,
      height: feature.depth,
      rotation: 0,
      sides: 96,
      hidden: feature.suppressed,
      locked: false,
    };
  }
  if (feature.kind !== "extrude") return null;
  const sketch = sketchForExtrude(document, feature);
  if (!sketch) return null;
  const width = sketch.profile.shape === "rectangle" ? sketch.profile.width : sketch.profile.diameter;
  const depth = sketch.profile.shape === "rectangle" ? sketch.profile.depth : sketch.profile.diameter;
  return {
    id: feature.id,
    name: feature.name,
    kind: sketch.profile.shape === "rectangle" ? "box" : "cylinder",
    color: document.color,
    hole: feature.operation === "cut",
    x: sketch.x,
    z: sketch.y,
    elevation: sketch.offset,
    size: Math.max(width, depth),
    width,
    depth,
    height: feature.distance,
    rotation: 0,
    radius: sketch.profile.shape === "rectangle" ? 0 : undefined,
    sides: sketch.profile.shape === "circle" ? 96 : undefined,
    hidden: feature.suppressed,
    locked: false,
  };
}

export function viewportSelectionForObject(document: ParametricDocument, id: string | null): ViewportSelection | null {
  const shape = workplaneShapeForObject(document, id);
  if (!shape || shape.hidden) return null;
  return {
    id: shape.id,
    x: shape.x,
    y: shape.z,
    baseZ: shape.elevation ?? 0,
    width: shape.width,
    depth: shape.depth,
    height: shape.height,
  };
}

export function applyWorkplanePatch(document: ParametricDocument, id: string, patch: Partial<WorkplaneShape>) {
  const feature = document.features.find((candidate) => candidate.id === id);
  if (!feature) return;
  if (typeof patch.color === "string") document.color = patch.color;
  if (typeof patch.hidden === "boolean") feature.suppressed = patch.hidden;
  if (feature.kind === "hole") {
    if (typeof patch.x === "number") feature.x = patch.x;
    if (typeof patch.z === "number") feature.y = patch.z;
    if (typeof patch.width === "number") feature.diameter = patch.width;
    if (typeof patch.depth === "number") feature.diameter = patch.depth;
    if (typeof patch.height === "number") {
      feature.depth = patch.height;
      feature.termination = "blind";
    }
    return;
  }
  if (feature.kind !== "extrude") return;
  const sketch = sketchForExtrude(document, feature);
  if (!sketch) return;
  if (typeof patch.x === "number") sketch.x = patch.x;
  if (typeof patch.z === "number") sketch.y = patch.z;
  if (typeof patch.elevation === "number") sketch.offset = patch.elevation;
  if (typeof patch.height === "number") feature.distance = Math.max(0.01, patch.height);
  if (typeof patch.hole === "boolean") {
    if (patch.hole) feature.operation = "cut";
    else {
      const featureIndex = document.features.findIndex((candidate) => candidate.id === feature.id);
      const hasEarlierSolid = document.features.slice(0, featureIndex).some((candidate) => candidate.kind === "extrude" && !candidate.suppressed && candidate.operation !== "cut");
      feature.operation = hasEarlierSolid ? "add" : "new";
    }
  }
  if (sketch.profile.shape === "rectangle") {
    if (typeof patch.width === "number") sketch.profile.width = Math.max(0.01, patch.width);
    if (typeof patch.depth === "number") sketch.profile.depth = Math.max(0.01, patch.depth);
  } else if (typeof patch.width === "number" || typeof patch.depth === "number") {
    sketch.profile.diameter = Math.max(0.01, patch.width ?? patch.depth ?? sketch.profile.diameter);
  }
}
