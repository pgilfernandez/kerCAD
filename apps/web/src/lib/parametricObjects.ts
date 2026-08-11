import { createExtrudeFeature, createParametricObject, createSketchFeature } from "@/lib/parametricDocument";
import type { ViewportSelection } from "@/components/ParametricViewport";
import type { ExtrudeFeature, ParametricDocument, ParametricFeature, ParametricObject, SketchFeature } from "@/types/parametric";
import type { WorkplaneShape } from "@/types/sketchforge";

export type SupportedPrimitive = "box" | "cylinder";
export type ParametricObjectNode = {
  id: string;
  name: string;
  object: ParametricObject;
  operations: ParametricFeature[];
};

export function sketchForExtrude(document: ParametricDocument, feature: ParametricFeature | null) {
  if (!feature || feature.kind !== "extrude") return null;
  return document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === feature.sketchId) ?? null;
}

export function objectIdForFeature(document: ParametricDocument, featureId: string | null) {
  if (!featureId) return null;
  if (document.objects.some((object) => object.id === featureId)) return featureId;
  const featureIndex = document.features.findIndex((feature) => feature.id === featureId);
  if (featureIndex < 0) return null;
  const feature = document.features[featureIndex];
  if (feature.objectId && document.objects.some((object) => object.id === feature.objectId)) {
    return feature.objectId;
  }
  if (feature.kind === "sketch") {
    return document.features.find((candidate) => candidate.kind === "extrude" && candidate.sketchId === feature.id)?.objectId ?? null;
  }
  return null;
}

export function parametricObjectTree(document: ParametricDocument): ParametricObjectNode[] {
  return document.objects.map((object) => {
    return {
      id: object.id,
      name: object.name,
      object,
      operations: document.features.filter((candidate) => candidate.objectId === object.id && candidate.kind !== "sketch"),
    };
  });
}

export function addParametricObject(document: ParametricDocument, position = { x: 0, y: 0, z: 0 }) {
  const object = createParametricObject(document.objects.length + 1, position);
  document.objects.push(object);
  return object.id;
}

export function addPrimitive(
  document: ParametricDocument,
  objectId: string,
  kind: SupportedPrimitive,
  position = { x: 0, y: 0 },
) {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  if (!object) return null;
  const objectOperations = document.features.filter((feature) => feature.objectId === objectId && feature.kind === "extrude");
  const count = document.features.filter((feature) => feature.kind === "extrude").length + 1;
  const sketch = createSketchFeature(kind === "box" ? "rectangle" : "circle", count);
  sketch.name = `Perfil de ${kind === "box" ? "Caja" : "Cilindro"}`;
  sketch.objectId = objectId;
  if (sketch.profile.shape === "rectangle") {
    sketch.profile.width = 20;
    sketch.profile.depth = 20;
  } else {
    sketch.profile.diameter = 20;
  }
  const extrusion = createExtrudeFeature(sketch.id, count, objectOperations.length > 0);
  extrusion.name = kind === "box" ? "Caja" : "Cilindro";
  extrusion.objectId = objectId;
  extrusion.distance = 20;
  extrusion.operation = "add";
  extrusion.transform.position.x = position.x;
  extrusion.transform.position.y = position.y;
  document.features.push(sketch, extrusion);
  return extrusion.id;
}

export function deleteParametricObject(document: ParametricDocument, id: string) {
  document.objects = document.objects.filter((object) => object.id !== id);
  document.features = document.features.filter((feature) => feature.objectId !== id);
}

export function duplicateParametricObject(document: ParametricDocument, id: string) {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return null;
  const objectClone = structuredClone(object);
  objectClone.id = `${object.id}-copy-${Date.now().toString(36)}`;
  objectClone.name = `${object.name} copia`;
  objectClone.transform.position.x += 10;
  objectClone.transform.position.y += 10;

  const sourceFeatures = document.features.filter((feature) => feature.objectId === id);
  const idMap = new Map(sourceFeatures.map((feature, index) => [feature.id, `${feature.id}-copy-${Date.now().toString(36)}-${index}`]));
  const featureClones = sourceFeatures.map((feature) => {
    const clone = structuredClone(feature);
    clone.id = idMap.get(feature.id)!;
    clone.objectId = objectClone.id;
    if (clone.kind === "extrude") {
      clone.sketchId = idMap.get(clone.sketchId) ?? clone.sketchId;
    }
    return clone;
  });
  document.objects.push(objectClone);
  document.features.push(...featureClones);
  return objectClone.id;
}

export function workplaneShapeForObject(document: ParametricDocument, id: string | null): WorkplaneShape | null {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return null;
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.kind === "extrude" && candidate.objectId === object.id) ?? null;
  if (!feature) return null;
  const sketch = sketchForExtrude(document, feature);
  if (!sketch) return null;
  const baseWidth = sketch.profile.shape === "rectangle" ? sketch.profile.width : sketch.profile.diameter;
  const baseDepth = sketch.profile.shape === "rectangle" ? sketch.profile.depth : sketch.profile.diameter;
  const width = baseWidth * object.transform.scale.x;
  const depth = baseDepth * object.transform.scale.y;
  return {
    id: object.id,
    name: object.name,
    kind: sketch.profile.shape === "rectangle" ? "box" : "cylinder",
    color: document.color,
    hole: feature.operation === "cut",
    x: object.transform.position.x,
    z: object.transform.position.y,
    elevation: object.transform.position.z,
    size: Math.max(width, depth),
    width,
    depth,
    height: feature.distance * object.transform.scale.z,
    rotation: object.transform.rotation.z,
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
    rotation: shape.rotation,
  };
}

function operationWorldTransform(object: ParametricObject, feature: ExtrudeFeature) {
  const angle = object.transform.rotation.z * Math.PI / 180;
  const localX = feature.transform.position.x * object.transform.scale.x;
  const localY = feature.transform.position.y * object.transform.scale.y;
  return {
    x: object.transform.position.x + localX * Math.cos(angle) - localY * Math.sin(angle),
    y: object.transform.position.y + localX * Math.sin(angle) + localY * Math.cos(angle),
    z: object.transform.position.z + feature.transform.position.z * object.transform.scale.z,
    rotation: object.transform.rotation.z + feature.transform.rotation.z,
  };
}

export function viewportSelectionForFeature(document: ParametricDocument, id: string | null): ViewportSelection | null {
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.id === id && candidate.kind === "extrude");
  if (!feature || feature.suppressed) return null;
  const object = document.objects.find((candidate) => candidate.id === feature.objectId);
  const sketch = sketchForExtrude(document, feature);
  if (!object || !sketch) return null;
  const world = operationWorldTransform(object, feature);
  const width = (sketch.profile.shape === "rectangle" ? sketch.profile.width : sketch.profile.diameter) * object.transform.scale.x;
  const depth = (sketch.profile.shape === "rectangle" ? sketch.profile.depth : sketch.profile.diameter) * object.transform.scale.y;
  return {
    id: feature.id,
    x: world.x,
    y: world.y,
    baseZ: world.z,
    width,
    depth,
    height: feature.distance * object.transform.scale.z,
    rotation: world.rotation,
  };
}

export function applyOperationWorldPosition(document: ParametricDocument, id: string, x: number, y: number) {
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.id === id && candidate.kind === "extrude");
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object) return;
  const angle = -object.transform.rotation.z * Math.PI / 180;
  const dx = x - object.transform.position.x;
  const dy = y - object.transform.position.y;
  feature.transform.position.x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / object.transform.scale.x;
  feature.transform.position.y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / object.transform.scale.y;
}

export function applyOperationWorldRotation(document: ParametricDocument, id: string, rotation: number) {
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.id === id && candidate.kind === "extrude");
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (feature && object) feature.transform.rotation.z = rotation - object.transform.rotation.z;
}

export function applyWorkplanePatch(document: ParametricDocument, id: string, patch: Partial<WorkplaneShape>) {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return;
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.kind === "extrude" && candidate.objectId === id);
  if (typeof patch.color === "string") document.color = patch.color;
  if (typeof patch.hidden === "boolean" && feature) feature.suppressed = patch.hidden;
  if (typeof patch.x === "number") object.transform.position.x = patch.x;
  if (typeof patch.z === "number") object.transform.position.y = patch.z;
  if (typeof patch.elevation === "number") object.transform.position.z = patch.elevation;
  if (typeof patch.rotation === "number") object.transform.rotation.z = patch.rotation;
}
