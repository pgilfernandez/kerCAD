import { describe, expect, it } from "vitest";
import { createStarterDocument, normalizeParametricDocument } from "@/lib/parametricDocument";
import { addPrimitiveToSelection, viewportSelectionForFeature, viewportSelectionForObject } from "@/lib/parametricObjects";
import {
  normalizeParametricWorkplanePlacement,
  parametricTransformMatrix,
  parametricWorkplaneFromFace,
  parametricWorkplaneIsGlobal,
  standardParametricPlane,
  standardParametricWorkplane,
} from "@/lib/parametricWorkplane";

describe("parametric workplanes", () => {
  it("normalizes a finite orthonormal right-handed frame", () => {
    const placement = normalizeParametricWorkplanePlacement({
      origin: { x: 3, y: 4, z: 5 },
      normal: { x: 0, y: 0, z: 4 },
      xAxis: { x: 2, y: 2, z: 3 },
    });
    expect(placement.origin).toEqual({ x: 3, y: 4, z: 5 });
    expect(placement.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(placement.xAxis.x).toBeCloseTo(Math.SQRT1_2);
    expect(placement.xAxis.y).toBeCloseTo(Math.SQRT1_2);
    expect(placement.yAxis.x).toBeCloseTo(-Math.SQRT1_2);
    expect(placement.yAxis.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("repairs legacy or degenerate stored placement", () => {
    const document = createStarterDocument(123);
    document.workplane.normal = { x: 0, y: 0, z: 0 };
    document.workplane.xAxis = { x: Number.NaN, y: 0, z: 0 };
    expect(normalizeParametricDocument(document).workplane).toMatchObject({
      origin: { x: 0, y: 0, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    });
  });

  it("recognizes the three standard creation planes", () => {
    expect(standardParametricPlane(standardParametricWorkplane("XY"))).toBe("XY");
    expect(standardParametricPlane(standardParametricWorkplane("XZ"))).toBe("XZ");
    expect(standardParametricPlane(standardParametricWorkplane("YZ"))).toBe("YZ");
  });

  it.each(["XY", "XZ", "YZ"] as const)("keeps extrusion perpendicular to the %s plane", (plane) => {
    const document = createStarterDocument(123);
    const placement = standardParametricWorkplane(plane);
    Object.assign(document.workplane, placement);
    const result = addPrimitiveToSelection(document, null, "cylinder");
    const object = document.objects.find((candidate) => candidate.id === result.objectId)!;
    const matrix = parametricTransformMatrix(object.transform);
    expect(matrix.elements[8]).toBeCloseTo(placement.normal.x);
    expect(matrix.elements[9]).toBeCloseTo(placement.normal.y);
    expect(matrix.elements[10]).toBeCloseTo(placement.normal.z);
  });

  it("creates an orthonormal plane from a selected face", () => {
    const placement = parametricWorkplaneFromFace({ x: 4, y: 5, z: 6 }, { x: 1, y: 1, z: 0 });
    expect(placement.origin).toEqual({ x: 4, y: 5, z: 6 });
    expect(placement.normal.x).toBeCloseTo(Math.SQRT1_2);
    expect(placement.normal.y).toBeCloseTo(Math.SQRT1_2);
    const dot = placement.xAxis.x * placement.normal.x + placement.xAxis.y * placement.normal.y + placement.xAxis.z * placement.normal.z;
    expect(dot).toBeCloseTo(0);
    expect(placement.yAxis.z).toBeCloseTo(1);
    expect(parametricWorkplaneIsGlobal(standardParametricWorkplane("XY"))).toBe(true);
    expect(parametricWorkplaneIsGlobal(placement)).toBe(false);
  });

  it.each([
    { normal: { x: 1, y: 0, z: 0 }, expectedX: { x: 0, y: 1, z: 0 } },
    { normal: { x: -1, y: 0, z: 0 }, expectedX: { x: 0, y: -1, z: 0 } },
    { normal: { x: 0, y: 1, z: 0 }, expectedX: { x: -1, y: 0, z: 0 } },
    { normal: { x: 0, y: -1, z: 0 }, expectedX: { x: 1, y: 0, z: 0 } },
  ])("keeps local sketch Z pointing toward global Z for face normal $normal", ({ normal, expectedX }) => {
    const placement = parametricWorkplaneFromFace({ x: 0, y: 0, z: 0 }, normal);
    expect(placement.yAxis).toMatchObject({ x: 0, y: 0, z: 1 });
    expect(placement.xAxis).toMatchObject(expectedX);
  });

  it("places a new object at the active plane origin and orientation", () => {
    const document = createStarterDocument(123);
    Object.assign(document.workplane, standardParametricWorkplane("YZ", { x: 12, y: 8, z: 4 }));
    const result = addPrimitiveToSelection(document, null, "box");
    const object = document.objects.find((candidate) => candidate.id === result.objectId)!;
    const feature = document.features.find((candidate) => candidate.id === result.featureId && candidate.kind === "extrude")!;
    expect(object.transform.position).toEqual({ x: 12, y: 8, z: 4 });
    const extrusionAxis = { x: 0, y: 0, z: 1 };
    const matrix = parametricTransformMatrix(object.transform);
    const transformedAxis = {
      x: matrix.elements[8] * extrusionAxis.z,
      y: matrix.elements[9] * extrusionAxis.z,
      z: matrix.elements[10] * extrusionAxis.z,
    };
    expect(transformedAxis.x).toBeCloseTo(1);
    expect(transformedAxis.y).toBeCloseTo(0);
    expect(transformedAxis.z).toBeCloseTo(0);
    const preview = viewportSelectionForFeature(document, feature.id)!;
    const previewMatrix = parametricTransformMatrix({ position: { x: 0, y: 0, z: 0 }, rotation: preview.rotation3d! });
    expect(previewMatrix.elements[8]).toBeCloseTo(1);
    expect(previewMatrix.elements[9]).toBeCloseTo(0);
    expect(previewMatrix.elements[10]).toBeCloseTo(0);
    const objectSelection = viewportSelectionForObject(document, object.id)!;
    expect(objectSelection.center).toEqual(preview.center);
    expect(objectSelection.rotation3d).toEqual(preview.rotation3d);
    expect(feature.transform.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(feature.transform.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("resolves an active plane into the selected object's local coordinates", () => {
    const document = createStarterDocument(123);
    const object = document.objects[0];
    object.transform.position = { x: 10, y: 0, z: 0 };
    document.workplane.origin = { x: 14, y: 6, z: 2 };
    const result = addPrimitiveToSelection(document, object.id, "cylinder");
    const feature = document.features.find((candidate) => candidate.id === result.featureId && candidate.kind === "extrude")!;
    expect(feature.transform.position).toEqual({ x: 4, y: 6, z: 2 });
  });
});
