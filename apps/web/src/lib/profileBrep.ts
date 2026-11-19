import type { Face } from "brepjs";
import type { Brep, BrepSolid } from "@/lib/brepKernel";
import { classifyPlanarProfileLoops, type PlanarProfileLoop } from "@/lib/planarProfile";

type ProfileWire = Parameters<Brep["face"]>[0];

export type PlanarBrepLoop = PlanarProfileLoop<{ wire: ProfileWire }>;
export type ProfileBooleanRole = "add" | "cut" | "intersect";

export function facesFromPlanarProfile(brep: Brep, loops: readonly PlanarBrepLoop[], label: string): Face[] {
  if (loops.length > 1) {
    // Validate each contour independently, then resolve intersecting contours
    // by symmetric difference. Unit slabs preserve exact arcs and Beziers.
    for (const loop of loops) classifyPlanarProfileLoops([loop], label);
    const slabs = loops.map((loop) => {
      const face = brep.unwrap(brep.face(loop.payload.wire)) as Face;
      return brep.unwrap(brep.extrude(face as Parameters<Brep["extrude"]>[0], 1)) as BrepSolid;
    });
    let filled = slabs[0];
    for (const slab of slabs.slice(1)) {
      const outside = brep.unwrap(brep.cut(filled, slab)) as BrepSolid;
      const inside = brep.unwrap(brep.cut(slab, filled)) as BrepSolid;
      filled = brep.unwrap(brep.fuse(outside, inside)) as BrepSolid;
    }
    return brep.getFaces<"3D">(filled).filter((face) => {
      const bounds = brep.getBounds(face);
      return Math.abs(bounds.zMin) < 1e-6 && Math.abs(bounds.zMax) < 1e-6;
    });
  }
  return classifyPlanarProfileLoops(loops, label).map((region) => brep.unwrap(brep.face(
    region.outer.payload.wire,
    region.holes.map((hole) => hole.payload.wire) as Parameters<Brep["face"]>[1],
  )) as Face);
}

export function extrudePlanarProfile(brep: Brep, faces: readonly Face[], distance: number, symmetric: boolean): BrepSolid {
  if (!Number.isFinite(distance) || Math.abs(distance) <= 1e-8) throw new Error("Extrusion distance must not be zero.");
  const length = Math.abs(distance);
  const solids = faces.map((sourceFace) => {
    const offset = symmetric ? -length / 2 : distance < 0 ? -length : 0;
    const face = offset ? brep.translate(sourceFace, [0, 0, offset]) as Face : sourceFace;
    // Rebuild the outer region and subtract every inner wire explicitly.
    // Do not rely on the adapter preserving holes during face extrusion.
    const outer = brep.unwrap(brep.face(brep.outerWire(face) as ProfileWire)) as Face;
    let solid = brep.unwrap(brep.extrude(outer as Parameters<Brep["extrude"]>[0], length)) as BrepSolid;
    for (const wire of brep.innerWires(face)) {
      const hole = brep.unwrap(brep.face(wire as ProfileWire)) as Face;
      const tool = brep.unwrap(brep.extrude(hole as Parameters<Brep["extrude"]>[0], length)) as BrepSolid;
      solid = brep.unwrap(brep.cut(solid, tool)) as BrepSolid;
    }
    return solid;
  });
  return combineProfileSolids(brep, solids);
}

export function combineProfileSolids(brep: Brep, solids: readonly BrepSolid[]): BrepSolid {
  if (!solids.length) throw new Error("The profile does not contain a filled region.");
  if (solids.length === 1) return solids[0];
  // Text and imported SVG profiles commonly contain many disconnected regions.
  // A single multi-body boolean avoids simplifying the accumulated result after
  // every glyph, which made construction time grow rapidly with word length.
  return brep.unwrap(brep.fuseAll([...solids], { simplify: true })) as BrepSolid;
}

export function applyProfileBoolean(brep: Brep, current: BrepSolid, tool: BrepSolid, role: ProfileBooleanRole): BrepSolid {
  const result = role === "add" ? brep.fuse(current, tool) : role === "cut" ? brep.cut(current, tool) : brep.intersect(current, tool);
  return brep.unwrap(brep.simplify(brep.unwrap(result))) as BrepSolid;
}
