import { describe, expect, it } from "vitest";
import { addPrimitiveToSelection, duplicateParametricObject } from "@/lib/parametricObjects";
import { createStarterDocument } from "@/lib/parametricDocument";
import { ParametricDependencyError, topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";

describe("parametric dependency graph", () => {
  it("reorders explicit inputs before their dependent feature", () => {
    const document = createStarterDocument(1);
    document.features.reverse();
    const sorted = topologicallySortedParametricFeatures(document);
    expect(sorted.map((feature) => feature.kind)).toEqual(["sketch", "extrude"]);
  });

  it("keeps each object's operation history sequential", () => {
    const document = createStarterDocument(1);
    const objectId = document.objects[0].id;
    addPrimitiveToSelection(document, objectId, "cylinder");
    const operations = topologicallySortedParametricFeatures(document).filter((feature) => feature.objectId === objectId && feature.kind !== "sketch");
    expect(operations.map((feature) => feature.name)).toEqual(["Box", "Cylinder"]);
  });

  it("orders cross-object references before their consumers", () => {
    const document = createStarterDocument(1);
    const firstOperation = document.features.find((feature) => feature.kind === "extrude");
    const second = addPrimitiveToSelection(document, null, "box");
    const secondOperation = document.features.find((feature) => feature.id === second.featureId);
    if (!firstOperation || !secondOperation) throw new Error("expected operations");
    firstOperation.dependencies = [{ type: "object", id: second.objectId }];

    const sorted = topologicallySortedParametricFeatures(document);
    expect(sorted.indexOf(secondOperation)).toBeLessThan(sorted.indexOf(firstOperation));
  });

  it("rejects cyclic and missing references before a document mutation is committed", () => {
    const document = createStarterDocument(1);
    const firstOperation = document.features.find((feature) => feature.kind === "extrude");
    const second = addPrimitiveToSelection(document, null, "box");
    const secondOperation = document.features.find((feature) => feature.id === second.featureId);
    if (!firstOperation || !secondOperation || !firstOperation.objectId || !secondOperation.objectId) throw new Error("expected operations");
    firstOperation.dependencies = [{ type: "object", id: secondOperation.objectId }];
    secondOperation.dependencies = [{ type: "object", id: firstOperation.objectId }];
    expect(() => topologicallySortedParametricFeatures(document)).toThrow(ParametricDependencyError);

    secondOperation.dependencies = [{ type: "object", id: "missing-object" }];
    expect(() => topologicallySortedParametricFeatures(document)).toThrow("does not exist");
  });

  it("remaps internal references when an object is duplicated", () => {
    const document = createStarterDocument(1);
    const objectId = document.objects[0].id;
    const firstOperation = document.features.find((feature) => feature.kind === "extrude");
    const second = addPrimitiveToSelection(document, objectId, "cylinder");
    const secondOperation = document.features.find((feature) => feature.id === second.featureId);
    if (!firstOperation || !secondOperation) throw new Error("expected operations");
    secondOperation.dependencies = [{ type: "feature", id: firstOperation.id }];

    const cloneId = duplicateParametricObject(document, objectId);
    const cloneOperations = document.features.filter((feature) => feature.objectId === cloneId && feature.kind !== "sketch");
    expect(cloneOperations[1].dependencies?.[0]).toEqual({ type: "feature", id: cloneOperations[0].id });
    expect(() => topologicallySortedParametricFeatures(document)).not.toThrow();
  });
});
