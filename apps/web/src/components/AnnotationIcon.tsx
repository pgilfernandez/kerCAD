import type { CSSProperties } from "react";

export function AnnotationIcon({ kind, size = 24 }: { kind: "text" | "dimension" | "arrow" | "dashedLine" | "angle" | "circle" | "group" | "align-left" | "align-center" | "align-right"; size?: number }) {
  const mask = `url("/assets/educad/annotations/${kind}.svg")`;
  return <span className="educad-operation-tree-icon" aria-hidden="true" style={{ width: size, height: size, maskImage: mask, WebkitMaskImage: mask } as CSSProperties} />;
}
