/** Completed build steps, never a timer-driven percentage. */
export type ParametricBuildProgress = {
  stage: "initializing" | "operations" | "meshing" | "ready";
  completed: number;
  total: number;
  elapsedMs: number;
};
