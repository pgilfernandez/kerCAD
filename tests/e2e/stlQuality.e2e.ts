import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createEmptyDocument } from "@/lib/parametricDocument";
import { addPrimitiveToSelection } from "@/lib/parametricObjects";

vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  return {
    loadBrepWithOcct: () => (ready ??= (async () => {
      const kernel = await OcctKernel.init({ wasm });
      brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
      return brep;
    })()),
  };
});

describe("STL tessellation quality (real OCCT kernel)", () => {
  it("creates progressively denser curved meshes", async () => {
    const document = createEmptyDocument(123);
    addPrimitiveToSelection(document, null, "sphere");
    const { buildParametricStlMeshes } = await import("@/lib/parametricKernel");

    const low = await buildParametricStlMeshes(document, "low");
    const medium = await buildParametricStlMeshes(document, "medium");
    const high = await buildParametricStlMeshes(document, "high");
    const veryHigh = await buildParametricStlMeshes(document, "veryHigh");
    const triangles = [low, medium, high, veryHigh].map((meshes) => meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0));

    expect(triangles[1]).toBeGreaterThan(triangles[0]);
    expect(triangles[2]).toBeGreaterThan(triangles[1]);
    expect(triangles[3]).toBeGreaterThan(triangles[2]);
  });
});
