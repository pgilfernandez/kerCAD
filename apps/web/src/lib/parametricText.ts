import { createDrawnSketchFeature, createExtrudeFeature } from "@/lib/parametricDocument";
import { createLocalId } from "@/lib/localIds";
import { addParametricObject } from "@/lib/parametricObjects";
import { objectPlacementForWorkplane } from "@/lib/parametricWorkplane";
import type { ParametricDocument, SketchFeature } from "@/types/parametric";
import type { SketchProfile } from "@/types/sketchforge";

export type ParametricTextSettings = NonNullable<SketchProfile["generator"]>;

const GLYPHS: Record<string, string[]> = Object.fromEntries(Object.entries({
  A: "01110/10001/10001/11111/10001/10001/10001", B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01111/10000/10000/10000/10000/10000/01111", D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111", F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01111/10000/10000/10111/10001/10001/01111", H: "10001/10001/10001/11111/10001/10001/10001",
  I: "11111/00100/00100/00100/00100/00100/11111", J: "00111/00010/00010/00010/10010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001", L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001", N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110", P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101", R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110", T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110", V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/10101/01010", X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100", Z: "11111/00001/00010/00100/01000/10000/11111",
  "0": "01110/10001/10011/10101/11001/10001/01110", "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00010/00100/01000/11111", "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "00010/00110/01010/10010/11111/00010/00010", "5": "11111/10000/10000/11110/00001/00001/11110",
  "6": "01110/10000/10000/11110/10001/10001/01110", "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110", "9": "01110/10001/10001/01111/00001/00001/01110",
  "-": "00000/00000/00000/11111/00000/00000/00000", ".": "00000/00000/00000/00000/00000/00110/00110",
  "?": "01110/10001/00001/00010/00100/00000/00100",
}).map(([character, rows]) => [character, rows.split("/")]));

function addRectangle(profile: SketchProfile, x: number, z: number, width: number, height: number) {
  const points = [
    { id: createLocalId("text-point"), x, z },
    { id: createLocalId("text-point"), x: x + width, z },
    { id: createLocalId("text-point"), x: x + width, z: z + height },
    { id: createLocalId("text-point"), x, z: z + height },
  ];
  profile.points.push(...points);
  for (let index = 0; index < 4; index += 1) profile.segments.push({ id: createLocalId("text-segment"), kind: "line", startId: points[index].id, endId: points[(index + 1) % 4].id });
}

export function parametricTextProfile(settings: ParametricTextSettings): SketchProfile {
  const text = settings.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().slice(0, 40);
  const unit = Math.max(1, settings.size) / 7;
  const advance = 6 * unit + Math.max(0, settings.spacing);
  const totalWidth = Math.max(0, text.length * advance - unit - Math.max(0, settings.spacing));
  const originX = settings.align === "center" ? -totalWidth / 2 : settings.align === "right" ? -totalWidth : 0;
  const profile: SketchProfile = { points: [], segments: [], circles: [], images: [], constraints: [], generator: { ...settings, text } };
  for (const [characterIndex, character] of [...text].entries()) {
    if (character === " ") continue;
    const rows = GLYPHS[character] ?? GLYPHS["?"];
    for (const [rowIndex, row] of rows.entries()) {
      let column = 0;
      while (column < row.length) {
        if (row[column] !== "1") { column += 1; continue; }
        const start = column;
        while (column < row.length && row[column] === "1") column += 1;
        addRectangle(profile, originX + characterIndex * advance + start * unit, (6 - rowIndex) * unit, (column - start - 0.14) * unit, 0.86 * unit);
      }
    }
  }
  if (!profile.segments.length) throw new Error("Escribe al menos un carácter visible.");
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
  const profile = parametricTextProfile({ kind: "text", text: "eduCAD", size: 20, spacing: 1, align: "left" });
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
