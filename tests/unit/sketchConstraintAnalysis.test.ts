import { describe, expect, it } from "vitest";

import { analyzeSketchConstraints, sketchConstraintRankGain } from "@/lib/sketchConstraintAnalysis";
import { solveSketchConstraints } from "@/lib/sketchConstraints";
import type { SketchProfile } from "@/types/workplane";

function lineProfile(): SketchProfile {
  return {
    points: [{ id: "start", x: 0, z: 0 }, { id: "end", x: 10, z: 4 }],
    segments: [{ id: "line", startId: "start", endId: "end", kind: "line" }],
    constraints: [],
  };
}

describe("numerical sketch constraint analysis", () => {
  it("computes degrees of freedom from the Jacobian rank", () => {
    const profile = lineProfile();
    expect(analyzeSketchConstraints(profile)).toMatchObject({ variableCount: 4, rank: 0, degreesOfFreedom: 4, status: "under" });

    profile.constraints = [{ id: "horizontal", kind: "horizontal", segmentId: "line" }];
    expect(analyzeSketchConstraints(profile)).toMatchObject({ rank: 1, degreesOfFreedom: 3, status: "over" });

    solveSketchConstraints(profile);
    expect(analyzeSketchConstraints(profile)).toMatchObject({ rank: 1, degreesOfFreedom: 3, status: "under" });
  });

  it("recognises a fully constrained line", () => {
    const profile = lineProfile();
    profile.constraints = [
      { id: "fixed", kind: "fixed", pointId: "start", x: 0, z: 0 },
      { id: "horizontal", kind: "horizontal", segmentId: "line" },
      { id: "length", kind: "distance", segmentId: "line", axis: "aligned", value: 10 },
    ];

    solveSketchConstraints(profile);

    expect(analyzeSketchConstraints(profile)).toMatchObject({ variableCount: 4, rank: 4, degreesOfFreedom: 0, status: "full" });
  });

  it("distinguishes redundant and contradictory zero-rank constraints", () => {
    const profile = lineProfile();
    profile.constraints = [{ id: "fixed", kind: "fixed", pointId: "start", x: 0, z: 0 }];

    expect(sketchConstraintRankGain(profile, { id: "same", kind: "fixed", pointId: "start", x: 0, z: 0 })).toMatchObject({ gain: 0, residual: 0 });
    expect(sketchConstraintRankGain(profile, { id: "different", kind: "fixed", pointId: "start", x: 2, z: 0 })).toMatchObject({ gain: 0, residual: 2 });
  });

  it("reports contradictory persisted constraints", () => {
    const profile = lineProfile();
    profile.constraints = [
      { id: "first", kind: "fixed", pointId: "start", x: 0, z: 0 },
      { id: "second", kind: "fixed", pointId: "start", x: 2, z: 0 },
    ];

    const analysis = analyzeSketchConstraints(profile);

    expect(analysis.status).toBe("over");
    expect(analysis.conflictingConstraintIds).toContain("second");
  });
});
