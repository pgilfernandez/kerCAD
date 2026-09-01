import type { Face } from "brepjs";
import type { Brep, BrepSolid } from "@/lib/brepKernel";
import { classifyPlanarProfileLoops, type PlanarProfileLoop } from "@/lib/planarProfile";

type ProfileWire = Parameters<Brep["face"]>[0];

export type PlanarBrepLoop = PlanarProfileLoop<{ wire: ProfileWire }>;
export type ProfileBooleanRole = "add" | "cut" | "intersect";

export function facesFromPlanarProfile(brep: Brep, loops: readonly PlanarBrepLoop[], label: string): Face[] {
  return classifyPlanarProfileLoops(loops, label).map((region) => brep.unwrap(brep.face(
    region.outer.payload.wire,
    region.holes.map((hole) => hole.payload.wire) as Parameters<Brep["face"]>[1],
  )) as Face);
}

export function extrudePlanarProfile(brep: Brep, faces: readonly Face[], distance: number, symmetric: boolean): BrepSolid {
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("Extrusion distance must be positive.");
  const solids = faces.map((sourceFace) => {
    const face = symmetric ? brep.translate(sourceFace, [0, 0, -distance / 2]) as Face : sourceFace;
    return brep.unwrap(brep.extrude(face as Parameters<Brep["extrude"]>[0], distance)) as BrepSolid;
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
