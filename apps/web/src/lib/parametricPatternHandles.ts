import { Vector3 } from "three";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import type { ParametricObject, ParametricVector3 } from "@/types/parametric";

/** Pattern axes are object-local; manipulators use CAD world coordinates. */
export function patternHandlePlacement(object: ParametricObject, axis: "x" | "y" | "z", center: ParametricVector3 = { x: 0, y: 0, z: 0 }) {
  const matrix = parametricTransformMatrix(object.transform);
  const origin = new Vector3(center.x, center.y, center.z).applyMatrix4(matrix);
  const direction = new Vector3(center.x + (axis === "x" ? 1 : 0), center.y + (axis === "y" ? 1 : 0), center.z + (axis === "z" ? 1 : 0)).applyMatrix4(matrix).sub(origin);
  const valueScale = direction.length();
  direction.normalize();
  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    direction: { x: direction.x, y: direction.y, z: direction.z },
    valueScale,
  };
}
