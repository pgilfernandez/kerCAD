import { describe, expect, it } from "vitest";
import { appendScribbleContour, simplifyScribbleContour } from "@/lib/parametricScribble";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";

describe("parametric Scribble", () => {
  const noisyRectangle = [
    { x: 0, z: 0 }, { x: 3, z: 0.1 }, { x: 7, z: -0.1 }, { x: 10, z: 0 },
    { x: 10.1, z: 4 }, { x: 10, z: 8 }, { x: 6, z: 8.1 }, { x: 0, z: 8 },
    { x: -0.1, z: 4 }, { x: 0, z: 0 },
  ];

  it("simplifies a noisy pointer trace into a closed editable contour", () => {
    const contour = simplifyScribbleContour(noisyRectangle, 0.5);
    expect(contour.length).toBeGreaterThanOrEqual(4);
    expect(contour.length).toBeLessThan(noisyRectangle.length);
    const profile = appendScribbleContour({ points: [], segments: [], circles: [], images: [], constraints: [] }, noisyRectangle, 0.5);
    expect(profile.generator).toEqual({ kind: "scribble", smoothing: 0.5, smooth: false });
    expect(validateDrawnSketchProfile(profile).valid).toBe(true);
  });

  it("can turn the final contour into an editable closed smooth curve", () => {
    const profile = appendScribbleContour({ points: [], segments: [], circles: [], images: [], constraints: [] }, noisyRectangle, 0.5, true);
    expect(profile.generator).toEqual({ kind: "scribble", smoothing: 0.5, smooth: true });
    expect(profile.points.every((point) => point.mode === "smooth" && point.handleIn && point.handleOut)).toBe(true);
    expect(profile.segments.every((segment) => segment.kind === "smooth")).toBe(true);
    expect(validateDrawnSketchProfile(profile).valid).toBe(true);
  });

  it("rejects taps and nearly straight gestures", () => {
    expect(() => simplifyScribbleContour([{ x: 0, z: 0 }, { x: 0.01, z: 0 }, { x: 0.02, z: 0 }])).toThrow();
    expect(() => simplifyScribbleContour([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }])).toThrow();
  });
});
