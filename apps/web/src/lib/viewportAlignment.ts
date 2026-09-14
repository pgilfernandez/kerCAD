import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { sameAlignmentItem, type AlignmentItem, type AlignmentTarget } from "@/lib/parametricAlignment";

// Everything here uses CAD coordinates, as a child of the viewport's model group.
export function createAlignmentOverlay(targets: AlignmentTarget[], reference: AlignmentItem | null) {
  const group = new THREE.Group();
  const pickMeshes: THREE.Mesh[] = [];
  const vector = (point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z);
  for (const target of targets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(target.mesh.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(target.mesh.indices, 1));
    const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    body.visible = false; // Used only for raycasting, including subtractive operands.
    if (target.meshOffset) body.position.set(target.meshOffset.x, target.meshOffset.y, target.meshOffset.z);
    body.userData.alignmentItem = { id: target.id, kind: target.kind };
    group.add(body);
    pickMeshes.push(body);
  }
  const target = targets.find(item => reference && sameAlignmentItem(item, reference));
  if (target) {
    const bounds = new THREE.Box3(vector(target.min), vector(target.max));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const geometry = new THREE.BoxGeometry(Math.max(size.x, 0.001), Math.max(size.y, 0.001), Math.max(size.z, 0.001));
    const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false }));
    fill.position.copy(center);
    fill.renderOrder = 1000;
    const edges = new THREE.EdgesGeometry(geometry);
    const lines = new LineSegments2(new LineSegmentsGeometry().setPositions(Array.from(edges.getAttribute("position").array)), new LineMaterial({ color: 0x2563eb, linewidth: 4, depthTest: false, depthWrite: false, transparent: true }));
    edges.dispose();
    lines.position.copy(center);
    lines.renderOrder = 1001;
    group.add(fill, lines);
    const radius = Math.max(size.length() / 2 * 1.05, 0.1);
    for (const moving of targets) {
      if (sameAlignmentItem(moving, target)) continue;
      const start = vector(moving.min).add(vector(moving.max)).multiplyScalar(0.5);
      const outward = start.clone().sub(center);
      if (outward.lengthSq() < 1e-12) outward.set(1, 0, 0);
      const end = center.clone().addScaledVector(outward.normalize(), radius);
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length < 1e-7) continue;
      const head = Math.min(length * 0.4, Math.max(radius * 0.24, 0.8));
      const arrow = new THREE.ArrowHelper(direction.normalize(), start, length, 0x22a06b, head, head * 0.55);
      arrow.traverse(child => {
        if (!(child instanceof THREE.Line || child instanceof THREE.Mesh)) return;
        // ArrowHelper shares its geometry between instances; own our copy for disposal.
        child.geometry = child.geometry.clone();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => { material.depthTest = false; material.depthWrite = false; material.transparent = true; });
        child.renderOrder = 1002;
      });
      arrow.line.visible = false;
      const shaftEnd = end.clone().addScaledVector(direction, -head);
      const shaft = new LineSegments2(
        new LineSegmentsGeometry().setPositions([...start.toArray(), ...shaftEnd.toArray()]),
        new LineMaterial({ color: 0x22a06b, linewidth: 4, depthTest: false, depthWrite: false, transparent: true }),
      );
      shaft.renderOrder = 1002;
      group.add(arrow, shaft);
    }
  }
  return { group, pickMeshes };
}

export function disposeAlignmentOverlay(group: THREE.Group) {
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material.dispose());
  });
  group.removeFromParent();
}
