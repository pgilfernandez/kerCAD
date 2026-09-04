import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { viewportSelectionBounds, type ViewportBoundsSelection } from "@/lib/viewportBounds";

function selection(overrides: Partial<ViewportBoundsSelection> = {}): ViewportBoundsSelection {
  return { x: 10, y: 20, baseZ: 3, width: 8, depth: 4, height: 6, rotation: 0, ...overrides };
}

describe("viewport selection bounds", () => {
  it("uses the selected geometry instead of its visual helpers", () => {
    const bounds = viewportSelectionBounds(selection());
    expect(bounds.min.toArray()).toEqual([6, 18, 3]);
    expect(bounds.max.toArray()).toEqual([14, 22, 9]);
  });

  it("includes the selected operation rotation", () => {
    const bounds = viewportSelectionBounds(selection({ rotation: 90 }));
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeCloseTo(4, 5);
    expect(size.y).toBeCloseTo(8, 5);
  });
});
