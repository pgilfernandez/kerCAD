// Shared artwork lives once, grouped by its primary GUI role.
export function operationIconPath(file: string) {
  const folder = file === "snap-grid.svg" ? "toolbar-vertical"
    : ["edit.svg", "sharp.svg", "boolean-add.svg", "boolean-hole.svg", "boolean-common.svg"].includes(file) ? "toolbar-horizontal"
    : "toolbar-3d";
  return `/assets/educad/${folder}/${file}`;
}

export function annotationIconPath(kind: string) {
  if (kind === "group") return "/assets/educad/operations-tree/annotations.svg";
  const folder = ["text", "dimension", "arrow", "dashedLine", "angle", "circle"].includes(kind)
    ? "toolbar-3d" : "toolbar-horizontal";
  return `/assets/educad/${folder}/annotations/${kind}.svg`;
}
