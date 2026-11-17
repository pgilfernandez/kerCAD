import type { SketchProfile } from "@/types/sketchforge";

/** Editable closed four-cubic approximation of an ellipse. */
export function sketchEllipse(center: { x: number; z: number }, corner: { x: number; z: number }): SketchProfile | null {
  const rx = Math.abs(corner.x - center.x), ry = Math.abs(corner.z - center.z);
  if (rx < .001 || ry < .001) return null;
  const k = 4 * (Math.sqrt(2) - 1) / 3;
  const points = Array.from({ length: 4 }, (_, i) => {
    const angle = i * Math.PI / 2;
    const x = center.x + rx * Math.cos(angle), z = center.z + ry * Math.sin(angle);
    const dx = -rx * Math.sin(angle) * k, dz = ry * Math.cos(angle) * k;
    return { id: `ellipse-point-${i}`, x, z, mode: "smooth" as const, handleIn: { x: x - dx, z: z - dz }, handleOut: { x: x + dx, z: z + dz } };
  });
  return { points, segments: points.map((point, i) => ({ id: `ellipse-segment-${i}`, startId: point.id, endId: points[(i + 1) % 4].id, kind: "bezier" as const })), constraints: [] };
}
