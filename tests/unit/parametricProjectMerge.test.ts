import { describe, expect, it } from "vitest";
import { createFilletFeature, createObjectBooleanFeature, createStarterDocument } from "@/lib/parametricDocument";
import { addPrimitiveToSelection } from "@/lib/parametricObjects";
import { mergeParametricProjects } from "@/lib/parametricProjectMerge";
import type { ParametricTopologyReference } from "@/types/parametric";

describe("parametric project merge", () => {
  it("remaps colliding objects, features, dependencies and topology references", () => {
    const target = createStarterDocument(123);
    const imported = structuredClone(target);
    const sourceFeature = imported.features.find((feature) => feature.kind === "extrude")!;
    const reference: ParametricTopologyReference = {
      id: "topology-1",
      name: "Imported edge",
      objectId: imported.objects[0].id,
      sourceFeatureId: sourceFeature.id,
      reference: { origin: `${sourceFeature.id}:result`, faceRoles: ["a", "b"], hint: { entityType: "edge", topologyId: 1 } },
    };
    imported.topologyReferences.push(reference);
    const fillet = createFilletFeature(1);
    fillet.objectId = imported.objects[0].id;
    fillet.selectionReferenceIds = [reference.id];
    fillet.dependencies = [{ type: "feature", id: sourceFeature.id }];
    imported.features.push(fillet);

    const result = mergeParametricProjects(target, imported);
    const importedObjectId = result.objectIdMap.get(imported.objects[0].id)!;
    const importedSourceId = result.featureIdMap.get(sourceFeature.id)!;
    const importedReferenceId = result.topologyReferenceIdMap.get(reference.id)!;
    const mergedFillet = result.document.features.find((feature) => feature.id === result.featureIdMap.get(fillet.id));
    const mergedReference = result.document.topologyReferences.find((candidate) => candidate.id === importedReferenceId)!;

    expect(importedObjectId).not.toBe(imported.objects[0].id);
    expect(importedSourceId).not.toBe(sourceFeature.id);
    expect(mergedFillet).toMatchObject({ objectId: importedObjectId, selectionReferenceIds: [importedReferenceId], dependencies: [{ type: "feature", id: importedSourceId }] });
    expect(mergedReference).toMatchObject({ objectId: importedObjectId, sourceFeatureId: importedSourceId, reference: { origin: `${importedSourceId}:result` } });
  });

  it("preserves Boolean links inside the imported project and supports repeated imports", () => {
    const target = createStarterDocument(123);
    const imported = createStarterDocument(456);
    const source = addPrimitiveToSelection(imported, null, "box");
    const boolean = createObjectBooleanFeature(1, source.objectId);
    boolean.objectId = imported.objects[0].id;
    imported.features.push(boolean);

    const first = mergeParametricProjects(target, imported);
    const second = mergeParametricProjects(first.document, imported);
    const secondBoolean = second.document.features.find((feature) => feature.id === second.featureIdMap.get(boolean.id));

    expect(new Set(second.document.objects.map((object) => object.id)).size).toBe(second.document.objects.length);
    expect(new Set(second.document.features.map((feature) => feature.id)).size).toBe(second.document.features.length);
    expect(secondBoolean).toMatchObject({ objectId: second.objectIdMap.get(boolean.objectId!), sourceObjectId: second.objectIdMap.get(source.objectId) });
  });
});
