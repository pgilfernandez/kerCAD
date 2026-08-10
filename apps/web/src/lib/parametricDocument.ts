import type {
  CircleProfile,
  ExtrudeFeature,
  FilletFeature,
  HoleFeature,
  ParametricDocument,
  ParametricFeature,
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
  return {
    schema: "educad-parametric/v1",
    id: createFeatureId("project"),
    name: "Mi primera pieza paramétrica",
    units: "mm",
    color: "#f2a93b",
    createdAt: now,
    updatedAt: now,
    features: [
      {
        id: sketchId,
        kind: "sketch",
        name: "Boceto base",
        suppressed: false,
        plane: "XY",
        x: 0,
        y: 0,
        offset: 0,
        profile: { shape: "rectangle", width: 80, depth: 52 },
      },
      {
        id: createFeatureId("extrude"),
        kind: "extrude",
        name: "Extrusión base",
        suppressed: false,
        sketchId,
        distance: 8,
        symmetric: false,
        operation: "new",
      },
      {
        id: createFeatureId("hole"),
        kind: "hole",
        name: "Taladro izquierdo",
        suppressed: false,
        x: -25,
        y: 0,
        diameter: 12,
        termination: "through-all",
        depth: 8,
      },
      {
        id: createFeatureId("hole"),
        kind: "hole",
        name: "Taladro derecho",
        suppressed: false,
        x: 25,
        y: 0,
        diameter: 12,
        termination: "through-all",
        depth: 8,
      },
      {
        id: createFeatureId("fillet"),
        kind: "fillet",
        name: "Redondeo exterior",
        suppressed: false,
        radius: 4,
        edges: "vertical",
      },
    ],
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

export function createExtrudeFeature(sketchId: string, index: number, hasSolid: boolean): ExtrudeFeature {
  return {
    id: createFeatureId("extrude"),
    kind: "extrude",
    name: `Extrusión ${index}`,
    suppressed: false,
    sketchId,
    distance: 10,
    symmetric: false,
    operation: hasSolid ? "add" : "new",
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
    && Array.isArray(candidate.features)
    && candidate.features.every((feature) => feature && typeof feature.id === "string" && typeof feature.kind === "string");
}

export function previousSketch(features: ParametricFeature[], selectedId: string | null) {
  const selectedIndex = selectedId ? features.findIndex((feature) => feature.id === selectedId) : features.length;
  const end = selectedIndex < 0 ? features.length : selectedIndex + 1;
  return features.slice(0, end).reverse().find((feature): feature is SketchFeature => feature.kind === "sketch") ?? null;
}

export function documentHasSolid(features: ParametricFeature[]) {
  return features.some((feature) => feature.kind === "extrude" && !feature.suppressed && feature.operation !== "cut");
}

export function cloneDocument(document: ParametricDocument): ParametricDocument {
  return structuredClone(document);
}
