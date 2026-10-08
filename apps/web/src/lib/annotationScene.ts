import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { ParametricAnnotation } from "@/types/parametric";
import { displayUnitLabel, formatDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";

/** An independent display layer: annotations never enter the CAD kernel. */
export function createAnnotationScene(annotations: ParametricAnnotation[], unit: ParametricDisplayUnit, selectedId: string | null) {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const vector = (point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z);
  for (const annotation of annotations) {
    if (!annotation.visible) continue;
    const color = annotation.kind === "text" ? "#000000" : annotation.id === selectedId ? "#1463ee" : "#233c52";
    const label = (text: string, position: THREE.Vector3, size: number, font = "Arial", alignment = "center") => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const lines = text.split("\n");
      const fontSpec = `48px ${font}, sans-serif`;
      context.font = fontSpec;
      canvas.width = Math.min(4096, Math.max(64, Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width)) + 16)));
      canvas.height = Math.min(4096, Math.max(64, lines.length * 64));
      context.font = fontSpec;
      if (annotation.kind === "dimension") {
        context.fillStyle = "rgba(255,255,255,0.85)";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.fillStyle = color;
      context.textBaseline = "middle";
      context.textAlign = alignment === "left" ? "left" : alignment === "right" ? "right" : "center";
      const x = alignment === "left" ? 8 : alignment === "right" ? canvas.width - 8 : canvas.width / 2;
      lines.forEach((line, index) => context.fillText(line, x, index * 64 + 32));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.center.set(alignment === "left" ? 0 : alignment === "right" ? 1 : 0.5, 0.5);
      sprite.scale.set(canvas.width / 48 * size, canvas.height / 48 * size, 1);
      sprite.renderOrder = 90;
      group.add(sprite);
      disposables.push(texture, material);
    };
    if (annotation.kind === "text") {
      label(annotation.text, vector(annotation.position), annotation.size, annotation.font, annotation.alignment);
      continue;
    }
    const start = vector(annotation.start), end = vector(annotation.end);
    const distance = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();
    const perpendicular = direction.clone().cross(Math.abs(direction.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(2);
    const points = [
      start, end, start.clone().sub(perpendicular), start.clone().add(perpendicular), end.clone().sub(perpendicular), end.clone().add(perpendicular),
    ];
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]));
    const material = new LineMaterial({ color, linewidth: 3, worldUnits: false, depthTest: false, depthWrite: false, transparent: true });
    const lines = new LineSegments2(geometry, material);
    // Keep the requested width in screen pixels across Retina/quality changes.
    lines.onBeforeRender = (renderer) => material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
    lines.renderOrder = 89;
    group.add(lines);
    disposables.push(geometry, material);
    if (distance > 0.001) {
      const height = Math.min(2, distance / 5) * 2;
      const cone = new THREE.ConeGeometry(height * 0.3, height, 12);
      const coneMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
      for (const [point, sign] of [[start, -1], [end, 1]] as const) {
        const arrow = new THREE.Mesh(cone, coneMaterial);
        arrow.position.copy(point).addScaledVector(direction, -sign * height / 2);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().multiplyScalar(sign));
        arrow.renderOrder = 89;
        group.add(arrow);
      }
      disposables.push(cone, coneMaterial);
    }
    label(`${formatDisplayLength(distance, unit)} ${displayUnitLabel(unit)}`, start.clone().add(end).multiplyScalar(0.5), 3);
  }
  return { group, dispose: () => { group.removeFromParent(); disposables.forEach((resource) => resource.dispose()); } };
}
