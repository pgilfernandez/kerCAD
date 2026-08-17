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

export function operationPreviewStyle(_mode: "add" | "hole" | "common", _historical: boolean) {
  return { fillOpacity: null, wireframe: true };
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
