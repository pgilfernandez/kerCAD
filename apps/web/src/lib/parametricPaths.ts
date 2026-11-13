import type { GeneratedPath, ParametricVector3, SpiralType } from "@/types/parametric";

export const spiralTypes: SpiralType[] = ["archimedean", "logarithmic", "fibonacci", "hyperbolic", "fermat"];
const finite = (value: number, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizeGeneratedPath(path: GeneratedPath): GeneratedPath {
  const clockwise = path.clockwise === true;
  if (path.kind === "helix") return { kind: "helix", radius: finite(path.radius, 15, .1, 10000), pitch: finite(path.pitch, 10, .1, 10000), turns: finite(path.turns, 3, .1, 100), clockwise };
  const spiralType = spiralTypes.includes(path.spiralType) ? path.spiralType : "archimedean";
  const innerRadius = finite(path.innerRadius, 3, .1, 9999);
  return { kind: "spiral", spiralType, innerRadius, outerRadius: finite(path.outerRadius, Math.max(30, innerRadius + 1), spiralType === "fibonacci" ? .1 : innerRadius + .1, 10000), turns: finite(path.turns, 2, .25, spiralType === "fibonacci" ? 4 : 20), clockwise };
}

/** True Fibonacci quarter-circle construction (not a renamed golden spiral). */
export function fibonacciPathArcs(input: Extract<GeneratedPath, { kind: "spiral" }>) {
  const path = normalizeGeneratedPath(input) as typeof input;
  const quarterCount = Math.ceil(path.turns * 4);
  const arcs: Array<{ start: number; sweep: number; radius: number; x: number; y: number }> = [];
  let a = 1, b = 1, x = 1, y = 0;
  for (let index = 0; index < quarterCount; index++) {
    const radius = a, start = index * Math.PI / 2;
    const sweep = Math.min(1, path.turns * 4 - index) * Math.PI / 2;
    const cx = x - Math.cos(start) * radius, cy = y - Math.sin(start) * radius;
    arcs.push({ start, sweep, radius, x: cx, y: cy });
    x = cx + Math.cos(start + sweep) * radius; y = cy + Math.sin(start + sweep) * radius;
    [a, b] = [b, a + b];
  }
  let extent = 0;
  for (const arc of arcs) for (let i = 0; i <= 32; i++) {
    const angle = arc.start + arc.sweep * i / 32;
    extent = Math.max(extent, Math.hypot(arc.x + Math.cos(angle) * arc.radius, arc.y + Math.sin(angle) * arc.radius));
  }
  const scale = path.outerRadius / Math.max(.001, extent), sign = path.clockwise ? -1 : 1;
  return arcs.map((arc) => ({
    point: (t: number): ParametricVector3 => ({
      x: (arc.x + Math.cos(arc.start + arc.sweep * t) * arc.radius) * scale,
      y: (arc.y + Math.sin(arc.start + arc.sweep * t) * arc.radius) * scale * sign,
      z: 0,
    }),
  }));
}

export function generatedPathPoints(input: GeneratedPath): ParametricVector3[] {
  const path = normalizeGeneratedPath(input);
  if (path.kind === "spiral" && path.spiralType === "fibonacci") {
    return fibonacciPathArcs(path).flatMap((arc, index) => Array.from({ length: 33 }, (_, step) => arc.point(step / 32)).slice(index ? 1 : 0));
  }
  const steps = Math.min(4096, Math.max(64, Math.ceil(path.turns * 96)));
  const sign = path.clockwise ? -1 : 1;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps, angle = t * path.turns * Math.PI * 2 * sign;
    if (path.kind === "helix") return { x: Math.cos(angle) * path.radius, y: Math.sin(angle) * path.radius, z: path.pitch * path.turns * t };
    const a = path.innerRadius, b = path.outerRadius;
    // Linear radius (Archimedes), exponential radius, reciprocal radius,
    // and linear squared radius (Fermat), bounded away from singularities.
    const radius = path.spiralType === "logarithmic" ? a * (b / a) ** t
      : path.spiralType === "hyperbolic" ? 1 / ((1 - t) / a + t / b)
      : path.spiralType === "fermat" ? Math.sqrt(a * a + (b * b - a * a) * t)
      : a + (b - a) * t;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
  });
}
