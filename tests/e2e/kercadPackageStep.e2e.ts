import { beforeAll, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { createEmptyDocument, createParametricObject, createRevolveFeature, createSketchFeature, createStarterDocument } from "@/lib/parametricDocument";
import { addPrimitiveToSelection } from "@/lib/parametricObjects";
import { exportKercadProject, importKercadProject } from "@/lib/kercadProject";

// Real OCCT, with only its browser URL replaced by the installed WASM path.
vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const { registerShellKernels } = await import("@/lib/shellKernel");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  return { loadBrepWithOcct: () => ready ??= (async () => {
    registerShellKernels(brep, await OcctKernel.init({ wasm }));
    return brep;
  })() };
});

let brep: typeof import("brepjs");
beforeAll(async () => { brep = await (await import("@/lib/brepKernel")).loadBrepWithOcct(); });

async function embeddedSolid(document: ReturnType<typeof createStarterDocument>) {
  const bytes = await exportKercadProject(document);
  const files = unzipSync(bytes);
  expect(strFromU8(files["model.step"])).toMatch(/^ISO-10303-21;/);
  const restored = await importKercadProject(bytes);
  expect(restored.step).toEqual(files["model.step"]);
  expect(restored.manifest).toMatchObject({ formatVersion: 2, geometry: { path: "model.step", units: "mm" } });
  const result = await brep.importSTEP(new Blob([restored.step! as Uint8Array<ArrayBuffer>]));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function volume(solid: Awaited<ReturnType<typeof embeddedSolid>>) {
  const result = brep.measureVolume(solid);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("embedded STEP preservation (real OCCT)", () => {
  it("preserves physical units and world placement independently of display units", async () => {
    const document = createStarterDocument();
    const original = await embeddedSolid(document);
    const before = brep.getBounds(original);
    document.displayUnit = "in";
    document.objects[0].transform.position = { x: 42, y: -13, z: 7 };
    const moved = await embeddedSolid(document);
    const after = brep.getBounds(moved);
    expect(volume(moved)).toBeCloseTo(8000, 3);
    expect(after.xMin - before.xMin).toBeCloseTo(42, 5);
    expect(after.yMin - before.yMin).toBeCloseTo(-13, 5);
    expect(after.zMin - before.zMin).toBeCloseTo(7, 5);
  });

  it("preserves the complete final Boolean result, rather than a source or cached mesh", async () => {
    const document = createStarterDocument();
    const added = addPrimitiveToSelection(document, document.objects[0].id, "cylinder");
    const cutter = document.features.find(feature => feature.id === added.featureId);
    if (cutter?.kind !== "extrude") throw new Error("Expected cylinder extrusion");
    const sketch = document.features.find(feature => feature.id === cutter.sketchId);
    if (sketch?.kind !== "sketch") throw new Error("Expected cylinder profile");
    sketch.profile = { shape: "circle", diameter: 6 };
    cutter.operation = "cut";
    cutter.distance = 30;
    cutter.transform.position.z = -5;
    expect(volume(await embeddedSolid(document))).toBeCloseTo(8000 - Math.PI * 9 * 20, 3);
  });

  it("includes hidden bodies and scaled objects in the whole-project representation", async () => {
    const document = createStarterDocument();
    document.objects[0].transform.scale.x = 2;
    document.objects[0].transform.rotation.z = 90;
    const added = addPrimitiveToSelection(document, null, "cylinder");
    const hiddenBody = document.objects.find(object => object.id === added.objectId)!;
    hiddenBody.visible = false;
    hiddenBody.transform.position.x = 60;
    const expected = 16000 + Math.PI * 100 * 20;
    expect(volume(await embeddedSolid(document))).toBeCloseTo(expected, 3);
  });

  it("includes a sketch revolution used as the first solid operation", async () => {
    const document = createEmptyDocument();
    const object = createParametricObject(1);
    const sketch = createSketchFeature("rectangle", 1);
    sketch.objectId = object.id;
    sketch.x = 5;
    sketch.profile = { shape: "rectangle", width: 2, depth: 3 };
    const revolve = createRevolveFeature(1);
    revolve.objectId = object.id;
    revolve.source = "sketch";
    revolve.sketchId = sketch.id;
    revolve.axis = "y";
    revolve.angle = 360;
    document.objects = [object];
    document.features = [sketch, revolve];
    expect(volume(await embeddedSolid(document))).toBeCloseTo(60 * Math.PI, 3);
  });
});
