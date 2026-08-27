import { describe, expect, it } from "vitest";
import { omitParallelRenderEdges } from "@/lib/parametricKernel";

describe("text extrusion display edges", () => {
  it("removes extrusion-direction edges while retaining cap contours", () => {
    const lines = new Float32Array([
      0, 0, 0, 0, 0, 10,
      0, 0, 0, 4, 0, 0,
      0, 0, 10, 4, 0, 10,
    ]);
    const groups = [
      { start: 0, count: 2, edgeId: 1 },
      { start: 2, count: 2, edgeId: 2 },
      { start: 4, count: 2, edgeId: 3 },
    ];

    const filtered = omitParallelRenderEdges(lines, groups, [[0, 0, 1]]);

    expect(Array.from(filtered.edges)).toEqual([
      0, 0, 0, 4, 0, 0,
      0, 0, 10, 4, 0, 10,
    ]);
    expect(filtered.edgeGroups).toEqual([
      { start: 0, count: 2, edgeId: 2 },
      { start: 2, count: 2, edgeId: 3 },
    ]);
  });

  it("uses the supplied extrusion direction rather than the global Z axis", () => {
    const lines = new Float32Array([
      0, 0, 0, 10, 0, 0,
      0, 0, 0, 0, 10, 0,
    ]);
    const groups = [
      { start: 0, count: 2, edgeId: 4 },
      { start: 2, count: 2, edgeId: 5 },
    ];

    const filtered = omitParallelRenderEdges(lines, groups, [[1, 0, 0]]);

    expect(Array.from(filtered.edges)).toEqual([0, 0, 0, 0, 10, 0]);
    expect(filtered.edgeGroups).toEqual([{ start: 0, count: 2, edgeId: 5 }]);
  });
});
