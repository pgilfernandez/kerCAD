export type TubeSection = { outerRadius: number; radius2: number; innerRadius: number; elliptical: boolean };
export type TubeSectionParameter = "outerRadius" | "radius2" | "thickness";

export function tubeMinimumCurvatureRadius(rx: number, ry: number) {
  return Math.min(rx, ry) ** 2 / Math.max(rx, ry);
}

/** Offset along the ellipse's unit normal, not along its parameter-space radius. */
export function tubeSectionPoint(rx: number, ry: number, angle: number, inset = 0): [number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  const nx = c / rx, ny = s / ry, length = Math.hypot(nx, ny);
  return [rx * c - inset * nx / length, ry * s - inset * ny / length];
}

export function tubeWireframePositions(section: TubeSection, height: number, scaleX: number, scaleY: number, segments = 64) {
  const positions: number[] = [];
  const { outerRadius: rx, radius2: ry, innerRadius } = section;
  const top = height / 2, bottom = -top;
  for (const inset of [0, rx - innerRadius]) {
    const points = Array.from({ length: segments }, (_, index) => {
      const [x, y] = tubeSectionPoint(rx, ry, index / segments * 2 * Math.PI, inset);
      return [x * scaleX, y * scaleY] as const;
    });
    points.forEach(([x, y], index) => {
      const [nextX, nextY] = points[(index + 1) % segments];
      for (const z of [bottom, top]) positions.push(x, y, z, nextX, nextY, z);
    });
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const [x, y] = tubeSectionPoint(rx, ry, angle, inset);
      positions.push(x * scaleX, y * scaleY, bottom, x * scaleX, y * scaleY, top);
    }
  }
  return positions;
}

export function resizeTubeSection(section: TubeSection, parameter: TubeSectionParameter, value: number): TubeSection {
  let { outerRadius, radius2, elliptical } = section;
  let thickness = Math.max(0.1, outerRadius - section.innerRadius);
  // Keep the inward parallel curve regular: it develops cusps at the
  // minimum radius of curvature. Leave a small clearance from that limit.
  const clearance = 0.1;
  if (parameter === "thickness") {
    thickness = Math.min(Math.max(0.1, value), Math.max(0.1, tubeMinimumCurvatureRadius(outerRadius, radius2) - clearance));
  } else if (!elliptical) {
    if (parameter === "outerRadius") outerRadius = radius2 = Math.max(thickness + clearance, value);
  } else {
    const other = parameter === "outerRadius" ? radius2 : outerRadius;
    const limit = Math.min(thickness + clearance, other);
    const radius = Math.max(Math.sqrt(limit * other), Math.min(value, other ** 2 / limit));
    if (parameter === "outerRadius") outerRadius = radius;
    else radius2 = radius;
  }
  return { outerRadius, radius2, innerRadius: outerRadius - thickness, elliptical };
}
