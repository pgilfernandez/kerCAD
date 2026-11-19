import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { ParametricScaleTarget, ScaleAxis } from "@/lib/parametricScaleManipulator";

const axes = ["x", "y", "z"] as const;
const planes = {
  x: { axes: ["y", "z"], rotation: new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, "ZYX") },
  y: { axes: ["x", "z"], rotation: new THREE.Euler(Math.PI / 2, 0, 0) },
  z: { axes: ["x", "y"], rotation: new THREE.Euler() },
} as const;
const normal = (axis: ScaleAxis) => new THREE.Vector3().setComponent(axes.indexOf(axis), 1);
const corners = Array.from({ length: 8 }, (_, index) => new THREE.Vector3(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1));
const handles = corners.flatMap((corner) => axes.map((axis) => ({ corner, axis })));
const handleSizePx = 12;

export function attachScaleManipulator(model: THREE.Group, camera: THREE.Camera, canvas: HTMLCanvasElement, controls: OrbitControls, target: ParametricScaleTarget, snap: number, invalidate: () => void, onCommit: (factors: THREE.Vector3, pivot: THREE.Vector3) => void) {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(target.matrix);
  const outline = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 0x000000, linewidth: 2, opacity: .3, transparent: true, depthTest: false, depthWrite: false }));
  outline.renderOrder = 40;
  const squares = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, depthWrite: false }), handles.length);
  squares.renderOrder = 41;
  squares.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(outline, squares);
  model.add(group);
  const tint = new THREE.Color(0x495561), highlight = new THREE.Color(0xf2c42b);
  handles.forEach((_, index) => squares.setColorAt(index, tint));
  const axisLength = new THREE.Vector3(...axes.map((axis) => normal(axis).applyMatrix3(new THREE.Matrix3().setFromMatrix4(target.matrix)).length()) as [number, number, number]);
  let hover = -1;
  const colorHandle = (index: number) => {
    if (hover === index) return;
    if (hover >= 0) squares.setColorAt(hover, tint);
    if (index >= 0) squares.setColorAt(index, highlight);
    hover = index;
    if (squares.instanceColor) squares.instanceColor.needsUpdate = true;
    invalidate();
  };
  const vertices = corners.map(() => new THREE.Vector3());
  const dimensions = new THREE.Vector3();
  const instance = new THREE.Object3D(), cameraPoint = new THREE.Vector3();
  const positionSquares = () => {
    group.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const unitsPerPixel = 2 / (Math.max(1, canvas.clientHeight) * Math.abs(camera.projectionMatrix.elements[5]));
    const sizes = vertices.map((vertex) => {
      const depth = camera instanceof THREE.PerspectiveCamera ? -cameraPoint.copy(vertex).applyMatrix4(group.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z : 1;
      return handleSizePx * unitsPerPixel * Math.max(.001, depth);
    });
    handles.forEach(({ corner, axis }, index) => {
      const [u, v] = planes[axis].axes;
      const vertexIndex = Math.floor(index / 3);
      const size = sizes[vertexIndex];
      instance.position.copy(vertices[vertexIndex]);
      instance.position[u] -= corner[u] * Math.min(size / axisLength[u] * .62, dimensions[u] / 4);
      instance.position[v] -= corner[v] * Math.min(size / axisLength[v] * .62, dimensions[v] / 4);
      instance.rotation.copy(planes[axis].rotation);
      instance.scale.set(size / axisLength[u], size / axisLength[v], 1);
      instance.updateMatrix();
      squares.setMatrixAt(index, instance.matrix);
    });
    squares.instanceMatrix.needsUpdate = true;
    squares.computeBoundingSphere();
    group.updateWorldMatrix(true, true);
    invalidate();
  };
  const draw = (bounds: THREE.Box3) => {
    corners.forEach((sign, i) => {
      for (const axis of axes) vertices[i][axis] = sign[axis] > 0 ? bounds.max[axis] : bounds.min[axis];
    });
    const edges: number[] = [];
    for (let i = 0; i < 8; i++) for (const mask of [1, 2, 4]) {
      if (!(i & mask)) edges.push(...vertices[i].toArray(), ...vertices[i | mask].toArray());
    }
    outline.geometry.setPositions(edges);
    bounds.getSize(dimensions);
    positionSquares();
  };
  const raycaster = new THREE.Raycaster(), initialDimensions = target.bounds.getSize(new THREE.Vector3());
  let drag: { id: number; index: number; plane: THREE.Plane; inverse: THREE.Matrix4; start: THREE.Vector3; pivot: THREE.Vector3; factors: THREE.Vector3; controlsEnabled: boolean; damping: boolean } | null = null;
  const setRay = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
  };
  const pick = () => raycaster.intersectObject(squares, false).find(({ instanceId }) => {
    if (instanceId === undefined) return false;
    const n = normal(handles[instanceId].axis).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(group.matrixWorld));
    return Math.abs(n.dot(raycaster.ray.direction)) > .05;
  });
  const down = (event: PointerEvent) => {
    if (drag || event.button !== 0) return;
    setRay(event);
    const hit = pick();
    if (hit?.instanceId === undefined) return;
    const index = hit.instanceId;
    const { corner, axis } = handles[index];
    const pivot = new THREE.Vector3(...axes.map((key) => corner[key] > 0 ? target.bounds.min[key] : target.bounds.max[key]) as [number, number, number]);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal(axis).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(group.matrixWorld)), hit.point);
    const inverse = group.matrixWorld.clone().invert();
    drag = { id: event.pointerId, index, plane, inverse, start: hit.point.clone().applyMatrix4(inverse), pivot, factors: new THREE.Vector3(1, 1, 1), controlsEnabled: controls.enabled, damping: controls.enableDamping };
    event.preventDefault();
    event.stopImmediatePropagation();
    controls.enabled = false;
    controls.enableDamping = false;
    canvas.setPointerCapture(event.pointerId);
    colorHandle(index);
  };
  const move = (event: PointerEvent) => {
    setRay(event);
    if (!drag) { colorHandle(pick()?.instanceId ?? -1); return; }
    if (event.pointerId !== drag.id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!point) return;
    const { corner, axis } = handles[drag.index];
    const delta = point.applyMatrix4(drag.inverse).sub(drag.start);
    const factors = new THREE.Vector3(1, 1, 1);
    for (const key of planes[axis].axes) {
      if (target.linkedXY && axis !== "z" && key !== "z") continue;
      const size = initialDimensions[key] + delta[key] * corner[key];
      if (Math.abs(size - initialDimensions[key]) < 1e-8) continue;
      const step = snap / axisLength[key];
      factors[key] = Math.max(target.minimum[key], (step > 0 ? Math.round(size / step) * step : size) / initialDimensions[key]);
    }
    if (target.linkedXY && axis === "z") {
      const factor = Math.abs(factors.x - 1) >= Math.abs(factors.y - 1) ? factors.x : factors.y;
      factors.x = factors.y = Math.max(target.minimum.x, target.minimum.y, factor);
    }
    drag.factors = factors;
    const scaled = (corner: THREE.Vector3) => corner.clone().sub(drag!.pivot).multiply(factors).add(drag!.pivot);
    draw(new THREE.Box3(scaled(target.bounds.min), scaled(target.bounds.max)));
  };
  const settle = (commit: boolean) => {
    if (!drag) return;
    const completed = drag;
    drag = null;
    controls.enabled = completed.controlsEnabled;
    controls.enableDamping = completed.damping;
    if (canvas.hasPointerCapture(completed.id)) canvas.releasePointerCapture(completed.id);
    draw(target.bounds);
    colorHandle(-1);
    if (commit && axes.some((axis) => Math.abs(completed.factors[axis] - 1) > 1e-7)) onCommit(completed.factors, completed.pivot);
  };
  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    settle(event.type === "pointerup");
  };
  const escape = (event: KeyboardEvent) => {
    if (!drag || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    settle(false);
  };
  const leave = () => { if (!drag) colorHandle(-1); };
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointermove", move, true);
  canvas.addEventListener("pointerup", finish, true);
  canvas.addEventListener("pointercancel", finish, true);
  canvas.addEventListener("lostpointercapture", finish, true);
  canvas.addEventListener("pointerleave", leave);
  window.addEventListener("keydown", escape, true);
  controls.addEventListener("change", positionSquares);
  const resize = new ResizeObserver(positionSquares);
  resize.observe(canvas);
  draw(target.bounds);
  return { group, dispose: () => {
    settle(false);
    resize.disconnect();
    controls.removeEventListener("change", positionSquares);
    window.removeEventListener("keydown", escape, true);
    canvas.removeEventListener("pointerdown", down, true);
    canvas.removeEventListener("pointermove", move, true);
    canvas.removeEventListener("pointerup", finish, true);
    canvas.removeEventListener("pointercancel", finish, true);
    canvas.removeEventListener("lostpointercapture", finish, true);
    canvas.removeEventListener("pointerleave", leave);
    group.removeFromParent();
    outline.geometry.dispose();
    outline.material.dispose();
    squares.geometry.dispose();
    squares.material.dispose();
    squares.dispose();
    invalidate();
  } };
}
