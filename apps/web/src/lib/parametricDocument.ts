import type {
  CircleProfile,
  ExtrudeFeature,
  FilletFeature,
  FaceExtrudeFeature,
  RevolveFeature,
  ShellFeature,
  HoleFeature,
  ParametricDocument,
  ParametricFeature,
  ParametricObject,
  PrimitiveFeature,
  RectangleProfile,
  DrawnProfile,
  SketchFeature,
} from "@/types/parametric";
import { assertValidParametricDependencies } from "@/lib/parametricDependencyGraph";
import { assertValidParametricTopology, isParametricTopologyReference } from "@/lib/parametricTopology";
import { globalParametricWorkplanePlacement, normalizeParametricWorkplanePlacement } from "@/lib/parametricWorkplane";

let localCounter = 0;
export const CURRENT_PARAMETRIC_SCHEMA = "educad-parametric/v2" as const;
type ParametricSchema = ParametricDocument["schema"];

const documentMigrations: Partial<Record<ParametricSchema, (document: ParametricDocument) => ParametricDocument>> = {
  "educad-parametric/v1": (document) => ({ ...document, schema: "educad-parametric/v2", topologyReferences: document.topologyReferences ?? [] }),
};

export function createFeatureId(prefix: string) {
  localCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localCounter.toString(36)}`;
}

export function createStarterDocument(now = Date.now()): ParametricDocument {
  const sketchId = createFeatureId("sketch");
  const object = createParametricObject(1);
  return {
    schema: CURRENT_PARAMETRIC_SCHEMA,
    id: createFeatureId("project"),
    name: "Nuevo diseño",
    units: "mm",
    color: "#d41721",
    workplane: { width: 200, depth: 200, gridStep: 5, snapToGrid: true, gridVisible: true, activeSizePercent: 10, ...globalParametricWorkplanePlacement() },
    objects: [object],
    topologyReferences: [],
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
        rotation: { x: 0, y: 0, z: 0 },
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
    color: "#d41721",
    visible: true,
    locked: false,
    expanded: true,
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
    purpose: "primitive",
    plane: "XY",
    x: 0,
    y: 0,
    offset: 0,
    rotation: { x: 0, y: 0, z: 0 },
    profile: shape === "rectangle"
      ? { shape, width: 40, depth: 30 }
      : { shape, diameter: 24 },
  };
}

export function createDrawnSketchFeature(index: number, geometry: DrawnProfile["geometry"] = { points: [], segments: [], circles: [], images: [] }): SketchFeature {
  return {
    id: createFeatureId("sketch"),
    kind: "sketch",
    name: `Boceto ${index}`,
    suppressed: false,
    purpose: "user",
    plane: "XY",
    x: 0,
    y: 0,
    offset: 0,
    rotation: { x: 0, y: 0, z: 0 },
    profile: { shape: "drawn", geometry: structuredClone(geometry) },
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

export function createPrimitiveFeature(primitive: PrimitiveFeature["primitive"], index: number): PrimitiveFeature {
  return {
    id: createFeatureId("primitive"),
    kind: "primitive",
    primitive,
    name: primitive === "sphere" ? "Esfera" : primitive === "cone" ? "Cono" : primitive === "tube" ? "Tubo" : primitive === "halfSphere" ? "Semiesfera" : primitive === "torus" ? "Toro" : primitive === "pyramid" ? "Pirámide" : primitive === "wedge" ? "Cuña" : primitive === "roof" ? "Tejado" : primitive === "roundRoof" ? "Tejado redondo" : primitive === "polygon" ? "Polígono" : primitive === "gear" ? "Engranaje" : `Primitiva ${index}`,
    suppressed: false,
    width: 20,
    depth: 20,
    height: 20,
    ...(primitive === "cone" ? { topRadius: 0 } : {}),
    ...(primitive === "tube" ? { innerRadius: 6 } : {}),
    ...(primitive === "torus" ? { majorRadius: 12, tubeRadius: 4, width: 32, depth: 32, height: 8 } : {}),
    ...(primitive === "polygon" ? { sides: 6 } : {}),
    ...(primitive === "gear" ? { teeth: 12, toothDepth: 2.5, boreRadius: 3, width: 30, depth: 30, height: 6 } : {}),
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

export function createFilletFeature(index: number, treatment: FilletFeature["treatment"] = "fillet"): FilletFeature {
  return {
    id: createFeatureId("fillet"),
    kind: "fillet",
    name: `${treatment === "chamfer" ? "Chaflán" : "Redondeo"} ${index}`,
    suppressed: false,
    treatment,
    radius: 2,
    edges: "vertical",
  };
}

export function createFaceExtrudeFeature(index: number, operation: FaceExtrudeFeature["operation"] = "add"): FaceExtrudeFeature {
  return {
    id: createFeatureId("face-extrude"),
    kind: "faceExtrude",
    name: `${operation === "cut" ? "Hueco de cara" : "Extrusión de cara"} ${index}`,
    suppressed: false,
    operation,
    distance: 10,
    faceReferenceId: "",
  };
}

export function createShellFeature(index: number): ShellFeature {
  return {
    id: createFeatureId("shell"),
    kind: "shell",
    name: `Vaciado ${index}`,
    suppressed: false,
    thickness: 2,
    faceReferenceIds: [],
  };
}

export function createRevolveFeature(index: number, operation: RevolveFeature["operation"] = "add"): RevolveFeature {
  return {
    id: createFeatureId("revolve"),
    kind: "revolve",
    name: `Revolución ${index}`,
    suppressed: false,
    source: "face",
    operation,
    angle: 360,
    axis: "z",
    faceReferenceId: "",
  };
}

export function validateDocument(value: unknown): value is ParametricDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ParametricDocument>;
  return (candidate.schema === "educad-parametric/v1" || candidate.schema === CURRENT_PARAMETRIC_SCHEMA)
    && typeof candidate.name === "string"
    && candidate.units === "mm"
    && (candidate.objects === undefined || Array.isArray(candidate.objects))
    && (candidate.topologyReferences === undefined || (Array.isArray(candidate.topologyReferences) && candidate.topologyReferences.every(isParametricTopologyReference)))
    && Array.isArray(candidate.features)
    && candidate.features.every((feature) => {
      if (!feature || typeof feature.id !== "string" || typeof feature.kind !== "string") return false;
      if (feature.dependencies === undefined) return true;
      return Array.isArray(feature.dependencies) && feature.dependencies.every((reference) => reference
        && (reference.type === "feature" || reference.type === "object")
        && typeof reference.id === "string");
    });
}

export function migrateParametricDocument(document: ParametricDocument): ParametricDocument {
  let next = structuredClone(document);
  const visited = new Set<ParametricSchema>();
  while (next.schema !== CURRENT_PARAMETRIC_SCHEMA) {
    if (visited.has(next.schema)) throw new Error(`Se ha detectado un ciclo de migración para ${next.schema}.`);
    visited.add(next.schema);
    const migration = documentMigrations[next.schema];
    if (!migration) throw new Error(`La versión ${next.schema} no es compatible con esta versión de eduCAD.`);
    next = migration(next);
  }
  return next;
}

export function normalizeParametricDocument(document: ParametricDocument): ParametricDocument {
  const next = migrateParametricDocument(document);
  next.workplane ??= { width: 200, depth: 200, gridStep: 5, snapToGrid: true, gridVisible: true, activeSizePercent: 10, ...globalParametricWorkplanePlacement() };
  next.workplane.width = Math.min(2000, Math.max(1, Number.isFinite(next.workplane.width) ? next.workplane.width : 200));
  next.workplane.depth = Math.min(2000, Math.max(1, Number.isFinite(next.workplane.depth) ? next.workplane.depth : 200));
  next.workplane.gridStep = Math.min(200, Math.max(0.1, Number.isFinite(next.workplane.gridStep) ? next.workplane.gridStep : 5));
  next.workplane.snapToGrid = typeof next.workplane.snapToGrid === "boolean" ? next.workplane.snapToGrid : true;
  next.workplane.gridVisible = typeof next.workplane.gridVisible === "boolean" ? next.workplane.gridVisible : true;
  next.workplane.activeSizePercent = Math.min(100, Math.max(2, Number.isFinite(next.workplane.activeSizePercent) ? next.workplane.activeSizePercent : 10));
  Object.assign(next.workplane, normalizeParametricWorkplanePlacement(next.workplane));
  next.objects ??= [];
  next.topologyReferences ??= [];
  const objectIds = new Set(next.objects.map((object) => object.id));
  const objectByExtrude = new Map<string, string>();

  for (const object of next.objects) {
    object.color ??= next.color;
    object.visible ??= true;
    object.locked ??= false;
    object.expanded ??= true;
    delete (object as ParametricObject & { originVisible?: boolean }).originVisible;
  }

  for (const feature of next.features) {
    if (feature.kind === "sketch") {
      feature.purpose ??= feature.profile.shape === "drawn" ? "user" : "primitive";
      feature.rotation ??= { x: 0, y: 0, z: 0 };
    }
    if ((feature.kind === "extrude" || feature.kind === "primitive") && (feature.operation as string) === "new") feature.operation = "add";
    if (feature.kind === "fillet") {
      feature.treatment ??= "fillet";
      feature.selectionReferenceIds ??= feature.edgeReferenceIds;
    }
    if (feature.kind === "revolve") feature.source ??= feature.sketchId ? "sketch" : "face";
    if (feature.kind === "primitive") {
      feature.width = Math.max(0.1, Number.isFinite(feature.width) ? feature.width : 20);
      feature.depth = Math.max(0.1, Number.isFinite(feature.depth) ? feature.depth : 20);
      feature.height = Math.max(0.1, Number.isFinite(feature.height) ? feature.height : 20);
      if (feature.primitive === "torus") {
        feature.majorRadius = Math.max(0.2, Number.isFinite(feature.majorRadius) ? feature.majorRadius! : 12);
        feature.tubeRadius = Math.min(feature.majorRadius - 0.1, Math.max(0.1, Number.isFinite(feature.tubeRadius) ? feature.tubeRadius! : 4));
        feature.width = (feature.majorRadius + feature.tubeRadius) * 2;
        feature.depth = feature.width;
        feature.height = feature.tubeRadius * 2;
      }
      if (feature.primitive === "polygon") feature.sides = Math.min(32, Math.max(3, Math.round(Number.isFinite(feature.sides) ? feature.sides! : 6)));
      if (feature.primitive === "gear") {
        feature.teeth = Math.min(64, Math.max(6, Math.round(Number.isFinite(feature.teeth) ? feature.teeth! : 12)));
        feature.toothDepth = Math.min(feature.width / 2 - 0.2, Math.max(0.2, Number.isFinite(feature.toothDepth) ? feature.toothDepth! : 2.5));
        feature.boreRadius = Math.max(0, Math.min(feature.width / 2 - feature.toothDepth - 0.1, Math.max(0, Number.isFinite(feature.boreRadius) ? feature.boreRadius! : 3)));
      }
      feature.transform ??= operationTransform();
    }
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
  assertValidParametricDependencies(next);
  assertValidParametricTopology(next);
  return next;
}

export function previousSketch(features: ParametricFeature[], selectedId: string | null) {
  const selectedIndex = selectedId ? features.findIndex((feature) => feature.id === selectedId) : features.length;
  const end = selectedIndex < 0 ? features.length : selectedIndex + 1;
  return features.slice(0, end).reverse().find((feature): feature is SketchFeature => feature.kind === "sketch") ?? null;
}

export function documentHasSolid(features: ParametricFeature[]) {
  return features.some((feature) => (feature.kind === "extrude" || feature.kind === "primitive") && !feature.suppressed && feature.operation === "add");
}

export function cloneDocument(document: ParametricDocument): ParametricDocument {
  return structuredClone(document);
}
