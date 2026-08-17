import { describe, expect, it } from "vitest";
import { topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";
import { createParametricClassroomScene } from "../fixtures/parametricClassroomScene";

describe("parametric classroom performance fixture", () => {
  it("contains a deterministic history with additive and subtractive operations", () => {
    const document = createParametricClassroomScene();
    const operations = document.features.filter((feature) => feature.kind === "extrude");

    expect(document.objects).toHaveLength(12);
    expect(document.features).toHaveLength(72);
    expect(operations.filter((feature) => feature.operation === "add")).toHaveLength(24);
    expect(operations.filter((feature) => feature.operation === "cut")).toHaveLength(12);
    expect(topologicallySortedParametricFeatures(document)).toHaveLength(72);
  });
});
