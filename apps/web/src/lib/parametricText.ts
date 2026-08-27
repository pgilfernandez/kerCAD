import { createDrawnSketchFeature, createExtrudeFeature } from "@/lib/parametricDocument";
import { createLocalId } from "@/lib/localIds";
import { addParametricObject } from "@/lib/parametricObjects";
import { objectPlacementForWorkplane } from "@/lib/parametricWorkplane";
import type { ParametricDocument, SketchFeature } from "@/types/parametric";
import type { SketchPoint, SketchProfile } from "@/types/sketchforge";
import { CubicBezierCurve, LineCurve, QuadraticBezierCurve, type Curve, type Vector2 } from "three";
import { FontLoader, type Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import droidMonoFontJson from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import droidSansBoldFontJson from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import droidSerifBoldFontJson from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import gentilisBoldFontJson from "three/examples/fonts/gentilis_bold.typeface.json";
import optimerBoldFontJson from "three/examples/fonts/optimer_bold.typeface.json";

export type ParametricTextSettings = Extract<NonNullable<SketchProfile["generator"]>, { kind: "text" }>;

const fontLoader = new FontLoader();
const PARAMETRIC_WEB_FONT_DATA: Record<ParametricTextSettings["font"], FontData> = {
  Sans: droidSansBoldFontJson as FontData,
  Serif: droidSerifBoldFontJson as FontData,
  Script: gentilisBoldFontJson as FontData,
  Monospace: droidMonoFontJson as FontData,
  Rounded: optimerBoldFontJson as FontData,
};
const parsedFonts = new Map<ParametricTextSettings["font"], Font>();
const cachedGlyphs = new Map<string, TextGlyph>();

export const parametricTextFontNames = Object.keys(PARAMETRIC_WEB_FONT_DATA) as ParametricTextSettings["font"][];

function parametricWebFont(name: ParametricTextSettings["font"]) {
  const cached = parsedFonts.get(name);
  if (cached) return cached;
  const font = fontLoader.parse(PARAMETRIC_WEB_FONT_DATA[name]);
  parsedFonts.set(name, font);
  return font;
}

type TextCurvePiece = {
  start: Vector2;
  end: Vector2;
  control1?: Vector2;
  control2?: Vector2;
};

type TextGlyph = {
  loops: TextCurvePiece[][];
  minX: number;
  maxX: number;
};

function textCurvePieces(curve: Curve<Vector2>): TextCurvePiece[] {
  if (curve instanceof LineCurve) return [{ start: curve.v1, end: curve.v2 }];
  if (curve instanceof CubicBezierCurve) return [{ start: curve.v0, end: curve.v3, control1: curve.v1, control2: curve.v2 }];
  if (curve instanceof QuadraticBezierCurve) {
    return [{
      start: curve.v0,
      end: curve.v2,
      control1: curve.v0.clone().lerp(curve.v1, 2 / 3),
      control2: curve.v2.clone().lerp(curve.v1, 2 / 3),
    }];
  }
  const sampled = curve.getPoints(4);
  return sampled.slice(1).map((end, index) => ({ start: sampled[index], end }));
}

function cachedTextGlyph(fontName: ParametricTextSettings["font"], font: Font, character: string): TextGlyph | null {
  const key = `${fontName}:${character}`;
  const cached = cachedGlyphs.get(key);
  if (cached) return cached;
  const shapes = font.generateShapes(character, 1);
  const loops = shapes.flatMap((shape) => [shape, ...shape.holes]);
  const bounds = loops.flatMap((loop) => loop.getPoints(5));
  const points = bounds.flat();
  if (!points.length) return null;
  const glyph = {
    loops: loops.map((loop) => loop.curves.flatMap(textCurvePieces).filter((piece) => piece.start.distanceToSquared(piece.end) > 1e-14)),
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
  };
  cachedGlyphs.set(key, glyph);
  return glyph;
}

function addCurveLoop(profile: SketchProfile, pieces: TextCurvePiece[], offsetX: number, scale: number) {
  if (pieces.length < 2) return;
  const points: SketchPoint[] = pieces.map((piece) => ({
    id: createLocalId("text-point"),
    x: piece.start.x * scale + offsetX,
    z: piece.start.y * scale,
    ...(piece.control1 ? { handleOut: { x: piece.control1.x * scale + offsetX, z: piece.control1.y * scale } } : {}),
  }));
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const next = points[(index + 1) % points.length];
    if (piece.control2) next.handleIn = { x: piece.control2.x * scale + offsetX, z: piece.control2.y * scale };
    profile.segments.push({
      id: createLocalId("text-segment"),
      kind: piece.control1 && piece.control2 ? "bezier" : "line",
      startId: points[index].id,
      endId: next.id,
    });
  }
  profile.points.push(...points);
}

export function parametricTextProfile(settings: ParametricTextSettings): SketchProfile {
  const normalized = {
    ...settings,
    text: settings.text.slice(0, 40),
    font: PARAMETRIC_WEB_FONT_DATA[settings.font] ? settings.font : "Sans" as const,
    align: settings.align ?? "center",
    verticalAlign: settings.verticalAlign ?? "center",
  };
  const font = parametricWebFont(normalized.font);
  const size = Math.max(1, normalized.size);
  const profile: SketchProfile = { points: [], segments: [], circles: [], images: [], constraints: [], generator: normalized };
  let cursor = 0;
  for (const character of normalized.text) {
    if (/\s/.test(character)) { cursor += size * 0.38 + Math.max(0, normalized.spacing); continue; }
    const glyph = cachedTextGlyph(normalized.font, font, character);
    if (!glyph) { cursor += size * 0.55 + Math.max(0, normalized.spacing); continue; }
    const minX = glyph.minX * size;
    const maxX = glyph.maxX * size;
    for (const loop of glyph.loops) addCurveLoop(profile, loop, cursor - minX, size);
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
    if (point.handleIn) {
      point.handleIn.x += offsetX;
      point.handleIn.z += offsetZ;
    }
    if (point.handleOut) {
      point.handleOut.x += offsetX;
      point.handleOut.z += offsetZ;
    }
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
