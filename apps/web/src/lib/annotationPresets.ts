export type AnnotationTool = "text" | "dimension" | "arrow" | "dashedLine";

/** Toolbar tools share a dimension model and only differ in initial appearance. */
export function annotationDimensionPreset(tool: Exclude<AnnotationTool, "text">) {
  return {
    color: tool === "dimension" ? "#233c52" : "#000000",
    startArrow: tool === "dimension",
    endArrow: tool !== "dashedLine",
    lineStyle: tool === "dashedLine" ? "dashed" as const : "solid" as const,
    showLength: tool === "dimension",
  };
}
