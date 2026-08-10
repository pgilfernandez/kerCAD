import { describe, expect, it, vi } from "vitest";
import {
  addPrimitive,
  applyWorkplanePatch,
  deleteParametricObject,
  duplicateParametricObject,
  objectFeatures,
  sketchForExtrude,
  viewportSelectionForObject,
  workplaneShapeForObject,
} from "@/lib/parametricObjects";
import { createStarterDocument } from "@/lib/parametricDocument";

describe("parametric object workflow", () => {
  it("adds a simple shape as a real sketch and extrusion", () => {
    const document = createStarterDocument(123);
    const cylinderId = addPrimitive(document, "cylinder", { x: 8, y: 6 });
    const cylinder = document.features.find((feature) => feature.id === cylinderId) ?? null;
    const sketch = sketchForExtrude(document, cylinder);

    expect(document.features.map((feature) => feature.kind)).toEqual(["sketch", "extrude", "sketch", "extrude"]);
    expect(cylinder?.kind === "extrude" && cylinder.operation).toBe("add");
    expect(sketch?.profile).toEqual({ shape: "circle", diameter: 20 });
    expect(workplaneShapeForObject(document, cylinderId)).toMatchObject({
      kind: "cylinder",
      x: 8,
      z: 6,
      width: 20,
      depth: 20,
      height: 20,
      hole: false,
    });
  });

  it("translates inspector edits into parametric dimensions and operations", () => {
    const document = createStarterDocument(123);
    const box = objectFeatures(document)[0];

    applyWorkplanePatch(document, box.id, {
      x: 5,
      z: -3,
      width: 32,
      depth: 18,
      height: 7,
      hole: true,
      color: "#3b82f6",
    });

    const updated = document.features.find((feature) => feature.id === box.id) ?? null;
    const sketch = sketchForExtrude(document, updated);
    expect(document.color).toBe("#3b82f6");
    expect(sketch).toMatchObject({ x: 5, y: -3, profile: { shape: "rectangle", width: 32, depth: 18 } });
    expect(updated).toMatchObject({ kind: "extrude", distance: 7, operation: "cut" });
    expect(viewportSelectionForObject(document, box.id)).toMatchObject({ x: 5, y: -3, width: 32, depth: 18, height: 7 });

    applyWorkplanePatch(document, box.id, { hole: false });
    expect(document.features.find((feature) => feature.id === box.id)).toMatchObject({ operation: "new" });
  });

  it("duplicates and deletes the sketch-operation pair together", () => {
    vi.spyOn(Date, "now").mockReturnValue(456);
    const document = createStarterDocument(123);
    const source = objectFeatures(document)[0];
    const sourceSketch = sketchForExtrude(document, source);
    const copyId = duplicateParametricObject(document, source.id);
    const copy = document.features.find((feature) => feature.id === copyId) ?? null;
    const copySketch = sketchForExtrude(document, copy);

    expect(copyId).not.toBe(source.id);
    expect(copy).toMatchObject({ kind: "extrude", name: "Caja copia", operation: "add" });
    expect(copySketch).toMatchObject({ x: (sourceSketch?.x ?? 0) + 10, y: (sourceSketch?.y ?? 0) + 10 });

    deleteParametricObject(document, copyId!);
    expect(document.features.some((feature) => feature.id === copyId)).toBe(false);
    expect(document.features.some((feature) => feature.id === copySketch?.id)).toBe(false);
    vi.restoreAllMocks();
  });
});
