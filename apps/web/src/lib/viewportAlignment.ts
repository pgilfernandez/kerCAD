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
    if (target.boundsOnly || !target.mesh) continue;
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
    // Group alignment only needs its enclosing box and face controls.
    if (target.boundsOnly) return { group, pickMeshes };
    const shaftPositions: number[] = [];
    const headMatrices: THREE.Matrix4[] = [];
    const maxHead = Math.max(size.length() * 0.126, 0.8);
    const up = new THREE.Vector3(0, 1, 0);
    for (const moving of targets) {
      if (moving.boundsOnly) continue;
      if (sameAlignmentItem(moving, target)) continue;
      const start = vector(moving.min).add(vector(moving.max)).multiplyScalar(0.5);
      const direction = center.clone().sub(start);
      const length = direction.length();
      if (length < 1e-7) continue;
      direction.divideScalar(length);
      const end = start.clone().lerp(center, 2 / 3);
      const head = Math.min(length * (2 / 3) * 0.4, maxHead);
      const shaftEnd = end.clone().addScaledVector(direction, -head);
      shaftPositions.push(...start.toArray(), ...shaftEnd.toArray());
      headMatrices.push(new THREE.Matrix4().compose(end, new THREE.Quaternion().setFromUnitVectors(up, direction), new THREE.Vector3(head * 0.55, head, head * 0.55)));
    }
    if (headMatrices.length) {
      // Two draw calls for the entire selection: all 4px shafts together and
      // instances of one small cone for the heads. No per-arrow helper objects.
      const shafts = new LineSegments2(
        new LineSegmentsGeometry().setPositions(shaftPositions),
        new LineMaterial({ color: 0x22a06b, linewidth: 4, depthTest: false, depthWrite: false, transparent: true }),
      );
      const headGeometry = new THREE.ConeGeometry(0.5, 1, 8).translate(0, -0.5, 0);
      const heads = new THREE.InstancedMesh(headGeometry, new THREE.MeshBasicMaterial({ color: 0x22a06b, depthTest: false, depthWrite: false, transparent: true }), headMatrices.length);
      headMatrices.forEach((matrix, index) => heads.setMatrixAt(index, matrix));
      heads.instanceMatrix.needsUpdate = true;
      shafts.renderOrder = 1002;
      heads.renderOrder = 1003;
      group.add(shafts, heads);
    }
  }
  return { group, pickMeshes };
}

export function disposeAlignmentOverlay(group: THREE.Group) {
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    if (child instanceof THREE.InstancedMesh) child.dispose();
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material.dispose());
  });
  group.removeFromParent();
}
