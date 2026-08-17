export type FeatureKind = "sketch" | "extrude" | "hole" | "fillet";

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
  };
};

export type ParametricEdgeReference = {
  origin: string;
  faceRoles: [string, string];
  hint: {
    entityType: "edge";
    length?: number;
    midpoint?: [number, number, number];
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

export type SketchFeature = BaseFeature & {
  kind: "sketch";
  plane: "XY";
  x: number;
  y: number;
  offset: number;
  profile: RectangleProfile | CircleProfile;
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
  radius: number;
  edges: "vertical" | "all";
  edgeReferenceIds?: string[];
};

export type ParametricFeature = SketchFeature | ExtrudeFeature | HoleFeature | FilletFeature;

export type ParametricObject = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  transform: {
    position: ParametricVector3;
    rotation: ParametricVector3;
    scale: ParametricVector3;
  };
};

export type ParametricDocument = {
  schema: "educad-parametric/v1" | "educad-parametric/v2";
  id: string;
  name: string;
  units: "mm";
  color: string;
  workplane: {
    width: number;
    depth: number;
    gridStep: number;
    snapToGrid: boolean;
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
  metrics: ModelMetrics;
};

export type ParametricObjectRenderRecord = {
  objectId: string;
  renderId: string;
  geometryFingerprint: string;
  color: string;
  worldTransform: ParametricObject["transform"];
  mesh: RenderMesh;
};

export type BuildResult = {
  mesh: RenderMesh | null;
  objectRecords: ParametricObjectRenderRecord[];
  operationContext: { featureId: string; objectId: string; color: string; mesh: RenderMesh } | null;
  completedFeatureIds: string[];
  warning: string | null;
};
