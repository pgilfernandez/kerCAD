import * as THREE from "three";
import type { ParametricAnnotation, ParametricVector3 } from "@/types/parametric";

export type AnnotationPoint = "start" | "center" | "end";

export function annotationPosition(annotation: ParametricAnnotation, point: AnnotationPoint | null) {
  if (annotation.kind === "text") return annotation.position;
  if (!point) return null;
  if (point === "center") return annotation.kind === "angle" ? annotation.center : null;
  return annotation[point];
}

export function setAnnotationPosition(annotation: ParametricAnnotation, point: AnnotationPoint | null, position: ParametricVector3) {
  const target = annotationPosition(annotation, point);
  if (target) Object.assign(target, position);
}

/** Minor angle in the plane defined by three CAD-space points. */
export function annotationAngleGeometry(annotation: Extract<ParametricAnnotation, { kind: "angle" }>) {
  const vector = (point: ParametricVector3) => new THREE.Vector3(point.x, point.y, point.z);
  const center = vector(annotation.center);
  const first = vector(annotation.start).sub(center), last = vector(annotation.end).sub(center);
  const firstLength = first.length(), lastLength = last.length();
  if (Math.min(firstLength, lastLength) < 1e-6) return null;
  first.normalize(); last.normalize();
  const dot = THREE.MathUtils.clamp(first.dot(last), -1, 1);
  const angle = Math.acos(dot);
  const radius = Math.min(firstLength, lastLength) / 3;
  const tangent = last.clone().addScaledVector(first, -dot);
  if (tangent.lengthSq() < 1e-12) {
    // Collinear sides still define 0°/180°. Choose a stable display plane.
    const normal = first.clone().cross(Math.abs(first.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)).normalize();
    tangent.crossVectors(normal, first);
  }
  tangent.normalize();
  const pointAt = (radians: number, distance: number) => center.clone().addScaledVector(first, Math.cos(radians) * distance).addScaledVector(tangent, Math.sin(radians) * distance);
  const segments = Math.max(8, Math.ceil(angle * 24));
  const arc = Array.from({ length: segments + 1 }, (_, index) => pointAt(angle * index / segments, radius));
  return { degrees: THREE.MathUtils.radToDeg(angle), radius, arc, labelPosition: pointAt(angle / 2, radius + Math.max(6, radius / 4)) };
}
