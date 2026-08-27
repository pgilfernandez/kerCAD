import { describe, expect, it } from "vitest";
import { createObjectBooleanFeature, createStarterDocument } from "@/lib/parametricDocument";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint, parametricObjectFeaturePrefixFingerprint, parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
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

  it("invalidates a Boolean consumer when its reference object moves", () => {
    const document = createStarterDocument(123);
    const targetId = document.objects[0].id;
    const source = addPrimitiveToSelection(document, null, "box");
    const operation = createObjectBooleanFeature(1, source.objectId);
    operation.objectId = targetId;
    document.features.push(operation);
    const before = parametricObjectGeometryFingerprint(document, targetId);

    document.objects.find((object) => object.id === source.objectId)!.transform.position.y += 8;

    expect(parametricObjectGeometryFingerprint(document, targetId)).not.toBe(before);
  });

  it("keeps an unchanged operation prefix reusable when a later operation changes", () => {
    const document = createStarterDocument(123);
    const objectId = document.objects[0].id;
    const firstFeatureId = document.features.find((feature) => feature.objectId === objectId && feature.kind !== "sketch")!.id;
    const second = addPrimitiveToSelection(document, objectId, "cylinder");
    const prefixBefore = parametricObjectFeaturePrefixFingerprint(document, objectId, firstFeatureId);
    const objectBefore = parametricObjectGeometryFingerprint(document, objectId);
    const secondFeature = document.features.find((feature) => feature.id === second.featureId)!;
    if (secondFeature.kind !== "extrude") throw new Error("Expected an extrude feature");
    secondFeature.distance += 5;

    expect(parametricObjectFeaturePrefixFingerprint(document, objectId, firstFeatureId)).toBe(prefixBefore);
    expect(parametricObjectGeometryFingerprint(document, objectId)).not.toBe(objectBefore);

    const firstFeature = document.features.find((feature) => feature.id === firstFeatureId)!;
    if (firstFeature.kind !== "extrude" && firstFeature.kind !== "primitive") throw new Error("Expected a solid feature");
    firstFeature.transform.position.x += 1;
    expect(parametricObjectFeaturePrefixFingerprint(document, objectId, firstFeatureId)).not.toBe(prefixBefore);
  });
});
