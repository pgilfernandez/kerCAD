import { describe, expect, it } from "vitest";
import { createStarterDocument } from "@/lib/parametricDocument";
import { addParametricText, parametricTextProfile, updateParametricTextSketch } from "@/lib/parametricText";
import { updateParametricShapeParameter, viewportSelectionForFeature } from "@/lib/parametricObjects";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";

describe("parametric text", () => {
  it("creates a valid profile from bundled web-font outlines", () => {
    const profile = parametricTextProfile({ kind: "text", text: "eduCAD 3D á", font: "Sans", size: 20, spacing: 1, align: "center", verticalAlign: "center" });
    expect(profile.generator).toMatchObject({ kind: "text", text: "eduCAD 3D á", font: "Sans", align: "center", verticalAlign: "center" });
    expect(profile.segments.length).toBeGreaterThan(20);
    expect(profile.segments.some((segment) => segment.kind === "bezier")).toBe(true);
    expect(validateDrawnSketchProfile(profile).valid).toBe(true);
  });

  it("adds one visible text operation backed by a hidden generated sketch", () => {
    const document = createStarterDocument(123);
    const result = addParametricText(document, document.objects[0].id);
    const sketch = document.features.find((feature) => feature.id === result.sketchId);
    const extrusion = document.features.find((feature) => feature.id === result.extrusionId);
    expect(sketch).toMatchObject({ kind: "sketch", purpose: "primitive", visible: false });
    expect(extrusion).toMatchObject({ kind: "extrude", name: "Text", distance: 4, operation: "add" });
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

  it("moves the viewport bounding box with text alignment", () => {
    const document = createStarterDocument(123);
    const result = addParametricText(document, document.objects[0].id);
    const sketch = document.features.find((feature) => feature.id === result.sketchId);
    if (sketch?.kind !== "sketch") throw new Error("Missing generated text sketch");
    const centered = viewportSelectionForFeature(document, result.extrusionId);

    updateParametricTextSketch(sketch, { align: "left", verticalAlign: "bottom" });
    const aligned = viewportSelectionForFeature(document, result.extrusionId);

    expect(centered?.center?.x).toBeCloseTo(0, 5);
    expect(centered?.center?.y).toBeCloseTo(0, 5);
    expect(aligned?.center?.x).toBeCloseTo((aligned?.width ?? 0) / 2, 5);
    expect(aligned?.center?.y).toBeCloseTo((aligned?.depth ?? 0) / 2, 5);
  });

  it("reuses unit glyph curves without sharing sketch entities", () => {
    const settings = { kind: "text", text: "e", font: "Sans", size: 20, spacing: 0, align: "center", verticalAlign: "center" } as const;
    const first = parametricTextProfile(settings);
    const second = parametricTextProfile({ ...settings, size: 40 });

    expect(second.segments).toHaveLength(first.segments.length);
    expect(second.points[0].id).not.toBe(first.points[0].id);
    expect(second.points[0].x).toBeCloseTo(first.points[0].x * 2, 5);
    expect(second.points[0].z).toBeCloseTo(first.points[0].z * 2, 5);
  });

  it("exposes only size and height manipulators", () => {
    const document = createStarterDocument(123);
    const result = addParametricText(document, document.objects[0].id);
    const sketch = document.features.find((feature) => feature.id === result.sketchId);
    if (sketch?.kind !== "sketch" || sketch.profile.shape !== "drawn") throw new Error("Missing generated text sketch");
    const beforeX = sketch.profile.geometry.points[0].x;

    expect(viewportSelectionForFeature(document, result.extrusionId)).toMatchObject({
      parameterHandles: ["size", "height"],
      shapeParameters: { shape: "text", size: 20, height: 4 },
    });

    updateParametricShapeParameter(document, result.extrusionId, "size", 30);
    updateParametricShapeParameter(document, result.extrusionId, "height", 8);

    expect(sketch.profile.geometry.generator).toMatchObject({ kind: "text", size: 30 });
    expect(sketch.profile.geometry.points[0].x).toBeCloseTo(beforeX * 1.5);
    expect(viewportSelectionForFeature(document, result.extrusionId)).toMatchObject({
      parameterHandles: ["size", "height"],
      shapeParameters: { shape: "text", size: 30, height: 8 },
    });
  });
});
