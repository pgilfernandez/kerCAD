export type AnnotationTool = "text" | "dimension" | "arrow" | "dashedLine" | "angle";

/** Toolbar tools share a dimension model and only differ in initial appearance. */
export function annotationDimensionPreset(tool: Exclude<AnnotationTool, "text" | "angle">) {
  return {
    color: tool === "dimension" ? "#233c52" : "#000000",
    startArrow: tool === "dimension",
    endArrow: tool !== "dashedLine",
    lineStyle: tool === "dashedLine" ? "dashed" as const : "solid" as const,
    showLength: tool === "dimension",
  };
}
