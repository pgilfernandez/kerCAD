import { describe, expect, it } from "vitest";
import { hasProjectGeometry } from "@/lib/projectLibrary";
import { createEmptyDocument, createParametricObject, createPrimitiveFeature, createDrawnSketchFeature, createImportedStepFeature } from "@/lib/parametricDocument";

describe("project geometry detection for challenge drafts", () => {
  it("does not treat project settings, annotations or empty object containers as geometry", () => {
    const document = createEmptyDocument();
    document.name = "Renamed attempt";
    document.workplane.snapToGrid = false;
    document.objects.push(createParametricObject(1));
    document.annotations = [{ id: "note", name: "Note", kind: "text", visible: true, text: "Instructions", position: { x: 0, y: 0, z: 0 }, alignment: "left", size: 6, font: "Sans" }];
    expect(hasProjectGeometry(document)).toBe(false);
  });

  it("preserves modeled work even if its operation is suppressed", () => {
    const document = createEmptyDocument();
    const feature = createPrimitiveFeature("sphere", 1);
    feature.suppressed = true;
    document.features.push(feature);
    expect(hasProjectGeometry(document)).toBe(true);
    document.features = [];
    expect(hasProjectGeometry(document)).toBe(false);
  });

  it("distinguishes an empty sketch from actual drawing progress", () => {
    const document = createEmptyDocument();
    const sketch = createDrawnSketchFeature(1);
    document.features.push(sketch);
    expect(hasProjectGeometry(document)).toBe(false);
    if (sketch.profile.shape !== "drawn") throw new Error("Expected drawn sketch");
    sketch.profile.geometry.circles = [{ id: "circle", x: 0, z: 0, radius: 10 }];
    expect(hasProjectGeometry(document)).toBe(true);
  });

  it("keeps imported solid geometry and reference assets", () => {
    const document = createEmptyDocument();
    document.features.push(createImportedStepFeature("model.step", "ISO-10303-21;", 1));
    expect(hasProjectGeometry(document)).toBe(true);
    document.features = [];
    const object = createParametricObject(1);
    object.referenceMesh = { sourceName: "model.stl", format: "stl", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [], edges: [], opacity: 1, displayMode: "solid", pickable: true };
    document.objects.push(object);
    expect(hasProjectGeometry(document)).toBe(true);
    object.referenceMesh.positions = [];
    expect(hasProjectGeometry(document)).toBe(false);
    object.referenceMesh.image = { dataUrl: "data:image/png;base64,image", width: 10, height: 10 };
    expect(hasProjectGeometry(document)).toBe(true);
  });
});
