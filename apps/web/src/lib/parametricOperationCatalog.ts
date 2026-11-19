import { getLocaleContent, type KercadLocale } from "@/lib/kercadI18n";

export type ParametricPrimitiveKind = "box" | "roundedBox" | "cylinder" | "sphere" | "cone" | "tube" | "halfSphere" | "torus" | "pyramid" | "wedge" | "roof" | "roundRoof" | "polygon" | "gear" | "platonic";
export type ParametricBooleanRole = "add" | "cut" | "intersect";

export const parametricShapeMenuOrder: readonly (ParametricPrimitiveKind | "text" | "spiral" | "helix")[] = [
  "box", "roundedBox", "cylinder", "tube", "cone", "pyramid", "polygon",
  "wedge", "roof", "roundRoof", "torus", "sphere", "halfSphere", "text", "platonic", "gear",
  "spiral", "helix",
];

export type ParametricParameterDefinition = {
  key: "width" | "depth" | "height" | "diameter" | "radius" | "baseRadius" | "topRadius" | "outerRadius" | "innerRadius" | "thickness" | "majorRadius" | "tubeRadius" | "cornerRadius" | "sides" | "teeth" | "toothDepth" | "boreRadius";
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

const sourcePrimitive = (kind: ParametricPrimitiveKind) => getLocaleContent("es", "primitives")[kind];
const sourceParameter = (kind: ParametricPrimitiveKind, key: string) => (sourcePrimitive(kind).parameters as Record<string, string>)[key];

const roles = (kind: ParametricPrimitiveKind): ParametricOperationDefinition["roles"] => ({
  add: { label: sourcePrimitive(kind).roles.add, color: "#378451", iconId: `${kind}-add` },
  cut: { label: sourcePrimitive(kind).roles.cut, color: "#b6524d", iconId: `${kind}-hole` },
  intersect: { label: sourcePrimitive(kind).roles.intersect, color: "#7256aa", iconId: `${kind}-common` },
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
    kind: "platonic",
    name: sourcePrimitive("platonic").name,
    description: sourcePrimitive("platonic").description,
    menuIcon: "assets/kercad/toolbar-3d/shapes/platonic.svg",
    roles: roles("platonic"),
    parameters: [dimension("width", sourceParameter("platonic", "width"), 20)],
  },
  {
    kind: "box",
    name: sourcePrimitive("box").name,
    description: sourcePrimitive("box").description,
    menuIcon: "assets/old/shape-icons-gray/box.png",
    roles: roles("box"),
    parameters: [dimension("width", sourceParameter("box", "width")), dimension("depth", sourceParameter("box", "depth")), dimension("height", sourceParameter("box", "height"))],
  },
  {
    kind: "roundedBox",
    name: sourcePrimitive("roundedBox").name,
    description: sourcePrimitive("roundedBox").description,
    menuIcon: "assets/kercad/toolbar-3d/shapes/box_rounded.svg",
    roles: roles("roundedBox"),
    parameters: [dimension("width", sourceParameter("roundedBox", "width")), dimension("depth", sourceParameter("roundedBox", "depth")), dimension("height", sourceParameter("roundedBox", "height")), dimension("cornerRadius", sourceParameter("roundedBox", "cornerRadius"), 3)],
  },
  {
    kind: "cylinder",
    name: sourcePrimitive("cylinder").name,
    description: sourcePrimitive("cylinder").description,
    menuIcon: "assets/old/shape-icons-gray/cylinder.png",
    roles: roles("cylinder"),
    parameters: [dimension("radius", sourceParameter("cylinder", "radius"), 10), dimension("height", sourceParameter("cylinder", "height"))],
  },
  {
    kind: "sphere",
    name: sourcePrimitive("sphere").name,
    description: sourcePrimitive("sphere").description,
    menuIcon: "assets/old/shape-icons-gray/sphere.png",
    roles: roles("sphere"),
    parameters: [dimension("radius", sourceParameter("sphere", "radius"), 10)],
  },
  {
    kind: "halfSphere",
    name: sourcePrimitive("halfSphere").name,
    description: sourcePrimitive("halfSphere").description,
    menuIcon: "assets/old/shape-icons-gray/half-sphere.png",
    roles: roles("halfSphere"),
    parameters: [dimension("radius", sourceParameter("halfSphere", "radius"), 10), dimension("height", sourceParameter("halfSphere", "height"), 10)],
  },
  {
    kind: "cone",
    name: sourcePrimitive("cone").name,
    description: sourcePrimitive("cone").description,
    menuIcon: "assets/old/shape-icons-gray/cone.png",
    roles: roles("cone"),
    parameters: [
      dimension("baseRadius", sourceParameter("cone", "baseRadius"), 10),
      { ...dimension("topRadius", sourceParameter("cone", "topRadius"), 0), min: 0 },
      dimension("height", sourceParameter("cone", "height")),
    ],
  },
  {
    kind: "tube",
    name: sourcePrimitive("tube").name,
    description: sourcePrimitive("tube").description,
    menuIcon: "assets/old/shape-icons-gray/tube.png",
    roles: roles("tube"),
    parameters: [dimension("outerRadius", sourceParameter("tube", "outerRadius"), 10), dimension("thickness", sourceParameter("tube", "thickness"), 4), dimension("height", sourceParameter("tube", "height"))],
  },
  {
    kind: "torus",
    name: sourcePrimitive("torus").name,
    description: sourcePrimitive("torus").description,
    menuIcon: "assets/kercad/toolbar-3d/shapes/torus.svg",
    roles: roles("torus"),
    parameters: [dimension("majorRadius", sourceParameter("torus", "majorRadius"), 12), dimension("tubeRadius", sourceParameter("torus", "tubeRadius"), 4)],
  },
  {
    kind: "pyramid",
    name: sourcePrimitive("pyramid").name,
    description: sourcePrimitive("pyramid").description,
    menuIcon: "assets/old/shape-icons-gray/pyramid.png",
    roles: roles("pyramid"),
    parameters: [dimension("width", sourceParameter("pyramid", "width")), dimension("depth", sourceParameter("pyramid", "depth")), dimension("height", sourceParameter("pyramid", "height")), { ...dimension("topRadius", sourceParameter("pyramid", "topRadius"), 0), min: 0 }],
  },
  {
    kind: "wedge",
    name: sourcePrimitive("wedge").name,
    description: sourcePrimitive("wedge").description,
    menuIcon: "assets/kercad/toolbar-3d/shapes/wedge.svg",
    roles: roles("wedge"),
    parameters: [dimension("width", sourceParameter("wedge", "width")), dimension("depth", sourceParameter("wedge", "depth")), dimension("height", sourceParameter("wedge", "height"))],
  },
  {
    kind: "roof",
    name: sourcePrimitive("roof").name,
    description: sourcePrimitive("roof").description,
    menuIcon: "assets/kercad/toolbar-3d/shapes/roof.svg",
    roles: roles("roof"),
    parameters: [dimension("width", sourceParameter("roof", "width")), dimension("depth", sourceParameter("roof", "depth")), dimension("height", sourceParameter("roof", "height"), 12)],
  },
  {
    kind: "roundRoof",
    name: sourcePrimitive("roundRoof").name,
    description: sourcePrimitive("roundRoof").description,
    menuIcon: "assets/old/shape-icons-gray/round-roof.png",
    roles: roles("roundRoof"),
    parameters: [dimension("width", sourceParameter("roundRoof", "width")), dimension("depth", sourceParameter("roundRoof", "depth")), dimension("height", sourceParameter("roundRoof", "height"), 10)],
  },
  {
    kind: "polygon",
    name: sourcePrimitive("polygon").name,
    description: sourcePrimitive("polygon").description,
    menuIcon: "assets/kercad/toolbar-3d/shapes/polygon.svg",
    roles: roles("polygon"),
    parameters: [dimension("radius", sourceParameter("polygon", "radius"), 10), count("sides", sourceParameter("polygon", "sides"), 6, 3, 32), dimension("height", sourceParameter("polygon", "height"))],
  },
  {
    kind: "gear",
    name: sourcePrimitive("gear").name,
    description: sourcePrimitive("gear").description,
    menuIcon: "assets/old/gear-types/spur.png",
    roles: roles("gear"),
    parameters: [dimension("outerRadius", sourceParameter("gear", "outerRadius"), 15), count("teeth", sourceParameter("gear", "teeth"), 12, 6, 64), dimension("toothDepth", sourceParameter("gear", "toothDepth"), 2.5), { ...dimension("boreRadius", sourceParameter("gear", "boreRadius"), 3), min: 0 }, dimension("height", sourceParameter("gear", "height"), 6)],
  },
];

export function parametricOperationDefinition(kind: ParametricPrimitiveKind) {
  return parametricOperationCatalog.find((definition) => definition.kind === kind)!;
}

export function localizedParametricOperationDefinition(kind: ParametricPrimitiveKind, locale: KercadLocale) {
  const definition = parametricOperationDefinition(kind);
  const text = getLocaleContent(locale, "primitives")[kind];
  return {
    ...definition,
    name: text.name,
    description: text.description,
    roles: Object.fromEntries(Object.entries(definition.roles).map(([key, role]) => [key, { ...role, label: text.roles[key as keyof typeof text.roles] }])) as ParametricOperationDefinition["roles"],
    parameters: definition.parameters.map((parameter) => ({ ...parameter, label: (text.parameters as Record<string, string>)[parameter.key] ?? parameter.label })),
  };
}
