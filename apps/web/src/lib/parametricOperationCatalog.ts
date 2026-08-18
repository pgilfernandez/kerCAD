export type ParametricPrimitiveKind = "box" | "cylinder" | "sphere";
export type ParametricBooleanRole = "add" | "cut" | "intersect";

export type ParametricParameterDefinition = {
  key: "width" | "depth" | "height" | "diameter";
  label: string;
  unit: "mm";
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

export type ParametricOperationDefinition = {
  kind: ParametricPrimitiveKind;
  name: string;
  description: string;
  menuIcon: string;
  roles: Record<ParametricBooleanRole, { label: string; color: string; iconId: string }>;
  parameters: ParametricParameterDefinition[];
};

const roles = (kind: ParametricPrimitiveKind): ParametricOperationDefinition["roles"] => ({
  add: { label: "Añadir", color: "#378451", iconId: `${kind}-add` },
  cut: { label: "Hueco", color: "#b6524d", iconId: `${kind}-hole` },
  intersect: { label: "Común", color: "#7256aa", iconId: `${kind}-common` },
});

const dimension = (key: ParametricParameterDefinition["key"], label: string, defaultValue = 20): ParametricParameterDefinition => ({
  key,
  label,
  unit: "mm",
  min: 0.1,
  max: 200,
  step: 0.1,
  defaultValue,
});

export const parametricOperationCatalog: ParametricOperationDefinition[] = [
  {
    kind: "box",
    name: "Caja",
    description: "Prisma rectangular paramétrico",
    menuIcon: "assets/sketchforge/shape-icons-gray/box.png",
    roles: roles("box"),
    parameters: [dimension("width", "Anchura"), dimension("depth", "Profundidad"), dimension("height", "Altura")],
  },
  {
    kind: "cylinder",
    name: "Cilindro",
    description: "Cilindro circular paramétrico",
    menuIcon: "assets/sketchforge/shape-icons-gray/cylinder.png",
    roles: roles("cylinder"),
    parameters: [dimension("diameter", "Diámetro"), dimension("height", "Altura")],
  },
  {
    kind: "sphere",
    name: "Esfera",
    description: "Esfera o elipsoide exacto",
    menuIcon: "assets/sketchforge/shape-icons-gray/sphere.png",
    roles: roles("sphere"),
    parameters: [dimension("width", "Anchura"), dimension("depth", "Profundidad"), dimension("height", "Altura")],
  },
];

export function parametricOperationDefinition(kind: ParametricPrimitiveKind) {
  return parametricOperationCatalog.find((definition) => definition.kind === kind)!;
}
