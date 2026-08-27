import { createDrawnSketchFeature, createExtrudeFeature } from "@/lib/parametricDocument";
import { addParametricObject } from "@/lib/parametricObjects";
import { objectPlacementForWorkplane } from "@/lib/parametricWorkplane";
import { sketchProfileFromSvg } from "@/lib/svgImport";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";
import type { ParametricDocument } from "@/types/parametric";
import type { SketchProfile } from "@/types/sketchforge";

function svgOperationName(fileName: string) {
  const withoutExtension = fileName.replace(/\.svg$/i, "").trim();
  return withoutExtension || "SVG importado";
}

export function appendSvgProfileAsParametricExtrusion(document: ParametricDocument, profile: SketchProfile, fileName: string, selectedObjectId: string | null) {
  const validation = validateDrawnSketchProfile(profile);
  if (!validation.valid) throw new Error(validation.diagnostics[0]?.message ?? "El SVG no contiene un perfil cerrado válido.");

  let objectId = selectedObjectId && document.objects.some((object) => object.id === selectedObjectId) ? selectedObjectId : null;
  if (!objectId) {
    objectId = addParametricObject(document, document.workplane.origin);
    const object = document.objects.find((candidate) => candidate.id === objectId);
    if (object) {
      const placement = objectPlacementForWorkplane(document.workplane);
      object.transform.position = placement.position;
      object.transform.rotation = placement.rotation;
      object.name = svgOperationName(fileName);
    }
  }

  const name = svgOperationName(fileName);
  const sketch = createDrawnSketchFeature(document.features.filter((feature) => feature.kind === "sketch" && feature.purpose === "user").length + 1, profile);
  sketch.objectId = objectId;
  sketch.name = `${name} · Boceto`;
  sketch.visible = false;

  const extrusion = createExtrudeFeature(sketch.id, document.features.filter((feature) => feature.kind === "extrude").length + 1, false);
  extrusion.objectId = objectId;
  extrusion.name = name;
  extrusion.dependencies = [{ type: "feature", id: sketch.id }];
  document.features.push(sketch, extrusion);

  return {
    objectId,
    sketchId: sketch.id,
    extrusionId: extrusion.id,
    segmentCount: profile.segments.length,
    circleCount: profile.circles?.length ?? 0,
  };
}

export function importSvgAsParametricExtrusion(document: ParametricDocument, source: string, fileName: string, selectedObjectId: string | null) {
  return appendSvgProfileAsParametricExtrusion(document, sketchProfileFromSvg(source), fileName, selectedObjectId);
}
