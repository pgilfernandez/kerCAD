import { describe, expect, it } from "vitest";
import { operationPreviewStyle, operationPreviewWireframePositions } from "@/lib/viewportGeometry";

describe("operation preview wireframes", () => {
  it("draws only the twelve structural edges of a box", () => {
    const positions = operationPreviewWireframePositions("box", 20, 10, 6);

    expect(positions).toHaveLength(12 * 6);
    expect(positions.slice(0, 6)).toEqual([-10, -5, -3, 10, -5, -3]);
  });

  it("draws two cylinder caps and four local-axis generators", () => {
    const positions = operationPreviewWireframePositions("cylinder", 20, 10, 6);
    const generators = positions.slice(-4 * 6);

    expect(positions).toHaveLength((64 * 2 + 4) * 6);
    expect(generators.slice(0, 6)).toEqual([10, 0, -3, 10, 0, 3]);
    expect(generators[7]).toBeCloseTo(5);
    expect(generators[8]).toBe(-3);
    expect(generators[11]).toBe(3);
  });
});

describe("operation preview styles", () => {
  it("adds only the simplified wireframe when inspecting the final operation", () => {
    expect(operationPreviewStyle("add", false)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("hole", false)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("common", false)).toEqual({ fillOpacity: null, wireframe: true });
  });

  it("keeps intermediate tools wireframe-only because the accumulated result supplies the fill", () => {
    expect(operationPreviewStyle("add", true)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("hole", true)).toEqual({ fillOpacity: null, wireframe: true });
    expect(operationPreviewStyle("common", true)).toEqual({ fillOpacity: null, wireframe: true });
  });
});
