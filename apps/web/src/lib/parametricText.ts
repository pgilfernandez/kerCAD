import { createDrawnSketchFeature, createExtrudeFeature } from "@/lib/parametricDocument";
import { createLocalId } from "@/lib/localIds";
import { addParametricObject } from "@/lib/parametricObjects";
import { objectPlacementForWorkplane } from "@/lib/parametricWorkplane";
import type { ParametricDocument, SketchFeature } from "@/types/parametric";
import type { SketchPoint, SketchProfile, SolidTextFont, SolidTextStyle } from "@/types/workplane";
import { SOLID_TEXT_FONT_NAMES } from "@/types/workplane";
import { CubicBezierCurve, LineCurve, QuadraticBezierCurve, type Curve, type Vector2 } from "three";
import { FontLoader, type Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import { textFonts, textFontNames } from "@/lib/textFonts";
import fredoka from "./operation-fonts/fredoka.typeface.json";
import barlowCondensed from "./operation-fonts/barlowcondensed.typeface.json";
import alfaSlabOne from "./operation-fonts/alfaslabone.typeface.json";
import stardosStencil from "./operation-fonts/stardosstencil.typeface.json";
import oswald from "./operation-fonts/oswald.typeface.json";
import montserrat from "./operation-fonts/montserrat.typeface.json";
import ubuntu from "./operation-fonts/ubuntu.typeface.json";
import roboto from "./operation-fonts/roboto.typeface.json";
import pacifico from "./operation-fonts/pacifico.typeface.json";
import gloriahallelujah from "./operation-fonts/gloriahallelujah.typeface.json";
import greatvibes from "./operation-fonts/greatvibes.typeface.json";
import amaticsc from "./operation-fonts/amaticsc.typeface.json";
import worksans from "./operation-fonts/worksans.typeface.json";
import dmsans from "./operation-fonts/dmsans.typeface.json";
import lora from "./operation-fonts/lora.typeface.json";
import montserrat0 from "./operation-fonts/montserrat-bold.typeface.json";
import montserrat1 from "./operation-fonts/montserrat-italic.typeface.json";
import montserrat2 from "./operation-fonts/montserrat-bold-italic.typeface.json";
import ubuntu0 from "./operation-fonts/ubuntu-bold.typeface.json";
import ubuntu1 from "./operation-fonts/ubuntu-italic.typeface.json";
import ubuntu2 from "./operation-fonts/ubuntu-bold-italic.typeface.json";
import worksans0 from "./operation-fonts/worksans-bold.typeface.json";
import worksans1 from "./operation-fonts/worksans-italic.typeface.json";
import worksans2 from "./operation-fonts/worksans-bold-italic.typeface.json";
import montserrat_light from "./operation-fonts/montserrat-light.typeface.json";
import ubuntu_light from "./operation-fonts/ubuntu-light.typeface.json";
import worksans_light from "./operation-fonts/worksans-light.typeface.json";
import barlowcondensed_light from "./operation-fonts/barlowcondensed-light.typeface.json";
import barlowcondensed_regular from "./operation-fonts/barlowcondensed-regular.typeface.json";
import barlowcondensed_italic from "./operation-fonts/barlowcondensed-italic.typeface.json";
import barlowcondensed_bold_italic from "./operation-fonts/barlowcondensed-bold-italic.typeface.json";
import amaticsc_regular from "./operation-fonts/amaticsc-regular.typeface.json";
import stardosstencil_regular from "./operation-fonts/stardosstencil-regular.typeface.json";
import fredoka_regular from "./operation-fonts/fredoka-regular.typeface.json";
import fredoka_bold from "./operation-fonts/fredoka-bold.typeface.json";
import oswald_light from "./operation-fonts/oswald-light.typeface.json";
import oswald_bold from "./operation-fonts/oswald-bold.typeface.json";
import roboto_light from "./operation-fonts/roboto-light.typeface.json";
import roboto_bold from "./operation-fonts/roboto-bold.typeface.json";
import roboto_italic from "./operation-fonts/roboto-italic.typeface.json";
import roboto_bold_italic from "./operation-fonts/roboto-bold-italic.typeface.json";
import dmsans_light from "./operation-fonts/dmsans-light.typeface.json";
import dmsans_bold from "./operation-fonts/dmsans-bold.typeface.json";
import dmsans_italic from "./operation-fonts/dmsans-italic.typeface.json";
import dmsans_bold_italic from "./operation-fonts/dmsans-bold-italic.typeface.json";
import lora_bold from "./operation-fonts/lora-bold.typeface.json";
import lora_italic from "./operation-fonts/lora-italic.typeface.json";
import lora_bold_italic from "./operation-fonts/lora-bold-italic.typeface.json";
import sansRegular from "three/examples/fonts/droid/droid_sans_regular.typeface.json";
import serifRegular from "three/examples/fonts/droid/droid_serif_regular.typeface.json";
import scriptRegular from "three/examples/fonts/gentilis_regular.typeface.json";
import roundedRegular from "three/examples/fonts/optimer_regular.typeface.json";

export type ParametricTextSettings = Extract<NonNullable<SketchProfile["generator"]>, { kind: "text" }>;

const fontLoader = new FontLoader();
const PARAMETRIC_WEB_FONT_DATA = {
  ...Object.fromEntries(textFontNames.map((name) => [name, textFonts[name].geometry])) as Record<typeof textFontNames[number], FontData>,
  Fredoka: fredoka as FontData,
  "Barlow Condensed": barlowCondensed as FontData,
  "Alfa Slab One": alfaSlabOne as FontData,
  "Stardos Stencil": stardosStencil as FontData,
  "Oswald": oswald as FontData,
  "Montserrat": montserrat as FontData,
  "Ubuntu": ubuntu as FontData,
  "Roboto": roboto as FontData,
  "Pacifico": pacifico as FontData,
  "Gloria Hallelujah": gloriahallelujah as FontData,
  "Great Vibes": greatvibes as FontData,
  "Amatic SC": amaticsc as FontData,
  "Work Sans": worksans as FontData,
  "DM Sans": dmsans as FontData,
  Lora: lora as FontData,
} satisfies Record<ParametricTextSettings["font"], FontData>;
const fontVariants: Partial<Record<SolidTextFont, Partial<Record<SolidTextStyle, FontData>>>> = {
  "Montserrat": { "light": montserrat_light as FontData, bold: montserrat0 as FontData, italic: montserrat1 as FontData, "bold-italic": montserrat2 as FontData },
  "Ubuntu": { "light": ubuntu_light as FontData, bold: ubuntu0 as FontData, italic: ubuntu1 as FontData, "bold-italic": ubuntu2 as FontData },
  "Work Sans": { "light": worksans_light as FontData, bold: worksans0 as FontData, italic: worksans1 as FontData, "bold-italic": worksans2 as FontData },
  "Barlow Condensed": { "light": barlowcondensed_light as FontData, "regular": barlowcondensed_regular as FontData, "italic": barlowcondensed_italic as FontData, "bold-italic": barlowcondensed_bold_italic as FontData },
  "Amatic SC": { "regular": amaticsc_regular as FontData },
  "Stardos Stencil": { "regular": stardosstencil_regular as FontData },
  "Fredoka": { "regular": fredoka_regular as FontData, "bold": fredoka_bold as FontData },
  "Oswald": { "light": oswald_light as FontData, "bold": oswald_bold as FontData },
  "Roboto": { "light": roboto_light as FontData, "bold": roboto_bold as FontData, "italic": roboto_italic as FontData, "bold-italic": roboto_bold_italic as FontData },
  "DM Sans": { "light": dmsans_light as FontData, "bold": dmsans_bold as FontData, "italic": dmsans_italic as FontData, "bold-italic": dmsans_bold_italic as FontData },
  "Lora": { "bold": lora_bold as FontData, "italic": lora_italic as FontData, "bold-italic": lora_bold_italic as FontData },
  Sans: { regular: sansRegular as FontData },
  Serif: { regular: serifRegular as FontData },
  Script: { regular: scriptRegular as FontData },
  Rounded: { regular: roundedRegular as FontData },
};
const parsedFonts = new Map<string, Font>();
const cachedGlyphs = new Map<string, TextGlyph>();

export const parametricTextFontNames = [...SOLID_TEXT_FONT_NAMES].sort((a, b) => a.localeCompare(b, "en"));

export function parametricTextFontStyles(name: SolidTextFont): SolidTextStyle[] {
  const variants = fontVariants[name];
  return (["light", "regular", "default", "bold", "italic", "bold-italic"] as const)
    .filter((style) => style === "default" || style === "italic" || Boolean(variants?.[style]));
}

export function parametricTextOriginalStyle(name: SolidTextFont): SolidTextStyle {
  if (name === "Fredoka") return "light";
  return fontVariants[name]?.regular ? "bold" : "default";
}

function parametricWebFont(name: SolidTextFont, style: SolidTextStyle) {
  const variant = fontVariants[name]?.[style];
  const key = variant ? `${name}:${style}` : name;
  const cached = parsedFonts.get(key);
  if (cached) return cached;
  const font = fontLoader.parse(variant ?? PARAMETRIC_WEB_FONT_DATA[name]);
  parsedFonts.set(key, font);
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

function cachedTextGlyph(fontName: SolidTextFont, style: SolidTextStyle, font: Font, character: string): TextGlyph | null {
  const key = `${fontName}:${style}:${character}`;
  const cached = cachedGlyphs.get(key);
  if (cached) return cached;
  const shapes = font.generateShapes(character, 1);
  const loops = shapes.flatMap((shape) => [shape, ...shape.holes]);
  const bounds = loops.flatMap((loop) => loop.getPoints(5));
  const points = bounds.flat();
  if (!points.length) return null;
  // Families without a separate italic face can use a slanted outline.
  const shear = style === "italic" && !fontVariants[fontName]?.italic ? 0.22 : 0;
  const slant = (point: Vector2) => point.clone().setX(point.x + point.y * shear);
  const outline = loops.map((loop) => loop.curves.flatMap(textCurvePieces).filter((piece) => piece.start.distanceToSquared(piece.end) > 1e-14));
  const glyph = {
    loops: shear ? outline.map((loop) => loop.map((piece) => ({
      start: slant(piece.start), end: slant(piece.end),
      control1: piece.control1 && slant(piece.control1),
      control2: piece.control2 && slant(piece.control2),
    }))) : outline,
    minX: Math.min(...points.map((point) => point.x + point.y * shear)),
    maxX: Math.max(...points.map((point) => point.x + point.y * shear)),
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
  const style = normalized.style && parametricTextFontStyles(normalized.font).includes(normalized.style) ? normalized.style : "default";
  normalized.style = style === "default" ? undefined : style;
  const font = parametricWebFont(normalized.font, style);
  const size = Math.max(1, normalized.size);
  const profile: SketchProfile = { points: [], segments: [], circles: [], images: [], constraints: [], generator: normalized };
  let cursor = 0;
  for (const character of normalized.text) {
    if (/\s/.test(character)) { cursor += size * 0.38 + Math.max(0, normalized.spacing); continue; }
    const glyph = cachedTextGlyph(normalized.font, style, font, character);
    if (!glyph) { cursor += size * 0.55 + Math.max(0, normalized.spacing); continue; }
    const minX = glyph.minX * size;
    const maxX = glyph.maxX * size;
    for (const loop of glyph.loops) addCurveLoop(profile, loop, cursor - minX, size);
    cursor += Math.max(size * 0.2, maxX - minX) + Math.max(0, normalized.spacing);
  }
  if (!profile.segments.length) throw new Error("Enter at least one visible character.");
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
      object.name = "Text";
    }
  }
  const profile = parametricTextProfile({ kind: "text", text: "kerCAD", font: "Sans", size: 20, spacing: 1, align: "center", verticalAlign: "center" });
  const sketch = createDrawnSketchFeature(document.features.filter((feature) => feature.kind === "sketch" && feature.purpose === "user").length + 1, profile);
  sketch.objectId = objectId;
  sketch.name = "Text profile";
  sketch.visible = false;
  sketch.purpose = "primitive";
  const extrusion = createExtrudeFeature(sketch.id, document.features.filter((feature) => feature.kind === "extrude").length + 1, false);
  extrusion.objectId = objectId;
  extrusion.name = "Text";
  extrusion.distance = 4;
  extrusion.dependencies = [{ type: "feature", id: sketch.id }];
  document.features.push(sketch, extrusion);
  return { objectId, sketchId: sketch.id, extrusionId: extrusion.id };
}
