import { describe, expect, it } from "vitest";
import { createFilletFeature, createStarterDocument } from "@/lib/parametricDocument";
import { deleteParametricFeature, duplicateParametricObject } from "@/lib/parametricObjects";
import {
  assertValidParametricTopology,
  isParametricTopologyReference,
  parametricTopologyReferenceIsAvailable,
  ParametricTopologyError,
  recoverParametricTopologyReference,
} from "@/lib/parametricTopology";
import type { ParametricObjectRenderRecord, ParametricTopologyReference } from "@/types/parametric";

function edgeReference(objectId: string, sourceFeatureId: string): ParametricTopologyReference {
  return {
    id: "topology-edge-1",
    name: "Arista vertical delantera",
    objectId,
    sourceFeatureId,
    reference: {
      origin: sourceFeatureId,
      faceRoles: ["box:front", "box:right"],
      hint: { entityType: "edge", length: 20, midpoint: [10, -10, 10] },
    },
  };
}

describe("stable parametric topology references", () => {
  it("detects an exact edge reference that disappeared after a rebuild", () => {
    const document = createStarterDocument(1);
    const source = document.features.find((feature) => feature.kind === "extrude")!;
    const reference = edgeReference(document.objects[0].id, source.id);
    reference.reference.hint = { entityType: "edge", topologyId: 73 };
    const record: ParametricObjectRenderRecord = {
      objectId: document.objects[0].id,
      renderId: "object:test",
      geometryFingerprint: "test",
      color: "#fff",
      worldTransform: document.objects[0].transform,
      mesh: {
        positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), edges: new Float32Array(),
        edgeGroups: [{ start: 0, count: 2, edgeId: 72 }],
        metrics: { width: 0, depth: 0, height: 0, volume: 0 },
      },
    };

    expect(parametricTopologyReferenceIsAvailable(reference, [record])).toBe(false);
    record.mesh.edgeGroups![0].edgeId = 73;
    expect(parametricTopologyReferenceIsAvailable(reference, [record])).toBe(true);
  });

  it("stores lineage and geometric hints in a serializable document record", () => {
    const document = createStarterDocument(1);
    const object = document.objects[0];
    const source = document.features.find((feature) => feature.kind === "extrude");
    if (!source) throw new Error("expected extrusion");
    const stored = edgeReference(object.id, source.id);
    document.topologyReferences.push(stored);
    const fillet = createFilletFeature(1);
    fillet.objectId = object.id;
    fillet.edgeReferenceIds = [stored.id];
    document.features.push(fillet);

    expect(isParametricTopologyReference(JSON.parse(JSON.stringify(stored)))).toBe(true);
    expect(() => assertValidParametricTopology(document)).not.toThrow();
  });

  it("keeps one editable edge-treatment feature for fillet and chamfer", () => {
    expect(createFilletFeature(1)).toMatchObject({ treatment: "fillet", name: "Fillet 1", radius: 2 });
    expect(createFilletFeature(2, "chamfer")).toMatchObject({ treatment: "chamfer", name: "Chamfer 2", radius: 2 });
  });

  it("reports broken references instead of silently selecting another edge", () => {
    const document = createStarterDocument(1);
    const object = document.objects[0];
    const source = document.features.find((feature) => feature.kind === "extrude");
    if (!source) throw new Error("expected extrusion");
    const stored = edgeReference(object.id, source.id);
    document.topologyReferences.push(stored);
    const fillet = createFilletFeature(1);
    fillet.objectId = object.id;
    fillet.edgeReferenceIds = [stored.id];
    document.features.push(fillet);

    deleteParametricFeature(document, source.id);
    expect(() => assertValidParametricTopology(document)).toThrow(ParametricTopologyError);
  });

  it("removes references owned by a deleted edge-treatment operation", () => {
    const document = createStarterDocument(1);
    const object = document.objects[0];
    const source = document.features.find((feature) => feature.kind === "extrude")!;
    const stored = edgeReference(object.id, source.id);
    document.topologyReferences.push(stored);
    const treatment = createFilletFeature(1, "chamfer");
    treatment.objectId = object.id;
    treatment.edgeReferenceIds = [stored.id];
    document.features.push(treatment);

    deleteParametricFeature(document, treatment.id);

    expect(document.topologyReferences).toHaveLength(0);
  });

  it("supports explicit manual recovery while preserving the stable reference id", () => {
    const document = createStarterDocument(1);
    const source = document.features.find((feature) => feature.kind === "extrude");
    if (!source) throw new Error("expected extrusion");
    const stored = edgeReference(document.objects[0].id, source.id);
    const recovered = recoverParametricTopologyReference(stored, {
      origin: source.id,
      faceRoles: ["box:front", "box:left"],
      hint: { entityType: "edge", length: 24, midpoint: [-12, -10, 12] },
    });
    expect(recovered.id).toBe(stored.id);
    expect(recovered.reference).not.toEqual(stored.reference);
    expect(stored.reference).toEqual(edgeReference(document.objects[0].id, source.id).reference);
  });

  it("duplicates owned topology references and remaps their consumers", () => {
    const document = createStarterDocument(1);
    const object = document.objects[0];
    const source = document.features.find((feature) => feature.kind === "extrude");
    if (!source) throw new Error("expected extrusion");
    const stored = edgeReference(object.id, source.id);
    document.topologyReferences.push(stored);
    const fillet = createFilletFeature(1);
    fillet.objectId = object.id;
    fillet.edgeReferenceIds = [stored.id];
    document.features.push(fillet);

    const cloneId = duplicateParametricObject(document, object.id);
    const cloneReference = document.topologyReferences.find((reference) => reference.objectId === cloneId);
    const cloneFillet = document.features.find((feature) => feature.objectId === cloneId && feature.kind === "fillet");
    expect(cloneReference?.id).not.toBe(stored.id);
    expect(cloneFillet?.edgeReferenceIds).toEqual([cloneReference?.id]);
    expect(() => assertValidParametricTopology(document)).not.toThrow();
  });
});
