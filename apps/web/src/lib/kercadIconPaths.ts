// Shared artwork lives once, grouped by its primary GUI role.
export function operationIconPath(file: string) {
  const folder = ["edit.svg", "sharp.svg", "boolean-add.svg", "boolean-hole.svg", "boolean-common.svg"].includes(file) ? "toolbar-horizontal"
    : "toolbar-3d";
  return `/assets/kercad/${folder}/${file}`;
}

export function annotationIconPath(kind: string) {
  if (kind === "group") return "/assets/kercad/operations-tree/annotations.svg";
  const folder = ["text", "dimension", "arrow", "dashedLine", "angle", "circle", "rectangle"].includes(kind)
    ? "toolbar-3d" : "toolbar-horizontal";
  return `/assets/kercad/${folder}/annotations/${kind}.svg`;
}
