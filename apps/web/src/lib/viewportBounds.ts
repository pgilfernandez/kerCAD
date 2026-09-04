import { Box3, Euler, MathUtils, Quaternion, Vector3 } from "three";

export type ViewportBoundsSelection = {
  x: number;
  y: number;
  baseZ: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  center?: { x: number; y: number; z: number };
  rotation3d?: { x: number; y: number; z: number };
};

export function viewportSelectionBounds(selection: ViewportBoundsSelection) {
  const center = new Vector3(
    selection.center?.x ?? selection.x,
    selection.center?.y ?? selection.y,
    selection.center?.z ?? selection.baseZ + selection.height / 2,
  );
  const rotation = new Quaternion().setFromEuler(new Euler(
    MathUtils.degToRad(selection.rotation3d?.x ?? 0),
    MathUtils.degToRad(selection.rotation3d?.y ?? 0),
    MathUtils.degToRad(selection.rotation3d?.z ?? selection.rotation),
    "ZYX",
  ));
  const half = new Vector3(
    Math.abs(selection.width) / 2,
    Math.abs(selection.depth) / 2,
    Math.abs(selection.height) / 2,
  );
  const bounds = new Box3();
  for (const x of [-half.x, half.x]) {
    for (const y of [-half.y, half.y]) {
      for (const z of [-half.z, half.z]) {
        bounds.expandByPoint(new Vector3(x, y, z).applyQuaternion(rotation).add(center));
      }
    }
  }
  return bounds;
}
