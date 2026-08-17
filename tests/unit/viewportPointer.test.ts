import { describe, expect, it } from "vitest";
import { orthographicTouchTargetWorldSize, perspectiveTouchTargetWorldSize, viewportPointerDragIntent } from "@/lib/viewportPointer";

describe("viewport pointer gesture intent", () => {
  it("keeps short movements as taps for every pointer type", () => {
    expect(viewportPointerDragIntent("mouse", 5)).toBe("pending");
    expect(viewportPointerDragIntent("pen", 3)).toBe("pending");
    expect(viewportPointerDragIntent("touch", 4)).toBe("pending");
  });

  it("uses mouse and pen drags for marquee selection", () => {
    expect(viewportPointerDragIntent("mouse", 6)).toBe("marquee");
    expect(viewportPointerDragIntent("pen", 12)).toBe("marquee");
  });

  it("reserves touch drags for camera gestures", () => {
    expect(viewportPointerDragIntent("touch", 6)).toBe("camera");
  });

  it("keeps a 44 pixel touch target stable across camera projections", () => {
    expect(orthographicTouchTargetWorldSize(180, 2, 900)).toBeCloseTo(4.4);
    expect(orthographicTouchTargetWorldSize(180, 1, 900)).toBeCloseTo(8.8);
    expect(perspectiveTouchTargetWorldSize(100, 45, 900)).toBeCloseTo(4.05, 1);
  });
});
