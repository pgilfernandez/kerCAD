import type { ParametricDocument, RenderMesh } from "@/types/parametric";

export type AlignmentItem = { id: string; kind: "object" | "feature" };
export type AlignmentTarget = AlignmentItem & {
  objectId: string;
  movable: boolean;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  mesh: RenderMesh;
  meshOffset?: { x: number; y: number; z: number };
};

export function sameAlignmentItem(a: AlignmentItem, b: AlignmentItem) {
  return a.id === b.id && a.kind === b.kind;
}

// A translation preserves the operand mesh. Keep its buffers and move only its
// bounds and picking transform. Dependent geometry must still go through CAD.
export function translateAlignmentTargets(document: ParametricDocument, targets: AlignmentTarget[], moves: Array<AlignmentItem & { delta: { x: number; y: number; z: number } }>): AlignmentTarget[] | null {
  if (document.features.some(feature => !["primitive", "extrude", "sketch"].includes(feature.kind) || feature.dependencies?.length)) return null;
  if (moves.some(move => move.kind === "feature" && document.features.find(feature => feature.id === move.id)?.kind === "sketch")) return null;
  return targets.map(target => {
    const move = moves.find(item => sameAlignmentItem(item, target));
    if (!move) return target;
    const add = (point: { x: number; y: number; z: number }) => ({ x: point.x + move.delta.x, y: point.y + move.delta.y, z: point.z + move.delta.z });
    return { ...target, min: add(target.min), max: add(target.max), meshOffset: add(target.meshOffset ?? { x: 0, y: 0, z: 0 }) };
  });
}
