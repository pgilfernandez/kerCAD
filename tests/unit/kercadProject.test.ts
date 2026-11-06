import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createEmptyDocument, createStarterDocument } from "@/lib/parametricDocument";
import { KERCAD_PACKAGE_SCHEMA, exportKercadProject, importKercadProject, type KercadPackageManifestV2 } from "@/lib/kercadProject";
import { projectAssetFromBytes } from "@/lib/projectAssets";

vi.mock("@/lib/parametricKernel", () => ({ exportParametricStep: vi.fn(async () => new Blob(["ISO-10303-21;\nHEADER;ENDSEC;DATA;ENDSEC;END-ISO-10303-21;"], { type: "application/step" })) }));

import { exportParametricStep } from "@/lib/parametricKernel";
beforeEach(() => vi.clearAllMocks());

describe("kerCAD project packages", () => {
  it("round-trips a parametric document and deduplicated source assets", async () => {
    const document = createStarterDocument(123);
    document.name = "Clase de geometría";
    const svg = await projectAssetFromBytes("profile.svg", "svg", strToU8("<svg/>"));
    const duplicate = { ...svg, id: "duplicate", name: "same.svg" };
    const bytes = await exportKercadProject(document, [svg, duplicate]);
    const restored = await importKercadProject(bytes);

    expect(restored.document).toMatchObject({ id: document.id, name: document.name, schema: "kercad-parametric/v2" });
    expect(restored.assets).toHaveLength(1);
    expect(strFromU8(restored.assets[0].bytes)).toBe("<svg/>");
    expect(restored.manifest).toMatchObject({ schema: KERCAD_PACKAGE_SCHEMA, formatVersion: 2 });
  });

  it("embeds a declared, hashed model.step independently of source assets", async () => {
    const document = createStarterDocument(123);
    const source = await projectAssetFromBytes("source.step", "step", strToU8("Original source"));
    const bytes = await exportKercadProject(document, [source]);
    const files = unzipSync(bytes);
    const restored = await importKercadProject(bytes);
    expect(strFromU8(files["model.step"])).toMatch(/^ISO-10303-21;/);
    expect(restored.step).toEqual(files["model.step"]);
    expect(restored.manifest).toMatchObject({ formatVersion: 2, minimumReaderVersion: 2, geometry: { path: "model.step", units: "mm", mediaType: "application/step", byteLength: files["model.step"].byteLength, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(restored.assets).toHaveLength(1);
    expect(restored.assets[0].name).toBe("source.step");
    expect(exportParametricStep).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exportParametricStep).mock.calls[0][0]).not.toBe(document);
    expect(vi.mocked(exportParametricStep).mock.calls[0]).toHaveLength(1);
  });

  it("keeps empty and sketch-only documents portable without inventing a solid", async () => {
    const sketchOnly = createStarterDocument(123);
    sketchOnly.features = sketchOnly.features.filter(feature => feature.kind === "sketch");
    for (const document of [createEmptyDocument(), sketchOnly]) {
      const bytes = await exportKercadProject(document);
      expect(unzipSync(bytes)["model.step"]).toBeUndefined();
      expect((await importKercadProject(bytes)).manifest).toMatchObject({ geometry: null });
    }
    expect(exportParametricStep).not.toHaveBeenCalled();
  });

  it("continues importing version 1 packages", async () => {
    const files = unzipSync(await exportKercadProject(createStarterDocument(123)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    manifest.formatVersion = 1;
    manifest.minimumReaderVersion = 1;
    delete manifest.geometry;
    delete files["model.step"];
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    const restored = await importKercadProject(zipSync(files));
    expect(restored.manifest.formatVersion).toBe(1);
    expect(restored.step).toBeUndefined();
    expect(restored.document.features).toHaveLength(2);
  });

  it("rejects modified, missing or unsafe STEP entries", async () => {
    const bytes = await exportKercadProject(createStarterDocument(123));
    const modified = unzipSync(bytes);
    modified["model.step"][15] ^= 1;
    await expect(importKercadProject(zipSync(modified))).rejects.toThrow("integrity");
    const missing = unzipSync(bytes);
    delete missing["model.step"];
    await expect(importKercadProject(zipSync(missing))).rejects.toThrow("integrity");
    const unsafe = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(unsafe["manifest.json"]));
    manifest.geometry.path = "../model.step";
    unsafe["manifest.json"] = strToU8(JSON.stringify(manifest));
    await expect(importKercadProject(zipSync(unsafe))).rejects.toThrow("STEP entry");
  });

  it("fails explicitly if exact geometry cannot be generated", async () => {
    vi.mocked(exportParametricStep).mockRejectedValueOnce(new Error("Invalid geometry"));
    await expect(exportKercadProject(createStarterDocument(123))).rejects.toThrow("Could not include STEP geometry: Invalid geometry");
  });

  it("rejects a modified project document", async () => {
    const files = unzipSync(await exportKercadProject(createStarterDocument(123)));
    const project = JSON.parse(strFromU8(files["project.json"])) as { name: string };
    project.name = "Manipulado";
    files["project.json"] = strToU8(JSON.stringify(project));

    await expect(importKercadProject(zipSync(files))).rejects.toThrow("integrity");
  });

  it("rejects unsafe asset paths before reading their contents", async () => {
    const files = unzipSync(await exportKercadProject(createStarterDocument(123)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as KercadPackageManifestV2;
    manifest.assets.push({ id: "bad", path: "assets/../bad.svg", name: "bad.svg", mediaType: "image/svg+xml", sourceFormat: "svg", byteLength: 0, sha256: "0".repeat(64) });
    files["manifest.json"] = strToU8(JSON.stringify(manifest));

    await expect(importKercadProject(zipSync(files))).rejects.toThrow("duplicated or invalid asset");
  });

  it("rejects files not declared by the package manifest", async () => {
    const files = unzipSync(await exportKercadProject(createStarterDocument(123)));
    files["unexpected.bin"] = new Uint8Array([1, 2, 3]);

    await expect(importKercadProject(zipSync(files))).rejects.toThrow("not declared");
  });
});
