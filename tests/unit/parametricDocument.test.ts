import { describe, expect, it } from "vitest";
import {
  createExtrudeFeature,
  createMirrorFeature,
  createLinearPatternFeature,
  createPolarPatternFeature,
  createObjectBooleanFeature,
  createRevolveFeature,
  createShellFeature,
  createSketchFeature,
  createStarterDocument,
  documentHasSolid,
  migrateParametricDocument,
  normalizeParametricDocument,
  previousSketch,
  validateDocument,
} from "@/lib/parametricDocument";

describe("parametric document", () => {
  it("preserves sharp Shell corners and defaults legacy operations to rounded", () => {
    const document = createStarterDocument(123);
    const shell = createShellFeature(1);
    shell.objectId = document.objects[0].id;
    expect(shell.cornerType).toBe("rounded");
    document.features.push(shell);
    shell.cornerType = "sharp";
    expect(normalizeParametricDocument(JSON.parse(JSON.stringify(document))).features.at(-1)).toMatchObject({ cornerType: "sharp" });
    delete shell.cornerType;
    expect(normalizeParametricDocument(document).features.at(-1)).toMatchObject({ cornerType: "rounded" });
  });
  it("creates a reconstructable educational starter part", () => {
    const document = createStarterDocument(123);
    expect(document.schema).toBe("educad-parametric/v2");
    expect(document.createdAt).toBe(123);
    expect(document.workplane).toEqual({
      width: 200,
      depth: 200,
      gridStep: 5,
      snapSpacing: 1,
      snapToGrid: true,
      gridVisible: true,
      activeSizePercent: 20,
      origin: { x: 0, y: 0, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    });
    expect(document.objects).toHaveLength(1);
    expect(document.objects[0]).toMatchObject({ name: "Object 1", color: "#d41721", visible: true, locked: false, expanded: true, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } });
    expect(document.features.map((feature) => feature.kind)).toEqual(["sketch", "extrude"]);
    expect(document.features[0]).toMatchObject({ kind: "sketch", visible: true });
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

  it("creates an editable mirror history operation", () => {
    const mirror = createMirrorFeature(2);
    expect(mirror).toMatchObject({
      kind: "mirror",
      name: "Mirror 2",
      axis: "x",
      duplicate: true,
      suppressed: false,
    });
  });

  it("creates an editable linear pattern history operation", () => {
    const pattern = createLinearPatternFeature(1);
    expect(pattern).toMatchObject({
      kind: "linearPattern",
      name: "Linear pattern 1",
      source: "body",
      axis: "x",
      count: 3,
      spacing: 20,
      suppressed: false,
    });
  });

  it("creates an editable polar pattern history operation", () => {
    const pattern = createPolarPatternFeature(1);
    expect(pattern).toMatchObject({
      kind: "polarPattern",
      name: "Polar pattern 1",
      source: "body",
      axis: "z",
      count: 6,
      angle: 360,
      equalSpacing: true,
      suppressed: false,
    });
  });

  it("preserves valid negative revolve angles and repairs unsafe stored values", () => {
    const stored = createStarterDocument(123);
    const reverse = createRevolveFeature(1);
    reverse.objectId = stored.objects[0].id;
    reverse.source = "sketch";
    reverse.sketchId = stored.features[0].id;
    reverse.faceReferenceId = undefined;
    reverse.angle = -135;
    stored.features.push(reverse);
    expect(normalizeParametricDocument(stored).features.at(-1)).toMatchObject({ kind: "revolve", angle: -135 });

    reverse.angle = Number.NaN;
    (reverse as typeof reverse & { axis: string; operation: string }).axis = "invalid";
    (reverse as typeof reverse & { axis: string; operation: string }).operation = "invalid";
    expect(normalizeParametricDocument(stored).features.at(-1)).toMatchObject({ kind: "revolve", angle: 360, axis: "z", operation: "add" });
  });

  it("creates a cross-object Boolean dependency", () => {
    const feature = createObjectBooleanFeature(1, "source-object");
    expect(feature).toMatchObject({ kind: "objectBoolean", sourceObjectId: "source-object", operation: "add", dependencies: [{ type: "object", id: "source-object" }] });
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

  it("adds visibility, locking and tree expansion defaults to stored objects", () => {
    const stored = createStarterDocument(123);
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).visible;
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).locked;
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).expanded;
    delete (stored.objects[0] as Partial<typeof stored.objects[0]>).color;
    (stored.objects[0] as typeof stored.objects[0] & { originVisible?: boolean }).originVisible = true;

    expect(normalizeParametricDocument(stored).objects[0]).toMatchObject({ color: stored.color, visible: true, locked: false, expanded: true });
    expect("originVisible" in normalizeParametricDocument(stored).objects[0]).toBe(false);
  });

  it("restores sketch overlay visibility without changing suppression", () => {
    const stored = createStarterDocument(123);
    const sketch = stored.features[0];
    if (sketch.kind !== "sketch") throw new Error("expected sketch");
    delete (sketch as Partial<typeof sketch>).visible;

    const normalized = normalizeParametricDocument(stored);
    expect(normalized.features[0]).toMatchObject({ kind: "sketch", visible: true, suppressed: false });
  });

  it("migrates and clamps workplane settings", () => {
    const stored = createStarterDocument(123);
    delete (stored as Partial<typeof stored>).workplane;
    expect(normalizeParametricDocument(stored).workplane).toMatchObject({
      width: 200,
      depth: 200,
      gridStep: 5,
      snapSpacing: 1,
      snapToGrid: true,
      gridVisible: true,
      activeSizePercent: 20,
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    });

    const invalid = createStarterDocument(123);
    invalid.workplane = { width: 10, depth: 9000, gridStep: 0, snapSpacing: 500, snapToGrid: false } as typeof invalid.workplane;
    expect(normalizeParametricDocument(invalid).workplane).toMatchObject({ width: 10, depth: 2000, gridStep: 0.1, snapSpacing: 200, snapToGrid: false });

    const legacy = createStarterDocument(123);
    delete (legacy.workplane as Partial<typeof legacy.workplane>).snapSpacing;
    legacy.workplane.gridStep = 12;
    expect(normalizeParametricDocument(legacy).workplane.snapSpacing).toBe(12);
  });
});
