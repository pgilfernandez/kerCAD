import { describe, expect, it } from "vitest";
import { createStarterDocument, normalizeParametricDocument } from "../../apps/web/src/lib/parametricDocument";
import { importReferenceMesh, parametricReferenceRenderRecords } from "../../apps/web/src/lib/parametricReferenceImport";

const asciiStl = `solid triangle
facet normal 0 0 1
 outer loop
  vertex 0 0 2
  vertex 10 0 2
  vertex 0 10 2
 endloop
endfacet
endsolid triangle`;

const obj = `v 0 0 1
v 4 0 1
v 0 6 1
f 1 2 3`;

describe("parametric reference meshes", () => {
  it.each([
    ["guide.stl", asciiStl, "stl"],
    ["guide.obj", obj, "obj"],
  ] as const)("imports %s outside the CAD history", (sourceName, source, format) => {
    const document = createStarterDocument(1);
    const featureCount = document.features.length;
    const objectId = importReferenceMesh(document, sourceName, new TextEncoder().encode(source).buffer as ArrayBuffer, () => 0);
    const object = document.objects.find((candidate) => candidate.id === objectId);

    expect(document.features).toHaveLength(featureCount);
    expect(object?.referenceMesh).toMatchObject({ sourceName, format, opacity: 0.4, displayMode: "solidEdges", pickable: true });
    expect(object?.referenceMesh?.positions.length).toBe(9);
    expect(normalizeParametricDocument(document).objects.find((candidate) => candidate.id === objectId)?.referenceMesh).toBeTruthy();
  });

  it("applies the object transform only to the render record", () => {
    const document = createStarterDocument(1);
    const objectId = importReferenceMesh(document, "guide.obj", new TextEncoder().encode(obj).buffer as ArrayBuffer, () => 0);
    const object = document.objects.find((candidate) => candidate.id === objectId)!;
    const localPositions = [...object.referenceMesh!.positions];
    object.transform.position = { x: 12, y: -3, z: 7 };
    object.referenceMesh!.displayMode = "wireframe";
    object.locked = true;

    const record = parametricReferenceRenderRecords(document)[0];
    expect(record.reference).toMatchObject({ opacity: 0.4, displayMode: "wireframe", pickable: false });
    expect(record.mesh.positions[0]).toBeCloseTo(localPositions[0] + 12);
    expect(record.mesh.positions[1]).toBeCloseTo(localPositions[1] - 3);
    expect(record.mesh.positions[2]).toBeCloseTo(localPositions[2] + 7);
    expect(object.referenceMesh!.positions).toEqual(localPositions);
  });
});
