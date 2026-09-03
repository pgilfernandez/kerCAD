import { describe, expect, it } from "vitest";
import { binaryStlFromRenderMeshes } from "@/lib/stlExport";
import type { RenderMesh } from "@/types/parametric";

function triangleMesh(z = 0): RenderMesh {
  return {
    positions: new Float32Array([0, 0, z, 10, 0, z, 0, 5, z]),
    normals: new Float32Array(9),
    indices: new Uint32Array([0, 1, 2]),
    edges: new Float32Array(),
    metrics: { width: 10, depth: 5, height: 0, volume: 0 },
  };
}

describe("binary STL export", () => {
  it("writes little-endian triangles without changing millimetre coordinates", () => {
    const buffer = binaryStlFromRenderMeshes([triangleMesh()], "test");
    const view = new DataView(buffer);

    expect(buffer.byteLength).toBe(84 + 50);
    expect(view.getUint32(80, true)).toBe(1);
    expect(view.getFloat32(84 + 8, true)).toBeCloseTo(1);
    expect(view.getFloat32(84 + 12 + 3 * 4, true)).toBe(10);
    expect(view.getFloat32(84 + 12 + 7 * 4, true)).toBe(5);
  });

  it("combines visible object meshes into one printable STL", () => {
    const buffer = binaryStlFromRenderMeshes([triangleMesh(0), triangleMesh(8)]);
    expect(new DataView(buffer).getUint32(80, true)).toBe(2);
  });

  it("rejects an empty export", () => {
    expect(() => binaryStlFromRenderMeshes([])).toThrow("There are no objects to export.");
  });
});
