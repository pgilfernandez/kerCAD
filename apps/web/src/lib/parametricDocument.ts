import type {
  CircleProfile,
  ExtrudeFeature,
  FilletFeature,
  HoleFeature,
  ParametricDocument,
  ParametricFeature,
  ParametricObject,
  RectangleProfile,
  SketchFeature,
} from "@/types/parametric";

let localCounter = 0;

export function createFeatureId(prefix: string) {
  localCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localCounter.toString(36)}`;
}

export function createStarterDocument(now = Date.now()): ParametricDocument {
  const sketchId = createFeatureId("sketch");
  const object = createParametricObject(1);
  return {
    schema: "educad-parametric/v1",
    id: createFeatureId("project"),
    name: "Nuevo diseño",
    units: "mm",
    color: "#d41721",
    objects: [object],
    createdAt: now,
    updatedAt: now,
    features: [
      {
        id: sketchId,
        kind: "sketch",
        name: "Boceto de Caja",
        suppressed: false,
        objectId: object.id,
        plane: "XY",
        x: 0,
        y: 0,
        offset: 0,
        profile: { shape: "rectangle", width: 20, depth: 20 },
      },
      {
        id: createFeatureId("extrude"),
        kind: "extrude",
        name: "Caja",
        suppressed: false,
        objectId: object.id,
        sketchId,
        distance: 20,
        symmetric: false,
        operation: "add",
        transform: operationTransform(),
      },
    ],
  };
}

export function createParametricObject(index: number, position = { x: 0, y: 0, z: 0 }): ParametricObject {
  return {
    id: createFeatureId("object"),
    name: `Objeto ${index}`,
    visible: true,
    locked: false,
    transform: {
      position: { ...position },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

export function createSketchFeature(shape: RectangleProfile["shape"] | CircleProfile["shape"], index: number): SketchFeature {
  return {
    id: createFeatureId("sketch"),
    kind: "sketch",
    name: `Boceto ${index}`,
    suppressed: false,
    plane: "XY",
    x: 0,
    y: 0,
    offset: 0,
    profile: shape === "rectangle"
      ? { shape, width: 40, depth: 30 }
      : { shape, diameter: 24 },
  };
}

export function createExtrudeFeature(sketchId: string, index: number, _hasSolid: boolean): ExtrudeFeature {
  return {
    id: createFeatureId("extrude"),
    kind: "extrude",
    name: `Extrusión ${index}`,
    suppressed: false,
    sketchId,
    distance: 10,
    symmetric: false,
    operation: "add",
    transform: operationTransform(),
  };
}

function operationTransform() {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

export function createHoleFeature(index: number): HoleFeature {
  return {
    id: createFeatureId("hole"),
    kind: "hole",
    name: `Taladro ${index}`,
    suppressed: false,
    x: 0,
    y: 0,
    diameter: 8,
    termination: "through-all",
    depth: 10,
  };
}

export function createFilletFeature(index: number): FilletFeature {
  return {
    id: createFeatureId("fillet"),
    kind: "fillet",
    name: `Redondeo ${index}`,
    suppressed: false,
    radius: 2,
    edges: "vertical",
  };
}

export function validateDocument(value: unknown): value is ParametricDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ParametricDocument>;
  return candidate.schema === "educad-parametric/v1"
    && typeof candidate.name === "string"
    && candidate.units === "mm"
    && (candidate.objects === undefined || Array.isArray(candidate.objects))
    && Array.isArray(candidate.features)
    && candidate.features.every((feature) => feature && typeof feature.id === "string" && typeof feature.kind === "string");
}

export function normalizeParametricDocument(document: ParametricDocument): ParametricDocument {
  const next = structuredClone(document) as ParametricDocument;
  next.objects ??= [];
  const objectIds = new Set(next.objects.map((object) => object.id));
  const objectByExtrude = new Map<string, string>();

  for (const object of next.objects) {
    object.visible ??= true;
    object.locked ??= false;
  }

  for (const feature of next.features) {
    if (feature.kind === "extrude" && (feature.operation as string) === "new") feature.operation = "add";
  }

  for (const [index, feature] of next.features.entries()) {
    if (feature.kind !== "extrude") continue;
    const existingObject = feature.objectId ? next.objects.find((object) => object.id === feature.objectId) : null;
    if (existingObject) {
      objectByExtrude.set(feature.id, existingObject.id);
      continue;
    }
    const sketch = next.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === feature.sketchId);
    const object = createParametricObject(next.objects.length + 1, {
      x: sketch?.x ?? 0,
      y: sketch?.y ?? 0,
      z: sketch?.offset ?? 0,
    });
    while (objectIds.has(object.id)) object.id = createFeatureId("object");
    objectIds.add(object.id);
    next.objects.push(object);
    feature.objectId = object.id;
    if (sketch) {
      sketch.objectId = object.id;
      sketch.x = 0;
      sketch.y = 0;
      sketch.offset = 0;
    }
    objectByExtrude.set(feature.id, object.id);

    for (const candidate of next.features.slice(index + 1)) {
      if (candidate.kind === "extrude") break;
      if (candidate.objectId === feature.id || ((candidate.kind === "hole" || candidate.kind === "fillet") && !candidate.objectId)) {
        candidate.objectId = object.id;
      }
    }
  }

  for (const feature of next.features) {
    if (feature.objectId && objectByExtrude.has(feature.objectId)) feature.objectId = objectByExtrude.get(feature.objectId);
    if (feature.kind !== "extrude") continue;
    const legacy = feature as ExtrudeFeature & { transform?: ExtrudeFeature["transform"] };
    if (legacy.transform) continue;
    const sketch = next.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === feature.sketchId);
    legacy.transform = operationTransform();
    if (sketch) {
      legacy.transform.position = { x: sketch.x, y: sketch.y, z: sketch.offset };
      sketch.x = 0;
      sketch.y = 0;
      sketch.offset = 0;
    }
  }
  return next;
}

export function previousSketch(features: ParametricFeature[], selectedId: string | null) {
  const selectedIndex = selectedId ? features.findIndex((feature) => feature.id === selectedId) : features.length;
  const end = selectedIndex < 0 ? features.length : selectedIndex + 1;
  return features.slice(0, end).reverse().find((feature): feature is SketchFeature => feature.kind === "sketch") ?? null;
}

export function documentHasSolid(features: ParametricFeature[]) {
  return features.some((feature) => feature.kind === "extrude" && !feature.suppressed && feature.operation === "add");
}

export function cloneDocument(document: ParametricDocument): ParametricDocument {
  return structuredClone(document);
}
