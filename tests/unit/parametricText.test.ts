import { describe, expect, it } from "vitest";
import { createStarterDocument } from "@/lib/parametricDocument";
import { addParametricText, parametricTextProfile, updateParametricTextSketch } from "@/lib/parametricText";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";

describe("parametric text", () => {
  it("creates a valid profile from bundled web-font outlines", () => {
    const profile = parametricTextProfile({ kind: "text", text: "eduCAD 3D á", font: "Sans", size: 20, spacing: 1, align: "center", verticalAlign: "center" });
    expect(profile.generator).toMatchObject({ kind: "text", text: "eduCAD 3D á", font: "Sans", align: "center", verticalAlign: "center" });
    expect(profile.segments.length).toBeGreaterThan(20);
    expect(validateDrawnSketchProfile(profile).valid).toBe(true);
  });

  it("adds one visible text operation backed by a hidden generated sketch", () => {
    const document = createStarterDocument(123);
    const result = addParametricText(document, document.objects[0].id);
    const sketch = document.features.find((feature) => feature.id === result.sketchId);
    const extrusion = document.features.find((feature) => feature.id === result.extrusionId);
    expect(sketch).toMatchObject({ kind: "sketch", purpose: "primitive", visible: false });
    expect(extrusion).toMatchObject({ kind: "extrude", name: "Texto", distance: 4, operation: "add" });
  });

  it("regenerates geometry when its text parameters change", () => {
    const document = createStarterDocument(123);
    const result = addParametricText(document, document.objects[0].id);
    const sketch = document.features.find((feature) => feature.id === result.sketchId)!;
    const before = sketch.kind === "sketch" && sketch.profile.shape === "drawn" ? sketch.profile.geometry.segments.length : 0;
    if (sketch.kind !== "sketch") throw new Error("Missing generated sketch");
    expect(updateParametricTextSketch(sketch, { text: "I" })).toBe(true);
    expect(sketch.profile.shape === "drawn" ? sketch.profile.geometry.segments.length : 0).toBeLessThan(before);
  });
});
