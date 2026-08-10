export type FeatureKind = "sketch" | "extrude" | "hole" | "fillet";

export type BaseFeature = {
  id: string;
  name: string;
  kind: FeatureKind;
  suppressed: boolean;
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

export type ExtrudeFeature = BaseFeature & {
  kind: "extrude";
  sketchId: string;
  distance: number;
  symmetric: boolean;
  operation: "new" | "add" | "cut";
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
};

export type ParametricFeature = SketchFeature | ExtrudeFeature | HoleFeature | FilletFeature;

export type ParametricDocument = {
  schema: "educad-parametric/v1";
  id: string;
  name: string;
  units: "mm";
  color: string;
  features: ParametricFeature[];
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

export type BuildResult = {
  mesh: RenderMesh | null;
  completedFeatureIds: string[];
  warning: string | null;
};
