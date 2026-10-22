import { Box3, Vector3 } from "three";
import type { ParametricVector3, RenderMesh } from "@/types/parametric";

// Mesh coordinates already include object transforms. Cache per immutable
// position buffer so camera/UI updates never rescan tessellated geometry.
const cachedBounds = new WeakMap<Float32Array, Box3>();
export function workplaneGeometryBounds(meshes: RenderMesh[]) {
  const bounds = new Box3();
  for (const mesh of meshes) {
    let box = cachedBounds.get(mesh.positions);
    if (!box) {
      box = new Box3();
      const point = new Vector3();
      for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
        point.set(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
        if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) box.expandByPoint(point);
      }
      cachedBounds.set(mesh.positions, box);
    }
    bounds.union(box);
  }
  return bounds.isEmpty() ? null : bounds;
}

export function automaticWorkplaneSize(bounds: Box3 | null, xAxis: ParametricVector3, yAxis: ParametricVector3) {
  if (!bounds) return { width: 40, depth: 40 };
  const size = bounds.getSize(new Vector3());
  const projected = (axis: ParametricVector3) => Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z;
  // A flat model still needs a usable plane when viewed edge-on.
  const minimum = Math.max(1, Math.max(size.x, size.y, size.z) * 0.05);
  const side = Math.max(minimum, projected(xAxis), projected(yAxis)) * 1.2;
  return { width: side, depth: side };
}
