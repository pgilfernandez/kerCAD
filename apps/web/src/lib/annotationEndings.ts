import type { AnnotationEnding, ParametricAnnotation } from "@/types/parametric";

export const annotationEndings: AnnotationEnding[] = ["none", "arrow1", "arrow2", "arrow3", "arrow4", "circle", "square"];
export function annotationEnding(annotation: Extract<ParametricAnnotation, { kind: "dimension" }>, side: "start" | "end"): AnnotationEnding {
  const value = side === "start" ? annotation.startEnding : annotation.endEnding;
  return value && annotationEndings.includes(value) ? value : (side === "start" ? annotation.startArrow : annotation.endArrow) === false ? "none" : "arrow2";
}
export function setAnnotationEnding(annotation: ParametricAnnotation, side: "start" | "end", value: AnnotationEnding) {
  if (annotation.kind !== "dimension") return;
  if (side === "start") { annotation.startEnding = value; annotation.startArrow = value !== "none"; }
  else { annotation.endEnding = value; annotation.endArrow = value !== "none"; }
}
export function annotationEndingSize(ending: AnnotationEnding, distance: number) {
  const size = ending === "arrow1" ? 2 : ending === "arrow3" ? 6 : ending === "arrow2" || ending === "arrow4" ? 4 : 2;
  return Math.min(size, distance * .4);
}
