import type {
  CircleProfile,
  ExtrudeFeature,
  FilletFeature,
  FaceExtrudeFeature,
  MirrorFeature,
  LinearPatternFeature,
  PolarPatternFeature,
  ObjectBooleanFeature,
  RevolveFeature,
  ShellFeature,
  HoleFeature,
  ImportedStepFeature,
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
import { circleSketchPointId } from "@/lib/sketchConstraints";
import { PARAMETRIC_IMPORT_LIMITS } from "@/lib/parametricImportLimits";

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

export function createEmptyDocument(now = Date.now()): ParametricDocument {
  return {
    schema: CURRENT_PARAMETRIC_SCHEMA,
    id: createFeatureId("project"),
    name: "New design",
    units: "mm",
    color: "#d41721",
    workplane: { width: 200, depth: 200, gridStep: 5, snapSpacing: 1, snapToGrid: true, gridVisible: true, activeSizePercent: 20, ...globalParametricWorkplanePlacement() },
    objects: [],
    topologyReferences: [],
    createdAt: now,
    updatedAt: now,
    features: [],
  };
}

export function createStarterDocument(now = Date.now()): ParametricDocument {
  const sketchId = createFeatureId("sketch");
  const object = createParametricObject(1);
  const document = createEmptyDocument(now);
  return {
    ...document,
    objects: [object],
    features: [
      {
        id: sketchId,
        kind: "sketch",
        name: "Box profile",
        suppressed: false,
        visible: true,
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
        name: "Box",
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
    name: `Object ${index}`,
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
    name: `Sketch ${index}`,
    suppressed: false,
    visible: true,
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
    name: `Sketch ${index}`,
    suppressed: false,
    visible: true,
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
    name: `Extrusion ${index}`,
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
    name: primitive === "roundedBox" ? "Rounded box" : primitive === "sphere" ? "Sphere" : primitive === "cone" ? "Cone" : primitive === "tube" ? "Tube" : primitive === "halfSphere" ? "Half sphere" : primitive === "torus" ? "Torus" : primitive === "pyramid" ? "Pyramid" : primitive === "wedge" ? "Wedge" : primitive === "roof" ? "Roof" : primitive === "roundRoof" ? "Round roof" : primitive === "polygon" ? "Polygon" : primitive === "gear" ? "Gear" : `Primitive ${index}`,
    suppressed: false,
    width: 20,
    depth: 20,
    height: 20,
    ...(primitive === "roundedBox" ? { cornerRadius: 3 } : {}),
    ...(primitive === "cone" ? { topRadius: 0 } : {}),
    ...(primitive === "tube" ? { innerRadius: 6 } : {}),
    ...(primitive === "torus" ? { majorRadius: 12, tubeRadius: 4, width: 32, depth: 32, height: 8 } : {}),
    ...(primitive === "polygon" ? { sides: 6 } : {}),
    ...(primitive === "gear" ? { teeth: 12, toothDepth: 2.5, boreRadius: 3, width: 30, depth: 30, height: 6 } : {}),
    operation: "add",
    transform: operationTransform(),
  };
}

export function createImportedStepFeature(sourceName: string, stepText: string, index: number): ImportedStepFeature {
  return {
    id: createFeatureId("step"),
    kind: "importedStep",
    name: sourceName.replace(/\.(?:step|stp)$/i, "") || `Imported STEP ${index}`,
    suppressed: false,
    sourceName,
    stepText,
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
    name: `Hole ${index}`,
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
    name: `${treatment === "chamfer" ? "Chamfer" : "Fillet"} ${index}`,
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
    name: `${operation === "cut" ? "Face cut" : "Face extrusion"} ${index}`,
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
    name: `Shell ${index}`,
    suppressed: false,
    thickness: 2,
    faceReferenceIds: [],
  };
}

export function createRevolveFeature(index: number, operation: RevolveFeature["operation"] = "add"): RevolveFeature {
  return {
    id: createFeatureId("revolve"),
    kind: "revolve",
    name: `Revolution ${index}`,
    suppressed: false,
    source: "face",
    operation,
    angle: 360,
    axis: "z",
    faceReferenceId: "",
  };
}

export function createMirrorFeature(index: number): MirrorFeature {
  return {
    id: createFeatureId("mirror"),
    kind: "mirror",
    name: `Mirror ${index}`,
    suppressed: false,
    axis: "x",
    duplicate: true,
  };
}

export function createLinearPatternFeature(index: number): LinearPatternFeature {
  return {
    id: createFeatureId("linear-pattern"),
    kind: "linearPattern",
    name: `Linear pattern ${index}`,
    suppressed: false,
    source: "body",
    axis: "x",
    count: 3,
    spacing: 20,
  };
}

export function createPolarPatternFeature(index: number): PolarPatternFeature {
  return {
    id: createFeatureId("polar-pattern"),
    kind: "polarPattern",
    name: `Polar pattern ${index}`,
    suppressed: false,
    source: "body",
    axis: "z",
    count: 6,
    angle: 360,
    equalSpacing: true,
  };
}

export function createObjectBooleanFeature(index: number, sourceObjectId: string): ObjectBooleanFeature {
  return {
    id: createFeatureId("object-boolean"),
    kind: "objectBoolean",
    name: `Object boolean ${index}`,
    suppressed: false,
    sourceObjectId,
    operation: "add",
    dependencies: [{ type: "object", id: sourceObjectId }],
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
    if (visited.has(next.schema)) throw new Error(`A migration cycle was detected for ${next.schema}.`);
    visited.add(next.schema);
    const migration = documentMigrations[next.schema];
    if (!migration) throw new Error(`Version ${next.schema} is not supported by this version of eduCAD.`);
    next = migration(next);
  }
  return next;
}

export function normalizeParametricDocument(document: ParametricDocument): ParametricDocument {
  const next = migrateParametricDocument(document);
  next.objects ??= [];
  next.topologyReferences ??= [];
  if (next.objects.length > PARAMETRIC_IMPORT_LIMITS.objects) throw new Error(`The project exceeds the ${PARAMETRIC_IMPORT_LIMITS.objects.toLocaleString("en-US")} object limit.`);
  if (next.features.length > PARAMETRIC_IMPORT_LIMITS.features) throw new Error(`The project exceeds the ${PARAMETRIC_IMPORT_LIMITS.features.toLocaleString("en-US")} operation limit.`);
  if ((next.topologyReferences?.length ?? 0) > PARAMETRIC_IMPORT_LIMITS.topologyReferences) throw new Error("The project contains too many topological references.");
  const identifiers = [...next.objects.map((object) => object.id), ...next.features.map((feature) => feature.id), ...(next.topologyReferences ?? []).map((reference) => reference.id)];
  if (new Set(identifiers).size !== identifiers.length) throw new Error("The project contains duplicated identifiers.");
  next.workplane ??= { width: 200, depth: 200, gridStep: 5, snapSpacing: 1, snapToGrid: true, gridVisible: true, activeSizePercent: 20, ...globalParametricWorkplanePlacement() };
  next.workplane.width = Math.min(2000, Math.max(1, Number.isFinite(next.workplane.width) ? next.workplane.width : 200));
  next.workplane.depth = Math.min(2000, Math.max(1, Number.isFinite(next.workplane.depth) ? next.workplane.depth : 200));
  next.workplane.gridStep = Math.min(200, Math.max(0.1, Number.isFinite(next.workplane.gridStep) ? next.workplane.gridStep : 5));
  next.workplane.snapSpacing = Math.min(200, Math.max(0.1, Number.isFinite(next.workplane.snapSpacing) ? next.workplane.snapSpacing : next.workplane.gridStep));
  next.workplane.snapToGrid = typeof next.workplane.snapToGrid === "boolean" ? next.workplane.snapToGrid : true;
  next.workplane.gridVisible = typeof next.workplane.gridVisible === "boolean" ? next.workplane.gridVisible : true;
  next.workplane.activeSizePercent = Math.min(100, Math.max(2, Number.isFinite(next.workplane.activeSizePercent) ? next.workplane.activeSizePercent : 20));
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
    if (object.referenceMesh) {
      object.referenceMesh.opacity = Math.min(1, Math.max(0.05, Number.isFinite(object.referenceMesh.opacity) ? object.referenceMesh.opacity : 0.4));
      object.referenceMesh.displayMode = object.referenceMesh.displayMode === "solid" || object.referenceMesh.displayMode === "wireframe" ? object.referenceMesh.displayMode : "solidEdges";
      object.referenceMesh.pickable = typeof object.referenceMesh.pickable === "boolean" ? object.referenceMesh.pickable : true;
      const positions = object.referenceMesh.positions;
      const normals = object.referenceMesh.normals;
      const edges = object.referenceMesh.edges;
      if (!Array.isArray(positions) || !Array.isArray(normals) || !Array.isArray(edges) || positions.length < 9 || positions.length % 9 !== 0 || normals.length !== positions.length || edges.length % 6 !== 0 || positions.some((value) => !Number.isFinite(value)) || normals.some((value) => !Number.isFinite(value)) || edges.some((value) => !Number.isFinite(value))) throw new Error(`${object.name}: reference mesh is invalid.`);
      if (positions.length / 9 > PARAMETRIC_IMPORT_LIMITS.referenceTriangles) throw new Error(`${object.name}: reference mesh contains too many triangles.`);
    }
    delete (object as ParametricObject & { originVisible?: boolean }).originVisible;
  }

  for (const feature of next.features) {
    if (feature.kind === "sketch") {
      feature.visible = typeof feature.visible === "boolean" ? feature.visible : true;
      feature.purpose ??= feature.profile.shape === "drawn" ? "user" : "primitive";
      feature.rotation ??= { x: 0, y: 0, z: 0 };
      if (feature.profile.shape === "drawn") {
        const geometry = feature.profile.geometry;
        geometry.points ??= [];
        geometry.segments ??= [];
        geometry.circles ??= [];
        geometry.images ??= [];
        geometry.texts ??= [];
        if (geometry.generator?.kind === "text") {
          geometry.generator.font = ["Sans", "Serif", "Script", "Monospace", "Rounded"].includes(geometry.generator.font) ? geometry.generator.font : "Sans";
          geometry.generator.align = geometry.generator.align === "left" || geometry.generator.align === "right" ? geometry.generator.align : "center";
          geometry.generator.verticalAlign = geometry.generator.verticalAlign === "bottom" || geometry.generator.verticalAlign === "top" ? geometry.generator.verticalAlign : "center";
        }
        const lineIds = new Set(geometry.segments.filter((segment) => segment.kind === "line").map((segment) => segment.id));
        const segmentIds = new Set(geometry.segments.map((segment) => segment.id));
        const pointIds = new Set(geometry.points.map((point) => point.id));
        const circleIds = new Set(geometry.circles.map((circle) => circle.id));
        for (const circle of geometry.circles) {
          if (!Number.isFinite(circle.radiusAngle)) circle.radiusAngle = 0;
          pointIds.add(circleSketchPointId(circle.id, "center"));
          pointIds.add(circleSketchPointId(circle.id, "radius"));
        }
        geometry.constraints = (geometry.constraints ?? []).filter((constraint) => {
          if (constraint.kind === "horizontal" || constraint.kind === "vertical") return lineIds.has(constraint.segmentId);
          if (constraint.kind === "parallel" || constraint.kind === "perpendicular") return constraint.segmentIds[0] !== constraint.segmentIds[1] && constraint.segmentIds.every((id) => lineIds.has(id));
          if (constraint.kind === "equalLength") return constraint.segmentIds[0] !== constraint.segmentIds[1] && constraint.segmentIds.every((id) => lineIds.has(id));
          if (constraint.kind === "concentric" || constraint.kind === "equalRadius") return constraint.circleIds[0] !== constraint.circleIds[1] && constraint.circleIds.every((id) => circleIds.has(id));
          if (constraint.kind === "midpoint" || constraint.kind === "pointOnObject") return pointIds.has(constraint.pointId) && lineIds.has(constraint.segmentId);
          if (constraint.kind === "tangentLineCircle") return lineIds.has(constraint.segmentId) && circleIds.has(constraint.circleId);
          if (constraint.kind === "tangentCircles") return constraint.circleIds[0] !== constraint.circleIds[1] && constraint.circleIds.every((id) => circleIds.has(id));
          if (constraint.kind === "symmetric") return constraint.pointIds[0] !== constraint.pointIds[1] && constraint.pointIds.every((id) => pointIds.has(id)) && lineIds.has(constraint.segmentId);
          if (constraint.kind === "fixed") return pointIds.has(constraint.pointId) && Number.isFinite(constraint.x) && Number.isFinite(constraint.z);
          if (constraint.kind === "coincident") return constraint.pointIds[0] !== constraint.pointIds[1] && constraint.pointIds.every((id) => pointIds.has(id));
          if (constraint.kind === "distance") return lineIds.has(constraint.segmentId) && ["aligned", "x", "z"].includes(constraint.axis) && Number.isFinite(constraint.value) && constraint.value > 0;
          if (constraint.kind === "radius" || constraint.kind === "diameter") return circleIds.has(constraint.circleId) && Number.isFinite(constraint.value) && constraint.value > 0;
          if (constraint.kind === "arcRadius" || constraint.kind === "arcDiameter") return segmentIds.has(constraint.segmentId) && Number.isFinite(constraint.value) && constraint.value > 0;
          if (constraint.kind === "arcAngle") return segmentIds.has(constraint.segmentId) && Number.isFinite(constraint.value) && constraint.value > 0 && constraint.value < 360;
          if (constraint.kind === "angle") return constraint.segmentIds.length >= 1 && constraint.segmentIds.length <= 2 && constraint.segmentIds.every((id) => lineIds.has(id)) && Number.isFinite(constraint.value);
          return false;
        });
      }
    }
    if ((feature.kind === "extrude" || feature.kind === "primitive") && (feature.operation as string) === "new") feature.operation = "add";
    if (feature.kind === "importedStep") {
      feature.sourceName = typeof feature.sourceName === "string" && feature.sourceName.trim() ? feature.sourceName : `${feature.name}.step`;
      if (typeof feature.stepText !== "string" || !feature.stepText.trim()) throw new Error(`${feature.name}: STEP content is empty.`);
    }
    if (feature.kind === "fillet") {
      feature.treatment ??= "fillet";
      feature.selectionReferenceIds ??= feature.edgeReferenceIds;
    }
    if (feature.kind === "revolve") {
      const legacy = feature as RevolveFeature & { source?: RevolveFeature["source"] };
      legacy.source ??= legacy.sketchId ? "sketch" : "face";
    }
    if (feature.kind === "mirror") {
      feature.axis = feature.axis === "y" || feature.axis === "z" ? feature.axis : "x";
      if (!feature.planeOrigin || !feature.planeNormal || ![feature.planeOrigin.x, feature.planeOrigin.y, feature.planeOrigin.z, feature.planeNormal.x, feature.planeNormal.y, feature.planeNormal.z].every(Number.isFinite)) {
        feature.planeOrigin = undefined;
        feature.planeNormal = undefined;
      }
      feature.duplicate = typeof feature.duplicate === "boolean" ? feature.duplicate : true;
    }
    if (feature.kind === "linearPattern") {
      feature.source = feature.source === "feature" && feature.sourceFeatureId ? "feature" : "body";
      if (feature.source === "body") {
        feature.sourceFeatureId = undefined;
      } else if (!feature.dependencies?.some((dependency) => dependency.type === "feature" && dependency.id === feature.sourceFeatureId)) {
        feature.dependencies = [...feature.dependencies ?? [], { type: "feature", id: feature.sourceFeatureId! }];
      }
      feature.axis = feature.axis === "y" || feature.axis === "z" ? feature.axis : "x";
      feature.count = Math.min(50, Math.max(2, Math.round(Number.isFinite(feature.count) ? feature.count : 3)));
      feature.spacing = Math.abs(feature.spacing) >= 0.01 && Number.isFinite(feature.spacing) ? feature.spacing : 20;
    }
    if (feature.kind === "polarPattern") {
      feature.source = feature.source === "feature" && feature.sourceFeatureId ? "feature" : "body";
      if (feature.source === "body") {
        feature.sourceFeatureId = undefined;
      } else if (!feature.dependencies?.some((dependency) => dependency.type === "feature" && dependency.id === feature.sourceFeatureId)) {
        feature.dependencies = [...feature.dependencies ?? [], { type: "feature", id: feature.sourceFeatureId! }];
      }
      feature.axis = feature.axis === "x" || feature.axis === "y" ? feature.axis : "z";
      feature.count = Math.min(50, Math.max(2, Math.round(Number.isFinite(feature.count) ? feature.count : 6)));
      feature.angle = Math.min(360, Math.max(-360, Number.isFinite(feature.angle) && Math.abs(feature.angle) >= 0.1 ? feature.angle : 360));
      feature.equalSpacing = typeof feature.equalSpacing === "boolean" ? feature.equalSpacing : true;
    }
    if (feature.kind === "objectBoolean") {
      feature.operation = feature.operation === "cut" || feature.operation === "intersect" ? feature.operation : "add";
      feature.dependencies = [{ type: "object", id: feature.sourceObjectId }];
    }
    if (feature.kind === "primitive") {
      feature.width = Math.max(0.1, Number.isFinite(feature.width) ? feature.width : 20);
      feature.depth = Math.max(0.1, Number.isFinite(feature.depth) ? feature.depth : 20);
      feature.height = Math.max(0.1, Number.isFinite(feature.height) ? feature.height : 20);
      if (feature.primitive === "roundedBox") feature.cornerRadius = Math.min(feature.width / 2 - 0.1, feature.depth / 2 - 0.1, Math.max(0.1, Number.isFinite(feature.cornerRadius) ? feature.cornerRadius! : 3));
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

  for (const object of next.objects) {
    const operations = next.features.filter((feature) => feature.objectId === object.id && feature.kind !== "sketch");
    const importedBases = operations.filter((feature) => feature.kind === "importedStep");
    if (importedBases.length > 1 || (importedBases[0] && operations[0]?.id !== importedBases[0].id)) {
      throw new Error(`${object.name}: imported STEP must be the first and only base geometry in the object.`);
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
  return features.some((feature) => !feature.suppressed && (feature.kind === "importedStep" || ((feature.kind === "extrude" || feature.kind === "primitive") && feature.operation === "add")));
}

export function cloneDocument(document: ParametricDocument): ParametricDocument {
  return structuredClone(document);
}
