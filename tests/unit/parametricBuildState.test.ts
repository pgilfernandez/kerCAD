import { describe, expect, it } from "vitest";
import { createStarterDocument } from "@/lib/parametricDocument";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint, parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
import { addPrimitiveToSelection } from "@/lib/parametricObjects";

describe("parametric build state", () => {
  it("ignores edits that do not change B-Rep geometry", () => {
    const document = createStarterDocument(123);
    const initial = parametricGeometryFingerprint(document);

    document.name = "Renamed project";
    document.workplane.width = 500;
    document.objects[0].name = "Renamed object";
    document.objects[0].color = "#3b82f6";
    document.objects[0].locked = true;
    document.objects[0].originVisible = true;
    document.features[0].name = "Renamed feature";

    expect(parametricGeometryFingerprint(document)).toBe(initial);
  });

  it("changes when exact geometry or visibility changes", () => {
    const document = createStarterDocument(123);
    const initial = parametricGeometryFingerprint(document);
    document.objects[0].transform.position.x = 5;
    const moved = parametricGeometryFingerprint(document);
    document.objects[0].visible = false;

    expect(moved).not.toBe(initial);
    expect(parametricGeometryFingerprint(document)).not.toBe(moved);
  });

  it("tracks appearance colours independently", () => {
    const document = createStarterDocument(123);
    const initialGeometry = parametricGeometryFingerprint(document);
    document.objects[0].color = "#3b82f6";
    const colors = objectColorsFromFingerprint(parametricObjectColorFingerprint(document));

    expect(parametricGeometryFingerprint(document)).toBe(initialGeometry);
    expect(colors[document.objects[0].id]).toBe("#3b82f6");
  });

  it("fingerprints each object's GPU geometry independently", () => {
    const document = createStarterDocument(123);
    const firstId = document.objects[0].id;
    const second = addPrimitiveToSelection(document, null, "box");
    const firstBefore = parametricObjectGeometryFingerprint(document, firstId);
    const secondBefore = parametricObjectGeometryFingerprint(document, second.objectId);
    const secondObject = document.objects.find((object) => object.id === second.objectId)!;
    secondObject.transform.position.x += 12;

    expect(parametricObjectGeometryFingerprint(document, firstId)).toBe(firstBefore);
    expect(parametricObjectGeometryFingerprint(document, second.objectId)).not.toBe(secondBefore);
  });
});
