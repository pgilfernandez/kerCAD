export type ViewportPointerDragIntent = "pending" | "marquee" | "camera";

/** Resolve pointer movement without conflating touch camera gestures with a mouse marquee. */
export function viewportPointerDragIntent(pointerType: string, distance: number, threshold = 5): ViewportPointerDragIntent {
  if (distance <= threshold) return "pending";
  return pointerType === "touch" ? "camera" : "marquee";
}

export function orthographicTouchTargetWorldSize(verticalSpan: number, zoom: number, viewportHeight: number, targetPixels = 44) {
  return verticalSpan / Math.max(0.0001, zoom) * targetPixels / Math.max(1, viewportHeight);
}

export function perspectiveTouchTargetWorldSize(distance: number, verticalFovDegrees: number, viewportHeight: number, targetPixels = 44) {
  const visibleHeight = 2 * Math.max(0, distance) * Math.tan(verticalFovDegrees * Math.PI / 360);
  return visibleHeight * targetPixels / Math.max(1, viewportHeight);
}
