import { describe, expect, it, vi } from "vitest";
import {
  addPrimitive,
  addPrimitiveToSelection,
  addParametricObject,
  alignParametricSelections,
  applyOperationWorldPosition,
  applyOperationWorldRotation,
  applyParametricSelectionWorldDelta,
  applyParametricSelectionWorkplaneRotation,
  applyObjectWorldPosition,
  applyWorkplanePatch,
  colorForNewParametricObject,
  canReorderParametricSelection,
  deleteParametricObject,
  deleteParametricFeature,
  deleteParametricSelection,
  duplicateParametricObject,
  lastOperationForObject,
  moveParametricObjectOrigin,
  objectIdForFeature,
  parametricObjectTree,
  renameParametricSelection,
  resetParametricFeature,
  reorderParametricSelection,
  resizeParametricSelection,
  resizeParametricHeight,
  sketchForExtrude,
  viewportSelectionForObject,
  viewportSelectionForFeature,
  workplaneShapeForObject,
  updateParametricTreeSelection,
  updateParametricShapeParameter,
} from "@/lib/parametricObjects";
import { createFilletFeature, createLinearPatternFeature, createPrimitiveFeature, createStarterDocument } from "@/lib/parametricDocument";

describe("parametric object workflow", () => {
  it("adds a simple shape as a real sketch and extrusion", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const cylinderId = addPrimitive(document, objectId, "cylinder", { x: 8, y: 6 });
    const cylinder = document.features.find((feature) => feature.id === cylinderId) ?? null;
    const sketch = sketchForExtrude(document, cylinder);

    expect(document.objects).toHaveLength(1);
    expect(document.features.map((feature) => feature.kind)).toEqual(["sketch", "extrude", "sketch", "extrude"]);
    expect(cylinder?.kind === "extrude" && cylinder.operation).toBe("add");
    expect(sketch?.profile).toEqual({ shape: "circle", diameter: 20 });
    expect(sketch).toMatchObject({ objectId, x: 0, y: 0 });
    expect(cylinder).toMatchObject({ transform: { position: { x: 8, y: 6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } });
    expect(parametricObjectTree(document)[0].operations.map((feature) => feature.name)).toEqual(["Box", "Cylinder"]);
    expect(workplaneShapeForObject(document, objectId)).toMatchObject({
      kind: "box",
      color: "#d41721",
      x: 0,
      z: 0,
      width: 20,
      depth: 20,
      height: 20,
      hole: false,
    });
  });

  it("adds and edits a native sphere without a hidden sketch", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "sphere");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: "sphere", width: 20, depth: 20, height: 20, operation: "add" });
    expect(parametricObjectTree(document).at(-1)?.operations).toHaveLength(1);
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      baseZ: -10,
      center: { x: 0, y: 0, z: 0 },
      origin: { x: 0, y: 0, z: 0 },
      width: 20,
      depth: 20,
      height: 20,
      operationPreview: { shape: "sphere", mode: "add", historical: false },
    });

    updateParametricShapeParameter(document, result.featureId!, "radius", 15);
    expect(feature).toMatchObject({ width: 30, depth: 30, height: 30 });
    expect(viewportSelectionForObject(document, result.objectId)).toMatchObject({ width: 30, depth: 30, height: 30 });
  });

  it("adds and edits a native cone or frustum without a hidden sketch", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "cone");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: "cone", width: 20, depth: 20, height: 20, topRadius: 0, operation: "add" });
    expect(parametricObjectTree(document).at(-1)?.operations).toHaveLength(1);
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      baseZ: 0,
      center: { x: 0, y: 0, z: 10 },
      origin: { x: 0, y: 0, z: 0 },
      shapeParameters: { shape: "cone", baseRadius: 10, topRadius: 0, height: 20 },
      operationPreview: { shape: "cone", topRadius: 0, mode: "add", historical: false },
    });

    updateParametricShapeParameter(document, result.featureId!, "baseRadius", 14);
    updateParametricShapeParameter(document, result.featureId!, "topRadius", 6);
    updateParametricShapeParameter(document, result.featureId!, "height", 32);
    expect(feature).toMatchObject({ width: 28, depth: 28, height: 32, topRadius: 6 });

    updateParametricShapeParameter(document, result.featureId!, "topRadius", 0);
    expect(feature).toMatchObject({ topRadius: 0 });
  });

  it("adds and edits a native tube while preserving a positive wall", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "tube");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: "tube", width: 20, depth: 20, height: 20, innerRadius: 6, operation: "add" });
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      baseZ: 0,
      center: { x: 0, y: 0, z: 10 },
      shapeParameters: { shape: "tube", outerRadius: 10, innerRadius: 6, height: 20 },
      operationPreview: { shape: "tube", innerRadius: 6, mode: "add", historical: false },
    });

    updateParametricShapeParameter(document, result.featureId!, "innerRadius", 8);
    updateParametricShapeParameter(document, result.featureId!, "thickness", 7);
    updateParametricShapeParameter(document, result.featureId!, "height", 35);
    expect(feature).toMatchObject({ width: 30, depth: 30, innerRadius: 8, height: 35 });

    updateParametricShapeParameter(document, result.featureId!, "innerRadius", 20);
    expect(feature).toMatchObject({ width: 54, depth: 54, innerRadius: 20 });
  });

  it("adds and edits an exact half sphere from its flat base", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "halfSphere");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: "halfSphere", width: 20, depth: 20, height: 10, operation: "add" });
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      baseZ: 0,
      center: { x: 0, y: 0, z: 5 },
      shapeParameters: { shape: "halfSphere", radius: 10, height: 10 },
      operationPreview: { shape: "halfSphere", mode: "add", historical: false },
    });

    updateParametricShapeParameter(document, result.featureId!, "radius", 16);
    updateParametricShapeParameter(document, result.featureId!, "height", 9);
    expect(feature).toMatchObject({ width: 32, depth: 32, height: 9 });
  });

  it("adds and edits an exact torus while preserving a ring profile", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "torus");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: "torus", majorRadius: 12, tubeRadius: 4, width: 32, depth: 32, height: 8, operation: "add" });
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      baseZ: -4,
      center: { x: 0, y: 0, z: 0 },
      shapeParameters: { shape: "torus", majorRadius: 12, tubeRadius: 4 },
      operationPreview: { shape: "torus", mode: "add", historical: false },
    });

    updateParametricShapeParameter(document, result.featureId!, "majorRadius", 18);
    updateParametricShapeParameter(document, result.featureId!, "tubeRadius", 6);
    expect(feature).toMatchObject({ majorRadius: 18, tubeRadius: 6, width: 48, depth: 48, height: 12 });

    updateParametricShapeParameter(document, result.featureId!, "majorRadius", 4);
    expect(feature).toMatchObject({ majorRadius: 6.1, tubeRadius: 6, width: 24.2, depth: 24.2, height: 12 });
  });

  it("adds a rounded box and keeps its corner radius inside the footprint", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "roundedBox");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: "roundedBox", width: 20, depth: 20, height: 20, cornerRadius: 3 });
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      shapeParameters: { shape: "roundedBox", width: 20, depth: 20, height: 20, cornerRadius: 3 },
    });
    updateParametricShapeParameter(document, result.featureId!, "cornerRadius", 20);
    expect(feature).toMatchObject({ cornerRadius: 9.9 });
    updateParametricShapeParameter(document, result.featureId!, "width", 8);
    expect(feature).toMatchObject({ width: 8, cornerRadius: 3.9 });
  });

  it.each([
    ["pyramid", "Pirámide", 20],
    ["wedge", "Cuña", 20],
    ["roof", "Tejado", 12],
    ["roundRoof", "Tejado redondo", 10],
  ] as const)("adds and edits a native %s with direct dimensions", (kind, name, defaultHeight) => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, kind);
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ kind: "primitive", primitive: kind, name, width: 20, depth: 20, height: defaultHeight, operation: "add" });
    expect(viewportSelectionForFeature(document, result.featureId)).toMatchObject({
      baseZ: 0,
      center: { x: 0, y: 0, z: defaultHeight / 2 },
      shapeParameters: { shape: kind, width: 20, depth: 20, height: defaultHeight },
      operationPreview: { shape: kind, mode: "add", historical: false },
    });

    updateParametricShapeParameter(document, result.featureId!, "width", 28);
    updateParametricShapeParameter(document, result.featureId!, "depth", 18);
    updateParametricShapeParameter(document, result.featureId!, "height", 14);
    expect(feature).toMatchObject({ width: 28, depth: 18, height: 14 });
  });

  it("adds and edits a regular polygon prism", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "polygon");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ primitive: "polygon", width: 20, depth: 20, height: 20, sides: 6 });
    expect(viewportSelectionForFeature(document, result.featureId)?.shapeParameters).toEqual({ shape: "polygon", radius: 10, sides: 6, height: 20 });
    updateParametricShapeParameter(document, result.featureId!, "radius", 14);
    updateParametricShapeParameter(document, result.featureId!, "sides", 9.6);
    expect(feature).toMatchObject({ width: 28, depth: 28, sides: 10 });
  });

  it("adds and edits a bounded educational gear", () => {
    const document = createStarterDocument(123);
    const result = addPrimitiveToSelection(document, null, "gear");
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(feature).toMatchObject({ primitive: "gear", width: 30, depth: 30, height: 6, teeth: 12, toothDepth: 2.5, boreRadius: 3 });
    expect(viewportSelectionForFeature(document, result.featureId)?.shapeParameters).toEqual({ shape: "gear", outerRadius: 15, teeth: 12, toothDepth: 2.5, boreRadius: 3, height: 6 });
    updateParametricShapeParameter(document, result.featureId!, "teeth", 18.7);
    updateParametricShapeParameter(document, result.featureId!, "toothDepth", 4);
    updateParametricShapeParameter(document, result.featureId!, "boreRadius", 5);
    expect(feature).toMatchObject({ teeth: 19, toothDepth: 4, boreRadius: 5 });
  });

  it("edits only the defining visual parameters for boxes and cylinders", () => {
    const document = createStarterDocument(123);
    const box = document.features.find((feature) => feature.kind === "extrude")!;
    const cylinderId = addPrimitive(document, document.objects[0].id, "cylinder")!;

    updateParametricShapeParameter(document, box.id, "width", 32);
    updateParametricShapeParameter(document, box.id, "depth", 14);
    updateParametricShapeParameter(document, box.id, "height", 26);
    updateParametricShapeParameter(document, cylinderId, "radius", 7);
    updateParametricShapeParameter(document, cylinderId, "height", 31);

    expect(viewportSelectionForFeature(document, box.id)?.shapeParameters).toEqual({ shape: "box", width: 32, depth: 14, height: 26 });
    expect(viewportSelectionForFeature(document, cylinderId)?.shapeParameters).toEqual({ shape: "cylinder", radius: 7, height: 31 });
    expect(viewportSelectionForFeature(document, box.id)?.parameterHandles).toBeUndefined();
    expect(viewportSelectionForFeature(document, cylinderId)?.parameterHandles).toBeUndefined();
  });

  it("creates a new object only when a shape has no selected object", () => {
    const document = createStarterDocument(123);
    const existingObjectId = document.objects[0].id;

    const appended = addPrimitiveToSelection(document, existingObjectId, "cylinder");
    expect(appended).toMatchObject({ objectId: existingObjectId, createdObject: false });
    expect(parametricObjectTree(document)[0].operations.map((feature) => feature.name)).toEqual(["Box", "Cylinder"]);

    const created = addPrimitiveToSelection(document, null, "box");
    expect(created.createdObject).toBe(true);
    expect(created.objectId).not.toBe(existingObjectId);
    expect(parametricObjectTree(document).at(-1)?.operations.map((feature) => feature.name)).toEqual(["Box"]);
  });

  it("reorders selected objects as a stable group", () => {
    const document = createStarterDocument(123);
    const secondId = addParametricObject(document);
    const thirdId = addParametricObject(document);
    const firstId = document.objects[0].id;
    const selection = [{ id: secondId, kind: "object" as const }, { id: thirdId, kind: "object" as const }];

    expect(canReorderParametricSelection(document, selection, "up")).toBe(true);
    expect(reorderParametricSelection(document, selection, "up")).toBe(true);
    expect(document.objects.map((object) => object.id)).toEqual([secondId, thirdId, firstId]);
    expect(canReorderParametricSelection(document, selection, "up")).toBe(false);
  });

  it("reorders operations only inside their object and keeps extrusion sketches attached", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const cylinderId = addPrimitive(document, objectId, "cylinder")!;
    const sphereId = addPrimitive(document, objectId, "sphere")!;
    const secondObjectId = addParametricObject(document);
    const otherOperationId = addPrimitive(document, secondObjectId, "box")!;

    expect(reorderParametricSelection(document, [{ id: sphereId, kind: "feature" }], "up")).toBe(true);
    expect(parametricObjectTree(document)[0].operations.map((feature) => feature.id)).toEqual([
      document.features.find((feature) => feature.kind === "extrude" && feature.name === "Box")!.id,
      sphereId,
      cylinderId,
    ]);
    const cylinder = document.features.find((feature) => feature.id === cylinderId)!;
    const cylinderIndex = document.features.findIndex((feature) => feature.id === cylinderId);
    expect(cylinder.kind).toBe("extrude");
    expect(document.features[cylinderIndex - 1]).toMatchObject({ kind: "sketch", id: cylinder.kind === "extrude" ? cylinder.sketchId : "" });
    expect(document.features.some((feature) => feature.id === otherOperationId && feature.objectId === secondObjectId)).toBe(true);
  });

  it("renames mixed multi-selection in one model operation", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const operation = parametricObjectTree(document)[0].operations[0];

    expect(renameParametricSelection(document, [{ id: objectId, kind: "object" }, { id: operation.id, kind: "feature" }], "Grupo escolar")).toBe(true);
    expect(document.objects[0].name).toBe("Grupo escolar");
    expect(document.features.find((feature) => feature.id === operation.id)?.name).toBe("Grupo escolar");
  });

  it("assigns unused varied palette colours to new objects", () => {
    const document = createStarterDocument(123);
    const firstColor = colorForNewParametricObject(document, () => 0);
    const secondId = addParametricObject(document, { x: 20, y: 0, z: 0 }, () => 0);
    const secondColor = document.objects.find((object) => object.id === secondId)!.color;
    const thirdId = addParametricObject(document, { x: 40, y: 0, z: 0 }, () => 0);
    const thirdColor = document.objects.find((object) => object.id === thirdId)!.color;

    expect(firstColor).not.toBe(document.objects[0].color);
    expect(secondColor).toBe(firstColor);
    expect(new Set(document.objects.map((object) => object.color)).size).toBe(3);
    expect(thirdColor).not.toBe(secondColor);
  });

  it("targets and edits the selected operation in world coordinates", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    object.transform.position = { x: 10, y: -5, z: 2 };
    object.transform.rotation.z = 90;
    object.transform.scale = { x: 2, y: 3, z: 1.5 };
    const feature = document.features.find((candidate) => candidate.kind === "extrude");
    if (!feature || feature.kind !== "extrude") throw new Error("expected extrusion");
    feature.transform.position = { x: 4, y: 2, z: 3 };
    feature.transform.rotation.z = 15;

    const selection = viewportSelectionForFeature(document, feature.id);
    expect(selection).toMatchObject({
      id: feature.id,
      x: 4,
      baseZ: 6.5,
      width: 40,
      depth: 60,
      height: 30,
      rotation: 105,
    });
    expect(selection?.y).toBeCloseTo(3);

    applyOperationWorldPosition(document, feature.id, 13, 3);
    applyOperationWorldRotation(document, feature.id, 120);
    expect(feature.transform.position.x).toBeCloseTo(4);
    expect(feature.transform.position.y).toBeCloseTo(-1);
    expect(feature.transform.rotation.z).toBe(30);
  });

  it("moves an object origin while preserving its operation in world space", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    object.transform.position = { x: 10, y: -5, z: 2 };
    object.transform.rotation.z = 90;
    object.transform.scale = { x: 2, y: 3, z: 1.5 };
    const feature = document.features.find((candidate) => candidate.kind === "extrude");
    if (!feature || feature.kind !== "extrude") throw new Error("expected extrusion");
    feature.transform.position = { x: 4, y: 2, z: 3 };
    const before = viewportSelectionForFeature(document, feature.id);

    moveParametricObjectOrigin(document, object.id, { x: 16, y: -2, z: 5 });

    expect(object.transform.position).toEqual({ x: 16, y: -2, z: 5 });
    expect(feature.transform.position.x).toBeCloseTo(2.5);
    expect(feature.transform.position.y).toBeCloseTo(4);
    expect(feature.transform.position.z).toBeCloseTo(1);
    const after = viewportSelectionForFeature(document, feature.id);
    expect(after?.x).toBeCloseTo(before!.x);
    expect(after?.y).toBeCloseTo(before!.y);
    expect(after?.baseZ).toBeCloseTo(before!.baseZ);
    expect(after).toMatchObject({ width: before!.width, depth: before!.depth, height: before!.height, rotation: before!.rotation });
  });

  it("moves objects and operations by a full world-space workplane delta", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    const feature = document.features.find((candidate) => candidate.kind === "extrude")!;
    object.transform.rotation.x = 90;
    applyParametricSelectionWorldDelta(document, feature.id, "feature", { x: 0, y: 0, z: 5 });
    const moved = viewportSelectionForFeature(document, feature.id)!;
    expect(moved.baseZ).toBeCloseTo(5);
    applyParametricSelectionWorldDelta(document, object.id, "object", { x: 2, y: 3, z: 4 });
    expect(object.transform.position).toEqual({ x: 2, y: 3, z: 4 });
  });

  it("rotates a selection around the active workplane normal", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    applyParametricSelectionWorkplaneRotation(document, object.id, "object", { x: 1, y: 0, z: 0 }, 90);
    expect(object.transform.rotation.x).toBeCloseTo(90);
    const feature = document.features.find((candidate) => candidate.kind === "extrude")!;
    applyParametricSelectionWorkplaneRotation(document, feature.id, "feature", { x: 1, y: 0, z: 0 }, 45);
    const selection = viewportSelectionForFeature(document, feature.id)!;
    expect(selection.rotation3d?.x).toBeCloseTo(135);
  });

  it("moves an object by its displayed bounds after its origin has been offset", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    moveParametricObjectOrigin(document, object.id, { x: 8, y: 4, z: 0 });

    applyObjectWorldPosition(document, object.id, 12, -3);

    expect(viewportSelectionForObject(document, object.id)).toMatchObject({ x: 12, y: -3 });
    expect(object.transform.position).toEqual({ x: 20, y: 1, z: 0 });
  });

  it("resizes an operation through its parametric profile", () => {
    const document = createStarterDocument(123);
    const feature = document.features.find((candidate) => candidate.kind === "extrude");
    if (!feature || feature.kind !== "extrude") throw new Error("expected extrusion");

    resizeParametricSelection(document, feature.id, "feature", 5, -3, 30, 12);

    expect(viewportSelectionForFeature(document, feature.id)).toMatchObject({ x: 5, y: -3, width: 30, depth: 12 });
    expect(sketchForExtrude(document, feature)?.profile).toEqual({ shape: "rectangle", width: 30, depth: 12 });
  });

  it("keeps cylinder resizing circular and edits its diameter parameter", () => {
    const document = createStarterDocument(123);
    const cylinderId = addPrimitive(document, document.objects[0].id, "cylinder");
    if (!cylinderId) throw new Error("expected cylinder");

    expect(viewportSelectionForFeature(document, cylinderId)).toMatchObject({ resizeAspectRatio: 1 });
    resizeParametricSelection(document, cylinderId, "feature", 3, 4, 36, 20);

    expect(viewportSelectionForFeature(document, cylinderId)).toMatchObject({ x: 3, y: 4, width: 36, depth: 36 });
    expect(sketchForExtrude(document, document.features.find((feature) => feature.id === cylinderId) ?? null)?.profile).toEqual({ shape: "circle", diameter: 36 });
  });

  it("ignores invalid resize values instead of corrupting exact parameters", () => {
    const document = createStarterDocument(123);
    const feature = document.features.find((candidate) => candidate.kind === "extrude");
    if (!feature || feature.kind !== "extrude") throw new Error("expected extrusion");
    const before = structuredClone(sketchForExtrude(document, feature)?.profile);

    resizeParametricSelection(document, feature.id, "feature", 0, 0, Number.NaN, 12);
    resizeParametricHeight(document, feature.id, "feature", Number.POSITIVE_INFINITY);

    expect(sketchForExtrude(document, feature)?.profile).toEqual(before);
    expect(feature.distance).toBe(20);
  });

  it("describes the selected Boolean operation preview", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    object.color = "#3b82f6";
    const feature = document.features.find((candidate) => candidate.kind === "extrude");
    if (!feature || feature.kind !== "extrude") throw new Error("expected extrusion");

    feature.operation = "cut";
    expect(viewportSelectionForFeature(document, feature.id)?.operationPreview).toEqual({ shape: "box", mode: "hole", color: "#3b82f6", historical: false });

    feature.operation = "intersect";
    expect(viewportSelectionForFeature(document, feature.id)?.operationPreview).toEqual({ shape: "box", mode: "common", color: "#3b82f6", historical: false });

    feature.operation = "add";
    expect(viewportSelectionForFeature(document, feature.id)?.operationPreview).toEqual({ shape: "box", mode: "add", color: "#3b82f6", historical: false });
  });

  it("marks an older additive operation for a simplified wireframe preview", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const first = document.features.find((candidate) => candidate.kind === "extrude");
    if (!first || first.kind !== "extrude") throw new Error("expected extrusion");
    const lastId = addPrimitive(document, objectId, "cylinder");

    expect(viewportSelectionForFeature(document, first.id)?.operationPreview).toEqual({
      shape: "box",
      mode: "add",
      color: "#d41721",
      historical: true,
    });
    expect(viewportSelectionForFeature(document, lastId)?.operationPreview).toEqual({
      shape: "cylinder",
      mode: "add",
      color: "#d41721",
      historical: false,
    });
  });

  it("resizes an object through its container scale", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];

    resizeParametricSelection(document, object.id, "object", 4, 6, 40, 10);

    expect(object.transform).toMatchObject({ position: { x: 4, y: 6 }, scale: { x: 2, y: 0.5, z: 1 } });
  });

  it("resizes height through the extrusion or object scale", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    const feature = document.features.find((candidate) => candidate.kind === "extrude");
    if (!feature || feature.kind !== "extrude") throw new Error("expected extrusion");

    resizeParametricHeight(document, feature.id, "feature", 35);
    expect(feature.distance).toBe(35);
    resizeParametricHeight(document, object.id, "object", 70);
    expect(object.transform.scale.z).toBe(2);
  });

  it("keeps object edits limited to container transforms", () => {
    const document = createStarterDocument(123);
    const box = document.objects[0];

    applyWorkplanePatch(document, box.id, {
      x: 5,
      z: -3,
      elevation: 7,
      rotation: 25,
      color: "#3b82f6",
    });

    expect(document.objects[0].color).toBe("#3b82f6");
    expect(workplaneShapeForObject(document, box.id)?.color).toBe("#3b82f6");
    expect(document.objects[0].transform).toMatchObject({ position: { x: 5, y: -3, z: 7 }, rotation: { z: 25 }, scale: { x: 1, y: 1, z: 1 } });
    expect(viewportSelectionForObject(document, box.id)).toMatchObject({ x: 5, y: -3, width: 20, depth: 20, height: 20 });
  });

  it("hides or locks an object without suppressing its history", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    const extrusion = document.features.find((feature) => feature.kind === "extrude");

    object.visible = false;
    expect(viewportSelectionForObject(document, object.id)).toBeNull();
    expect(extrusion?.suppressed).toBe(false);

    object.visible = true;
    object.locked = true;
    expect(viewportSelectionForObject(document, object.id)).toBeNull();
    expect(extrusion?.suppressed).toBe(false);
  });

  it("duplicates and deletes the sketch-operation pair together", () => {
    vi.spyOn(Date, "now").mockReturnValue(456);
    const document = createStarterDocument(123);
    const source = document.objects[0];
    source.color = "#3b82f6";
    const copyId = duplicateParametricObject(document, source.id);
    const copy = document.objects.find((object) => object.id === copyId) ?? null;
    const copyExtrude = document.features.find((feature) => feature.kind === "extrude" && feature.objectId === copyId) ?? null;
    const copySketch = sketchForExtrude(document, copyExtrude);

    expect(copyId).not.toBe(source.id);
    expect(copy).toMatchObject({ name: "Object 1 copy", color: "#3b82f6", transform: { position: { x: 10, y: 10, z: 0 } } });
    expect(copyExtrude).toMatchObject({ kind: "extrude", name: "Box", operation: "add" });
    expect(copySketch).toMatchObject({ x: 0, y: 0, objectId: copyId });

    deleteParametricObject(document, copyId!);
    expect(document.objects.some((object) => object.id === copyId)).toBe(false);
    expect(document.features.some((feature) => feature.objectId === copyId)).toBe(false);
    vi.restoreAllMocks();
  });

  it("deletes an operation without deleting its object container", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const baseExtrude = document.features.find((feature) => feature.kind === "extrude");
    if (!baseExtrude || baseExtrude.kind !== "extrude") throw new Error("expected extrusion");
    const baseSketchId = baseExtrude.sketchId;
    const cylinderId = addPrimitive(document, objectId, "cylinder");

    const result = deleteParametricFeature(document, baseExtrude.id);

    expect(document.objects.map((object) => object.id)).toEqual([objectId]);
    expect(document.features.some((feature) => feature.id === baseExtrude.id || feature.id === baseSketchId)).toBe(false);
    expect(document.features.some((feature) => feature.id === cylinderId)).toBe(true);
    expect(result).toEqual({ objectId, nextId: cylinderId });
  });

  it("supports standard range and toggle tree selection", () => {
    const visible = [
      { id: "object-1", kind: "object" as const },
      { id: "feature-1", kind: "feature" as const },
      { id: "feature-2", kind: "feature" as const },
      { id: "object-2", kind: "object" as const },
    ];
    const initial = updateParametricTreeSelection([], visible[0], visible, null, { range: false, toggle: false });
    expect(updateParametricTreeSelection(initial, visible[2], visible, visible[0], { range: true, toggle: false })).toEqual(visible.slice(0, 3));
    expect(updateParametricTreeSelection(initial, visible[3], visible, visible[0], { range: false, toggle: true })).toEqual([visible[0], visible[3]]);
    expect(updateParametricTreeSelection([visible[0], visible[3]], visible[0], visible, visible[3], { range: false, toggle: true })).toEqual([visible[3]]);
  });

  it("aligns object minima to the last selected world-space reference", () => {
    const document = createStarterDocument(123);
    const firstId = document.objects[0].id;
    const second = addPrimitiveToSelection(document, null, "box");
    const secondObject = document.objects.find((object) => object.id === second.objectId)!;
    secondObject.transform.position.x = 50;
    const secondFeature = document.features.find((feature) => feature.id === second.featureId);
    const secondSketch = sketchForExtrude(document, secondFeature ?? null);
    if (!secondSketch || secondSketch.profile.shape !== "rectangle") throw new Error("expected rectangle");
    secondSketch.profile.width = 40;

    const result = alignParametricSelections(document, [{ id: firstId, kind: "object" }, { id: second.objectId, kind: "object" }], "x", "min");

    expect(result).toEqual({ moved: 1, referenceId: second.objectId });
    expect(viewportSelectionForObject(document, firstId)?.x).toBe(40);
    expect(viewportSelectionForObject(document, second.objectId)?.x).toBe(50);
  });

  it("aligns operations independently inside the same object", () => {
    const document = createStarterDocument(123);
    const first = document.features.find((feature) => feature.kind === "extrude");
    const secondId = addPrimitive(document, document.objects[0].id, "cylinder", { x: 30, y: 25 });
    if (!first || first.kind !== "extrude" || !secondId) throw new Error("expected operations");

    alignParametricSelections(document, [{ id: first.id, kind: "feature" }, { id: secondId, kind: "feature" }], "y", "center");

    expect(viewportSelectionForFeature(document, first.id)?.y).toBe(25);
    expect(viewportSelectionForFeature(document, secondId)?.y).toBe(25);
    expect(document.objects[0].transform.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("keeps a locked last-selected object fixed as the alignment reference", () => {
    const document = createStarterDocument(123);
    const firstId = document.objects[0].id;
    const second = addPrimitiveToSelection(document, null, "box");
    const reference = document.objects.find((object) => object.id === second.objectId)!;
    reference.transform.position.x = 60;
    reference.locked = true;

    const result = alignParametricSelections(document, [{ id: firstId, kind: "object" }, { id: reference.id, kind: "object" }], "x", "center");

    expect(result.moved).toBe(1);
    expect(viewportSelectionForObject(document, firstId)?.x).toBe(60);
    expect(reference.transform.position.x).toBe(60);
  });

  it("deletes a mixed tree selection atomically", () => {
    const document = createStarterDocument(123);
    const firstObjectId = document.objects[0].id;
    const firstFeatureId = document.features.find((feature) => feature.kind === "extrude")!.id;
    const secondObjectId = addParametricObject(document, { x: 20, y: 0, z: 0 });
    const secondFeatureId = addPrimitive(document, secondObjectId, "box")!;

    deleteParametricSelection(document, [{ id: firstFeatureId, kind: "feature" }, { id: secondObjectId, kind: "object" }]);

    expect(document.objects.map((object) => object.id)).toEqual([firstObjectId]);
    expect(document.features.some((feature) => feature.id === firstFeatureId || feature.id === secondFeatureId)).toBe(false);
  });

  it("groups operations beneath their owning object in rebuild order", () => {
    const document = createStarterDocument(123);
    const firstObject = document.objects[0];
    const fillet = createFilletFeature(1);
    fillet.objectId = firstObject.id;
    document.features.push(fillet);
    const secondObjectId = addParametricObject(document, { x: 24, y: 0, z: 0 });
    addPrimitive(document, secondObjectId, "cylinder");

    const tree = parametricObjectTree(document);
    expect(tree).toHaveLength(2);
    expect(tree[0].operations.map((feature) => feature.kind)).toEqual(["extrude", "fillet"]);
    expect(tree[1].operations.map((feature) => feature.kind)).toEqual(["extrude"]);
    expect(objectIdForFeature(document, fillet.id)).toBe(firstObject.id);
    expect(objectIdForFeature(document, tree[1].operations[0].id)).toBe(secondObjectId);

    deleteParametricObject(document, firstObject.id);
    expect(document.features.some((feature) => feature.id === fillet.id)).toBe(false);
    expect(parametricObjectTree(document).map((object) => object.id)).toEqual([secondObjectId]);
  });

  it("finds the last operation of an object for viewport selection", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const fillet = createFilletFeature(1);
    fillet.objectId = objectId;
    document.features.push(fillet);

    expect(lastOperationForObject(document, objectId)?.id).toBe(fillet.id);
    expect(lastOperationForObject(document, "missing-object")).toBeNull();
  });

  it("removes a feature pattern when its source operation is deleted", () => {
    const document = createStarterDocument(123);
    const source = document.features.find((feature) => feature.kind === "extrude")!;
    const pattern = createLinearPatternFeature(1);
    pattern.objectId = source.objectId;
    pattern.source = "feature";
    pattern.sourceFeatureId = source.id;
    pattern.dependencies = [{ type: "feature", id: source.id }];
    document.features.push(pattern);

    deleteParametricFeature(document, source.id);

    expect(document.features.some((feature) => feature.id === pattern.id)).toBe(false);
  });

  it("resets editable operation parameters without replacing history identity or topology inputs", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const primitive = createPrimitiveFeature("roundedBox", 1);
    primitive.objectId = objectId;
    primitive.name = "Custom enclosure";
    primitive.width = 72;
    primitive.depth = 48;
    primitive.height = 16;
    primitive.cornerRadius = 7;
    primitive.operation = "cut";
    primitive.transform.position.x = 25;
    document.features.push(primitive);
    const fillet = createFilletFeature(1, "chamfer");
    fillet.objectId = objectId;
    fillet.radius = 9;
    fillet.selectionReferenceIds = ["edge-reference"];
    document.features.push(fillet);

    expect(resetParametricFeature(document, primitive.id)).toBe(true);
    expect(primitive).toMatchObject({
      id: primitive.id,
      name: "Custom enclosure",
      objectId,
      width: 20,
      depth: 20,
      height: 20,
      cornerRadius: 3,
      operation: "add",
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    });

    expect(resetParametricFeature(document, fillet.id)).toBe(true);
    expect(fillet).toMatchObject({ treatment: "fillet", radius: 2, selectionReferenceIds: ["edge-reference"] });
    expect(resetParametricFeature(document, document.features[0].id)).toBe(false);
  });
});
