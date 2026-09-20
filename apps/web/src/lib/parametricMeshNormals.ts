/**
 * Keep OCCT's analytical (smooth) normals, oriented like the rendered triangles.
 * Its tessellator reverses triangle winding for reversed faces but can leave
 * their surface normals unchanged. Recomputing all normals would instead lose
 * exact tangency at fillet boundaries and introduce tessellation artifacts.
 */
export function orientedMeshNormals(positions: ArrayLike<number>, normals: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const geometric = new Float64Array(positions.length);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const abX = positions[b] - positions[a];
    const abY = positions[b + 1] - positions[a + 1];
    const abZ = positions[b + 2] - positions[a + 2];
    const acX = positions[c] - positions[a];
    const acY = positions[c + 1] - positions[a + 1];
    const acZ = positions[c + 2] - positions[a + 2];
    const x = abY * acZ - abZ * acY;
    const y = abZ * acX - abX * acZ;
    const z = abX * acY - abY * acX;
    if (!Number.isFinite(x + y + z)) continue;
    // Area-weighted reference direction, without welding vertices across faces.
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[i + corner] * 3;
      geometric[vertex] += x;
      geometric[vertex + 1] += y;
      geometric[vertex + 2] += z;
    }
  }

  const oriented = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    let x = normals[i];
    let y = normals[i + 1];
    let z = normals[i + 2];
    let length = Math.hypot(x, y, z);
    if (!Number.isFinite(length) || length === 0) {
      x = geometric[i];
      y = geometric[i + 1];
      z = geometric[i + 2];
      length = Math.hypot(x, y, z);
    }
    if (length === 0) continue; // Isolated or wholly degenerate vertex.
    const sign = x * geometric[i] + y * geometric[i + 1] + z * geometric[i + 2] < 0 ? -1 : 1;
    oriented[i] = sign * x / length;
    oriented[i + 1] = sign * y / length;
    oriented[i + 2] = sign * z / length;
  }
  return oriented;
}
