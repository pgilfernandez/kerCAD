export function AnnotationIcon({ kind, size = 24 }: { kind: "text" | "dimension" | "arrow" | "dashedLine" | "angle" | "circle" | "group" | "align-left" | "align-center" | "align-right"; size?: number }) {
  return <img src={`/assets/educad/annotations/${kind}.svg`} className="educad-operation-tree-icon" alt="" aria-hidden="true" draggable={false} style={{ width: size, height: size, objectFit: "contain", backgroundColor: "transparent", filter: "none" }} />;
}
