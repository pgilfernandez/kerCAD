import { describe, expect, it } from "vitest";
import {
  createExtrudeFeature,
  createSketchFeature,
  createStarterDocument,
  documentHasSolid,
  migrateParametricDocument,
  normalizeParametricDocument,
  previousSketch,
  validateDocument,
} from "@/lib/parametricDocument";

describe("parametric document", () => {
  it("creates a reconstructable educational starter part", () => {
    const document = createStarterDocument(123);
    expect(document.schema).toBe("educad-parametric/v2");
    expect(document.createdAt).toBe(123);
    expect(document.workplane).toEqual({ width: 200, depth: 200, gridStep: 5, snapToGrid: true });
    expect(document.objects).toHaveLength(1);
    expect(document.objects[0]).toMatchObject({ name: "Objeto 1", color: "#d41721", visible: true, locked: false, originVisible: false, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } });
    expect(document.features.map((feature) => feature.kind)).toEqual(["sketch", "extrude"]);
    const [sketch, extrude] = document.features;
    expect(extrude.kind === "extrude" && extrude.sketchId).toBe(sketch.id);
    expect(extrude.kind === "extrude" && extrude.operation).toBe("add");
    expect(extrude.kind === "extrude" && extrude.transform).toEqual({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
    expect(extrude.objectId).toBe(document.objects[0].id);
    expect(documentHasSolid(document.features)).toBe(true);
  });

  it("finds the latest sketch at or before the selection", () => {
    const first = createSketchFeature("rectangle", 1);
    const extrusion = createExtrudeFeature(first.id, 1, false);
    const second = createSketchFeature("circle", 2);
    const features = [first, extrusion, second];
    expect(previousSketch(features, extrusion.id)?.id).toBe(first.id);
    expect(previousSketch(features, second.id)?.id).toBe(second.id);
  });

  it("does not count suppressed or cutting extrusions as a base solid", () => {
    const sketch = createSketchFeature("rectangle", 1);
    const extrusion = createExtrudeFeature(sketch.id, 1, false);
    expect(documentHasSolid([sketch, { ...extrusion, suppressed: true }])).toBe(false);
    expect(documentHasSolid([sketch, { ...extrusion, operation: "cut" }])).toBe(false);
    expect(documentHasSolid([sketch, { ...extrusion, operation: "intersect" }])).toBe(false);
  });

  it("rejects unrelated JSON documents", () => {
    expect(validateDocument({ schema: "mesh-scene/v1", features: [] })).toBe(false);
    expect(validateDocument({ schema: "educad-parametric/v3", name: "Future", units: "mm", features: [] })).toBe(false);
    expect(validateDocument(createStarterDocument())).toBe(true);
  });

  it("migrates v1 documents through the versioned pipeline", () => {
    const legacy = createStarterDocument(123);
    legacy.schema = "educad-parametric/v1";

    const migrated = migrateParametricDocument(legacy);
    expect(migrated.schema).toBe("educad-parametric/v2");
    expect(legacy.schema).toBe("educad-parametric/v1");
    expect(migrated.features).toEqual(legacy.features);
  });

  it("migrates legacy feature positions into object transforms", () => {
    const legacy = createStarterDocument(123);
    legacy.schema = "educad-parametric/v1";
    const sketch = legacy.features[0];
    if (sketch.kind !== "sketch") throw new Error("expected sketch");
    sketch.x = 12;
    sketch.y = -4;
    sketch.offset = 3;
    if (legacy.features[1].kind === "extrude") (legacy.features[1] as { operation: string }).operation = "new";
    for (const feature of legacy.features) delete feature.objectId;
    delete (legacy as Partial<typeof legacy>).objects;

    const migrated = normalizeParametricDocument(legacy);
    expect(migrated.schema).toBe("educad-parametric/v2");
    expect(migrated.objects[0].transform.position).toEqual({ x: 12, y: -4, z: 3 });
    expect(migrated.features[0]).toMatchObject({ objectId: migrated.objects[0].id, x: 0, y: 0, offset: 0 });
    expect(migrated.features[1].objectId).toBe(migrated.objects[0].id);
    expect(migrated.features[1]).toMatchObject({ operation: "add" });
  });

  it("migrates stored sketch placement into an operation transform", () => {
    const stored = createStarterDocument(123);
    const sketch = stored.features[0];
    const extrusion = stored.features[1];
    if (sketch.kind !== "sketch" || extrusion.kind !== "extrude") throw new Error("expected primitive");
    sketch.x = 7;
    sketch.y = -2;
    sketch.offset = 4;
    delete (extrusion as Partial<typeof extrusion>).transform;

    const migrated = normalizeParametricDocument(stored);
    expect(migrated.features[0]).toMatchObject({ x: 0, y: 0, offset: 0 });
    expect(migrated.features[1]).toMatchObject({ transform: { position: { x: 7, y: -2, z: 4 }, rotation: { x: 0, y: 0, z: 0 } } });
  });

  it("adds display and locking defaults to stored objects", () => {
    const stored = createStarterDocument(123);
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).visible;
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).locked;
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).originVisible;
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).color;

    expect(normalizeParametricDocument(stored).objects[0]).toMatchObject({ color: stored.color, visible: true, locked: false, originVisible: false });

    stored.objects[0].originVisible = true;
    expect(normalizeParametricDocument(stored).objects[0].originVisible).toBe(true);
  });

  it("migrates and clamps workplane settings", () => {
    const stored = createStarterDocument(123);
    delete (stored as Partial<typeof stored>).workplane;
    expect(normalizeParametricDocument(stored).workplane).toEqual({ width: 200, depth: 200, gridStep: 5, snapToGrid: true });

    const invalid = createStarterDocument(123);
    invalid.workplane = { width: 10, depth: 9000, gridStep: 0, snapToGrid: false };
    expect(normalizeParametricDocument(invalid).workplane).toEqual({ width: 60, depth: 2000, gridStep: 0.1, snapToGrid: false });
  });
});
