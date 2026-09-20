import { describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { operationToolbarDocument } from "../fixtures/operationToolbarDocument";

vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const { registerShellKernels } = await import("@/lib/shellKernel");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  return { loadBrepWithOcct: () => ready ??= OcctKernel.init({ wasm }).then((kernel) => { registerShellKernels(brep, kernel); return brep; }) };
});

describe("Shell corner changes in an existing operation history", () => {
  it.each([0, 3])("rebuilds later Booleans when switching corner modes with tool offset %s", async (offset) => {
    const { buildParametricModel } = await import("@/lib/parametricKernel");
    const document = operationToolbarDocument();
    document.objects[1].transform.position.x = offset;
    const shell = document.features.find((feature) => feature.kind === "shell")!;
    for (const mode of ["rounded", "sharp", "rounded", "sharp"] as const) {
      shell.cornerType = mode;
      const result = await buildParametricModel(document);
      expect(result.warning, mode).toBeFalsy();
      expect(result.failedFeatureId).toBeFalsy();
      expect(result.objectRecords.length).toBeGreaterThan(0);
    }
  });
});
