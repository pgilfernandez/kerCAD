export type ViewportPointerDragIntent = "pending" | "marquee" | "camera";

/** Resolve pointer movement without conflating touch camera gestures with a mouse marquee. */
export function viewportPointerDragIntent(pointerType: string, distance: number, threshold = 5): ViewportPointerDragIntent {
  if (distance <= threshold) return "pending";
  return pointerType === "touch" ? "camera" : "marquee";
}
