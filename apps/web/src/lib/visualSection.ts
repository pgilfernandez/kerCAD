import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { sectionCapGeometry } from "@/lib/sectionCapGeometry";
import type { ParametricVector3 } from "@/types/parametric";

export type VisualSection = { position: ParametricVector3; rotation: ParametricVector3 };
export const SECTION_PLANE_ID = "$visual-section";

/** Cached caps use the actual closed surface, including holes and cavities.
 * No mesh/solid is modified and shared source geometries remain owned by the viewport.
 */
export function createVisualSection(model: THREE.Group, bodies: THREE.Mesh[], pose: VisualSection) {
  const group = new THREE.Group(); group.name = "Visual section";
  const resources: Array<{ dispose: () => void }> = [];
  const restored: Array<{ material: THREE.Material; planes: THREE.Plane[] | null; shadows: boolean }> = [];
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pose.rotation.x), THREE.MathUtils.degToRad(pose.rotation.y), THREE.MathUtils.degToRad(pose.rotation.z), "ZYX"));
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const position = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
  model.updateWorldMatrix(true, true);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone().transformDirection(model.matrixWorld), position.clone().applyMatrix4(model.matrixWorld));
  const bounds = new THREE.Box3(); bodies.forEach((body) => bounds.union(new THREE.Box3().setFromObject(body)));
  const side = Math.max(40, bounds.getSize(new THREE.Vector3()).length() * 2);
  model.traverse((object) => {
    if ((!object.userData.objectId && !object.userData.sectionClip) || !(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof LineSegments2)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (restored.some((entry) => entry.material === material)) continue;
      restored.push({ material, planes: material.clippingPlanes, shadows: material.clipShadows });
      material.clippingPlanes = [plane]; material.clipShadows = true; material.needsUpdate = true;
    }
  });
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff8db"; context.fillRect(0, 0, 64, 64);
  context.strokeStyle = "#776a45"; context.lineWidth = 3;
  for (let offset = -64; offset <= 64; offset += 16) { context.beginPath(); context.moveTo(offset, 64); context.lineTo(offset + 64, 0); context.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  resources.push(texture);
  const capMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  resources.push(capMaterial);
  bodies.forEach((body) => {
    const geometry = sectionCapGeometry(body, position, quaternion);
    if (!geometry) return;
    const material = capMaterial;
    const cap = new THREE.Mesh(geometry, material);
    cap.renderOrder = 2;
    group.add(cap); resources.push(geometry);
  });
  const guideGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-side / 2, -side / 2, 0), new THREE.Vector3(side / 2, -side / 2, 0), new THREE.Vector3(side / 2, side / 2, 0), new THREE.Vector3(-side / 2, side / 2, 0), new THREE.Vector3(-side / 2, -side / 2, 0),
  ]);
  const guideMaterial = new THREE.LineDashedMaterial({ color: "#c9a600", dashSize: 3, gapSize: 2, transparent: true, opacity: .7 });
  const guide = new THREE.Line(guideGeometry, guideMaterial); guide.computeLineDistances(); guide.position.copy(position); guide.quaternion.copy(quaternion);
  group.add(guide); resources.push(guideGeometry, guideMaterial);
  model.add(group);
  return () => {
    group.removeFromParent(); resources.forEach((resource) => resource.dispose());
    for (const { material, planes, shadows } of restored) { material.clippingPlanes = planes; material.clipShadows = shadows; material.needsUpdate = true; }
  };
}
