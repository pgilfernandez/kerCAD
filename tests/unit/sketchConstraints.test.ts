import { describe, expect, it } from "vitest";

import { sketchConstraintConflict, solveSketchConstraints } from "@/lib/sketchConstraints";
import type { SketchProfile } from "@/types/sketchforge";

function arcProfile(): SketchProfile {
  return {
    points: [
      { id: "start", x: 10, z: 0 },
      { id: "end", x: 0, z: 10 },
    ],
    segments: [{ id: "arc", startId: "start", endId: "end", kind: "arc", center: { x: 0, z: 0 }, clockwise: true }],
    circles: [],
    constraints: [],
  };
}

describe("sketch arc dimensions", () => {
  it("applies radius and sweep dimensions to the arc endpoints", () => {
    const profile = arcProfile();
    profile.constraints = [
      { id: "radius", kind: "arcRadius", segmentId: "arc", value: 20 },
      { id: "angle", kind: "arcAngle", segmentId: "arc", value: 180 },
    ];

    const solved = solveSketchConstraints(profile);

    expect(solved.points[0].x).toBeCloseTo(20);
    expect(solved.points[0].z).toBeCloseTo(0);
    expect(solved.points[1].x).toBeCloseTo(-20);
    expect(solved.points[1].z).toBeCloseTo(0);
  });

  it("treats an arc diameter as twice its solved radius", () => {
    const profile = arcProfile();
    profile.constraints = [{ id: "diameter", kind: "arcDiameter", segmentId: "arc", value: 30 }];

    const solved = solveSketchConstraints(profile);

    expect(Math.hypot(solved.points[0].x, solved.points[0].z)).toBeCloseTo(15);
    expect(Math.hypot(solved.points[1].x, solved.points[1].z)).toBeCloseTo(15);
  });

  it("rejects conflicting radial dimensions and invalid sweep angles", () => {
    const profile = arcProfile();
    profile.constraints = [{ id: "radius", kind: "arcRadius", segmentId: "arc", value: 10 }];

    expect(sketchConstraintConflict(profile, { id: "diameter", kind: "arcDiameter", segmentId: "arc", value: 20 })).toContain("radius");
    expect(sketchConstraintConflict(profile, { id: "angle", kind: "arcAngle", segmentId: "arc", value: 360 })).toContain("between 0° and 360°");
  });
});
