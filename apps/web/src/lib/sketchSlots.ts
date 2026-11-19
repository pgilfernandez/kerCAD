import type { SketchProfile } from "@/types/workplane";

type Point = { x: number; z: number };

/** Ordinary closed sketch geometry; the preview and committed contour share this builder. */
export function sketchSlot(kind: "slot" | "arcSlot", picks: Point[]): SketchProfile | null {
  const arc = kind === "arcSlot";
  if (picks.length < (arc ? 4 : 3)) return null;
  const [a, b, c, d] = picks;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 0.001) return null;
  let corners: Point[];
  let centers: Array<Point | undefined>;
  let directions: boolean[];
  if (!arc) {
    const nx = -(b.z - a.z) / length;
    const nz = (b.x - a.x) / length;
    const halfWidth = Math.abs((c.x - a.x) * nx + (c.z - a.z) * nz);
    if (halfWidth < 0.001) return null;
    const offset = (p: Point, sign: number) => ({ x: p.x + sign * nx * halfWidth, z: p.z + sign * nz * halfWidth });
    corners = [offset(a, 1), offset(b, 1), offset(b, -1), offset(a, -1)];
    centers = [undefined, b, undefined, a];
    directions = [false, false, false, false];
  } else {
    const start = Math.atan2(b.z - a.z, b.x - a.x);
    const end = Math.atan2(c.z - a.z, c.x - a.x);
    const sweep = (end - start + Math.PI * 2) % (Math.PI * 2);
    if (Math.min(sweep, Math.PI * 2 - sweep) < 0.001) return null;
    const halfWidth = Math.abs(Math.hypot(d.x - a.x, d.z - a.z) - length);
    if (halfWidth < 0.001 || halfWidth >= length - 0.001) return null;
    const at = (angle: number, radius: number) => ({ x: a.x + Math.cos(angle) * radius, z: a.z + Math.sin(angle) * radius });
    const positive = sweep <= Math.PI;
    corners = [at(start, length + halfWidth), at(end, length + halfWidth), at(end, length - halfWidth), at(start, length - halfWidth)];
    centers = [a, at(end, length), a, at(start, length)];
    directions = [positive, positive, !positive, positive];
  }
  return {
    points: corners.map((point, index) => ({ ...point, id: `slot-point-${index}`, mode: "corner" })),
    segments: corners.map((_, index) => ({ id: `slot-segment-${index}`, startId: `slot-point-${index}`, endId: `slot-point-${(index + 1) % 4}`, kind: centers[index] ? "arc" : "line", ...(centers[index] ? { center: { ...centers[index]! }, clockwise: directions[index] } : {}) })),
  };
}
