export type ParametricPrimitiveKind = "box" | "roundedBox" | "cylinder" | "sphere" | "cone" | "tube" | "halfSphere" | "torus" | "pyramid" | "wedge" | "roof" | "roundRoof" | "polygon" | "gear";
export type ParametricBooleanRole = "add" | "cut" | "intersect";

export type ParametricParameterDefinition = {
  key: "width" | "depth" | "height" | "diameter" | "radius" | "baseRadius" | "topRadius" | "outerRadius" | "innerRadius" | "majorRadius" | "tubeRadius" | "cornerRadius" | "sides" | "teeth" | "toothDepth" | "boreRadius";
  label: string;
  unit: "mm" | "";
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

const count = (key: "sides" | "teeth", label: string, defaultValue: number, min: number, max: number): ParametricParameterDefinition => ({
  key, label, unit: "", min, max, step: 1, defaultValue,
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
    kind: "roundedBox",
    name: "Caja redondeada",
    description: "Caja paramétrica con las cuatro esquinas verticales redondeadas",
    menuIcon: "assets/educad/shapes/box_rounded.svg",
    roles: roles("roundedBox"),
    parameters: [dimension("width", "Anchura"), dimension("depth", "Profundidad"), dimension("height", "Altura"), dimension("cornerRadius", "Radio de esquina", 3)],
  },
  {
    kind: "cylinder",
    name: "Cilindro",
    description: "Cilindro circular paramétrico",
    menuIcon: "assets/sketchforge/shape-icons-gray/cylinder.png",
    roles: roles("cylinder"),
    parameters: [dimension("radius", "Radio", 10), dimension("height", "Altura")],
  },
  {
    kind: "sphere",
    name: "Esfera",
    description: "Esfera paramétrica exacta",
    menuIcon: "assets/sketchforge/shape-icons-gray/sphere.png",
    roles: roles("sphere"),
    parameters: [dimension("radius", "Radio", 10)],
  },
  {
    kind: "cone",
    name: "Cono",
    description: "Cono o tronco de cono paramétrico exacto",
    menuIcon: "assets/sketchforge/shape-icons-gray/cone.png",
    roles: roles("cone"),
    parameters: [
      dimension("baseRadius", "Radio inferior", 10),
      { ...dimension("topRadius", "Radio superior", 0), min: 0 },
      dimension("height", "Altura"),
    ],
  },
  {
    kind: "tube",
    name: "Tubo",
    description: "Tubo paramétrico exacto con pared editable",
    menuIcon: "assets/sketchforge/shape-icons-gray/tube.png",
    roles: roles("tube"),
    parameters: [dimension("outerRadius", "Radio exterior", 10), dimension("innerRadius", "Radio interior", 6), dimension("height", "Altura")],
  },
  {
    kind: "halfSphere",
    name: "Semiesfera",
    description: "Media esfera o semielipsoide paramétrico exacto",
    menuIcon: "assets/sketchforge/shape-icons-gray/half-sphere.png",
    roles: roles("halfSphere"),
    parameters: [dimension("radius", "Radio", 10), dimension("height", "Altura", 10)],
  },
  {
    kind: "torus",
    name: "Toro",
    description: "Toro paramétrico exacto con radios mayor y de tubo editables",
    menuIcon: "assets/sketchforge/shape-icons-gray/torus.png",
    roles: roles("torus"),
    parameters: [dimension("majorRadius", "Radio", 12), dimension("tubeRadius", "Espesor", 4)],
  },
  {
    kind: "pyramid",
    name: "Pirámide",
    description: "Pirámide rectangular paramétrica exacta",
    menuIcon: "assets/sketchforge/shape-icons-gray/pyramid.png",
    roles: roles("pyramid"),
    parameters: [dimension("width", "Ancho"), dimension("depth", "Largo"), dimension("height", "Altura")],
  },
  {
    kind: "wedge",
    name: "Cuña",
    description: "Prisma triangular paramétrico exacto",
    menuIcon: "assets/sketchforge/shape-icons-gray/wedge.png",
    roles: roles("wedge"),
    parameters: [dimension("width", "Ancho"), dimension("depth", "Largo"), dimension("height", "Altura")],
  },
  {
    kind: "roof",
    name: "Tejado",
    description: "Tejado a dos aguas paramétrico exacto",
    menuIcon: "assets/sketchforge/shape-icons-gray/pyramid.png",
    roles: roles("roof"),
    parameters: [dimension("width", "Ancho"), dimension("depth", "Largo"), dimension("height", "Altura", 12)],
  },
  {
    kind: "roundRoof",
    name: "Tejado redondo",
    description: "Tejado semicilíndrico o semielíptico paramétrico exacto",
    menuIcon: "assets/sketchforge/shape-icons-gray/round-roof.png",
    roles: roles("roundRoof"),
    parameters: [dimension("width", "Ancho"), dimension("depth", "Largo"), dimension("height", "Altura", 10)],
  },
  {
    kind: "polygon",
    name: "Polígono",
    description: "Prisma poligonal regular paramétrico exacto",
    menuIcon: "assets/educad/shapes/polygon.svg",
    roles: roles("polygon"),
    parameters: [dimension("radius", "Radio", 10), count("sides", "Lados", 6, 3, 32), dimension("height", "Altura")],
  },
  {
    kind: "gear",
    name: "Engranaje",
    description: "Engranaje educativo paramétrico con dentado recto",
    menuIcon: "assets/sketchforge/gear-types/spur.png",
    roles: roles("gear"),
    parameters: [dimension("outerRadius", "Radio exterior", 15), count("teeth", "Dientes", 12, 6, 64), dimension("toothDepth", "Profundidad del diente", 2.5), { ...dimension("boreRadius", "Radio del eje", 3), min: 0 }, dimension("height", "Altura", 6)],
  },
];

export function parametricOperationDefinition(kind: ParametricPrimitiveKind) {
  return parametricOperationCatalog.find((definition) => definition.kind === kind)!;
}
