import { beforeAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as brep from "brepjs";
import { OcctKernel } from "occt-wasm";
import { registerShellKernels, shellWithCorners } from "@/lib/shellKernel";

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  registerShellKernels(brep, await OcctKernel.init({ wasm }));
});

function concavePrism() {
  const face = brep.unwrap(brep.polygon([[0, 0, 0], [30, 0, 0], [30, 10, 0], [10, 10, 0], [10, 30, 0], [0, 30, 0]]));
  return brep.unwrap(brep.extrude(face, [0, 0, 20]));
}

describe("Shell corners with the real OpenCascade kernel", () => {
  it("makes sharp internal corners instead of rounding a concave prism", () => {
    const solid = concavePrism();
    const openFaces = brep.faceFinder().inDirection("Z").when((face) => Math.abs(brep.faceCenter(face)[2] - 20) < 1e-6).findAll(solid);
    expect(openFaces).toHaveLength(1);
    const rounded = brep.unwrap(shellWithCorners(brep, solid, openFaces, 2, "rounded"));
    const sharp = brep.unwrap(shellWithCorners(brep, solid, openFaces, 2, "sharp"));
    expect(brep.isValid(rounded)).toBe(true);
    expect(brep.isValid(sharp)).toBe(true);
    const direct = brep.castShape(brep.getKernel("kercad-shell-sharp").shell(solid.wrapped, openFaces.map((face) => face.wrapped), 2));
    expect(brep.unwrap(brep.measureVolume(direct))).toBeCloseTo(brep.unwrap(brep.measureVolume(sharp)), 6);
    expect(brep.faceFinder().ofSurfaceType("CYLINDRE").findAll(rounded).length).toBeGreaterThan(0);
    expect(brep.faceFinder().ofSurfaceType("CYLINDRE").findAll(sharp)).toHaveLength(0);
    expect(brep.unwrap(brep.measureVolume(sharp))).not.toBeCloseTo(brep.unwrap(brep.measureVolume(rounded)), 4);
    expect(brep.getBounds(sharp)).toEqual(brep.getBounds(rounded));
    // Switching a later operation back to rounded must not retain sharp mode.
    const legacy = brep.unwrap(shellWithCorners(brep, solid, openFaces, 2));
    expect(brep.unwrap(brep.measureVolume(legacy))).toBeCloseTo(brep.unwrap(brep.measureVolume(rounded)), 6);
  });

  it("restores the default kernel after an invalid sharp operation", () => {
    const solid = concavePrism();
    const normal = brep.getKernel();
    expect(shellWithCorners(brep, solid, [], 2, "sharp").ok).toBe(false);
    expect(brep.getKernel()).toBe(normal);
  });
});
