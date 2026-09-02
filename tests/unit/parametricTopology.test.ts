import { describe, expect, it } from "vitest";
import { createFaceExtrudeFeature, createFilletFeature, createRevolveFeature, createShellFeature, createStarterDocument } from "@/lib/parametricDocument";
import { deleteParametricFeature, duplicateParametricObject } from "@/lib/parametricObjects";
import {
  assertValidParametricTopology,
  isParametricTopologyReference,
  parametricTopologyEditingSourceFeature,
  parametricTopologySelectionsMatch,
  parametricTopologyReferenceIsAvailable,
  ParametricTopologyError,
  recoverParametricTopologyReference,
  transformParametricObjectTopologyHints,
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
  it("matches the same selected entity even when persistent and temporary IDs differ", () => {
    const document = createStarterDocument(1);
    const source = document.features.find((feature) => feature.kind === "extrude")!;
    const stored = edgeReference(document.objects[0].id, source.id);
    stored.id = "stored-edge";
    stored.reference.hint.topologyId = 73;
    const temporary = structuredClone(stored);
    temporary.id = "selected-edge-object:edge:73";
    expect(parametricTopologySelectionsMatch(stored, temporary)).toBe(true);
    temporary.reference.hint.topologyId = 74;
    expect(parametricTopologySelectionsMatch(stored, temporary)).toBe(false);
  });

  it("edits every topology operation against its immediate previous result", () => {
    const document = createStarterDocument(1);
    const objectId = document.objects[0].id;
    const base = document.features.find((feature) => feature.objectId === objectId && feature.kind !== "sketch")!;
    const operations = [createFilletFeature(1), createFaceExtrudeFeature(1), createShellFeature(1), createRevolveFeature(1)];
    for (const operation of operations) {
      operation.objectId = objectId;
      document.features.push(operation);
    }
    expect(parametricTopologyEditingSourceFeature(document, operations[0].id)?.id).toBe(base.id);
    for (let index = 1; index < operations.length; index += 1) {
      expect(parametricTopologyEditingSourceFeature(document, operations[index].id)?.id).toBe(operations[index - 1].id);
    }
  });

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

  it("keeps an exact topology reference when its containing object moves", () => {
    const document = createStarterDocument(1);
    const source = document.features.find((feature) => feature.kind === "extrude")!;
    const reference = edgeReference(document.objects[0].id, source.id);
    reference.reference.hint.topologyId = 73;
    const record: ParametricObjectRenderRecord = {
      objectId: document.objects[0].id,
      renderId: "object:moved",
      geometryFingerprint: "moved",
      color: "#fff",
      worldTransform: { ...document.objects[0].transform, position: { x: 250, y: -80, z: 40 } },
      mesh: {
        positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(),
        edges: new Float32Array([250, -80, 40, 250, -80, 60]),
        edgeGroups: [{ start: 0, count: 2, edgeId: 73 }],
        metrics: { width: 0, depth: 0, height: 20, volume: 0 },
      },
    };

    expect(parametricTopologyReferenceIsAvailable(reference, [record])).toBe(true);
  });

  it("moves stored geometric hints with the containing object transform", () => {
    const document = createStarterDocument(1);
    const object = document.objects[0];
    const source = document.features.find((feature) => feature.kind === "extrude")!;
    const reference = edgeReference(object.id, source.id);
    reference.reference.hint.direction = [1, 0, 0];
    document.topologyReferences.push(reference);
    const previousTransform = structuredClone(object.transform);

    object.transform.position = { x: 10, y: 20, z: 30 };
    object.transform.rotation.z = 90;
    transformParametricObjectTopologyHints(document, object.id, previousTransform);

    expect(reference.reference.hint.midpoint?.[0]).toBeCloseTo(20);
    expect(reference.reference.hint.midpoint?.[1]).toBeCloseTo(30);
    expect(reference.reference.hint.midpoint?.[2]).toBeCloseTo(40);
    expect(reference.reference.hint.direction?.[0]).toBeCloseTo(0);
    expect(reference.reference.hint.direction?.[1]).toBeCloseTo(1);
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
