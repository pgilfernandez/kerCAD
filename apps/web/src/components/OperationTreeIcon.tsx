import type { CSSProperties } from "react";

/** External editable SVG; masking preserves the row's theme/selection colors. */
export function OperationTreeIcon({ file, src, size = 16, className, "aria-label": label }: {
  file: string;
  src?: string;
  size?: number;
  className?: string;
  role?: "img";
  "aria-label"?: string;
}) {
  const mask = `url("${src ?? `/assets/kercad/operations-tree/${file}.svg`}")`;
  return <span className={`kercad-operation-tree-icon ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: size, height: size, maskImage: mask, WebkitMaskImage: mask } as CSSProperties} />;
}
