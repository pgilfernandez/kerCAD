import { describe, expect, it, vi } from "vitest";
import {
  addPrimitive,
  addPrimitiveToSelection,
  addParametricObject,
  applyOperationWorldPosition,
  applyOperationWorldRotation,
  applyWorkplanePatch,
  deleteParametricObject,
  duplicateParametricObject,
  lastOperationForObject,
  objectIdForFeature,
  parametricObjectTree,
  sketchForExtrude,
  viewportSelectionForObject,
  viewportSelectionForFeature,
  workplaneShapeForObject,
} from "@/lib/parametricObjects";
import { createFilletFeature, createStarterDocument } from "@/lib/parametricDocument";

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
    expect(parametricObjectTree(document)[0].operations.map((feature) => feature.name)).toEqual(["Caja", "Cilindro"]);
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

  it("creates a new object only when a shape has no selected object", () => {
    const document = createStarterDocument(123);
    const existingObjectId = document.objects[0].id;

    const appended = addPrimitiveToSelection(document, existingObjectId, "cylinder");
    expect(appended).toMatchObject({ objectId: existingObjectId, createdObject: false });
    expect(parametricObjectTree(document)[0].operations.map((feature) => feature.name)).toEqual(["Caja", "Cilindro"]);

    const created = addPrimitiveToSelection(document, null, "box");
    expect(created.createdObject).toBe(true);
    expect(created.objectId).not.toBe(existingObjectId);
    expect(parametricObjectTree(document).at(-1)?.operations.map((feature) => feature.name)).toEqual(["Caja"]);
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
    expect(copy).toMatchObject({ name: "Objeto 1 copia", color: "#3b82f6", transform: { position: { x: 10, y: 10, z: 0 } } });
    expect(copyExtrude).toMatchObject({ kind: "extrude", name: "Caja", operation: "add" });
    expect(copySketch).toMatchObject({ x: 0, y: 0, objectId: copyId });

    deleteParametricObject(document, copyId!);
    expect(document.objects.some((object) => object.id === copyId)).toBe(false);
    expect(document.features.some((feature) => feature.objectId === copyId)).toBe(false);
    vi.restoreAllMocks();
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
});
