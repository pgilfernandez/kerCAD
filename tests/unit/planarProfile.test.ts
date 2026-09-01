import { describe, expect, it } from "vitest";
import { classifyPlanarProfileLoops } from "@/lib/planarProfile";

const square = (size: number, offset = 0) => ({
  polygon: [
    { x: offset - size, y: offset - size },
    { x: offset + size, y: offset - size },
    { x: offset + size, y: offset + size },
    { x: offset - size, y: offset + size },
  ],
  payload: size,
});

describe("shared planar profiles", () => {
  it("classifies holes and nested islands independently of winding", () => {
    const outer = square(10);
    const hole = { ...square(6), polygon: [...square(6).polygon].reverse() };
    const island = square(2);
    const regions = classifyPlanarProfileLoops([hole, island, outer]);
    expect(regions).toHaveLength(2);
    expect(regions.find((region) => region.outer.payload === 10)?.holes.map((loop) => loop.payload)).toEqual([6]);
    expect(regions.find((region) => region.outer.payload === 2)?.holes).toEqual([]);
  });

  it("rejects crossing contours before creating CAD geometry", () => {
    expect(() => classifyPlanarProfileLoops([square(5), square(5, 4)], "SVG")).toThrow("intersect or touch");
  });

  it("rejects empty and zero-area profiles with a useful source label", () => {
    expect(() => classifyPlanarProfileLoops([], "Text")).toThrow("Text does not contain a closed contour");
    expect(() => classifyPlanarProfileLoops([{ polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], payload: null }], "Scribble")).toThrow("no area");
  });
});
