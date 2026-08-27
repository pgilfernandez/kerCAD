import { describe, expect, it } from "vitest";
import { createStarterDocument } from "@/lib/parametricDocument";
import { appendSvgProfileAsParametricExtrusion } from "@/lib/svgParametricImport";

const rectangle = {
  points: [
    { id: "a", x: 0, z: 0 },
    { id: "b", x: 20, z: 0 },
    { id: "c", x: 20, z: 10 },
    { id: "d", x: 0, z: 10 },
  ],
  segments: [
    { id: "ab", kind: "line" as const, startId: "a", endId: "b" },
    { id: "bc", kind: "line" as const, startId: "b", endId: "c" },
    { id: "cd", kind: "line" as const, startId: "c", endId: "d" },
    { id: "da", kind: "line" as const, startId: "d", endId: "a" },
  ],
  circles: [],
  images: [],
  constraints: [],
};

describe("parametric SVG import", () => {
  it("appends an editable sketch and extrusion to the selected object", () => {
    const document = createStarterDocument(123);
    const target = document.objects[0];
    const imported = appendSvgProfileAsParametricExtrusion(document, rectangle, "classroom-logo.svg", target.id);

    expect(imported.objectId).toBe(target.id);
    expect(document.features.slice(-2).map((feature) => feature.kind)).toEqual(["sketch", "extrude"]);
    expect(document.features.at(-1)).toMatchObject({ id: imported.extrusionId, name: "classroom-logo", operation: "add" });
    expect(document.features.at(-1)?.dependencies).toEqual([{ type: "feature", id: imported.sketchId }]);
  });

  it("creates a workplane-aligned object when there is no selection", () => {
    const document = createStarterDocument(123);
    const previousCount = document.objects.length;
    const imported = appendSvgProfileAsParametricExtrusion(document, rectangle, "badge.svg", null);

    expect(document.objects).toHaveLength(previousCount + 1);
    expect(document.objects.find((object) => object.id === imported.objectId)?.name).toBe("badge");
  });
});
