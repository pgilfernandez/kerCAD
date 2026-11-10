"use client";

import { annotationIconPath } from "@/lib/kercadIconPaths";
import { ThemedToolbarImage } from "./ThemedToolbarImage";
import { useAppTheme } from "@/lib/useAppTheme";

export function AnnotationIcon({ kind, size = 24 }: { kind: "text" | "dimension" | "arrow" | "arrow_start" | "arrow_end" | "length" | "dashedLine" | "angle" | "circle" | "rectangle" | "group" | "align-left" | "align-center" | "align-right" | "line-start-end-none" | `line-${"start" | "end"}-${"square" | "circle" | "arrow1" | "arrow2" | "arrow3" | "arrow4"}`; size?: number }) {
  const { theme } = useAppTheme();
  const path = annotationIconPath(kind);
  const src = theme === "dark" && path.startsWith("/assets/kercad/toolbar-3d/annotations/")
    ? path.replace("/annotations/", "/annotations/dark/") : path;
  if (kind === "rectangle") return <ThemedToolbarImage src={path} className="kercad-operation-tree-icon toolbar-command-icon" width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ objectFit: "contain", backgroundColor: "transparent" }} />;
  return <img src={src} className="kercad-operation-tree-icon toolbar-command-icon" width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ objectFit: "contain", backgroundColor: "transparent", filter: "none", opacity: 1 }} />;
}
