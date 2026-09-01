import type { RenderMesh } from "@/types/parametric";

function writeNormal(view: DataView, offset: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  view.setFloat32(offset, nx / length, true);
  view.setFloat32(offset + 4, ny / length, true);
  view.setFloat32(offset + 8, nz / length, true);
}

export function binaryStlFromRenderMeshes(meshes: RenderMesh[], name = "eduCAD model") {
  if (meshes.length === 0) throw new Error("No hay objetos visibles que exportar.");
  let triangleCount = 0;
  for (const mesh of meshes) {
    if (mesh.indices.length % 3 !== 0) throw new Error("The mesh contains incomplete indices.");
    triangleCount += mesh.indices.length / 3;
  }
  if (triangleCount === 0) throw new Error("Visible objects do not contain exportable triangles.");
  if (triangleCount > 0xffffffff) throw new Error("The mesh exceeds the STL format limit.");

  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const bytes = new Uint8Array(buffer);
  const header = new TextEncoder().encode(name.slice(0, 80));
  bytes.set(header.subarray(0, 80), 0);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (const mesh of meshes) {
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const ai = mesh.indices[index] * 3;
      const bi = mesh.indices[index + 1] * 3;
      const ci = mesh.indices[index + 2] * 3;
      if (ci + 2 >= mesh.positions.length || bi + 2 >= mesh.positions.length || ai + 2 >= mesh.positions.length) {
        throw new Error("The mesh contains an invalid vertex reference.");
      }
      const ax = mesh.positions[ai]; const ay = mesh.positions[ai + 1]; const az = mesh.positions[ai + 2];
      const bx = mesh.positions[bi]; const by = mesh.positions[bi + 1]; const bz = mesh.positions[bi + 2];
      const cx = mesh.positions[ci]; const cy = mesh.positions[ci + 1]; const cz = mesh.positions[ci + 2];
      if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) throw new Error("The mesh contains invalid coordinates.");
      writeNormal(view, offset, ax, ay, az, bx, by, bz, cx, cy, cz);
      offset += 12;
      for (const value of [ax, ay, az, bx, by, bz, cx, cy, cz]) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }
  return buffer;
}
