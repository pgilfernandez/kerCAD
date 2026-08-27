import { createDrawnSketchFeature, createExtrudeFeature } from "@/lib/parametricDocument";
import { createLocalId } from "@/lib/localIds";
import { addParametricObject } from "@/lib/parametricObjects";
import { objectPlacementForWorkplane } from "@/lib/parametricWorkplane";
import type { ParametricDocument, SketchFeature } from "@/types/parametric";
import type { SketchProfile } from "@/types/sketchforge";
import { FontLoader, type Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import droidMonoFontJson from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import droidSansBoldFontJson from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import droidSerifBoldFontJson from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import gentilisBoldFontJson from "three/examples/fonts/gentilis_bold.typeface.json";
import optimerBoldFontJson from "three/examples/fonts/optimer_bold.typeface.json";

export type ParametricTextSettings = Extract<NonNullable<SketchProfile["generator"]>, { kind: "text" }>;

const fontLoader = new FontLoader();
const PARAMETRIC_WEB_FONTS: Record<ParametricTextSettings["font"], Font> = {
  Sans: fontLoader.parse(droidSansBoldFontJson as FontData),
  Serif: fontLoader.parse(droidSerifBoldFontJson as FontData),
  Script: fontLoader.parse(gentilisBoldFontJson as FontData),
  Monospace: fontLoader.parse(droidMonoFontJson as FontData),
  Rounded: fontLoader.parse(optimerBoldFontJson as FontData),
};

export const parametricTextFontNames = Object.keys(PARAMETRIC_WEB_FONTS) as ParametricTextSettings["font"][];

function addLoop(profile: SketchProfile, source: Array<{ x: number; y: number }>, offsetX: number) {
  const cleaned = source.filter((point, index) => index === 0 || Math.hypot(point.x - source[index - 1].x, point.y - source[index - 1].y) > 1e-7);
  if (cleaned.length > 2 && Math.hypot(cleaned[0].x - cleaned.at(-1)!.x, cleaned[0].y - cleaned.at(-1)!.y) < 1e-7) cleaned.pop();
  if (cleaned.length < 3) return;
  const points = cleaned.map((point) => ({ id: createLocalId("text-point"), x: point.x + offsetX, z: point.y }));
  profile.points.push(...points);
  for (let index = 0; index < points.length; index += 1) profile.segments.push({ id: createLocalId("text-segment"), kind: "line", startId: points[index].id, endId: points[(index + 1) % points.length].id });
}

export function parametricTextProfile(settings: ParametricTextSettings): SketchProfile {
  const normalized = {
    ...settings,
    text: settings.text.slice(0, 40),
    font: PARAMETRIC_WEB_FONTS[settings.font] ? settings.font : "Sans" as const,
    align: settings.align ?? "center",
    verticalAlign: settings.verticalAlign ?? "center",
  };
  const font = PARAMETRIC_WEB_FONTS[normalized.font];
  const size = Math.max(1, normalized.size);
  const profile: SketchProfile = { points: [], segments: [], circles: [], images: [], constraints: [], generator: normalized };
  let cursor = 0;
  for (const character of normalized.text) {
    if (/\s/.test(character)) { cursor += size * 0.38 + Math.max(0, normalized.spacing); continue; }
    const shapes = font.generateShapes(character, size);
    const sampled = shapes.flatMap((shape) => [shape.getPoints(16), ...shape.holes.map((hole) => hole.getPoints(16))]);
    const glyphPoints = sampled.flat();
    if (!glyphPoints.length) { cursor += size * 0.55 + Math.max(0, normalized.spacing); continue; }
    const minX = Math.min(...glyphPoints.map((point) => point.x));
    const maxX = Math.max(...glyphPoints.map((point) => point.x));
    for (const loop of sampled) addLoop(profile, loop, cursor - minX);
    cursor += Math.max(size * 0.2, maxX - minX) + Math.max(0, normalized.spacing);
  }
  if (!profile.segments.length) throw new Error("Escribe al menos un carácter visible.");
  const minX = Math.min(...profile.points.map((point) => point.x));
  const maxX = Math.max(...profile.points.map((point) => point.x));
  const minZ = Math.min(...profile.points.map((point) => point.z));
  const maxZ = Math.max(...profile.points.map((point) => point.z));
  const offsetX = normalized.align === "left" ? -minX : normalized.align === "right" ? -maxX : -(minX + maxX) / 2;
  const offsetZ = normalized.verticalAlign === "bottom" ? -minZ : normalized.verticalAlign === "top" ? -maxZ : -(minZ + maxZ) / 2;
  for (const point of profile.points) {
    point.x += offsetX;
    point.z += offsetZ;
  }
  return profile;
}

export function updateParametricTextSketch(sketch: SketchFeature, update: Partial<Omit<ParametricTextSettings, "kind">>) {
  if (sketch.profile.shape !== "drawn" || sketch.profile.geometry.generator?.kind !== "text") return false;
  const settings = { ...sketch.profile.geometry.generator, ...update, kind: "text" as const };
  sketch.profile.geometry = parametricTextProfile(settings);
  return true;
}

export function addParametricText(document: ParametricDocument, selectedObjectId: string | null) {
  let objectId = selectedObjectId && document.objects.some((object) => object.id === selectedObjectId) ? selectedObjectId : null;
  if (!objectId) {
    objectId = addParametricObject(document, document.workplane.origin);
    const object = document.objects.find((candidate) => candidate.id === objectId);
    if (object) {
      const placement = objectPlacementForWorkplane(document.workplane);
      object.transform.position = placement.position;
      object.transform.rotation = placement.rotation;
      object.name = "Texto";
    }
  }
  const profile = parametricTextProfile({ kind: "text", text: "eduCAD", font: "Sans", size: 20, spacing: 1, align: "center", verticalAlign: "center" });
  const sketch = createDrawnSketchFeature(document.features.filter((feature) => feature.kind === "sketch" && feature.purpose === "user").length + 1, profile);
  sketch.objectId = objectId;
  sketch.name = "Perfil de texto";
  sketch.visible = false;
  sketch.purpose = "primitive";
  const extrusion = createExtrudeFeature(sketch.id, document.features.filter((feature) => feature.kind === "extrude").length + 1, false);
  extrusion.objectId = objectId;
  extrusion.name = "Texto";
  extrusion.distance = 4;
  extrusion.dependencies = [{ type: "feature", id: sketch.id }];
  document.features.push(sketch, extrusion);
  return { objectId, sketchId: sketch.id, extrusionId: extrusion.id };
}
