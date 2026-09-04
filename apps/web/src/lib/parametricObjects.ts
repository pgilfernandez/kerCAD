import { createExtrudeFeature, createParametricObject, createPrimitiveFeature, createSketchFeature } from "@/lib/parametricDocument";
import type { ViewportSelection } from "@/components/ParametricViewport";
import type { ExtrudeFeature, ParametricDocument, ParametricFeature, ParametricObject, PrimitiveFeature, SketchFeature } from "@/types/parametric";
import type { ParametricPrimitiveKind } from "@/lib/parametricOperationCatalog";
import { parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import type { WorkplaneShape } from "@/types/sketchforge";
import { objectPlacementForWorkplane, operationPlacementForWorkplane, parametricRotationFromMatrix, parametricTransformMatrix } from "@/lib/parametricWorkplane";
import { transformParametricObjectTopologyHints } from "@/lib/parametricTopology";
import * as THREE from "three";

export type SupportedPrimitive = ParametricPrimitiveKind;
type TransformableOperation = ExtrudeFeature | PrimitiveFeature;
type MovableOperation = TransformableOperation | SketchFeature;

function isTransformableOperation(feature: ParametricFeature): feature is TransformableOperation {
  return feature.kind === "extrude" || feature.kind === "primitive";
}

function isMovableOperation(feature: ParametricFeature): feature is MovableOperation {
  return isTransformableOperation(feature) || (feature.kind === "sketch" && feature.purpose === "user");
}

function sketchDimensions(sketch: SketchFeature) {
  if (sketch.profile.shape === "rectangle") return { width: sketch.profile.width, depth: sketch.profile.depth, centerX: 0, centerY: 0 };
  if (sketch.profile.shape === "circle") return { width: sketch.profile.diameter, depth: sketch.profile.diameter, centerX: 0, centerY: 0 };
  const points = sketch.profile.geometry.points;
  const circles = sketch.profile.geometry.circles ?? [];
  const minX = [...points.map((point) => point.x), ...circles.map((circle) => circle.x - circle.radius)];
  const maxX = [...points.map((point) => point.x), ...circles.map((circle) => circle.x + circle.radius)];
  const minZ = [...points.map((point) => point.z), ...circles.map((circle) => circle.z - circle.radius)];
  const maxZ = [...points.map((point) => point.z), ...circles.map((circle) => circle.z + circle.radius)];
  if (!minX.length) return { width: 0.1, depth: 0.1, centerX: 0, centerY: 0 };
  const bounds = {
    minX: Math.min(...minX),
    maxX: Math.max(...maxX),
    minY: Math.min(...minZ),
    maxY: Math.max(...maxZ),
  };
  return {
    width: Math.max(0.1, bounds.maxX - bounds.minX),
    depth: Math.max(0.1, bounds.maxY - bounds.minY),
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
  };
}
export type ParametricTreeSelection = { id: string; kind: "object" | "feature" };
export const OBJECT_COLOR_PALETTE = [
  "#bb0f17", "#e8731f", "#ddbd09", "#65c412", "#0f952a", "#18b99a", "#0098c7", "#3b82f6", "#8112cb", "#d03cab", "#b26519", "#ffffff", "#cfd8df", "#8a98a6", "#4b5563", "#111111",
];

export function canResetParametricFeature(feature: ParametricFeature) {
  return feature.kind !== "sketch" && feature.kind !== "importedStep";
}

export function resetParametricFeature(document: ParametricDocument, featureId: string) {
  const feature = document.features.find((candidate) => candidate.id === featureId);
  if (!feature || !canResetParametricFeature(feature)) return false;
  const zeroTransform = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  if (feature.kind === "extrude") {
    feature.distance = 10;
    feature.symmetric = false;
    feature.operation = "add";
    feature.transform = zeroTransform();
  } else if (feature.kind === "primitive") {
    const defaults = createPrimitiveFeature(feature.primitive, 1);
    feature.width = defaults.width;
    feature.depth = defaults.depth;
    feature.height = defaults.height;
    feature.operation = defaults.operation;
    feature.transform = defaults.transform;
    feature.topRadius = defaults.topRadius;
    feature.innerRadius = defaults.innerRadius;
    feature.majorRadius = defaults.majorRadius;
    feature.tubeRadius = defaults.tubeRadius;
    feature.cornerRadius = defaults.cornerRadius;
    feature.sides = defaults.sides;
    feature.teeth = defaults.teeth;
    feature.toothDepth = defaults.toothDepth;
    feature.boreRadius = defaults.boreRadius;
  } else if (feature.kind === "hole") {
    feature.x = 0;
    feature.y = 0;
    feature.diameter = 8;
    feature.termination = "through-all";
    feature.depth = 10;
  } else if (feature.kind === "fillet") {
    feature.treatment = "fillet";
    feature.radius = 2;
    feature.edges = "vertical";
  } else if (feature.kind === "faceExtrude") {
    feature.operation = "add";
    feature.distance = 10;
  } else if (feature.kind === "shell") {
    feature.thickness = 2;
  } else if (feature.kind === "revolve") {
    feature.operation = "add";
    feature.angle = 360;
    feature.axis = "z";
    delete feature.axisReferenceId;
  } else if (feature.kind === "mirror") {
    feature.axis = "x";
    feature.duplicate = true;
  } else if (feature.kind === "linearPattern") {
    feature.source = "body";
    delete feature.sourceFeatureId;
    feature.axis = "x";
    feature.count = 3;
    feature.spacing = 20;
  } else if (feature.kind === "polarPattern") {
    feature.source = "body";
    delete feature.sourceFeatureId;
    feature.axis = "z";
    feature.count = 6;
    feature.angle = 360;
    feature.equalSpacing = true;
  } else if (feature.kind === "objectBoolean") {
    feature.operation = "add";
  }
  return true;
}
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
      operations: document.features.filter((candidate) => candidate.objectId === object.id && (candidate.kind !== "sketch" || candidate.purpose === "user")),
    };
  });
}

export function lastOperationForObject(document: ParametricDocument, objectId: string) {
  return document.features.findLast((feature) => feature.objectId === objectId && (feature.kind !== "sketch" || feature.purpose === "user")) ?? null;
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
  const count = document.features.filter((feature) => feature.kind !== "sketch").length + 1;
  if (kind === "roundedBox" || kind === "sphere" || kind === "cone" || kind === "tube" || kind === "halfSphere" || kind === "torus" || kind === "pyramid" || kind === "wedge" || kind === "roof" || kind === "roundRoof" || kind === "polygon" || kind === "gear") {
    const definition = parametricOperationDefinition(kind);
    const primitive = createPrimitiveFeature(kind, count);
    primitive.objectId = objectId;
    primitive.name = definition.name;
    primitive.width = definition.parameters.find((parameter) => parameter.key === "width")?.defaultValue ?? 20;
    primitive.depth = definition.parameters.find((parameter) => parameter.key === "depth")?.defaultValue ?? 20;
    primitive.height = definition.parameters.find((parameter) => parameter.key === "height")?.defaultValue ?? 20;
    if (kind === "roundedBox") primitive.cornerRadius = definition.parameters.find((parameter) => parameter.key === "cornerRadius")?.defaultValue ?? 3;
    if (kind === "cone") {
      const baseRadius = definition.parameters.find((parameter) => parameter.key === "baseRadius")?.defaultValue ?? 10;
      primitive.width = baseRadius * 2;
      primitive.depth = baseRadius * 2;
      primitive.topRadius = definition.parameters.find((parameter) => parameter.key === "topRadius")?.defaultValue ?? 0;
    }
    if (kind === "tube") {
      const innerRadius = definition.parameters.find((parameter) => parameter.key === "innerRadius")?.defaultValue ?? 6;
      const thickness = definition.parameters.find((parameter) => parameter.key === "thickness")?.defaultValue ?? 4;
      const outerRadius = innerRadius + thickness;
      primitive.width = outerRadius * 2;
      primitive.depth = outerRadius * 2;
      primitive.innerRadius = innerRadius;
    }
    if (kind === "halfSphere") {
      const radius = definition.parameters.find((parameter) => parameter.key === "radius")?.defaultValue ?? 10;
      primitive.width = radius * 2;
      primitive.depth = radius * 2;
    }
    if (kind === "torus") {
      primitive.majorRadius = definition.parameters.find((parameter) => parameter.key === "majorRadius")?.defaultValue ?? 12;
      primitive.tubeRadius = definition.parameters.find((parameter) => parameter.key === "tubeRadius")?.defaultValue ?? 4;
      primitive.width = (primitive.majorRadius + primitive.tubeRadius) * 2;
      primitive.depth = primitive.width;
      primitive.height = primitive.tubeRadius * 2;
    }
    if (kind === "polygon") {
      const radius = definition.parameters.find((parameter) => parameter.key === "radius")?.defaultValue ?? 10;
      primitive.width = radius * 2;
      primitive.depth = radius * 2;
      primitive.sides = definition.parameters.find((parameter) => parameter.key === "sides")?.defaultValue ?? 6;
    }
    if (kind === "gear") {
      const outerRadius = definition.parameters.find((parameter) => parameter.key === "outerRadius")?.defaultValue ?? 15;
      primitive.width = outerRadius * 2;
      primitive.depth = outerRadius * 2;
      primitive.teeth = definition.parameters.find((parameter) => parameter.key === "teeth")?.defaultValue ?? 12;
      primitive.toothDepth = definition.parameters.find((parameter) => parameter.key === "toothDepth")?.defaultValue ?? 2.5;
      primitive.boreRadius = definition.parameters.find((parameter) => parameter.key === "boreRadius")?.defaultValue ?? 3;
    }
    primitive.operation = "add";
    primitive.transform.position.x = position.x;
    primitive.transform.position.y = position.y;
    document.features.push(primitive);
    return primitive.id;
  }
  const sketch = createSketchFeature(kind === "box" ? "rectangle" : "circle", count);
  sketch.name = `${kind === "box" ? "Box" : "Cylinder"} profile`;
  sketch.objectId = objectId;
  if (sketch.profile.shape === "rectangle") {
    sketch.profile.width = 20;
    sketch.profile.depth = 20;
  } else if (sketch.profile.shape === "circle") {
    sketch.profile.diameter = 20;
  }
  const extrusion = createExtrudeFeature(sketch.id, count, false);
  extrusion.name = kind === "box" ? "Box" : "Cylinder";
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
    objectId = addParametricObject(document, document.workplane.origin);
    const object = document.objects.find((candidate) => candidate.id === objectId)!;
    const placement = objectPlacementForWorkplane(document.workplane);
    object.transform.position = placement.position;
    object.transform.rotation = placement.rotation;
    createdObject = true;
  }
  const object = document.objects.find((candidate) => candidate.id === objectId)!;
  const featureId = addPrimitive(document, objectId, kind);
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === featureId && isTransformableOperation(candidate));
  if (feature && !createdObject) feature.transform = operationPlacementForWorkplane(document.workplane, object);
  return { objectId, featureId, createdObject };
}

export function deleteParametricObject(document: ParametricDocument, id: string) {
  document.objects = document.objects.filter((object) => object.id !== id);
  document.features = document.features.filter((feature) => feature.objectId !== id);
  document.topologyReferences = document.topologyReferences.filter((reference) => reference.objectId !== id);
}

export function deleteParametricFeature(document: ParametricDocument, id: string): { objectId: string | null; nextId: string | null } {
  const feature = document.features.find((candidate) => candidate.id === id);
  if (!feature) return { objectId: null, nextId: null };
  const objectId = objectIdForFeature(document, id);
  const operations = document.features.filter((candidate) => candidate.objectId === objectId && (candidate.kind !== "sketch" || candidate.purpose === "user"));
  const operationIndex = operations.findIndex((candidate) => candidate.id === id);
  const ids = new Set([id]);
  const ownedReferenceIds = new Set(feature.kind === "fillet" ? [...(feature.edgeReferenceIds ?? []), ...(feature.selectionReferenceIds ?? [])] : feature.kind === "faceExtrude" ? [feature.faceReferenceId] : feature.kind === "revolve" ? [...(feature.faceReferenceId ? [feature.faceReferenceId] : []), ...(feature.axisReferenceId ? [feature.axisReferenceId] : [])] : feature.kind === "shell" ? feature.faceReferenceIds : []);
  if (feature.kind === "extrude") {
    const sketch = document.features.find((candidate) => candidate.kind === "sketch" && candidate.id === feature.sketchId);
    if (sketch?.kind === "sketch" && sketch.purpose !== "user") ids.add(feature.sketchId);
  }
  if (feature.kind === "sketch") {
    for (const candidate of document.features) {
      if (candidate.kind === "extrude" && candidate.sketchId === feature.id) ids.add(candidate.id);
      if (candidate.kind === "revolve" && candidate.source === "sketch" && candidate.sketchId === feature.id) ids.add(candidate.id);
    }
  }
  let addedDependent = true;
  while (addedDependent) {
    addedDependent = false;
    for (const candidate of document.features) {
      if (ids.has(candidate.id) || !candidate.dependencies?.some((dependency) => dependency.type === "feature" && ids.has(dependency.id))) continue;
      ids.add(candidate.id);
      addedDependent = true;
    }
  }
  document.features = document.features.filter((candidate) => !ids.has(candidate.id));
  document.topologyReferences = document.topologyReferences.filter((reference) => !ids.has(reference.sourceFeatureId) && !ownedReferenceIds.has(reference.id));
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

function moveSelectedIds(ids: string[], selectedIds: Set<string>, direction: "up" | "down") {
  const reordered = [...ids];
  let moved = false;
  if (direction === "up") {
    for (let index = 1; index < reordered.length; index += 1) {
      if (!selectedIds.has(reordered[index]) || selectedIds.has(reordered[index - 1])) continue;
      [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
      moved = true;
    }
  } else {
    for (let index = reordered.length - 2; index >= 0; index -= 1) {
      if (!selectedIds.has(reordered[index]) || selectedIds.has(reordered[index + 1])) continue;
      [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
      moved = true;
    }
  }
  return { reordered, moved };
}

export function canReorderParametricSelection(document: ParametricDocument, selection: ParametricTreeSelection[], direction: "up" | "down") {
  if (selection.length === 0) return false;
  const selectedKind = selection[0].kind;
  if (selection.some((item) => item.kind !== selectedKind)) return false;
  if (selectedKind === "object") {
    const ids = document.objects.map((object) => object.id);
    return moveSelectedIds(ids, new Set(selection.map((item) => item.id)), direction).moved;
  }
  const ownerIds = new Set(selection.map((item) => objectIdForFeature(document, item.id)));
  if (ownerIds.size !== 1 || ownerIds.has(null)) return false;
  const objectId = [...ownerIds][0];
  const operations = document.features.filter((feature) => feature.objectId === objectId && (feature.kind !== "sketch" || feature.purpose === "user"));
  const { reordered, moved } = moveSelectedIds(operations.map((feature) => feature.id), new Set(selection.map((item) => item.id)), direction);
  const importedBase = operations.find((feature) => feature.kind === "importedStep");
  return moved && (!importedBase || reordered[0] === importedBase.id);
}

export function reorderParametricSelection(document: ParametricDocument, selection: ParametricTreeSelection[], direction: "up" | "down") {
  if (!canReorderParametricSelection(document, selection, direction)) return false;
  const selectedIds = new Set(selection.map((item) => item.id));
  if (selection[0].kind === "object") {
    const { reordered } = moveSelectedIds(document.objects.map((object) => object.id), selectedIds, direction);
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    document.objects = reordered.map((id) => byId.get(id)!);
    return true;
  }

  const objectId = objectIdForFeature(document, selection[0].id);
  if (!objectId) return false;
  const ownedFeatures = document.features.filter((feature) => feature.objectId === objectId);
  const operations = ownedFeatures.filter((feature) => feature.kind !== "sketch" || feature.purpose === "user");
  const { reordered } = moveSelectedIds(operations.map((feature) => feature.id), selectedIds, direction);
  const byId = new Map(ownedFeatures.map((feature) => [feature.id, feature]));
  const consumed = new Set<string>();
  const orderedOwned = reordered.flatMap((id) => {
    const operation = byId.get(id);
    if (!operation) return [];
    const group: ParametricFeature[] = [];
    if (operation.kind === "extrude") {
      const sketch = byId.get(operation.sketchId);
      if (sketch?.kind === "sketch" && sketch.purpose !== "user") {
        group.push(sketch);
        consumed.add(sketch.id);
      }
    }
    group.push(operation);
    consumed.add(operation.id);
    return group;
  });
  orderedOwned.push(...ownedFeatures.filter((feature) => !consumed.has(feature.id)));
  let ownedIndex = 0;
  document.features = document.features.map((feature) => feature.objectId === objectId ? orderedOwned[ownedIndex++] : feature);
  return true;
}

export function renameParametricSelection(document: ParametricDocument, selection: ParametricTreeSelection[], name: string) {
  const nextName = name.trim();
  if (!nextName || selection.length === 0) return false;
  const objectIds = new Set(selection.filter((item) => item.kind === "object").map((item) => item.id));
  const featureIds = new Set(selection.filter((item) => item.kind === "feature").map((item) => item.id));
  let renamed = false;
  for (const object of document.objects) {
    if (!objectIds.has(object.id)) continue;
    object.name = nextName;
    renamed = true;
  }
  for (const feature of document.features) {
    if (!featureIds.has(feature.id)) continue;
    feature.name = nextName;
    renamed = true;
  }
  return renamed;
}

export function duplicateParametricObject(document: ParametricDocument, id: string) {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return null;
  const objectClone = structuredClone(object);
  objectClone.id = `${object.id}-copy-${Date.now().toString(36)}`;
  objectClone.name = `${object.name} copy`;
  objectClone.transform.position.x += 10;
  objectClone.transform.position.y += 10;

  const sourceFeatures = document.features.filter((feature) => feature.objectId === id);
  const idMap = new Map(sourceFeatures.map((feature, index) => [feature.id, `${feature.id}-copy-${Date.now().toString(36)}-${index}`]));
  const sourceTopology = document.topologyReferences.filter((reference) => reference.objectId === id);
  const topologyIdMap = new Map(sourceTopology.map((reference, index) => [reference.id, `${reference.id}-copy-${Date.now().toString(36)}-${index}`]));
  const featureClones = sourceFeatures.map((feature) => {
    const clone = structuredClone(feature);
    clone.id = idMap.get(feature.id)!;
    clone.objectId = objectClone.id;
    if (clone.kind === "extrude") {
      clone.sketchId = idMap.get(clone.sketchId) ?? clone.sketchId;
    }
    clone.dependencies = clone.dependencies?.map((reference) => reference.type === "feature"
      ? { ...reference, id: idMap.get(reference.id) ?? reference.id }
      : { ...reference, id: reference.id === id ? objectClone.id : reference.id });
    if (clone.kind === "fillet") {
      clone.edgeReferenceIds = clone.edgeReferenceIds?.map((referenceId) => topologyIdMap.get(referenceId) ?? referenceId);
      clone.selectionReferenceIds = clone.selectionReferenceIds?.map((referenceId) => topologyIdMap.get(referenceId) ?? referenceId);
    }
    if (clone.kind === "faceExtrude") clone.faceReferenceId = topologyIdMap.get(clone.faceReferenceId) ?? clone.faceReferenceId;
    if (clone.kind === "revolve" && clone.faceReferenceId) clone.faceReferenceId = topologyIdMap.get(clone.faceReferenceId) ?? clone.faceReferenceId;
    if (clone.kind === "revolve" && clone.sketchId) clone.sketchId = idMap.get(clone.sketchId) ?? clone.sketchId;
    if (clone.kind === "revolve" && clone.axisReferenceId) clone.axisReferenceId = topologyIdMap.get(clone.axisReferenceId) ?? clone.axisReferenceId;
    if (clone.kind === "shell") clone.faceReferenceIds = clone.faceReferenceIds.map((referenceId) => topologyIdMap.get(referenceId) ?? referenceId);
    return clone;
  });
  const topologyClones = sourceTopology.map((reference) => {
    const clone = structuredClone(reference);
    clone.id = topologyIdMap.get(reference.id)!;
    clone.objectId = objectClone.id;
    clone.sourceFeatureId = idMap.get(reference.sourceFeatureId) ?? reference.sourceFeatureId;
    if (clone.reference.origin === reference.sourceFeatureId) clone.reference.origin = clone.sourceFeatureId;
    return clone;
  });
  document.objects.push(objectClone);
  document.features.push(...featureClones);
  document.topologyReferences.push(...topologyClones);
  return objectClone.id;
}

function uniqueDuplicateId(document: ParametricDocument, base: string) {
  const used = new Set([
    ...document.objects.map((object) => object.id),
    ...document.features.map((feature) => feature.id),
    ...document.topologyReferences.map((reference) => reference.id),
  ]);
  let suffix = 1;
  let id = `${base}-copy`;
  while (used.has(id)) id = `${base}-copy-${suffix += 1}`;
  return id;
}

function topologyIdsForFeature(feature: ParametricFeature) {
  if (feature.kind === "fillet") return feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [];
  if (feature.kind === "faceExtrude") return [feature.faceReferenceId];
  if (feature.kind === "shell") return feature.faceReferenceIds;
  if (feature.kind === "revolve") return [feature.faceReferenceId, feature.axisReferenceId].filter((id): id is string => Boolean(id));
  return [];
}

/** Copies one editable history operation, including private sketch/topology inputs. */
export function duplicateParametricFeature(document: ParametricDocument, featureId: string, targetObjectId?: string) {
  const source = document.features.find((feature) => feature.id === featureId);
  if (!source?.objectId) return null;
  const targetId = targetObjectId ?? source.objectId;
  if (!document.objects.some((object) => object.id === targetId)) return null;

  const clone = structuredClone(source);
  clone.id = uniqueDuplicateId(document, source.id);
  clone.objectId = targetId;
  clone.name = `${source.name} copy`;

  const featureIdMap = new Map<string, string>([[source.id, clone.id]]);
  const supportingFeatures: ParametricFeature[] = [];
  const sourceSketchId = source.kind === "extrude" ? source.sketchId : source.kind === "revolve" ? source.sketchId : undefined;
  if (sourceSketchId) {
    const sourceSketch = document.features.find((feature): feature is SketchFeature => feature.id === sourceSketchId && feature.kind === "sketch");
    if (sourceSketch) {
      const sketchClone = structuredClone(sourceSketch);
      sketchClone.id = uniqueDuplicateId(document, sourceSketch.id);
      sketchClone.objectId = targetId;
      sketchClone.name = `${sourceSketch.name} copy`;
      featureIdMap.set(sourceSketch.id, sketchClone.id);
      supportingFeatures.push(sketchClone);
      if (clone.kind === "extrude") clone.sketchId = sketchClone.id;
      if (clone.kind === "revolve") clone.sketchId = sketchClone.id;
    }
  }

  const previousTargetOperation = [...document.features].reverse().find((feature) => feature.objectId === targetId && feature.kind !== "sketch");
  if ((clone.kind === "linearPattern" || clone.kind === "polarPattern") && targetId !== source.objectId && previousTargetOperation) {
    clone.sourceFeatureId = previousTargetOperation.id;
  }

  clone.dependencies = clone.dependencies?.map((dependency) => dependency.type === "feature"
    ? { ...dependency, id: featureIdMap.get(dependency.id) ?? dependency.id }
    : { ...dependency });

  const topologyIdMap = new Map<string, string>();
  const referencedTopologyIds = new Set(topologyIdsForFeature(source));
  const topologyClones = document.topologyReferences
    .filter((reference) => referencedTopologyIds.has(reference.id))
    .map((reference) => {
      const topologyClone = structuredClone(reference);
      topologyClone.id = uniqueDuplicateId(document, reference.id);
      topologyIdMap.set(reference.id, topologyClone.id);
      if (targetId !== source.objectId) {
        topologyClone.objectId = targetId;
        if (previousTargetOperation) {
          const previousSourceId = topologyClone.sourceFeatureId;
          topologyClone.sourceFeatureId = previousTargetOperation.id;
          if (topologyClone.reference.origin === previousSourceId) topologyClone.reference.origin = previousTargetOperation.id;
          else if (topologyClone.reference.origin.startsWith(`${previousSourceId}:`)) topologyClone.reference.origin = `${previousTargetOperation.id}${topologyClone.reference.origin.slice(previousSourceId.length)}`;
        }
      }
      return topologyClone;
    });

  if (clone.kind === "fillet") {
    clone.edgeReferenceIds = clone.edgeReferenceIds?.map((id) => topologyIdMap.get(id) ?? id);
    clone.selectionReferenceIds = clone.selectionReferenceIds?.map((id) => topologyIdMap.get(id) ?? id);
  }
  if (clone.kind === "faceExtrude") clone.faceReferenceId = topologyIdMap.get(clone.faceReferenceId) ?? clone.faceReferenceId;
  if (clone.kind === "shell") clone.faceReferenceIds = clone.faceReferenceIds.map((id) => topologyIdMap.get(id) ?? id);
  if (clone.kind === "revolve") {
    if (clone.faceReferenceId) clone.faceReferenceId = topologyIdMap.get(clone.faceReferenceId) ?? clone.faceReferenceId;
    if (clone.axisReferenceId) clone.axisReferenceId = topologyIdMap.get(clone.axisReferenceId) ?? clone.axisReferenceId;
  }

  document.features.push(...supportingFeatures, clone);
  document.topologyReferences.push(...topologyClones);
  return clone.id;
}

export function duplicateParametricSelection(document: ParametricDocument, selection: Array<{ id: string; kind: "object" | "feature" }>) {
  const selectedFeatures = selection.filter((item) => item.kind === "feature" && document.features.some((feature) => feature.id === item.id));
  const selectedObjects = selection.filter((item) => item.kind === "object" && document.objects.some((object) => object.id === item.id));
  const duplicated: Array<{ id: string; kind: "object" | "feature" }> = [];

  if (selectedFeatures.length > 0) {
    for (const item of selectedFeatures) {
      const source = document.features.find((feature) => feature.id === item.id);
      if (!source?.objectId) continue;
      const otherTargets = selectedObjects.map((target) => target.id).filter((id) => id !== source.objectId);
      const targets = otherTargets.length > 0 ? otherTargets : [source.objectId];
      for (const targetId of targets) {
        const id = duplicateParametricFeature(document, source.id, targetId);
        if (id) duplicated.push({ id, kind: "feature" });
      }
    }
    return duplicated;
  }

  for (const item of selectedObjects) {
    const id = duplicateParametricObject(document, item.id);
    if (id) duplicated.push({ id, kind: "object" });
  }
  return duplicated;
}

export function workplaneShapeForObject(document: ParametricDocument, id: string | null): WorkplaneShape | null {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return null;
  if (object.referenceMesh) {
    const positions = object.referenceMesh.positions;
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (let index = 0; index < positions.length; index += 3) {
      minX = Math.min(minX, positions[index]); maxX = Math.max(maxX, positions[index]);
      minY = Math.min(minY, positions[index + 1]); maxY = Math.max(maxY, positions[index + 1]);
      minZ = Math.min(minZ, positions[index + 2]); maxZ = Math.max(maxZ, positions[index + 2]);
    }
    return {
      id: object.id,
      name: object.name,
      kind: "mesh",
      color: object.color,
      x: object.transform.position.x,
      z: object.transform.position.y,
      elevation: object.transform.position.z,
      size: Math.max((maxX - minX) * object.transform.scale.x, (maxY - minY) * object.transform.scale.y),
      width: (maxX - minX) * object.transform.scale.x,
      depth: (maxY - minY) * object.transform.scale.y,
      height: (maxZ - minZ) * object.transform.scale.z,
      rotation: object.transform.rotation.z,
      hidden: !object.visible,
      locked: object.locked,
    };
  }
  const feature = document.features.find((candidate): candidate is TransformableOperation => isTransformableOperation(candidate) && candidate.objectId === object.id) ?? null;
  if (!feature) return null;
  const sketch = feature.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  if (feature.kind === "extrude" && !sketch) return null;
  const sketchSize = sketch ? sketchDimensions(sketch) : null;
  const baseWidth = feature.kind === "primitive" ? feature.width : sketchSize!.width;
  const baseDepth = feature.kind === "primitive" ? feature.depth : sketchSize!.depth;
  const baseHeight = feature.kind === "primitive" ? feature.height : feature.distance;
  const width = baseWidth * object.transform.scale.x;
  const depth = baseDepth * object.transform.scale.y;
  const world = operationWorldTransform(object, feature, baseHeight);
  return {
    id: object.id,
    name: object.name,
    kind: feature.kind === "primitive" ? feature.primitive === "roundedBox" ? "box" : feature.primitive : sketch!.profile.shape === "rectangle" ? "box" : "cylinder",
    color: object.color,
    hole: feature.operation === "cut",
    x: world.x,
    z: world.y,
    elevation: feature.kind === "primitive" ? world.center.z - baseHeight * Math.abs(object.transform.scale.z) / 2 : world.z,
    size: Math.max(width, depth),
    width,
    depth,
    height: baseHeight * object.transform.scale.z,
    rotation: world.rotation,
    radius: feature.kind === "extrude" && sketch!.profile.shape === "rectangle" ? 0 : undefined,
    sides: feature.kind === "extrude" && sketch!.profile.shape === "circle" ? 96 : undefined,
    hidden: !object.visible || feature.suppressed,
    locked: object.locked,
  };
}

export function viewportSelectionForObject(document: ParametricDocument, id: string | null, includeUnavailable = false): ViewportSelection | null {
  const shape = workplaneShapeForObject(document, id);
  if (!shape || (!includeUnavailable && (shape.hidden || shape.locked))) return null;
  const operations = document.features.filter((candidate): candidate is TransformableOperation => candidate.objectId === id && isTransformableOperation(candidate) && !candidate.suppressed);
  if (operations.length === 1) {
    const operationSelection = viewportSelectionForFeature(document, operations[0].id, includeUnavailable);
    if (operationSelection) return { ...operationSelection, id: shape.id, operationPreview: undefined, shapeParameters: undefined };
  }
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

function operationWorldTransform(object: ParametricObject, feature: TransformableOperation, height: number, planarCenter = { x: 0, y: 0 }) {
  const matrix = parametricTransformMatrix(object.transform).multiply(parametricTransformMatrix({ ...feature.transform, scale: { x: 1, y: 1, z: 1 } }));
  const origin = new THREE.Vector3().applyMatrix4(matrix);
  const centerOffset = feature.kind === "primitive" && (feature.primitive === "sphere" || feature.primitive === "torus") ? 0 : height / 2;
  const center = new THREE.Vector3(planarCenter.x, planarCenter.y, centerOffset).applyMatrix4(matrix);
  const rotationMatrix = parametricTransformMatrix({ ...object.transform, scale: { x: 1, y: 1, z: 1 } })
    .multiply(parametricTransformMatrix({ ...feature.transform, scale: { x: 1, y: 1, z: 1 } }));
  const quaternion = new THREE.Quaternion();
  rotationMatrix.decompose(new THREE.Vector3(), quaternion, new THREE.Vector3());
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, "ZYX");
  const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(10));
  return {
    x: clean(origin.x),
    y: clean(origin.y),
    z: clean(origin.z),
    center: { x: clean(center.x), y: clean(center.y), z: clean(center.z) },
    rotation: clean(THREE.MathUtils.radToDeg(rotation.z)),
    rotation3d: {
      x: clean(THREE.MathUtils.radToDeg(rotation.x)),
      y: clean(THREE.MathUtils.radToDeg(rotation.y)),
      z: clean(THREE.MathUtils.radToDeg(rotation.z)),
    },
  };
}

export function viewportSelectionForFeature(document: ParametricDocument, id: string | null, includeUnavailable = false): ViewportSelection | null {
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === id && isTransformableOperation(candidate));
  if (!feature || feature.suppressed) return null;
  const object = document.objects.find((candidate) => candidate.id === feature.objectId);
  const sketch = feature.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  if (!object || (!includeUnavailable && (!object.visible || object.locked)) || (feature.kind === "extrude" && !sketch)) return null;
  const sketchSize = sketch ? sketchDimensions(sketch) : null;
  const textGenerator = sketch?.profile.shape === "drawn" && sketch.profile.geometry.generator?.kind === "text" ? sketch.profile.geometry.generator : null;
  const baseWidth = feature.kind === "primitive" ? feature.width : sketchSize!.width;
  const baseDepth = feature.kind === "primitive" ? feature.depth : sketchSize!.depth;
  const baseHeight = feature.kind === "primitive" ? feature.height : feature.distance;
  const world = operationWorldTransform(object, feature, baseHeight, sketchSize ? { x: sketchSize.centerX, y: sketchSize.centerY } : undefined);
  const width = baseWidth * object.transform.scale.x;
  const depth = baseDepth * object.transform.scale.y;
  const operations = document.features.filter((candidate) => candidate.objectId === object.id && candidate.kind !== "sketch");
  const operationIndex = operations.findIndex((candidate) => candidate.id === feature.id);
  const historical = operationIndex >= 0 && operationIndex < operations.length - 1;
  const previewMode = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
  return {
    id: feature.id,
    x: world.x,
    y: world.y,
    baseZ: feature.kind === "primitive" ? world.center.z - baseHeight * Math.abs(object.transform.scale.z) / 2 : world.z,
    width,
    depth,
    height: baseHeight * object.transform.scale.z,
    rotation: world.rotation,
    center: world.center,
    origin: { x: world.x, y: world.y, z: world.z },
    rotation3d: world.rotation3d,
    ...(textGenerator
      ? { parameterHandles: ["size" as const, "height" as const] }
      : feature.kind === "extrude" && sketch!.purpose === "user"
        ? { parameterHandles: ["height" as const] }
        : {}),
    ...(feature.kind === "extrude" && sketch!.profile.shape === "circle" ? { resizeAspectRatio: 1 } : {}),
    shapeParameters: feature.kind === "primitive"
      ? feature.primitive === "cone"
        ? { shape: "cone", baseRadius: feature.width / 2, topRadius: feature.topRadius ?? 0, height: feature.height }
        : feature.primitive === "tube"
          ? { shape: "tube", outerRadius: feature.width / 2, innerRadius: feature.innerRadius ?? 6, height: feature.height }
          : feature.primitive === "torus"
            ? { shape: "torus", majorRadius: feature.majorRadius ?? 12, tubeRadius: feature.tubeRadius ?? 4 }
          : feature.primitive === "roundedBox"
            ? { shape: "roundedBox", width: feature.width, depth: feature.depth, height: feature.height, cornerRadius: feature.cornerRadius ?? 3 }
          : feature.primitive === "pyramid" || feature.primitive === "wedge" || feature.primitive === "roof" || feature.primitive === "roundRoof"
            ? { shape: feature.primitive, width: feature.width, depth: feature.depth, height: feature.height }
          : feature.primitive === "polygon"
            ? { shape: "polygon", radius: feature.width / 2, sides: feature.sides ?? 6, height: feature.height }
          : feature.primitive === "gear"
            ? { shape: "gear", outerRadius: feature.width / 2, toothDepth: feature.toothDepth ?? 2.5, boreRadius: feature.boreRadius ?? 3, teeth: feature.teeth ?? 12, height: feature.height }
          : feature.primitive === "halfSphere"
            ? { shape: "halfSphere", radius: feature.width / 2, height: feature.height }
        : { shape: "sphere", radius: feature.width / 2 }
      : textGenerator
        ? { shape: "text", size: textGenerator.size, height: feature.distance }
      : sketch!.profile.shape === "circle"
        ? { shape: "cylinder", radius: sketch!.profile.diameter / 2, height: feature.distance }
        : { shape: "box", width: baseWidth, depth: baseDepth, height: feature.distance },
    operationPreview: {
      shape: feature.kind === "primitive" ? feature.primitive : sketch!.profile.shape === "circle" ? "cylinder" : "box",
      ...(feature.kind === "primitive" && feature.primitive === "cone" ? { topRadius: feature.topRadius ?? 0 } : {}),
      ...(feature.kind === "primitive" && feature.primitive === "tube" ? { innerRadius: feature.innerRadius ?? 6 } : {}),
      ...(feature.kind === "primitive" && feature.primitive === "roundedBox" ? { cornerRadius: feature.cornerRadius ?? 3 } : {}),
      ...(feature.kind === "primitive" && feature.primitive === "polygon" ? { sides: feature.sides ?? 6 } : {}),
      ...(feature.kind === "primitive" && feature.primitive === "gear" ? { teeth: feature.teeth ?? 12, toothDepth: feature.toothDepth ?? 2.5, boreRadius: feature.boreRadius ?? 3 } : {}),
      mode: previewMode,
      color: object.color,
      historical,
    },
  };
}

export function viewportPlacementForSketchFeature(document: ParametricDocument, id: string | null) {
  const feature = document.features.find((candidate): candidate is SketchFeature => candidate.id === id && candidate.kind === "sketch" && candidate.purpose === "user");
  const object = feature?.objectId ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object || feature.suppressed || !object.visible || object.locked) return null;
  const matrix = parametricTransformMatrix(object.transform).multiply(parametricTransformMatrix({
    position: { x: feature.x, y: feature.y, z: feature.offset },
    rotation: feature.rotation,
  }));
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(position, quaternion, new THREE.Vector3());
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, "ZYX");
  const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(10));
  return {
    position: { x: clean(position.x), y: clean(position.y), z: clean(position.z) },
    rotation: {
      x: clean(THREE.MathUtils.radToDeg(rotation.x)),
      y: clean(THREE.MathUtils.radToDeg(rotation.y)),
      z: clean(THREE.MathUtils.radToDeg(rotation.z)),
    },
  };
}

export function applyOperationWorldPosition(document: ParametricDocument, id: string, x: number, y: number) {
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === id && isTransformableOperation(candidate));
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object) return;
  const angle = -object.transform.rotation.z * Math.PI / 180;
  const dx = x - object.transform.position.x;
  const dy = y - object.transform.position.y;
  feature.transform.position.x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / object.transform.scale.x;
  feature.transform.position.y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / object.transform.scale.y;
}

export function applyParametricSelectionWorldDelta(
  document: ParametricDocument,
  id: string,
  kind: "object" | "feature",
  delta: { x: number; y: number; z: number },
) {
  if (![delta.x, delta.y, delta.z].every(Number.isFinite)) return;
  if (kind === "object") {
    const object = document.objects.find((candidate) => candidate.id === id);
    if (!object) return;
    const previousTransform = structuredClone(object.transform);
    object.transform.position.x += delta.x;
    object.transform.position.y += delta.y;
    object.transform.position.z += delta.z;
    transformParametricObjectTopologyHints(document, id, previousTransform);
    return;
  }
  const feature = document.features.find((candidate): candidate is MovableOperation => candidate.id === id && isMovableOperation(candidate));
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object) return;
  const unrotated = inverseRotateVector(delta, object.transform.rotation);
  const local = {
    x: unrotated.x / object.transform.scale.x,
    y: unrotated.y / object.transform.scale.y,
    z: unrotated.z / object.transform.scale.z,
  };
  if (feature.kind === "sketch") {
    feature.x += local.x;
    feature.y += local.y;
    feature.offset += local.z;
  } else {
    feature.transform.position.x += local.x;
    feature.transform.position.y += local.y;
    feature.transform.position.z += local.z;
  }
}

export function applyParametricSelectionWorkplaneRotation(
  document: ParametricDocument,
  id: string,
  kind: "object" | "feature",
  axis: { x: number; y: number; z: number },
  deltaDegrees: number,
) {
  if (![axis.x, axis.y, axis.z, deltaDegrees].every(Number.isFinite)) return;
  const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z);
  if (axisVector.lengthSq() < 1e-10) return;
  const delta = new THREE.Matrix4().makeRotationAxis(axisVector.normalize(), THREE.MathUtils.degToRad(deltaDegrees));
  const rotationMatrix = (rotation: { x: number; y: number; z: number }) => parametricTransformMatrix({
    position: { x: 0, y: 0, z: 0 },
    rotation,
  });
  if (kind === "object") {
    const object = document.objects.find((candidate) => candidate.id === id);
    if (object) {
      const previousTransform = structuredClone(object.transform);
      object.transform.rotation = parametricRotationFromMatrix(delta.multiply(rotationMatrix(object.transform.rotation)));
      transformParametricObjectTopologyHints(document, id, previousTransform);
    }
    return;
  }
  const feature = document.features.find((candidate): candidate is MovableOperation => candidate.id === id && isMovableOperation(candidate));
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object) return;
  const objectRotation = rotationMatrix(object.transform.rotation);
  const localRotation = feature.kind === "sketch" ? feature.rotation : feature.transform.rotation;
  const worldRotation = objectRotation.clone().multiply(rotationMatrix(localRotation));
  const nextLocal = objectRotation.clone().invert().multiply(delta.multiply(worldRotation));
  if (feature.kind === "sketch") feature.rotation = parametricRotationFromMatrix(nextLocal);
  else feature.transform.rotation = parametricRotationFromMatrix(nextLocal);
}

export function rotateParametricObjectAroundLocalAxis(
  document: ParametricDocument,
  id: string,
  axis: "x" | "y" | "z",
  deltaDegrees: number,
) {
  if (!Number.isFinite(deltaDegrees)) return;
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return;
  const previousTransform = structuredClone(object.transform);
  const current = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(object.transform.rotation.x),
    THREE.MathUtils.degToRad(object.transform.rotation.y),
    THREE.MathUtils.degToRad(object.transform.rotation.z),
    "ZYX",
  ));
  const direction = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  current.multiply(new THREE.Quaternion().setFromAxisAngle(direction, THREE.MathUtils.degToRad(deltaDegrees)));
  object.transform.rotation = parametricRotationFromMatrix(new THREE.Matrix4().makeRotationFromQuaternion(current));
  transformParametricObjectTopologyHints(document, id, previousTransform);
}

export function applyOperationWorldRotation(document: ParametricDocument, id: string, rotation: number) {
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === id && isTransformableOperation(candidate));
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (feature && object) feature.transform.rotation.z = rotation - object.transform.rotation.z;
}

export function applyObjectWorldPosition(document: ParametricDocument, id: string, x: number, y: number) {
  const object = document.objects.find((candidate) => candidate.id === id);
  const current = viewportSelectionForObject(document, id);
  if (!object || !current || ![x, y].every(Number.isFinite)) return;
  object.transform.position.x += x - current.x;
  object.transform.position.y += y - current.y;
}

function inverseRotateVector(vector: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) {
  const rz = -rotation.z * Math.PI / 180;
  const afterZ = { x: vector.x * Math.cos(rz) - vector.y * Math.sin(rz), y: vector.x * Math.sin(rz) + vector.y * Math.cos(rz), z: vector.z };
  const ry = -rotation.y * Math.PI / 180;
  const afterY = { x: afterZ.x * Math.cos(ry) + afterZ.z * Math.sin(ry), y: afterZ.y, z: -afterZ.x * Math.sin(ry) + afterZ.z * Math.cos(ry) };
  const rx = -rotation.x * Math.PI / 180;
  return { x: afterY.x, y: afterY.y * Math.cos(rx) - afterY.z * Math.sin(rx), z: afterY.y * Math.sin(rx) + afterY.z * Math.cos(rx) };
}

export function moveParametricObjectOrigin(document: ParametricDocument, id: string, position: { x: number; y: number; z: number }) {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object || ![position.x, position.y, position.z].every(Number.isFinite)) return;
  const scale = object.transform.scale;
  if ([scale.x, scale.y, scale.z].some((value) => !Number.isFinite(value) || Math.abs(value) < 0.0001)) return;
  const worldDelta = {
    x: position.x - object.transform.position.x,
    y: position.y - object.transform.position.y,
    z: position.z - object.transform.position.z,
  };
  const unrotated = inverseRotateVector(worldDelta, object.transform.rotation);
  const localDelta = { x: unrotated.x / scale.x, y: unrotated.y / scale.y, z: unrotated.z / scale.z };
  for (const feature of document.features) {
    if (feature.objectId !== id) continue;
    if (isTransformableOperation(feature)) {
      feature.transform.position.x -= localDelta.x;
      feature.transform.position.y -= localDelta.y;
      feature.transform.position.z -= localDelta.z;
    } else if (feature.kind === "hole") {
      feature.x -= localDelta.x;
      feature.y -= localDelta.y;
    }
  }
  object.transform.position = { ...position };
}

export type ParametricAlignmentAxis = "x" | "y" | "z";
export type ParametricAlignmentAnchor = "min" | "center" | "max";

function viewportSelectionAxisFrame(selection: ViewportSelection, axis: ParametricAlignmentAxis) {
  if (axis === "z") {
    const center = selection.baseZ + selection.height / 2;
    return { min: selection.baseZ, center, max: selection.baseZ + selection.height };
  }
  const angle = selection.rotation * Math.PI / 180;
  const half = axis === "x"
    ? Math.abs(Math.cos(angle)) * selection.width / 2 + Math.abs(Math.sin(angle)) * selection.depth / 2
    : Math.abs(Math.sin(angle)) * selection.width / 2 + Math.abs(Math.cos(angle)) * selection.depth / 2;
  const center = axis === "x" ? selection.x : selection.y;
  return { min: center - half, center, max: center + half };
}

export function alignParametricSelections(
  document: ParametricDocument,
  selection: ParametricTreeSelection[],
  axis: ParametricAlignmentAxis,
  anchor: ParametricAlignmentAnchor,
) {
  const selectedObjectIds = new Set(selection.filter((item) => item.kind === "object").map((item) => item.id));
  const targets = selection.flatMap((item) => {
    if (item.kind === "feature") {
      const objectId = objectIdForFeature(document, item.id);
      if (!objectId || selectedObjectIds.has(objectId)) return [];
    }
    const frame = item.kind === "object"
      ? viewportSelectionForObject(document, item.id, true)
      : viewportSelectionForFeature(document, item.id, true);
    return frame ? [{ item, frame }] : [];
  });
  const reference = targets.at(-1);
  if (!reference || targets.length < 2) return { moved: 0, referenceId: reference?.item.id ?? null };
  const referenceValue = viewportSelectionAxisFrame(reference.frame, axis)[anchor];
  let moved = 0;
  for (const target of targets.slice(0, -1)) {
    const objectId = target.item.kind === "object" ? target.item.id : objectIdForFeature(document, target.item.id);
    const object = objectId ? document.objects.find((candidate) => candidate.id === objectId) : null;
    if (!object || object.locked) continue;
    const frame = viewportSelectionAxisFrame(target.frame, axis);
    const delta = referenceValue - frame[anchor];
    if (Math.abs(delta) < 1e-9) continue;
    if (target.item.kind === "object") {
      if (axis === "x") applyObjectWorldPosition(document, target.item.id, target.frame.x + delta, target.frame.y);
      else if (axis === "y") applyObjectWorldPosition(document, target.item.id, target.frame.x, target.frame.y + delta);
      else object.transform.position.z += delta;
    } else {
      const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === target.item.id && isTransformableOperation(candidate));
      if (!feature) continue;
      if (axis === "x") applyOperationWorldPosition(document, feature.id, target.frame.x + delta, target.frame.y);
      else if (axis === "y") applyOperationWorldPosition(document, feature.id, target.frame.x, target.frame.y + delta);
      else feature.transform.position.z += delta / Math.max(0.0001, Math.abs(object.transform.scale.z));
    }
    moved += 1;
  }
  return { moved, referenceId: reference.item.id };
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
  if (![x, y, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return;
  if (selectionKind === "object") {
    const object = document.objects.find((candidate) => candidate.id === id);
    const current = viewportSelectionForObject(document, id);
    if (!object || !current) return;
    object.transform.position.x += x - current.x;
    object.transform.position.y += y - current.y;
    object.transform.scale.x *= width / Math.max(0.01, current.width);
    object.transform.scale.y *= depth / Math.max(0.01, current.depth);
    return;
  }
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === id && isTransformableOperation(candidate));
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  const sketch = feature?.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  const current = viewportSelectionForFeature(document, id);
  if (!feature || !object || (feature.kind === "extrude" && !sketch) || !current) return;
  applyOperationWorldPosition(document, id, x, y);
  if (feature.kind === "primitive") {
    feature.width = Math.max(0.1, width / Math.max(0.01, Math.abs(object.transform.scale.x)));
    feature.depth = Math.max(0.1, depth / Math.max(0.01, Math.abs(object.transform.scale.y)));
  } else if (sketch!.profile.shape === "rectangle") {
    sketch!.profile.width = Math.max(0.1, width / Math.max(0.01, Math.abs(object.transform.scale.x)));
    sketch!.profile.depth = Math.max(0.1, depth / Math.max(0.01, Math.abs(object.transform.scale.y)));
  } else if (sketch!.profile.shape === "circle") {
    const widthRatio = width / Math.max(0.01, current.width);
    const depthRatio = depth / Math.max(0.01, current.depth);
    const ratio = Math.abs(widthRatio - 1) >= Math.abs(depthRatio - 1) ? widthRatio : depthRatio;
    sketch!.profile.diameter = Math.max(0.1, sketch!.profile.diameter * ratio);
  } else {
    const bounds = sketchDimensions(sketch!);
    const scaleX = width / Math.max(0.1, bounds.width * Math.abs(object.transform.scale.x));
    const scaleZ = depth / Math.max(0.1, bounds.depth * Math.abs(object.transform.scale.y));
    sketch!.profile.geometry.points = sketch!.profile.geometry.points.map((point) => ({
      ...point,
      x: point.x * scaleX,
      z: point.z * scaleZ,
      handleIn: point.handleIn ? { x: point.handleIn.x * scaleX, z: point.handleIn.z * scaleZ } : undefined,
      handleOut: point.handleOut ? { x: point.handleOut.x * scaleX, z: point.handleOut.z * scaleZ } : undefined,
    }));
    sketch!.profile.geometry.circles = (sketch!.profile.geometry.circles ?? []).map((circle) => ({ ...circle, x: circle.x * scaleX, z: circle.z * scaleZ, radius: circle.radius * (Math.abs(scaleX) + Math.abs(scaleZ)) / 2 }));
  }
}

export function resizeParametricHeight(document: ParametricDocument, id: string, selectionKind: "object" | "feature", height: number) {
  if (!Number.isFinite(height) || height <= 0) return;
  if (selectionKind === "object") {
    const object = document.objects.find((candidate) => candidate.id === id);
    const current = viewportSelectionForObject(document, id);
    if (!object || !current) return;
    object.transform.scale.z *= Math.max(0.1, height) / Math.max(0.01, current.height);
    return;
  }
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === id && isTransformableOperation(candidate));
  const object = feature ? document.objects.find((candidate) => candidate.id === feature.objectId) : null;
  if (!feature || !object) return;
  if (feature.kind === "primitive") feature.height = Math.max(0.1, height / Math.max(0.01, Math.abs(object.transform.scale.z)));
  else feature.distance = Math.max(0.1, height / Math.max(0.01, Math.abs(object.transform.scale.z)));
}

export function updateParametricShapeParameter(
  document: ParametricDocument,
  id: string,
  parameter: "width" | "depth" | "height" | "size" | "radius" | "baseRadius" | "topRadius" | "outerRadius" | "innerRadius" | "thickness" | "majorRadius" | "tubeRadius" | "cornerRadius" | "sides" | "teeth" | "toothDepth" | "boreRadius",
  value: number,
) {
  if (!Number.isFinite(value) || (parameter === "topRadius" || parameter === "boreRadius" ? value < 0 : value <= 0)) return;
  const feature = document.features.find((candidate): candidate is TransformableOperation => candidate.id === id && isTransformableOperation(candidate));
  if (!feature) return;
  const next = Math.max(0.1, value);
  if (feature.kind === "primitive") {
    if (feature.primitive === "roundedBox" && parameter === "cornerRadius") {
      feature.cornerRadius = Math.min(feature.width / 2 - 0.1, feature.depth / 2 - 0.1, next);
    } else if (feature.primitive === "roundedBox" && parameter === "width") {
      feature.width = next;
      feature.cornerRadius = Math.min(feature.cornerRadius ?? 3, feature.width / 2 - 0.1, feature.depth / 2 - 0.1);
    } else if (feature.primitive === "roundedBox" && parameter === "depth") {
      feature.depth = next;
      feature.cornerRadius = Math.min(feature.cornerRadius ?? 3, feature.width / 2 - 0.1, feature.depth / 2 - 0.1);
    } else if (feature.primitive === "roundedBox" && parameter === "height") {
      feature.height = next;
    } else if (feature.primitive === "sphere" && parameter === "radius") {
      feature.width = next * 2;
      feature.depth = next * 2;
      feature.height = next * 2;
    } else if (feature.primitive === "halfSphere" && parameter === "radius") {
      feature.width = next * 2;
      feature.depth = next * 2;
    } else if (feature.primitive === "halfSphere" && parameter === "height") {
      feature.height = next;
    } else if (feature.primitive === "cone" && parameter === "baseRadius") {
      feature.width = next * 2;
      feature.depth = next * 2;
    } else if (feature.primitive === "cone" && parameter === "topRadius") {
      feature.topRadius = Math.max(0, value);
    } else if (feature.primitive === "cone" && parameter === "height") {
      feature.height = next;
    } else if (feature.primitive === "tube" && parameter === "innerRadius") {
      const thickness = Math.max(0.1, feature.width / 2 - (feature.innerRadius ?? 6));
      feature.innerRadius = next;
      feature.width = (next + thickness) * 2;
      feature.depth = feature.width;
    } else if (feature.primitive === "tube" && parameter === "thickness") {
      feature.width = ((feature.innerRadius ?? 6) + next) * 2;
      feature.depth = feature.width;
    } else if (feature.primitive === "tube" && parameter === "height") {
      feature.height = next;
    } else if (feature.primitive === "torus" && parameter === "majorRadius") {
      feature.majorRadius = Math.max((feature.tubeRadius ?? 4) + 0.1, next);
      feature.width = (feature.majorRadius + (feature.tubeRadius ?? 4)) * 2;
      feature.depth = feature.width;
    } else if (feature.primitive === "torus" && parameter === "tubeRadius") {
      feature.tubeRadius = Math.min((feature.majorRadius ?? 12) - 0.1, next);
      feature.width = ((feature.majorRadius ?? 12) + feature.tubeRadius) * 2;
      feature.depth = feature.width;
      feature.height = feature.tubeRadius * 2;
    } else if ((feature.primitive === "pyramid" || feature.primitive === "wedge" || feature.primitive === "roof" || feature.primitive === "roundRoof") && parameter === "width") {
      feature.width = next;
    } else if ((feature.primitive === "pyramid" || feature.primitive === "wedge" || feature.primitive === "roof" || feature.primitive === "roundRoof") && parameter === "depth") {
      feature.depth = next;
    } else if ((feature.primitive === "pyramid" || feature.primitive === "wedge" || feature.primitive === "roof" || feature.primitive === "roundRoof") && parameter === "height") {
      feature.height = next;
    } else if (feature.primitive === "polygon" && parameter === "radius") {
      feature.width = next * 2;
      feature.depth = next * 2;
    } else if (feature.primitive === "polygon" && parameter === "sides") {
      feature.sides = Math.min(32, Math.max(3, Math.round(value)));
    } else if (feature.primitive === "polygon" && parameter === "height") {
      feature.height = next;
    } else if (feature.primitive === "gear" && parameter === "outerRadius") {
      const minimum = (feature.toothDepth ?? 2.5) + (feature.boreRadius ?? 3) + 0.1;
      const radius = Math.max(minimum, next);
      feature.width = radius * 2;
      feature.depth = radius * 2;
    } else if (feature.primitive === "gear" && parameter === "teeth") {
      feature.teeth = Math.min(64, Math.max(6, Math.round(value)));
    } else if (feature.primitive === "gear" && parameter === "toothDepth") {
      feature.toothDepth = Math.min(feature.width / 2 - 0.2, next);
    } else if (feature.primitive === "gear" && parameter === "boreRadius") {
      feature.boreRadius = Math.max(0, Math.min(feature.width / 2 - (feature.toothDepth ?? 2.5) - 0.1, Math.max(0, value)));
    } else if (feature.primitive === "gear" && parameter === "height") {
      feature.height = next;
    }
    return;
  }
  const sketch = sketchForExtrude(document, feature);
  if (!sketch) return;
  if (parameter === "height") {
    feature.distance = next;
  } else if (parameter === "size" && sketch.profile.shape === "drawn" && sketch.profile.geometry.generator?.kind === "text") {
    const generator = sketch.profile.geometry.generator;
    const scale = next / Math.max(0.1, generator.size);
    generator.size = next;
    generator.spacing *= scale;
    for (const point of sketch.profile.geometry.points) {
      point.x *= scale;
      point.z *= scale;
      if (point.handleIn) {
        point.handleIn.x *= scale;
        point.handleIn.z *= scale;
      }
      if (point.handleOut) {
        point.handleOut.x *= scale;
        point.handleOut.z *= scale;
      }
    }
  } else if (sketch.profile.shape === "rectangle" && parameter === "width") {
    sketch.profile.width = next;
  } else if (sketch.profile.shape === "rectangle" && parameter === "depth") {
    sketch.profile.depth = next;
  } else if (sketch.profile.shape === "circle" && parameter === "radius") {
    sketch.profile.diameter = next * 2;
  }
}

export function applyWorkplanePatch(document: ParametricDocument, id: string, patch: Partial<WorkplaneShape>) {
  const object = document.objects.find((candidate) => candidate.id === id);
  if (!object) return;
  const previousTransform = structuredClone(object.transform);
  const feature = document.features.find((candidate): candidate is ExtrudeFeature => candidate.kind === "extrude" && candidate.objectId === id);
  if (typeof patch.color === "string") object.color = patch.color;
  if (typeof patch.hidden === "boolean" && feature) feature.suppressed = patch.hidden;
  if (typeof patch.x === "number") object.transform.position.x = patch.x;
  if (typeof patch.z === "number") object.transform.position.y = patch.z;
  if (typeof patch.elevation === "number") object.transform.position.z = patch.elevation;
  if (typeof patch.rotation === "number") object.transform.rotation.z = patch.rotation;
  transformParametricObjectTopologyHints(document, id, previousTransform);
}
