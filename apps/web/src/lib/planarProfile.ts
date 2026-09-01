import { findSketchOutlineIntersection, type SketchOutlinePoint } from "@/lib/sketchProfileValidation";

export type PlanarProfileLoop<T = unknown> = {
  polygon: readonly SketchOutlinePoint[];
  payload: T;
};

export type PlanarProfileRegion<T = unknown> = {
  outer: PlanarProfileLoop<T>;
  holes: Array<PlanarProfileLoop<T>>;
  depth: number;
};

function signedArea(polygon: readonly SketchOutlinePoint[]) {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function pointInPolygon(point: SketchOutlinePoint, polygon: readonly SketchOutlinePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    if ((current.y > point.y) !== (prior.y > point.y) && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) inside = !inside;
  }
  return inside;
}

/**
 * Validates and classifies arbitrary closed 2D loops into filled regions,
 * holes and nested islands. This is shared by sketches and future outline
 * sources such as text, Scribble and direct SVG solids.
 */
export function classifyPlanarProfileLoops<T>(loops: readonly PlanarProfileLoop<T>[], label = "The profile"): Array<PlanarProfileRegion<T>> {
  if (!loops.length) throw new Error(`${label} does not contain a closed contour.`);
  for (const loop of loops) {
    if (loop.polygon.length < 3 || loop.polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error(`${label} contains an incomplete contour.`);
    if (Math.abs(signedArea(loop.polygon)) <= 1e-8) throw new Error(`${label} contains a contour with no area.`);
  }
  if (findSketchOutlineIntersection(loops.map((loop) => loop.polygon))) throw new Error(`${label} contains contours that intersect or touch.`);

  const classified = loops.map((loop) => ({ loop, area: Math.abs(signedArea(loop.polygon)), depth: 0 }));
  for (const entry of classified) {
    entry.depth = classified.filter((candidate) => candidate !== entry && candidate.area > entry.area && pointInPolygon(entry.loop.polygon[0], candidate.loop.polygon)).length;
  }
  return classified.filter((entry) => entry.depth % 2 === 0).map((entry) => ({
    outer: entry.loop,
    depth: entry.depth,
    holes: classified.filter((candidate) => candidate.depth === entry.depth + 1 && pointInPolygon(candidate.loop.polygon[0], entry.loop.polygon)).map((candidate) => candidate.loop),
  }));
}
