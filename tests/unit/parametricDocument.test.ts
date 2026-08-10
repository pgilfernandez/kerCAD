import { describe, expect, it } from "vitest";
import {
  createExtrudeFeature,
  createSketchFeature,
  createStarterDocument,
  documentHasSolid,
  previousSketch,
  validateDocument,
} from "@/lib/parametricDocument";

describe("parametric document", () => {
  it("creates a reconstructable educational starter part", () => {
    const document = createStarterDocument(123);
    expect(document.schema).toBe("educad-parametric/v1");
    expect(document.createdAt).toBe(123);
    expect(document.features.map((feature) => feature.kind)).toEqual(["sketch", "extrude"]);
    const [sketch, extrude] = document.features;
    expect(extrude.kind === "extrude" && extrude.sketchId).toBe(sketch.id);
    expect(documentHasSolid(document.features)).toBe(true);
  });

  it("finds the latest sketch at or before the selection", () => {
    const first = createSketchFeature("rectangle", 1);
    const extrusion = createExtrudeFeature(first.id, 1, false);
    const second = createSketchFeature("circle", 2);
    const features = [first, extrusion, second];
    expect(previousSketch(features, extrusion.id)?.id).toBe(first.id);
    expect(previousSketch(features, second.id)?.id).toBe(second.id);
  });

  it("does not count suppressed or cutting extrusions as a base solid", () => {
    const sketch = createSketchFeature("rectangle", 1);
    const extrusion = createExtrudeFeature(sketch.id, 1, false);
    expect(documentHasSolid([sketch, { ...extrusion, suppressed: true }])).toBe(false);
    expect(documentHasSolid([sketch, { ...extrusion, operation: "cut" }])).toBe(false);
  });

  it("rejects unrelated JSON documents", () => {
    expect(validateDocument({ schema: "mesh-scene/v1", features: [] })).toBe(false);
    expect(validateDocument(createStarterDocument())).toBe(true);
  });
});
