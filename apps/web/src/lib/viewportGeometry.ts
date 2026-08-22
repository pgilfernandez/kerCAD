export function operationPreviewWireframePositions(shape: "box" | "cylinder" | "sphere" | "cone" | "tube" | "halfSphere" | "torus" | "pyramid" | "wedge" | "roof" | "roundRoof" | "polygon" | "gear", width: number, depth: number, height: number, topWidth = width, innerWidth = 0, profileInsetWidth = 0, radialSegments = 64) {
  const positions: number[] = [];
  const addSegment = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => positions.push(x1, y1, z1, x2, y2, z2);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const bottom = -height / 2;
  const top = height / 2;
  if (shape === "box") {
    for (const z of [bottom, top]) {
      addSegment(-halfWidth, -halfDepth, z, halfWidth, -halfDepth, z);
      addSegment(halfWidth, -halfDepth, z, halfWidth, halfDepth, z);
      addSegment(halfWidth, halfDepth, z, -halfWidth, halfDepth, z);
      addSegment(-halfWidth, halfDepth, z, -halfWidth, -halfDepth, z);
    }
    for (const [x, y] of [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]] as const) {
      addSegment(x, y, bottom, x, y, top);
    }
    return positions;
  }
  if (shape === "pyramid") {
    const base = [[-halfWidth, -halfDepth, bottom], [halfWidth, -halfDepth, bottom], [halfWidth, halfDepth, bottom], [-halfWidth, halfDepth, bottom]] as const;
    for (let index = 0; index < 4; index += 1) {
      const start = base[index];
      const end = base[(index + 1) % 4];
      addSegment(...start, ...end);
      addSegment(...start, 0, 0, top);
    }
    return positions;
  }
  if (shape === "wedge") {
    const points = [
      [-halfWidth, -halfDepth, bottom], [halfWidth, -halfDepth, bottom], [-halfWidth, -halfDepth, top],
      [-halfWidth, halfDepth, bottom], [halfWidth, halfDepth, bottom], [-halfWidth, halfDepth, top],
    ] as const;
    for (const [start, end] of [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]] as const) {
      const a = points[start];
      const b = points[end];
      addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    return positions;
  }
  if (shape === "roof") {
    const points = [
      [-halfWidth, -halfDepth, bottom], [halfWidth, -halfDepth, bottom], [0, -halfDepth, top],
      [-halfWidth, halfDepth, bottom], [halfWidth, halfDepth, bottom], [0, halfDepth, top],
    ] as const;
    for (const [start, end] of [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]] as const) {
      const a = points[start];
      const b = points[end];
      addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    return positions;
  }
  if (shape === "polygon") {
    const sides = Math.min(32, Math.max(3, Math.round(radialSegments)));
    for (let index = 0; index < sides; index += 1) {
      const angle = index / sides * Math.PI * 2;
      const nextAngle = (index + 1) / sides * Math.PI * 2;
      for (const z of [bottom, top]) addSegment(Math.cos(angle) * halfWidth, Math.sin(angle) * halfDepth, z, Math.cos(nextAngle) * halfWidth, Math.sin(nextAngle) * halfDepth, z);
      addSegment(Math.cos(angle) * halfWidth, Math.sin(angle) * halfDepth, bottom, Math.cos(angle) * halfWidth, Math.sin(angle) * halfDepth, top);
    }
    return positions;
  }
  const segments = 64;
  if (shape === "gear") {
    const teeth = Math.min(64, Math.max(6, Math.round(radialSegments)));
    const rootWidth = Math.max(0.2, width - profileInsetWidth * 2);
    const rootDepth = Math.max(0.2, depth - profileInsetWidth * 2);
    const outlineCount = teeth * 4;
    const point = (index: number, z: number) => {
      const phase = index % 4;
      const outer = phase === 1 || phase === 2;
      const angle = index / outlineCount * Math.PI * 2;
      return [Math.cos(angle) * (outer ? halfWidth : rootWidth / 2), Math.sin(angle) * (outer ? halfDepth : rootDepth / 2), z] as const;
    };
    for (let index = 0; index < outlineCount; index += 1) {
      const next = (index + 1) % outlineCount;
      const lower = point(index, bottom);
      const lowerNext = point(next, bottom);
      const upper = point(index, top);
      const upperNext = point(next, top);
      addSegment(...lower, ...lowerNext);
      addSegment(...upper, ...upperNext);
      addSegment(...lower, ...upper);
    }
    if (innerWidth > 0) {
      const innerRadius = innerWidth / 2;
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI * 2;
        const nextAngle = (index + 1) / segments * Math.PI * 2;
        for (const z of [bottom, top]) addSegment(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, z, Math.cos(nextAngle) * innerRadius, Math.sin(nextAngle) * innerRadius, z);
      }
    }
    return positions;
  }
  if (shape === "roundRoof") {
    for (const y of [-halfDepth, halfDepth]) {
      addSegment(-halfWidth, y, bottom, halfWidth, y, bottom);
      for (let index = 0; index < segments; index += 1) {
        const angle = Math.PI - index / segments * Math.PI;
        const nextAngle = Math.PI - (index + 1) / segments * Math.PI;
        addSegment(Math.cos(angle) * halfWidth, y, bottom + Math.sin(angle) * height, Math.cos(nextAngle) * halfWidth, y, bottom + Math.sin(nextAngle) * height);
      }
    }
    addSegment(-halfWidth, -halfDepth, bottom, -halfWidth, halfDepth, bottom);
    addSegment(halfWidth, -halfDepth, bottom, halfWidth, halfDepth, bottom);
    addSegment(0, -halfDepth, top, 0, halfDepth, top);
    return positions;
  }
  if (shape === "sphere") {
    for (const plane of ["xy", "xz", "yz"] as const) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI * 2;
        const nextAngle = (index + 1) / segments * Math.PI * 2;
        const point = (value: number) => plane === "xy"
          ? [Math.cos(value) * halfWidth, Math.sin(value) * halfDepth, 0]
          : plane === "xz"
            ? [Math.cos(value) * halfWidth, 0, Math.sin(value) * height / 2]
            : [0, Math.cos(value) * halfDepth, Math.sin(value) * height / 2];
        const start = point(angle);
        const end = point(nextAngle);
        addSegment(start[0], start[1], start[2], end[0], end[1], end[2]);
      }
    }
    return positions;
  }
  if (shape === "halfSphere") {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const nextAngle = (index + 1) / segments * Math.PI * 2;
      addSegment(Math.cos(angle) * halfWidth, Math.sin(angle) * halfDepth, bottom, Math.cos(nextAngle) * halfWidth, Math.sin(nextAngle) * halfDepth, bottom);
    }
    for (const direction of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI / 2;
        const nextAngle = (index + 1) / segments * Math.PI / 2;
        addSegment(
          Math.cos(direction) * halfWidth * Math.cos(angle),
          Math.sin(direction) * halfDepth * Math.cos(angle),
          bottom + height * Math.sin(angle),
          Math.cos(direction) * halfWidth * Math.cos(nextAngle),
          Math.sin(direction) * halfDepth * Math.cos(nextAngle),
          bottom + height * Math.sin(nextAngle),
        );
      }
    }
    return positions;
  }
  if (shape === "torus") {
    const minorX = height / 2;
    const minorY = height / 2;
    const majorX = Math.max(0.01, halfWidth - minorX);
    const majorY = Math.max(0.01, halfDepth - minorY);
    for (const radialSign of [-1, 1]) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI * 2;
        const nextAngle = (index + 1) / segments * Math.PI * 2;
        addSegment(
          Math.cos(angle) * (majorX + radialSign * minorX), Math.sin(angle) * (majorY + radialSign * minorY), 0,
          Math.cos(nextAngle) * (majorX + radialSign * minorX), Math.sin(nextAngle) * (majorY + radialSign * minorY), 0,
        );
      }
    }
    for (const direction of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI * 2;
        const nextAngle = (index + 1) / segments * Math.PI * 2;
        const point = (value: number) => [
          Math.cos(direction) * (majorX + Math.cos(value) * minorX),
          Math.sin(direction) * (majorY + Math.cos(value) * minorY),
          Math.sin(value) * height / 2,
        ];
        const start = point(angle);
        const end = point(nextAngle);
        addSegment(start[0], start[1], start[2], end[0], end[1], end[2]);
      }
    }
    return positions;
  }
  const topHalfWidth = shape === "cone" ? topWidth / 2 : halfWidth;
  const topHalfDepth = shape === "cone" ? topWidth / 2 : halfDepth;
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const nextAngle = (index + 1) / segments * Math.PI * 2;
    addSegment(Math.cos(angle) * halfWidth, Math.sin(angle) * halfDepth, bottom, Math.cos(nextAngle) * halfWidth, Math.sin(nextAngle) * halfDepth, bottom);
    addSegment(Math.cos(angle) * topHalfWidth, Math.sin(angle) * topHalfDepth, top, Math.cos(nextAngle) * topHalfWidth, Math.sin(nextAngle) * topHalfDepth, top);
  }
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    addSegment(Math.cos(angle) * halfWidth, Math.sin(angle) * halfDepth, bottom, Math.cos(angle) * topHalfWidth, Math.sin(angle) * topHalfDepth, top);
  }
  if (shape === "tube" && innerWidth > 0) {
    const innerRadius = innerWidth / 2;
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const nextAngle = (index + 1) / segments * Math.PI * 2;
      for (const z of [bottom, top]) {
        addSegment(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, z, Math.cos(nextAngle) * innerRadius, Math.sin(nextAngle) * innerRadius, z);
      }
    }
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      addSegment(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, bottom, Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, top);
    }
  }
  return positions;
}

export function coplanarFaceRegion(
  coordinates: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  faceIndex: number,
  tolerance = 1e-4,
) {
  const vertexIndex = (corner: number) => indices ? indices[corner] : corner;
  const vertex = (corner: number) => {
    const index = vertexIndex(corner) * 3;
    return { x: coordinates[index], y: coordinates[index + 1], z: coordinates[index + 2] };
  };
  const cross = (a: ReturnType<typeof vertex>, b: ReturnType<typeof vertex>, c: ReturnType<typeof vertex>) => ({
    x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
    y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
    z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
  });
  const first = faceIndex * 3;
  const anchor = vertex(first);
  const initialCross = cross(anchor, vertex(first + 1), vertex(first + 2));
  const initialLength = Math.hypot(initialCross.x, initialCross.y, initialCross.z);
  if (!Number.isFinite(initialLength) || initialLength < 1e-12) return null;
  const normal = { x: initialCross.x / initialLength, y: initialCross.y / initialLength, z: initialCross.z / initialLength };
  const candidates: Array<{
    triangle: number;
    vertices: Array<ReturnType<typeof vertex>>;
    area: number;
    centroid: { x: number; y: number; z: number };
  }> = [];
  const triangleCount = Math.floor((indices?.length ?? coordinates.length / 3) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const vertices = [vertex(offset), vertex(offset + 1), vertex(offset + 2)];
    const triangleCross = cross(vertices[0], vertices[1], vertices[2]);
    const crossLength = Math.hypot(triangleCross.x, triangleCross.y, triangleCross.z);
    if (crossLength < 1e-12) continue;
    const alignment = (triangleCross.x * normal.x + triangleCross.y * normal.y + triangleCross.z * normal.z) / crossLength;
    const coplanar = vertices.every((point) => Math.abs(
      normal.x * (point.x - anchor.x) + normal.y * (point.y - anchor.y) + normal.z * (point.z - anchor.z),
    ) <= tolerance);
    if (alignment < 0.9999 || !coplanar) continue;
    candidates.push({
      triangle,
      vertices,
      area: crossLength / 2,
      centroid: {
      x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
      y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
      z: (vertices[0].z + vertices[1].z + vertices[2].z) / 3,
      },
    });
  }
  const selectedCandidate = candidates.findIndex((candidate) => candidate.triangle === faceIndex);
  if (selectedCandidate < 0) return null;
  const pointKey = (point: ReturnType<typeof vertex>) => [point.x, point.y, point.z].map((value) => Math.round(value / tolerance)).join(":");
  const edgeKey = (a: ReturnType<typeof vertex>, b: ReturnType<typeof vertex>) => [pointKey(a), pointKey(b)].sort().join("|");
  const edges = new Map<string, number[]>();
  candidates.forEach((candidate, candidateIndex) => {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const key = edgeKey(candidate.vertices[a], candidate.vertices[b]);
      const connected = edges.get(key) ?? [];
      connected.push(candidateIndex);
      edges.set(key, connected);
    }
  });
  const connected = new Set([selectedCandidate]);
  const queue = [selectedCandidate];
  while (queue.length > 0) {
    const candidateIndex = queue.pop()!;
    const candidate = candidates[candidateIndex];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      for (const neighbor of edges.get(edgeKey(candidate.vertices[a], candidate.vertices[b])) ?? []) {
        if (connected.has(neighbor)) continue;
        connected.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  const positions: number[] = [];
  const weighted = { x: 0, y: 0, z: 0 };
  let totalArea = 0;
  for (const candidateIndex of connected) {
    const candidate = candidates[candidateIndex];
    weighted.x += candidate.centroid.x * candidate.area;
    weighted.y += candidate.centroid.y * candidate.area;
    weighted.z += candidate.centroid.z * candidate.area;
    totalArea += candidate.area;
    for (const point of candidate.vertices) positions.push(point.x, point.y, point.z);
  }
  if (totalArea < 1e-12) return null;
  return {
    positions,
    normal,
    centroid: { x: weighted.x / totalArea, y: weighted.y / totalArea, z: weighted.z / totalArea },
    area: totalArea,
  };
}

export function operationPreviewStyle(_mode: "add" | "hole" | "common", _historical: boolean) {
  return { fillOpacity: null, wireframe: true };
}

export function finalReferenceWireframeDepthTest(objectId: string | null, selectedObjectIds: readonly string[]) {
  return objectId === null || !selectedObjectIds.includes(objectId);
}

export function formatViewportDimension(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(2)).toString();
}

export type ViewportDimensionAxis = "x" | "y" | "z" | "rotation";

export function viewportDimensionsForHandle(resizeX: number, resizeY: number, resizeZ = false): ViewportDimensionAxis[] {
  if (resizeZ) return ["z"];
  return [resizeX !== 0 ? "x" as const : null, resizeY !== 0 ? "y" as const : null].filter((axis): axis is "x" | "y" => axis !== null);
}

export function constrainViewportResizeDimensions(
  startWidth: number,
  startDepth: number,
  resizeX: number,
  resizeY: number,
  requestedWidth: number,
  requestedDepth: number,
  aspectRatio?: number,
) {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return { width: requestedWidth, depth: requestedDepth };
  const widthChange = Math.abs(requestedWidth / Math.max(0.01, startWidth) - 1);
  const depthChange = Math.abs(requestedDepth / Math.max(0.01, startDepth) - 1);
  const widthDrivesResize = resizeY === 0 || (resizeX !== 0 && widthChange >= depthChange);
  return widthDrivesResize
    ? { width: requestedWidth, depth: requestedWidth / aspectRatio }
    : { width: requestedDepth * aspectRatio, depth: requestedDepth };
}

export function constrainViewportAxisDrag(
  start: { x: number; y: number; z: number },
  delta: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  step: number,
) {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-9) return { ...start };
  const unit = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const distance = delta.x * unit.x + delta.y * unit.y + delta.z * unit.z;
  const snappedDistance = Math.round(distance / Math.max(0.0001, step)) * Math.max(0.0001, step);
  return {
    x: start.x + unit.x * snappedDistance,
    y: start.y + unit.y * snappedDistance,
    z: start.z + unit.z * snappedDistance,
  };
}
