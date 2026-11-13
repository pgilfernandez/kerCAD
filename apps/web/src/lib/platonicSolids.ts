import * as THREE from "three";

export const platonicTypes = ["tetrahedron", "cube", "octahedron", "dodecahedron", "icosahedron"] as const;
export type PlatonicType = typeof platonicTypes[number];

/** Canonical regular polyhedra; size is the largest bounding-box dimension. */
export function platonicPolyhedron(type: PlatonicType, size: number) {
  const geometry = type === "cube" ? new THREE.BoxGeometry(2, 2, 2)
    : type === "tetrahedron" ? new THREE.TetrahedronGeometry(1, 0)
    : type === "octahedron" ? new THREE.OctahedronGeometry(1, 0)
    : type === "dodecahedron" ? new THREE.DodecahedronGeometry(1, 0)
    : new THREE.IcosahedronGeometry(1, 0);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const extent = box.getSize(new THREE.Vector3());
  const scale = size / Math.max(extent.x, extent.y, extent.z);
  const positions = geometry.getAttribute("position");
  const vertices: Array<[number, number, number]> = [];
  const vertexMap = new Map<string, number>();
  const remap: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const point: [number, number, number] = [positions.getX(i) * scale, positions.getY(i) * scale, (positions.getZ(i) - box.min.z) * scale];
    const key = point.map((v) => v.toFixed(8)).join(",");
    let index = vertexMap.get(key);
    if (index === undefined) { index = vertices.length; vertices.push(point); vertexMap.set(key, index); }
    remap.push(index);
  }
  const faces: number[][] = [];
  const indices = geometry.index;
  const count = indices?.count ?? positions.count;
  for (let i = 0; i < count; i += 3) faces.push([0, 1, 2].map((j) => remap[indices ? indices.getX(i + j) : i + j]));
  geometry.dispose();
  return { vertices, faces };
}
