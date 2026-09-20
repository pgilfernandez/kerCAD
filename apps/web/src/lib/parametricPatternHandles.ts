import { Vector3 } from "three";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import type { ParametricObject } from "@/types/parametric";

/** Pattern axes are object-local; manipulators use CAD world coordinates. */
export function patternHandlePlacement(object: ParametricObject, axis: "x" | "y" | "z") {
  const matrix = parametricTransformMatrix(object.transform);
  const origin = new Vector3().applyMatrix4(matrix);
  const direction = new Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0).applyMatrix4(matrix).sub(origin);
  const valueScale = direction.length();
  direction.normalize();
  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    direction: { x: direction.x, y: direction.y, z: direction.z },
    valueScale,
  };
}
