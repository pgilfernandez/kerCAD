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
  const attribute = geometry.getAttribute("position");
  const first = (i: number) => new THREE.Vector3().fromBufferAttribute(attribute, geometry.index ? geometry.index.getX(i) : i);
  const a = first(0), b = first(1), c = first(2);
  const normal = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 0, -1)));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const extent = box.getSize(new THREE.Vector3());
  const scale = size / Math.max(extent.x, extent.y, extent.z);
  const positions = geometry.getAttribute("position");
  const vertices: Array<[number, number, number]> = [];
  const vertexMap = new Map<string, number>();
  const remap: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const point: [number, number, number] = [(positions.getX(i) - center.x) * scale, (positions.getY(i) - center.y) * scale, (positions.getZ(i) - box.min.z) * scale];
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

export function platonicDimensions(type: PlatonicType, size: number) {
  const { vertices } = platonicPolyhedron(type, size);
  return {
    width: Math.max(...vertices.map((p) => p[0])) - Math.min(...vertices.map((p) => p[0])),
    depth: Math.max(...vertices.map((p) => p[1])) - Math.min(...vertices.map((p) => p[1])),
    height: Math.max(...vertices.map((p) => p[2])),
  };
}
