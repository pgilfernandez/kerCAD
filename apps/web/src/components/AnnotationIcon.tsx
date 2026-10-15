import { annotationIconPath } from "@/lib/educadIconPaths";

export function AnnotationIcon({ kind, size = 24 }: { kind: "text" | "dimension" | "arrow" | "arrow_start" | "arrow_end" | "length" | "dashedLine" | "angle" | "circle" | "group" | "align-left" | "align-center" | "align-right" | "line-start-end-none" | `line-${"start" | "end"}-${"square" | "circle" | "arrow1" | "arrow2" | "arrow3" | "arrow4"}`; size?: number }) {
  return <img src={annotationIconPath(kind)} className="educad-operation-tree-icon toolbar-command-icon" width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ objectFit: "contain", backgroundColor: "transparent", filter: "none", opacity: 1 }} />;
}
