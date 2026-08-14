export function operationPreviewWireframePositions(shape: "box" | "cylinder", width: number, depth: number, height: number) {
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
  const segments = 64;
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const nextAngle = (index + 1) / segments * Math.PI * 2;
    for (const z of [bottom, top]) {
      addSegment(
        Math.cos(angle) * halfWidth,
        Math.sin(angle) * halfDepth,
        z,
        Math.cos(nextAngle) * halfWidth,
        Math.sin(nextAngle) * halfDepth,
        z,
      );
    }
  }
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const x = Math.cos(angle) * halfWidth;
    const y = Math.sin(angle) * halfDepth;
    addSegment(x, y, bottom, x, y, top);
  }
  return positions;
}
