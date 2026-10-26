import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createStarterDocument } from "@/lib/parametricDocument";
import { KERCAD_PACKAGE_SCHEMA, exportKercadProject, importKercadProject, type KercadPackageManifestV1 } from "@/lib/kercadProject";
import { projectAssetFromBytes } from "@/lib/projectAssets";

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
    expect(restored.manifest).toMatchObject({ schema: KERCAD_PACKAGE_SCHEMA, formatVersion: 1 });
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
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as KercadPackageManifestV1;
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
