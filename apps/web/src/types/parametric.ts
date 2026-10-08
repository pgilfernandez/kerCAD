export type FeatureKind = "sketch" | "extrude" | "primitive" | "importedStep" | "hole" | "fillet" | "faceExtrude" | "shell" | "revolve" | "mirror" | "linearPattern" | "polarPattern" | "objectBoolean";

export type ParametricDependencyReference =
  | { type: "feature"; id: string }
  | { type: "object"; id: string };

export type ParametricFaceReference = {
  origin: string;
  role: string;
  hint: {
    entityType: "face";
    surfaceType?: string;
    normal?: [number, number, number];
    centroid?: [number, number, number];
    area?: number;
    topologyId?: number;
    originId?: number;
  };
};

export type ParametricEdgeReference = {
  origin: string;
  faceRoles: [string, string];
  hint: {
    entityType: "edge";
    length?: number;
    midpoint?: [number, number, number];
    direction?: [number, number, number];
    topologyId?: number;
  };
};

export type ParametricTopologyReference = {
  id: string;
  name: string;
  objectId: string;
  sourceFeatureId: string;
  reference: ParametricFaceReference | ParametricEdgeReference;
};

export type BaseFeature = {
  id: string;
  name: string;
  kind: FeatureKind;
  suppressed: boolean;
  /** Object/body that owns this operation in the model tree. */
  objectId?: string;
  /** Explicit inputs outside the object's ordinary sequential history. */
  dependencies?: ParametricDependencyReference[];
};

export type RectangleProfile = {
  shape: "rectangle";
  width: number;
  depth: number;
};

export type CircleProfile = {
  shape: "circle";
  diameter: number;
};

export type DrawnProfile = {
  shape: "drawn";
  geometry: import("@/types/sketchforge").SketchProfile;
};

export type SketchFeature = BaseFeature & {
  kind: "sketch";
  /** Controls only the 2D overlay; downstream CAD operations still consume the sketch. */
  visible: boolean;
  /** Primitive profiles are implementation details of Box/Cylinder; user sketches are editable history operations. */
  purpose?: "primitive" | "user";
  plane: "XY";
  x: number;
  y: number;
  offset: number;
  rotation: ParametricVector3;
  profile: RectangleProfile | CircleProfile | DrawnProfile;
};

export type ParametricVector3 = {
  x: number;
  y: number;
  z: number;
};

export type ExtrudeFeature = BaseFeature & {
  kind: "extrude";
  sketchId: string;
  distance: number;
  symmetric: boolean;
  operation: "add" | "cut" | "intersect";
  transform: {
    position: ParametricVector3;
    rotation: ParametricVector3;
  };
};

export type PrimitiveFeature = BaseFeature & {
  kind: "primitive";
  primitive: "roundedBox" | "sphere" | "cone" | "tube" | "halfSphere" | "torus" | "pyramid" | "wedge" | "roof" | "roundRoof" | "polygon" | "gear";
  width: number;
  depth: number;
  height: number;
  topRadius?: number;
  innerRadius?: number;
  majorRadius?: number;
  tubeRadius?: number;
  cornerRadius?: number;
  sides?: number;
  teeth?: number;
  toothDepth?: number;
  boreRadius?: number;
  operation: "add" | "cut" | "intersect";
  transform: {
    position: ParametricVector3;
    rotation: ParametricVector3;
  };
};

export type ImportedStepFeature = BaseFeature & {
  kind: "importedStep";
  sourceName: string;
  /** Exact canonical STEP payload; the editable history never falls back to a mesh. */
  stepText: string;
};

export type HoleFeature = BaseFeature & {
  kind: "hole";
  x: number;
  y: number;
  diameter: number;
  termination: "through-all" | "blind";
  depth: number;
};

export type FilletFeature = BaseFeature & {
  kind: "fillet";
  treatment: "fillet" | "chamfer";
  radius: number;
  edges: "vertical" | "all";
  edgeReferenceIds?: string[];
  selectionReferenceIds?: string[];
};

export type FaceExtrudeFeature = BaseFeature & {
  kind: "faceExtrude";
  operation: "add" | "cut";
  distance: number;
  faceReferenceId: string;
};

export type ShellCornerType = "rounded" | "sharp";

export type ShellFeature = BaseFeature & {
  kind: "shell";
  thickness: number;
  /** Missing in older projects: preserve the original rounded joins. */
  cornerType?: ShellCornerType;
  faceReferenceIds: string[];
};

export type RevolveFeature = BaseFeature & {
  kind: "revolve";
  source: "face" | "sketch";
  operation: "add" | "cut" | "intersect";
  angle: number;
  axis: "x" | "y" | "z" | "edge";
  axisReferenceId?: string;
  /** Stable source-sketch segment used as the revolution axis. */
  sketchAxisSegmentId?: string;
  faceReferenceId?: string;
  sketchId?: string;
};

export type MirrorFeature = BaseFeature & {
  kind: "mirror";
  /** Local axis normal to the mirror plane. */
  axis: "x" | "y" | "z";
  /** Optional custom plane, expressed in the container object's local space. */
  planeOrigin?: ParametricVector3;
  planeNormal?: ParametricVector3;
  /** Keep the previous result together with its mirrored copy. */
  duplicate: boolean;
};

export type LinearPatternFeature = BaseFeature & {
  kind: "linearPattern";
  source: "body" | "feature";
  sourceFeatureId?: string;
  axis: "x" | "y" | "z";
  /** Total number of instances, including the original result. */
  count: number;
  /** Signed center-to-center distance between consecutive instances. */
  spacing: number;
};

export type PolarPatternFeature = BaseFeature & {
  kind: "polarPattern";
  source: "body" | "feature";
  sourceFeatureId?: string;
  axis: "x" | "y" | "z";
  count: number;
  /** Total sweep when equalSpacing is enabled; otherwise the step angle. */
  angle: number;
  equalSpacing: boolean;
};

export type ObjectBooleanFeature = BaseFeature & {
  kind: "objectBoolean";
  sourceObjectId: string;
  operation: "add" | "cut" | "intersect";
};

export type ParametricFeature = SketchFeature | ExtrudeFeature | PrimitiveFeature | ImportedStepFeature | HoleFeature | FilletFeature | FaceExtrudeFeature | ShellFeature | RevolveFeature | MirrorFeature | LinearPatternFeature | PolarPatternFeature | ObjectBooleanFeature;

export type ParametricObject = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  transform: {
    position: ParametricVector3;
    rotation: ParametricVector3;
    scale: ParametricVector3;
  };
  /** Non-parametric visual aid. It never enters the OpenCascade history. */
  referenceMesh?: {
    sourceName: string;
    format: "stl" | "obj";
    positions: number[];
    normals: number[];
    edges: number[];
    opacity: number;
    displayMode: "solid" | "wireframe" | "solidEdges";
    pickable: boolean;
  };
};

export type ParametricAnnotation = {
  id: string;
  name: string;
  visible: boolean;
} & ({ kind: "text"; position: ParametricVector3; alignment: "left" | "center" | "right"; size: number; font: string; text: string }
  | { kind: "dimension"; start: ParametricVector3; end: ParametricVector3; size?: number; color?: string; startArrow?: boolean; endArrow?: boolean; lineStyle?: "solid" | "dashed"; showLength?: boolean }
  | { kind: "angle"; start: ParametricVector3; center: ParametricVector3; end: ParametricVector3; size?: number; color?: string }
  | { kind: "circle"; position: ParametricVector3; rotation: ParametricVector3; radius: number; mode: "billboard" | "planar"; color: string; lineWidth: number });

export type ParametricDocument = {
  schema: "educad-parametric/v1" | "educad-parametric/v2";
  id: string;
  name: string;
  creator?: string;
  author?: string;
  units: "mm";
  /** Display preference only; all stored lengths are millimeters. */
  displayUnit?: import("@/lib/parametricUnits").ParametricDisplayUnit;
  annotations?: ParametricAnnotation[];
  annotationGroup?: { expanded: boolean; position: number; visible?: boolean };
  color: string;
  workplane: {
    width: number;
    depth: number;
    gridStep: number;
    snapSpacing: number;
    snapToGrid: boolean;
    gridVisible: boolean;
    activeSizePercent: number;
    origin: ParametricVector3;
    xAxis: ParametricVector3;
    yAxis: ParametricVector3;
    normal: ParametricVector3;
  };
  objects: ParametricObject[];
  features: ParametricFeature[];
  topologyReferences: ParametricTopologyReference[];
  createdAt: number;
  updatedAt: number;
};

export type ModelMetrics = {
  width: number;
  depth: number;
  height: number;
  volume: number;
};

export type RenderMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  edges: Float32Array;
  faceGroups?: Array<{ start: number; count: number; faceId: number; origin: number }>;
  edgeGroups?: Array<{ start: number; count: number; edgeId: number }>;
  metrics: ModelMetrics;
};

export type ParametricObjectRenderRecord = {
  objectId: string;
  renderId: string;
  geometryFingerprint: string;
  color: string;
  worldTransform: ParametricObject["transform"];
  mesh: RenderMesh;
  reference?: {
    opacity: number;
    displayMode: "solid" | "wireframe" | "solidEdges";
    pickable: boolean;
  };
};

export type BuildResult = {
  mesh: RenderMesh | null;
  objectRecords: ParametricObjectRenderRecord[];
  renderDelta?: {
    reusedObjectIds: string[];
    activeObjects: Array<Omit<ParametricObjectRenderRecord, "mesh">>;
  };
  operationContext: { featureId: string; objectId: string; color: string; mesh: RenderMesh; selectionMesh?: RenderMesh; detailMesh?: RenderMesh; detailColor?: "green" | "red" } | null;
  completedFeatureIds: string[];
  failedFeatureId: string | null;
  warning: string | null;
};
