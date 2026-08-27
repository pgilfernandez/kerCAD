import { describe, expect, it } from "vitest";
import { appendDefaultSketchText, deleteSketchText, moveSketchText } from "@/lib/sketchText";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";

describe("sketch text entity", () => {
  const empty = { points: [], segments: [], circles: [], images: [], texts: [], constraints: [] };

  it("adds the default 10 mm system-font text with CAD contours", () => {
    const profile = appendDefaultSketchText(empty, { x: 12, z: -4 });
    const text = profile.texts?.[0];
    expect(text).toMatchObject({ text: "eduCAD", fontFamily: "sans-serif", x: 12, z: -4, height: 10 });
    expect(text?.width).toBeGreaterThan(0);
    expect(text?.depth).toBeGreaterThan(0);
    expect(profile.points.every((point) => point.generatedTextId === text?.id)).toBe(true);
    expect(validateDrawnSketchProfile(profile).valid).toBe(true);
  });

  it("moves and removes the text as one grouped entity", () => {
    const profile = appendDefaultSketchText(empty, { x: 0, z: 0 });
    const text = profile.texts![0];
    const firstPoint = profile.points[0];
    const moved = moveSketchText(profile, text.id, { x: 8, z: 3 });
    expect(moved.texts?.[0]).toMatchObject({ x: 8, z: 3 });
    expect(moved.points[0]).toMatchObject({ x: firstPoint.x + 8, z: firstPoint.z + 3 });
    const removed = deleteSketchText(moved, text.id);
    expect(removed.texts).toHaveLength(0);
    expect(removed.points).toHaveLength(0);
    expect(removed.segments).toHaveLength(0);
  });
});
