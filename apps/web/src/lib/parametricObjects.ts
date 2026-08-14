import { createExtrudeFeature, createParametricObject, createSketchFeature } from "@/lib/parametricDocument";
import type { ViewportSelection } from "@/components/ParametricViewport";
import type { ExtrudeFeature, ParametricDocument, ParametricFeature, ParametricObject, SketchFeature } from "@/types/parametric";
import type { WorkplaneShape } from "@/types/sketchforge";

export type SupportedPrimitive = "box" | "cylinder";
export type ParametricTreeSelection = { id: string; kind: "object" | "feature" };
export const OBJECT_COLOR_PALETTE = [
  "#d41721", "#ff7a1a", "#f2cf10", "#33983d", "#18b99a", "#0098c7", "#3b82f6",
  "#294c93", "#6e2786", "#c9009a", "#8a5a2b", "#ffffff", "#cfd8df", "#8a98a6", "#4b5563", "#111111",
];
const NEW_OBJECT_COLOR_PALETTE = OBJECT_COLOR_PALETTE.slice(0, 10);
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

export function lastOperationForObject(document: ParametricDocument, objectId: string) {
  return document.features.findLast((feature) => feature.objectId === objectId && feature.kind !== "sketch") ?? null;
}

export function colorForNewParametricObject(document: ParametricDocument, random = Math.random) {
  const used = new Set(document.objects.map((object) => object.color.toLowerCase()));
  let candidates = NEW_OBJECT_COLOR_PALETTE.filter((color) => !used.has(color));
  if (candidates.length === 0) {
    const lastColor = document.objects.at(-1)?.color.toLowerCase();
    candidates = NEW_OBJECT_COLOR_PALETTE.filter((color) => color !== lastColor);
  }
  const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * candidates.length));
  return candidates[Math.max(0, index)] ?? document.color;
}

export function addParametricObject(document: ParametricDocument, position = { x: 0, y: 0, z: 0 }, random = Math.random) {
  const object = createParametricObject(document.objects.length + 1, position);
  object.color = colorForNewParametricObject(document, random);
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

export function addPrimitiveToSelection(
  document: ParametricDocument,
  selectedObjectId: string | null,
  kind: SupportedPrimitive,
) {
  let objectId = selectedObjectId;
  let createdObject = false;
  if (!objectId || !document.objects.some((object) => object.id === objectId)) {
    const count = document.objects.length;
    objectId = addParametricObject(document, { x: count * 8, y: count * 6, z: 0 });
    createdObject = true;
  }
  const operationCount = document.features.filter((feature) => feature.kind === "extrude" && feature.objectId === objectId).length;
  const featureId = addPrimitive(document, objectId, kind, {
    x: operationCount === 0 ? 0 : operationCount * 8,
    y: operationCount === 0 ? 0 : operationCount * 6,
  });
  return { objectId, featureId, createdObject };
}

export function deleteParametricObject(document: ParametricDocument, id: string) {
  document.objects = document.objects.filter((object) => object.id !== id);
  document.features = document.features.filter((feature) => feature.objectId !== id);
}

export function deleteParametricFeature(document: ParametricDocument, id: string): { objectId: string | null; nextId: string | null } {
  const feature = document.features.find((candidate) => candidate.id === id);
  if (!feature) return { objectId: null, nextId: null };
  const objectId = objectIdForFeature(document, id);
  const operations = document.features.filter((candidate) => candidate.objectId === objectId && candidate.kind !== "sketch");
  const operationIndex = operations.findIndex((candidate) => candidate.id === id);
  const ids = new Set([id]);
  if (feature.kind === "extrude") ids.add(feature.sketchId);
  if (feature.kind === "sketch") {
    for (const candidate of document.features) {
      if (candidate.kind === "extrude" && candidate.sketchId === feature.id) ids.add(candidate.id);
    }
  }
  document.features = document.features.filter((candidate) => !ids.has(candidate.id));
  const remaining = operations.filter((candidate) => !ids.has(candidate.id));
  const nextId = remaining[Math.max(0, operationIndex - 1)]?.id ?? remaining[0]?.id ?? objectId;
  return { objectId, nextId };
}

export function deleteParametricSelection(document: ParametricDocument, selection: ParametricTreeSelection[]) {
  const objectIds = new Set(selection.filter((item) => item.kind === "object").map((item) => item.id));
  for (const objectId of objectIds) deleteParametricObject(document, objectId);
  for (const item of selection) {
    if (item.kind !== "feature") continue;
    const ownerId = objectIdForFeature(document, item.id);
    if (!ownerId || !objectIds.has(ownerId)) deleteParametricFeature(document, item.id);
  }
}

export function updateParametricTreeSelection(
  current: ParametricTreeSelection[],
  node: ParametricTreeSelection,
  visible: ParametricTreeSelection[],
  anchor: ParametricTreeSelection | null,
  modifiers: { range: boolean; toggle: boolean },
) {
  if (modifiers.range) {
    const start = anchor ?? current.at(-1) ?? node;
    const startIndex = visible.findIndex((candidate) => candidate.id === start.id && candidate.kind === start.kind);
    const endIndex = visible.findIndex((candidate) => candidate.id === node.id && candidate.kind === node.kind);
    if (startIndex >= 0 && endIndex >= 0) return visible.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
  }
  if (modifiers.toggle) {
    const exists = current.some((candidate) => candidate.id === node.id && candidate.kind === node.kind);
    return exists ? current.filter((candidate) => candidate.id !== node.id || candidate.kind !== node.kind) : [...current, node];
  }
  return [node];
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
    color: object.color,
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
    hidden: !object.visible || feature.suppressed,
    locked: object.locked,
  };
}

export function viewportSelectionForObject(document: ParametricDocument, id: string | null): ViewportSelection | null {
  const shape = workplaneShapeForObject(document, id);
  if (!shape || shape.hidden || shape.locked) return null;
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
  if (!object || !object.visible || object.locked || !sketch) return null;
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

export function resizeParametricSelection(
  document: ParametricDocument,
  id: string,
  selectionKind: "object" | "feature",
  x: number,
  y: number,
  width: number,
  depth: number,
) {
  if (selectionKind === "object") {
    const object = document.objects.find((candidate) => candidate.id === id);
    const current = viewportSelectionForObject(document, id);
    if (!object || !current) return;
    object.transform.position.x = x;
    object.transform.position.y = y;
    object.transform.scale.x *= width / Math.max(0.01, current.width);
    object.transform.scale.y *= depth / Math.max(0.01, current.depth);
    return;
  }
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.id === id && candidate.kind === "extrude");
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  const sketch = feature ? sketchForExtrude(document, feature) : null;
  const current = viewportSelectionForFeature(document, id);
  if (!feature || !object || !sketch || !current) return;
  applyOperationWorldPosition(document, id, x, y);
  if (sketch.profile.shape === "rectangle") {
    sketch.profile.width = Math.max(0.1, width / Math.max(0.01, Math.abs(object.transform.scale.x)));
    sketch.profile.depth = Math.max(0.1, depth / Math.max(0.01, Math.abs(object.transform.scale.y)));
  } else {
    const widthRatio = width / Math.max(0.01, current.width);
    const depthRatio = depth / Math.max(0.01, current.depth);
    const ratio = Math.abs(widthRatio - 1) >= Math.abs(depthRatio - 1) ? widthRatio : depthRatio;
    sketch.profile.diameter = Math.max(0.1, sketch.profile.diameter * ratio);
  }
}

export function resizeParametricHeight(document: ParametricDocument, id: string, selectionKind: "object" | "feature", height: number) {
  if (selectionKind === "object") {
    const object = document.objects.find((candidate) => candidate.id === id);
    const current = viewportSelectionForObject(document, id);
    if (!object || !current) return;
    object.transform.scale.z *= Math.max(0.1, height) / Math.max(0.01, current.height);
    return;
  }
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.id === id && candidate.kind === "extrude");
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object) return;
  feature.distance = Math.max(0.1, height / Math.max(0.01, Math.abs(object.transform.scale.z)));
}

export function applyWorkplanePatch(document: ParametricDocument, id: string, patch: Partial<WorkplaneShape>) {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return;
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.kind === "extrude" && candidate.objectId === id);
  if (typeof patch.color === "string") object.color = patch.color;
  if (typeof patch.hidden === "boolean" && feature) feature.suppressed = patch.hidden;
  if (typeof patch.x === "number") object.transform.position.x = patch.x;
  if (typeof patch.z === "number") object.transform.position.y = patch.z;
  if (typeof patch.elevation === "number") object.transform.position.z = patch.elevation;
  if (typeof patch.rotation === "number") object.transform.rotation.z = patch.rotation;
}
