import { describe, expect, it } from "vitest";
import { createStarterDocument, documentHasSolid, normalizeParametricDocument } from "../../apps/web/src/lib/parametricDocument";
import { appendImportedStepObject } from "../../apps/web/src/lib/parametricStepImport";
import { canReorderParametricSelection } from "../../apps/web/src/lib/parametricObjects";

describe("parametric STEP import", () => {
  it("adds an exact STEP base feature inside a new object", () => {
    const document = createStarterDocument(1);
    document.objects = [];
    document.features = [];

    const result = appendImportedStepObject(document, "support.step", "ISO-10303-21;\nEND-ISO-10303-21;", () => 0);
    const feature = document.features.find((candidate) => candidate.id === result.featureId);

    expect(document.objects).toHaveLength(1);
    expect(feature).toMatchObject({ kind: "importedStep", name: "support", sourceName: "support.step", objectId: result.objectId });
    expect(feature && feature.kind === "importedStep" ? feature.stepText : "").toContain("ISO-10303-21");
    expect(documentHasSolid(document.features)).toBe(true);
  });

  it("rejects an imported base whose exact payload was lost", () => {
    const document = createStarterDocument(1);
    document.objects = [];
    document.features = [];
    appendImportedStepObject(document, "empty.step", "ISO-10303-21;", () => 0);
    const feature = document.features[0];
    if (feature.kind === "importedStep") feature.stepText = "";

    expect(() => normalizeParametricDocument(document)).toThrow("STEP content is empty");
  });

  it("keeps the imported B-Rep as the first operation", () => {
    const document = createStarterDocument(1);
    document.objects = [];
    document.features = [];
    const imported = appendImportedStepObject(document, "base.step", "ISO-10303-21;", () => 0);
    document.features.push({ id: "hole", kind: "hole", name: "Taladro", suppressed: false, objectId: imported.objectId, x: 0, y: 0, diameter: 4, termination: "through-all", depth: 10 });

    expect(canReorderParametricSelection(document, [{ id: imported.featureId, kind: "feature" }], "down")).toBe(false);
  });
});
