import { describe, expect, it } from "vitest";

import { trimSketchGeometry } from "@/lib/sketchTrim";
import type { SketchProfile } from "@/types/workplane";

function ids() {
  let index = 0;
  return (prefix: string) => `${prefix}-${++index}`;
}

describe("sketch trimming", () => {
  it("removes the clicked portion of a line between intersections", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: -10, z: 0 }, { id: "b", x: 10, z: 0 },
        { id: "c", x: -5, z: -5 }, { id: "d", x: -5, z: 5 },
        { id: "e", x: 5, z: -5 }, { id: "f", x: 5, z: 5 },
      ],
      segments: [
        { id: "target", startId: "a", endId: "b", kind: "line" },
        { id: "left", startId: "c", endId: "d", kind: "line" },
        { id: "right", startId: "e", endId: "f", kind: "line" },
      ],
      constraints: [{ id: "length", kind: "distance", segmentId: "target", axis: "aligned", value: 20 }],
    };

    const result = trimSketchGeometry(profile, { kind: "segment", id: "target" }, { x: 0, z: 0 }, ids());

    expect(result.trimmed).toBe(true);
    expect(result.profile.segments.some((segment) => segment.id === "target")).toBe(false);
    expect(result.profile.segments).toHaveLength(4);
    expect(result.profile.constraints).toEqual([]);
    expect(result.profile.points.some((point) => Math.abs(point.x + 5) < 0.001 && Math.abs(point.z) < 0.001)).toBe(true);
    expect(result.profile.points.some((point) => Math.abs(point.x - 5) < 0.001 && Math.abs(point.z) < 0.001)).toBe(true);
  });

  it("opens a circle at the two intersections around the clicked portion", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: -20 }, { id: "b", x: 0, z: 20 },
      ],
      segments: [{ id: "divider", startId: "a", endId: "b", kind: "line" }],
      circles: [{ id: "circle", x: 0, z: 0, radius: 10 }],
      constraints: [{ id: "radius", kind: "radius", circleId: "circle", value: 10 }],
    };

    const result = trimSketchGeometry(profile, { kind: "circle", id: "circle" }, { x: 10, z: 0 }, ids());

    expect(result.trimmed).toBe(true);
    expect(result.profile.circles).toEqual([]);
    expect(result.profile.segments.filter((segment) => segment.kind === "arc")).toHaveLength(1);
    expect(result.profile.constraints).toEqual([]);
  });

  it("trims an arc from a single interior intersection to the chosen endpoint", () => {
    const profile: SketchProfile = {
      points: [
        { id: "start", x: 10, z: 0 }, { id: "end", x: 0, z: 10 },
        { id: "line-a", x: 5, z: -5 }, { id: "line-b", x: 5, z: 15 },
      ],
      segments: [
        { id: "arc", startId: "start", endId: "end", kind: "arc", center: { x: 0, z: 0 }, clockwise: true },
        { id: "divider", startId: "line-a", endId: "line-b", kind: "line" },
      ],
      constraints: [],
    };

    const result = trimSketchGeometry(profile, { kind: "segment", id: "arc" }, { x: 1, z: 9.9 }, ids());

    expect(result.trimmed).toBe(true);
    const arcs = result.profile.segments.filter((segment) => segment.kind === "arc");
    expect(arcs).toHaveLength(1);
    expect(arcs[0].startId).toBe("start");
    expect(arcs[0].endId).not.toBe("end");
  });

  it.each(["bezier", "smooth"] as const)("preserves exact handles when trimming a %s curve", (kind) => {
    const profile: SketchProfile = {
      points: [
        { id: "start", x: 0, z: 0, handleOut: { x: 3, z: 8 }, mode: kind === "smooth" ? "smooth" : "corner" },
        { id: "end", x: 10, z: 0, handleIn: { x: 7, z: 8 }, mode: kind === "smooth" ? "smooth" : "corner" },
        { id: "left-a", x: 3, z: -2 }, { id: "left-b", x: 3, z: 10 },
        { id: "right-a", x: 7, z: -2 }, { id: "right-b", x: 7, z: 10 },
      ],
      segments: [
        { id: "curve", startId: "start", endId: "end", kind },
        { id: "left", startId: "left-a", endId: "left-b", kind: "line" },
        { id: "right", startId: "right-a", endId: "right-b", kind: "line" },
      ],
      constraints: [],
    };

    const result = trimSketchGeometry(profile, { kind: "segment", id: "curve" }, { x: 5, z: 6 }, ids());

    expect(result.trimmed).toBe(true);
    const fragments = result.profile.segments.filter((segment) => segment.kind === kind);
    expect(fragments).toHaveLength(2);
    for (const fragment of fragments) {
      const fragmentStart = result.profile.points.find((point) => point.id === fragment.startId);
      const fragmentEnd = result.profile.points.find((point) => point.id === fragment.endId);
      expect(fragmentStart?.handleOut).toBeDefined();
      expect(fragmentEnd?.handleIn).toBeDefined();
    }
  });
});
