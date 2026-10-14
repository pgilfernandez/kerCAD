import * as THREE from "three";

/** Bake triangle/plane contours once; holes remain holes in the triangulated cap. */
export function sectionCapGeometry(body: THREE.Mesh, position: THREE.Vector3, rotation: THREE.Quaternion) {
  const vertices = body.geometry.getAttribute("position"), indices = body.geometry.index;
  if (!vertices) return null;
  body.updateMatrix();
  const matrix = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1)).invert().multiply(body.matrix);
  body.geometry.computeBoundingBox();
  const tolerance = Math.max(1e-5, (body.geometry.boundingBox?.getSize(new THREE.Vector3()).length() ?? 1) * 1e-6);
  const points = new Map<string, THREE.Vector2>();
  const neighbors = new Map<string, Set<string>>();
  const key = (point: THREE.Vector3) => `${Math.round(point.x / tolerance)},${Math.round(point.y / tolerance)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const count = indices?.count ?? vertices.count;
  for (let index = 0; index + 2 < count; index += 3) {
    for (const [point, offset] of [[a, 0], [b, 1], [c, 2]] as const) point.fromBufferAttribute(vertices, indices ? indices.getX(index + offset) : index + offset).applyMatrix4(matrix);
    const hits: THREE.Vector3[] = [];
    // A tiny consistent bias avoids ambiguous coplanar triangles/vertices.
    for (const [first, second] of [[a, b], [b, c], [c, a]]) {
      const firstZ = first.z - tolerance * .1, secondZ = second.z - tolerance * .1;
      if ((firstZ < 0) === (secondZ < 0)) continue;
      hits.push(first.clone().lerp(second, firstZ / (firstZ - secondZ)));
    }
    if (hits.length !== 2) continue;
    const first = key(hits[0]), second = key(hits[1]);
    if (first === second) continue;
    points.set(first, new THREE.Vector2(hits[0].x, hits[0].y)); points.set(second, new THREE.Vector2(hits[1].x, hits[1].y));
    if (!neighbors.has(first)) neighbors.set(first, new Set());
    if (!neighbors.has(second)) neighbors.set(second, new Set());
    neighbors.get(first)!.add(second); neighbors.get(second)!.add(first);
  }
  const rings: THREE.Vector2[][] = [];
  const visited = new Set<string>();
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    const ring: THREE.Vector2[] = [];
    let current = start, previous = "", closed = false;
    for (let step = 0; step <= neighbors.size; step++) {
      if (visited.has(current)) { closed = current === start; break; }
      visited.add(current); ring.push(points.get(current)!);
      const next = [...neighbors.get(current)!].find((candidate) => candidate !== previous);
      if (!next) break;
      previous = current; current = next;
    }
    if (closed && ring.length >= 3 && Math.abs(THREE.ShapeUtils.area(ring)) > tolerance ** 2) rings.push(ring);
  }
  const inside = (point: THREE.Vector2, ring: THREE.Vector2[]) => {
    let result = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const a = ring[index], b = ring[previous];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  const parents = rings.map((ring, index) => rings.map((parent, parentIndex) => ({ parentIndex, area: Math.abs(THREE.ShapeUtils.area(parent)) })).filter(({ parentIndex, area }) => parentIndex !== index && area > Math.abs(THREE.ShapeUtils.area(ring)) && inside(ring[0], rings[parentIndex])).sort((a, b) => a.area - b.area)[0]?.parentIndex ?? -1);
  const depth = (index: number): number => parents[index] < 0 ? 0 : 1 + depth(parents[index]);
  const positions: number[] = [], uv: number[] = [];
  rings.forEach((ring, index) => {
    if (depth(index) % 2) return;
    const holes = rings.filter((_, holeIndex) => parents[holeIndex] === index);
    const flat = [ring, ...holes].flat();
    for (const triangle of THREE.ShapeUtils.triangulateShape(ring, holes)) {
      for (const vertex of triangle) {
        const point = flat[vertex];
        const world = new THREE.Vector3(point.x, point.y, 0).applyQuaternion(rotation).add(position);
        positions.push(world.x, world.y, world.z); uv.push(point.x / 16, point.y / 16);
      }
    }
  });
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
