import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { sectionCapGeometry } from "@/lib/sectionCapGeometry";
import type { ParametricVector3 } from "@/types/parametric";

export type VisualSection = { position: ParametricVector3; rotation: ParametricVector3; inverted?: boolean };
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
  // Change only the retained half-space, never the plane's manipulators.
  if (pose.inverted !== false) plane.negate();
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
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 320;
  const context = canvas.getContext("2d")!;
  // Exact periodic sampling avoids cropped stroke ends at tile corners.
  // Eight periods fit the texture; keep the existing stroke thickness.
  const image = context.createImageData(320, 320);
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    const phase = (x + y + 1) % 40;
    const distance = Math.abs(phase - 20) / Math.SQRT2;
    const offset = (y * 320 + x) * 4;
    image.data[offset] = 100; image.data[offset + 1] = 110; image.data[offset + 2] = 120;
    image.data[offset + 3] = Math.round(255 * THREE.MathUtils.clamp(3.75 + .5 - distance, 0, 1));
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = 4;
  resources.push(texture);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: "#000000", linewidth: 1, depthTest: true, depthWrite: false });
  resources.push(edgeMaterial);
  bodies.forEach((body) => {
    const geometry = sectionCapGeometry(body, position, quaternion);
    if (!geometry) return;
    const source = Array.isArray(body.material) ? body.material[0] : body.material;
    const material = new THREE.MeshBasicMaterial({ color: (source as THREE.MeshBasicMaterial).color?.clone() ?? "#ffffff", map: texture, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    // The texture has a transparent background, but the cut remains solid.
    // Blend the hatch into the piece color in one pass rather than layering meshes.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          vec4 hatch = texture2D(map, vMapUv);
          diffuseColor.rgb *= mix(vec3(1.0), hatch.rgb, hatch.a);
        #endif
      `);
    };
    material.customProgramCacheKey = () => "kercad-section-hatch-v1";
    const cap = new THREE.Mesh(geometry, material);
    // Close the retained solid for shadow rays as well as for the camera.
    cap.castShadow = body.castShadow;
    cap.renderOrder = 2;
    group.add(cap); resources.push(geometry, material);
    // Coplanar triangulation edges are discarded: only outer and hole contours remain.
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.renderOrder = 17;
    group.add(edges); resources.push(edgeGeometry);
  });
  const guideGeometry = new LineSegmentsGeometry();
  const half = side / 2;
  guideGeometry.setPositions([-half, -half, 0, half, -half, 0, half, -half, 0, half, half, 0, half, half, 0, -half, half, 0, -half, half, 0, -half, -half, 0]);
  const guideMaterial = new LineMaterial({ color: "#9099a1", linewidth: 3, dashed: true, dashSize: 3, gapSize: 2, transparent: true, opacity: .7 });
  const guide = new LineSegments2(guideGeometry, guideMaterial); guide.computeLineDistances(); guide.position.copy(position); guide.quaternion.copy(quaternion);
  group.add(guide); resources.push(guideGeometry, guideMaterial);
  model.userData.sectionGuide = guide;
  model.userData.sectionClippingPlane = plane;
  model.add(group);
  return () => {
    if (model.userData.sectionGuide === guide) { delete model.userData.sectionGuide; delete model.userData.sectionClippingPlane; }
    group.removeFromParent(); resources.forEach((resource) => resource.dispose());
    for (const { material, planes, shadows } of restored) { material.clippingPlanes = planes; material.clipShadows = shadows; material.needsUpdate = true; }
  };
}
