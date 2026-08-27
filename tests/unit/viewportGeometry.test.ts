import { describe, expect, it } from "vitest";
import { constrainViewportAxisDrag, constrainViewportResizeDimensions, coplanarFaceRegion, exactEdgeRegion, exactFaceRegion, faceBoundaryPositions, finalReferenceWireframeDepthTest, formatViewportDimension, operationPreviewStyle, operationPreviewWireframePositions, viewportDimensionsForHandle } from "@/lib/viewportGeometry";

describe("workplane face centroids", () => {
  it("uses the area-weighted centroid of an irregular coplanar face", () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
      1, 0, 0, 2, 0, 0, 2, 1, 0,
      1, 0, 0, 2, 1, 0, 1, 1, 0,
      0, 1, 0, 1, 1, 0, 1, 2, 0,
      0, 1, 0, 1, 2, 0, 0, 2, 0,
      10, 10, 0, 11, 10, 0, 10, 11, 0,
      0, 0, 1, 2, 0, 1, 0, 2, 1,
    ]);

    const region = coplanarFaceRegion(positions, null, 0)!;

    expect(region.area).toBeCloseTo(3);
    expect(region.centroid.x).toBeCloseTo(5 / 6);
    expect(region.centroid.y).toBeCloseTo(5 / 6);
    expect(region.centroid.z).toBe(0);
    expect(region.positions).toHaveLength(6 * 9);
  });
});

describe("exact viewport topology groups", () => {
  it("returns every triangle assigned to one CAD face, including a curved tessellation", () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const region = exactFaceRegion(positions, indices, 1, [{ start: 0, count: 6, faceId: 42, origin: 7 }])!;

    expect(region).toMatchObject({ faceId: 42, origin: 7 });
    expect(region.positions).toHaveLength(18);
    expect(region.area).toBeCloseTo(1);
  });

  it("returns the complete CAD edge polyline from an intersected segment", () => {
    const lines = new Float32Array([
      0, 0, 0, 1, 0, 0,
      1, 0, 0, 2, 0, 0,
      0, 1, 0, 1, 1, 0,
    ]);
    const region = exactEdgeRegion(lines, 2, [
      { start: 0, count: 4, edgeId: 11 },
      { start: 4, count: 2, edgeId: 12 },
    ])!;

    expect(region.edgeId).toBe(11);
    expect(region.positions).toHaveLength(12);
    expect(region.length).toBeCloseTo(2);
  });

  it("keeps only a selected face perimeter and removes triangulation diagonals", () => {
    const positions = [
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
    ];

    expect(faceBoundaryPositions(positions)).toHaveLength(4 * 6);
  });
});

describe("operation preview wireframes", () => {
  it("draws only the twelve structural edges of a box", () => {
    const positions = operationPreviewWireframePositions("box", 20, 10, 6);

    expect(positions).toHaveLength(12 * 6);
    expect(positions.slice(0, 6)).toEqual([-10, -5, -3, 10, -5, -3]);
  });

  it("draws two cylinder caps and four local-axis generators", () => {
    const positions = operationPreviewWireframePositions("cylinder", 20, 10, 6);
    const generators = positions.slice(-4 * 6);

    expect(positions).toHaveLength((64 * 2 + 4) * 6);
    expect(generators.slice(0, 6)).toEqual([10, 0, -3, 10, 0, 3]);
    expect(generators[7]).toBeCloseTo(5);
    expect(generators[8]).toBe(-3);
    expect(generators[11]).toBe(3);
  });

  it("draws three great ellipses for a sphere or ellipsoid", () => {
    const positions = operationPreviewWireframePositions("sphere", 20, 10, 6);

    expect(positions).toHaveLength(3 * 64 * 6);
    expect(positions.slice(0, 3)).toEqual([10, 0, 0]);
    expect(positions.slice(64 * 6, 64 * 6 + 3)).toEqual([10, 0, 0]);
  });

  it("draws cone caps and generators using the two radii", () => {
    const positions = operationPreviewWireframePositions("cone", 20, 20, 30, 8);
    const generators = positions.slice(-4 * 6);

    expect(positions).toHaveLength((64 * 2 + 4) * 6);
    expect(generators.slice(0, 6)).toEqual([10, 0, -15, 4, 0, 15]);
    expect(generators[6]).toBeCloseTo(0);
    expect(generators.slice(7, 9)).toEqual([10, -15]);
    expect(generators[9]).toBeCloseTo(0);
    expect(generators.slice(10, 12)).toEqual([4, 15]);
  });

  it("draws the outer and inner structural edges of a tube", () => {
    const positions = operationPreviewWireframePositions("tube", 20, 20, 30, 20, 12);
    const innerGenerators = positions.slice(-4 * 6);

    expect(positions).toHaveLength((64 * 4 + 8) * 6);
    expect(innerGenerators.slice(0, 6)).toEqual([6, 0, -15, 6, 0, 15]);
  });

  it("draws the flat base and four meridians of a half sphere", () => {
    const positions = operationPreviewWireframePositions("halfSphere", 20, 20, 10);

    expect(positions).toHaveLength(5 * 64 * 6);
    expect(positions.slice(0, 3)).toEqual([10, 0, -5]);
    expect(positions.slice(64 * 6, 64 * 6 + 3)).toEqual([10, 0, -5]);
    expect(positions.slice(-3)[2]).toBeCloseTo(5);
  });

  it("draws two equators and four tube sections for a torus", () => {
    const positions = operationPreviewWireframePositions("torus", 32, 32, 8);

    expect(positions).toHaveLength(6 * 64 * 6);
    expect(positions.slice(0, 3)).toEqual([8, 0, 0]);
    expect(positions.slice(64 * 6, 64 * 6 + 3)).toEqual([16, 0, 0]);
    expect(positions.slice(2 * 64 * 6, 2 * 64 * 6 + 3)).toEqual([16, 0, 0]);
  });

  it("draws the eight structural edges of a pyramid", () => {
    const positions = operationPreviewWireframePositions("pyramid", 20, 10, 12);

    expect(positions).toHaveLength(8 * 6);
    expect(positions.slice(0, 6)).toEqual([-10, -5, -6, 10, -5, -6]);
    expect(positions.slice(6, 12)).toEqual([-10, -5, -6, 0, 0, 6]);
  });

  it("draws rounded box outlines without triangulated faces", () => {
    const positions = operationPreviewWireframePositions("roundedBox", 20, 10, 6, 20, 0, 0, 64, 2);

    expect(positions).toHaveLength(80 * 6);
    expect(positions.every(Number.isFinite)).toBe(true);
  });

  it.each(["wedge", "roof"] as const)("draws the nine structural edges of a %s", (shape) => {
    expect(operationPreviewWireframePositions(shape, 20, 10, 12)).toHaveLength(9 * 6);
  });

  it("draws two semicircular ends and five reference edges for a round roof", () => {
    const positions = operationPreviewWireframePositions("roundRoof", 20, 10, 8);

    expect(positions).toHaveLength((64 * 2 + 5) * 6);
    expect(positions.slice(0, 6)).toEqual([-10, -5, -4, 10, -5, -4]);
    expect(positions.slice(-6)).toEqual([0, -5, 4, 0, 5, 4]);
  });

  it("draws each edge and generator of a configurable polygon prism", () => {
    expect(operationPreviewWireframePositions("polygon", 20, 20, 12, 20, 0, 0, 7)).toHaveLength(7 * 3 * 6);
  });

  it("draws the toothed outline and bore of an educational gear", () => {
    const positions = operationPreviewWireframePositions("gear", 30, 30, 6, 30, 6, 5, 12);
    expect(positions).toHaveLength((12 * 4 * 3 + 64 * 2) * 6);
  });
});

describe("operation preview styles", () => {
  it("adds only the simplified wireframe when inspecting the final operation", () => {
    expect(operationPreviewStyle("add", false)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("hole", false)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("common", false)).toEqual({ fillOpacity: null, wireframe: true });
  });

  it("keeps intermediate tools wireframe-only because the accumulated result supplies the fill", () => {
    expect(operationPreviewStyle("add", true)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("hole", true)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("common", true)).toEqual({ fillOpacity: null, wireframe: true });
  });
});

describe("final reference wireframes", () => {
  it("overlays selected outlines while keeping other outlines depth-tested", () => {
    expect(finalReferenceWireframeDepthTest("object-a", [])).toBe(true);
    expect(finalReferenceWireframeDepthTest("object-a", ["object-a", "object-c"])).toBe(false);
    expect(finalReferenceWireframeDepthTest("object-b", ["object-a", "object-c"])).toBe(true);
    expect(finalReferenceWireframeDepthTest(null, ["object-a"])).toBe(true);
  });
});

describe("viewport dimensions", () => {
  it("shows concise millimetre values without floating point noise", () => {
    expect(formatViewportDimension(20)).toBe("20");
    expect(formatViewportDimension(12.3456)).toBe("12.35");
    expect(formatViewportDimension(-0.004)).toBe("0");
    expect(formatViewportDimension(-30)).toBe("-30");
  });

  it("maps edge, corner and height handles to their editable dimensions", () => {
    expect(viewportDimensionsForHandle(1, 0)).toEqual(["x"]);
    expect(viewportDimensionsForHandle(-1, 1)).toEqual(["x", "y"]);
    expect(viewportDimensionsForHandle(0, 0, true)).toEqual(["z"]);
  });

  it("preserves a parametric circle while dragging edge and corner handles", () => {
    expect(constrainViewportResizeDimensions(20, 20, 1, 0, 30, 20, 1)).toEqual({ width: 30, depth: 30 });
    expect(constrainViewportResizeDimensions(20, 20, 0, -1, 20, 12, 1)).toEqual({ width: 12, depth: 12 });
    expect(constrainViewportResizeDimensions(20, 20, 1, 1, 28, 25, 1)).toEqual({ width: 28, depth: 28 });
  });

  it("leaves independently parametric rectangle dimensions unconstrained", () => {
    expect(constrainViewportResizeDimensions(20, 20, 1, 1, 30, 12)).toEqual({ width: 30, depth: 12 });
  });

  it("projects and snaps object movement onto a rotated local axis", () => {
    const diagonal = Math.SQRT1_2;
    const position = constrainViewportAxisDrag(
      { x: 10, y: 5, z: 2 },
      { x: 8, y: 7, z: 3 },
      { x: diagonal, y: diagonal, z: 0 },
      5,
    );

    expect(position.x).toBeCloseTo(10 + diagonal * 10);
    expect(position.y).toBeCloseTo(5 + diagonal * 10);
    expect(position.z).toBe(2);
  });
});
