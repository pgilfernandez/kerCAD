import { describe, expect, it } from "vitest";
import { assertImportByteLimit, PARAMETRIC_IMPORT_LIMITS } from "../../apps/web/src/lib/parametricImportLimits";
import { createStarterDocument, normalizeParametricDocument } from "../../apps/web/src/lib/parametricDocument";
import { importReferenceMesh } from "../../apps/web/src/lib/parametricReferenceImport";

describe("parametric import hardening", () => {
  it("rejects oversized sources before parsing", () => {
    expect(() => assertImportByteLimit("SVG", PARAMETRIC_IMPORT_LIMITS.svgBytes + 1)).toThrow("8 MB limit");
    expect(() => assertImportByteLimit("STEP", PARAMETRIC_IMPORT_LIMITS.stepBytes)).not.toThrow();
  });

  it("rejects duplicate document identifiers", () => {
    const document = createStarterDocument(1);
    document.features[1].id = document.features[0].id;
    expect(() => normalizeParametricDocument(document)).toThrow("duplicated identifiers");
  });

  it("rejects non-finite reference coordinates without shifting the mesh", () => {
    const document = createStarterDocument(1);
    const invalidObj = `v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3`;
    expect(() => importReferenceMesh(document, "invalid.obj", new TextEncoder().encode(invalidObj).buffer as ArrayBuffer)).toThrow();
    expect(document.objects).toHaveLength(1);
  });
});
