/** Lucide graduation-cap, kept as an editable SVG asset. */
export function ChallengeIcon({ size = 24 }: { size?: number }) {
  const mask = 'url("/assets/kercad/graduation-cap.svg") center / contain no-repeat';
  return <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, flexShrink: 0, backgroundColor: "currentColor", mask, WebkitMask: mask }} />;
}
