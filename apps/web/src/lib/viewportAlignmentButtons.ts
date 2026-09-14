import * as THREE from "three";
import type { AlignmentTarget } from "@/lib/parametricAlignment";

const axes = ["x", "y", "z"] as const;
const anchors = ["min", "center", "max"] as const;

// Project actual face planes into CSS, keeping native, keyboard-accessible buttons.
export function positionAlignmentButtons(layer: HTMLDivElement, target: AlignmentTarget | undefined, model: THREE.Group, camera: THREE.Camera, width: number, height: number) {
  layer.style.visibility = target ? "visible" : "hidden";
  if (!target) {
    layer.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.style.visibility = "hidden"; });
    return;
  }
  model.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(model.matrixWorld);
  const center = new THREE.Vector3().addVectors(new THREE.Vector3(target.min.x, target.min.y, target.min.z), new THREE.Vector3(target.max.x, target.max.y, target.max.z)).multiplyScalar(0.5);
  const eye = model.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
  const view = camera instanceof THREE.OrthographicCamera
    ? camera.getWorldDirection(new THREE.Vector3()).negate().transformDirection(model.matrixWorld.clone().invert())
    : eye.sub(center).normalize();
  const project = (point: THREE.Vector3) => {
    const clip = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(matrix);
    return new THREE.Vector2((clip.x / clip.w + 1) * width / 2, (1 - clip.y / clip.w) * height / 2);
  };
  const screenCenter = project(center);
  const screenAxes = axes.map(axis => project(center.clone().setComponent(axes.indexOf(axis), center[axis] + 1)).sub(screenCenter));
  const centeredAxis = axes.find(axis => Math.abs(view[axis]) > 0.985);
  // One strip per visible face. In an axial view use the remaining face rather
  // than placing controls on a plane that has collapsed to a line.
  const faces = ["z", "x", "y"] as const;
  const visibleFaces = axes.map((axis, index) => Math.abs(view[faces[index]]) < 0.12
    ? axes.filter(candidate => candidate !== axis).sort((a, b) => Math.abs(view[b]) - Math.abs(view[a]))[0]
    : faces[index]);
  axes.forEach((axis, index) => {
    const axisFacesCamera = Math.abs(view[axis]) > 0.985;
    const face = visibleFaces[index];
    const sharesFace = axis !== centeredAxis && axes.some((other, otherIndex) => other !== axis && other !== centeredAxis && visibleFaces[otherIndex] === face);
    const tangent = axes.find(candidate => candidate !== axis && candidate !== face)!;
    const axisPixels = screenAxes[index].length();
    const tangentPixels = screenAxes[axes.indexOf(tangent)].length();
    const size = Math.max(0.001, Math.min(34 / Math.max(axisPixels, tangentPixels, 0.001), (target.max[axis] - target.min[axis]) / 3.6, (target.max[tangent] - target.min[tangent]) / 3.6));
    const u = new THREE.Vector3().setComponent(index, size / 32);
    const v = new THREE.Vector3().setComponent(axes.indexOf(tangent), size / 32);
    if (screenAxes[index].cross(screenAxes[axes.indexOf(tangent)]) < 0) v.negate();
    anchors.forEach((anchor, anchorIndex) => {
      const button = layer.querySelector<HTMLButtonElement>(`[data-alignment-axis="${axis}"][data-alignment-anchor="${anchor}"]`);
      if (!button) return;
      const point = center.clone();
      point[face] = view[face] >= 0 ? target.max[face] : target.min[face];
      point[tangent] = view[tangent] >= 0 ? target.max[tangent] - size * 0.65 : target.min[tangent] + size * 0.65;
      point[axis] = anchor === "min" ? target.min[axis] + size * 0.65 : anchor === "max" ? target.max[axis] - size * 0.65 : center[axis];
      // Strips sharing a visible face meet at one corner. Move each
      // corner tile one button width toward the center along its own axis.
      if (sharesFace && anchor === (view[axis] >= 0 ? "max" : "min")) {
        point[axis] += anchor === "min" ? size : -size;
      }
      const clipCenter = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(matrix);
      button.style.visibility = clipCenter.w > 0 && Math.abs(clipCenter.z / clipCenter.w) <= 1 ? "visible" : "hidden";
      const projectedU = project(point.clone().add(u)).sub(project(point));
      const projectedV = project(point.clone().add(v)).sub(project(point));
      if (axisFacesCamera || Math.abs(projectedU.cross(projectedV)) < 0.12) {
        // Only the foreshortened axis moves to the center. The other two keep
        // their face anchors, even when their tiles need to face the screen.
        const position = axisFacesCamera
          ? screenCenter.clone().add(new THREE.Vector2((anchorIndex - 1) * 36, 0))
          : project(point);
        button.style.transform = `translate(${position.x - 16}px, ${position.y - 16}px)`;
        return;
      }
      const origin = point.clone().addScaledVector(u, -16).addScaledVector(v, -16);
      const p = new THREE.Vector4(origin.x, origin.y, origin.z, 1).applyMatrix4(matrix);
      const a = new THREE.Vector4(u.x, u.y, u.z, 0).applyMatrix4(matrix);
      const b = new THREE.Vector4(v.x, v.y, v.z, 0).applyMatrix4(matrix);
      const values = [width / 2 * (a.x + a.w), height / 2 * (a.w - a.y), 0, a.w,
        width / 2 * (b.x + b.w), height / 2 * (b.w - b.y), 0, b.w,
        0, 0, p.w, 0, width / 2 * (p.x + p.w), height / 2 * (p.w - p.y), 0, p.w];
      button.style.transform = `matrix3d(${values.map(value => value / p.w).join(",")})`;
    });
  });
}
