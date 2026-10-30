import { joinChallengeParameterGroups } from "@/lib/challengeParameters";
import type { KercadChallengeStep } from "@/lib/challengeLibrary";
import { kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import { localizedParametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import { formatDisplayLength, normalizeDisplayUnit } from "@/lib/parametricUnits";
import type { ParametricDocument, ParametricFeature, ParametricVector3, PrimitiveFeature, SketchFeature } from "@/types/parametric";

export type CapturedChallengeParameter = NonNullable<KercadChallengeStep["values"]>[number];
type Selection = { id: string; kind: "object" | "feature" };

/** Capture editable source parameters, not a tessellated object's bounding box. */
export function captureChallengeParameters(document: ParametricDocument, selection: Selection | null, locale: KercadLocale): CapturedChallengeParameter[] {
  if (!selection) return [];
  const t = (key: string) => kercadTranslate(locale, key);
  const unit = normalizeDisplayUnit(document.displayUnit);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 6, useGrouping: false, numberingSystem: "latn" }).format(value);
  const qualify = (label: string, name?: string) => name ? kercadTranslate(locale, "challenge.parameterOf", { name, parameter: label }) : label;
  const axisLabel = (parameter: string, axis: string) => kercadTranslate(locale, "challenge.parameterAxis", { parameter: t(parameter), axis: axis.toUpperCase() });

  const transformValues = (position: ParametricVector3, rotation: ParametricVector3, name?: string) => {
    const positionValues: CapturedChallengeParameter[] = [];
    const rotationValues: CapturedChallengeParameter[] = [];
    for (const axis of ["x", "y", "z"] as const) {
      if (Number.isFinite(position[axis]) && Math.abs(position[axis]) > 1e-9) positionValues.push({ label: qualify(axisLabel("property.position", axis), name), value: `${formatDisplayLength(position[axis], unit, 6, locale)} ${unit}` });
    }
    for (const axis of ["x", "y", "z"] as const) {
      if (Number.isFinite(rotation[axis]) && Math.abs(rotation[axis]) > 1e-9) rotationValues.push({ label: qualify(axisLabel("property.rotation", axis), name), value: `${number(rotation[axis])} °` });
    }
    return joinChallengeParameterGroups([positionValues, rotationValues]);
  };

  const featureValues = (feature: ParametricFeature, prefix?: string, transformPrefix?: string) => {
    const values: CapturedChallengeParameter[] = [];
    const add = (label: string, value: number, kind: "length" | "angle" | "count" = "length") => {
      if (!Number.isFinite(value)) return;
      values.push({ label: qualify(label, prefix), value: kind === "length" ? `${formatDisplayLength(value, unit, 6, locale)} ${unit}` : `${number(value)}${kind === "angle" ? " °" : ""}` });
    };
    const profileValues = (sketch: SketchFeature) => {
      if (sketch.profile.shape === "rectangle") {
        add(t("property.width"), sketch.profile.width);
        add(t("property.depth"), sketch.profile.depth);
      } else if (sketch.profile.shape === "circle") add(t("property.radius"), sketch.profile.diameter / 2);
      else if (sketch.profile.geometry.generator?.kind === "text") {
        const generator = sketch.profile.geometry.generator;
        values.push({ label: qualify(t("toolbar.text"), prefix), value: generator.text });
        add(t("annotation.size"), generator.size);
      }
    };
    switch (feature.kind) {
      case "primitive": {
        const definition = localizedParametricOperationDefinition(feature.primitive, locale);
        for (const parameter of definition.parameters) {
          const key = parameter.key;
          const value = key === "radius" || key === "baseRadius" || key === "outerRadius" ? feature.width / 2
            : key === "thickness" ? Math.max(0.1, feature.width / 2 - (feature.innerRadius ?? 6))
            : feature[key as keyof PrimitiveFeature];
          add(parameter.label, typeof value === "number" ? value : parameter.defaultValue, parameter.unit === "mm" ? "length" : "count");
        }
        break;
      }
      case "extrude": {
        const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.id === feature.sketchId && candidate.kind === "sketch");
        if (sketch) profileValues(sketch);
        add(t("property.height"), feature.distance);
        break;
      }
      case "sketch": profileValues(feature); break;
      case "hole":
        add(t("property.diameter"), feature.diameter);
        values.push({ label: qualify(t("property.termination"), prefix), value: t(feature.termination === "blind" ? "value.blind" : "value.throughAll") });
        if (feature.termination === "blind") add(t("property.depth"), feature.depth);
        break;
      case "fillet": add(t(feature.treatment === "chamfer" ? "property.distance" : "property.radius"), feature.radius); break;
      case "faceExtrude": add(t("property.length"), feature.distance); break;
      case "shell": add(t("property.thickness"), feature.thickness); break;
      case "revolve": add(t("property.angle"), feature.angle, "angle"); break;
      case "linearPattern":
        add(t("property.count"), feature.count, "count");
        add(t("property.spacing"), feature.spacing);
        break;
      case "polarPattern":
        add(t("property.count"), feature.count, "count");
        add(t(feature.equalSpacing ? "property.totalAngle" : "property.angularStep"), feature.angle, "angle");
        for (const axis of ["x", "y", "z"] as const) if (feature.center?.[axis]) add(axisLabel("property.rotationCenter", axis), feature.center[axis]);
        break;
    }
    if (feature.kind === "linearPattern" || feature.kind === "polarPattern" || feature.kind === "revolve" || feature.kind === "mirror") {
      values.push({ label: qualify(t("property.axis"), prefix), value: feature.axis === "edge" ? t("operation.selectedEdge") : t(`value.local${feature.axis.toUpperCase()}`) });
    }
    let transforms: CapturedChallengeParameter[] = [];
    if (feature.kind === "sketch") transforms = transformValues({ x: feature.x, y: feature.y, z: feature.offset }, feature.rotation, transformPrefix ?? prefix);
    else if (feature.kind === "primitive" || feature.kind === "extrude") transforms = transformValues(feature.transform.position, feature.transform.rotation, transformPrefix ?? prefix);
    else if (feature.kind === "hole") transforms = transformValues({ x: feature.x, y: feature.y, z: 0 }, { x: 0, y: 0, z: 0 }, transformPrefix ?? prefix);
    return joinChallengeParameterGroups([values, transforms]);
  };

  if (selection.kind === "feature") {
    const feature = document.features.find((candidate) => candidate.id === selection.id);
    return feature && !feature.suppressed ? featureValues(feature) : [];
  }
  const object = document.objects.find((candidate) => candidate.id === selection.id);
  if (!object) return [];
  const owned = document.features.filter((feature) => feature.objectId === object.id && !feature.suppressed);
  const operations = owned.some((feature) => feature.kind !== "sketch") ? owned.filter((feature) => feature.kind !== "sketch") : owned;
  return joinChallengeParameterGroups([
    ...operations.map((feature) => featureValues(feature, operations.length > 1 ? feature.name : undefined, feature.name)),
    transformValues(object.transform.position, object.transform.rotation),
  ]);
}
