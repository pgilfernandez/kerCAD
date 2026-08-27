import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createStarterDocument } from "@/lib/parametricDocument";
import { EDUCAD_PACKAGE_SCHEMA, exportEducadProject, importEducadProject, type EducadPackageManifestV1 } from "@/lib/educadProject";
import { projectAssetFromBytes } from "@/lib/projectAssets";

describe("eduCAD project packages", () => {
  it("round-trips a parametric document and deduplicated source assets", async () => {
    const document = createStarterDocument(123);
    document.name = "Clase de geometría";
    const svg = await projectAssetFromBytes("profile.svg", "svg", strToU8("<svg/>"));
    const duplicate = { ...svg, id: "duplicate", name: "same.svg" };
    const bytes = await exportEducadProject(document, [svg, duplicate]);
    const restored = await importEducadProject(bytes);

    expect(restored.document).toMatchObject({ id: document.id, name: document.name, schema: "educad-parametric/v2" });
    expect(restored.assets).toHaveLength(1);
    expect(strFromU8(restored.assets[0].bytes)).toBe("<svg/>");
    expect(restored.manifest).toMatchObject({ schema: EDUCAD_PACKAGE_SCHEMA, formatVersion: 1 });
  });

  it("rejects a modified project document", async () => {
    const files = unzipSync(await exportEducadProject(createStarterDocument(123)));
    const project = JSON.parse(strFromU8(files["project.json"])) as { name: string };
    project.name = "Manipulado";
    files["project.json"] = strToU8(JSON.stringify(project));

    await expect(importEducadProject(zipSync(files))).rejects.toThrow("integridad");
  });

  it("rejects unsafe asset paths before reading their contents", async () => {
    const files = unzipSync(await exportEducadProject(createStarterDocument(123)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as EducadPackageManifestV1;
    manifest.assets.push({ id: "bad", path: "assets/../bad.svg", name: "bad.svg", mediaType: "image/svg+xml", sourceFormat: "svg", byteLength: 0, sha256: "0".repeat(64) });
    files["manifest.json"] = strToU8(JSON.stringify(manifest));

    await expect(importEducadProject(zipSync(files))).rejects.toThrow("recurso duplicado o no válido");
  });

  it("rejects files not declared by the package manifest", async () => {
    const files = unzipSync(await exportEducadProject(createStarterDocument(123)));
    files["unexpected.bin"] = new Uint8Array([1, 2, 3]);

    await expect(importEducadProject(zipSync(files))).rejects.toThrow("no están declarados");
  });
});
