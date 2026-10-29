/** Shared educational tooth profile for the CAD solid and its outline preview. */
export function gearOutlinePoints(width: number, depth: number, toothDepth: number, requestedTeeth: number, z = 0): Array<[number, number, number]> {
  const teeth = Math.min(64, Math.max(6, Math.round(requestedTeeth)));
  const rootWidth = Math.max(0.2, width - toothDepth * 2);
  const rootDepth = Math.max(0.2, depth - toothDepth * 2);
  const count = teeth * 4;
  return Array.from({ length: count }, (_, index) => {
    const phase = index % 4;
    const outer = phase === 1 || phase === 2;
    const angle = index / count * Math.PI * 2;
    return [Math.cos(angle) * (outer ? width : rootWidth) / 2, Math.sin(angle) * (outer ? depth : rootDepth) / 2, z];
  });
}
