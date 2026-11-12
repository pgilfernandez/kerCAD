import * as THREE from "three";

/** Overlapping hit areas must select the nearest visible centre, not the
 * sphere whose invisible front surface happens to be closest to the camera. */
export function closestScreenHandleHit(
  hits: THREE.Intersection[],
  camera: THREE.Camera,
  pointer: { clientX: number; clientY: number },
  bounds: { left: number; top: number; width: number; height: number },
) {
  let closest: THREE.Intersection | undefined;
  let distance = Infinity;
  const position = new THREE.Vector3();
  for (const hit of hits) {
    hit.object.getWorldPosition(position).project(camera);
    const x = bounds.left + (position.x + 1) * bounds.width / 2;
    const y = bounds.top + (1 - position.y) * bounds.height / 2;
    const squared = (x - pointer.clientX) ** 2 + (y - pointer.clientY) ** 2;
    if (squared < distance || squared === distance && hit.distance < (closest?.distance ?? Infinity)) {
      closest = hit;
      distance = squared;
    }
  }
  return closest;
}
