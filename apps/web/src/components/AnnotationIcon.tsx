import type { CSSProperties } from "react";

export function AnnotationIcon({ kind }: { kind: "text" | "dimension" | "arrow" | "dashedLine" | "angle" | "group" | "align-left" | "align-center" | "align-right" }) {
  const mask = `url("/assets/educad/annotations/${kind}.svg")`;
  return <span className="educad-operation-tree-icon" aria-hidden="true" style={{ width: 24, height: 24, maskImage: mask, WebkitMaskImage: mask } as CSSProperties} />;
}
