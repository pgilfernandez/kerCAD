import * as THREE from "three";
import { PARAMETER_HANDLE_RENDER_ORDER } from "@/lib/viewportRenderOrder";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParametricObject } from "@/types/parametric";
import { parametricTransformMatrix } from "@/lib/parametricWorkplane";
import { referenceTransformPreview } from "@/lib/referenceTransformPreview";

/** A screen-sized yellow corner handle; previews stay local until pointer-up. */
export function attachReferenceImageHandle(model: THREE.Group, camera: THREE.Camera, canvas: HTMLCanvasElement, controls: OrbitControls, object: ParametricObject, snap: number, invalidate: () => void, onScale: (factor: number) => void) {
  const image = object.referenceMesh!.image!;
  const layer = new THREE.Group();
  const icon = document.createElement("canvas"); icon.width = icon.height = 64;
  const ctx = icon.getContext("2d")!;
  ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.fillStyle = "#fff157"; ctx.fill(); ctx.strokeStyle = "#c39e00"; ctx.lineWidth = 4; ctx.stroke();
  const texture = new THREE.CanvasTexture(icon); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  const handle = new THREE.Sprite(material); handle.renderOrder = PARAMETER_HANDLE_RENDER_ORDER;
  layer.userData.viewportOverlay = true;
  layer.userData.referenceImageTarget = object.id;
  layer.add(handle); model.add(layer);
  const matrix = parametricTransformMatrix(object.transform);
  const corner = new THREE.Vector3(image.width / 2, image.height / 2, 0).applyMatrix4(matrix);
  const center = new THREE.Vector3().applyMatrix4(matrix);
  const raycaster = new THREE.Raycaster();
  let hovered = false;
  let drag: { id: number; initial: number; factor: number; plane: THREE.Plane; preview: ReturnType<typeof referenceTransformPreview>; damping: boolean } | null = null;
  const setRay = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
  };
  const localPoint = (event: PointerEvent, plane: THREE.Plane) => {
    setRay(event);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return point?.applyMatrix4(model.matrixWorld.clone().invert()).applyMatrix4(matrix.clone().invert());
  };
  const diagonal = new THREE.Vector3(image.width / 2, image.height / 2, 0);
  const update = () => {
    handle.position.copy(center).addScaledVector(corner.clone().sub(center), drag?.factor ?? 1);
    const world = handle.getWorldPosition(new THREE.Vector3());
    const height = Math.max(1, canvas.clientHeight);
    const diameter = camera instanceof THREE.OrthographicCamera ? (camera.top - camera.bottom) / camera.zoom * 28 / height
      : camera instanceof THREE.PerspectiveCamera ? 2 * camera.position.distanceTo(world) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 28 / height : 1;
    handle.scale.setScalar(diameter);
    handle.updateWorldMatrix(true, false);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    setRay(event);
    if (!raycaster.intersectObject(handle).length) return;
    const worldMatrix = model.matrixWorld.clone().multiply(matrix);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(worldMatrix);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, model.localToWorld(center.clone()));
    const point = localPoint(event, plane);
    if (!point) return;
    const initial = point.dot(diagonal) / diagonal.lengthSq();
    if (Math.abs(initial) < 0.00001) return;
    drag = { id: event.pointerId, initial, factor: 1, plane, preview: referenceTransformPreview(model, object.id, false), damping: controls.enableDamping };
    event.preventDefault(); event.stopImmediatePropagation();
    controls.enabled = false; controls.enableDamping = false;
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag) { setRay(event); const nextHovered = raycaster.intersectObject(handle).length > 0; if (nextHovered !== hovered) { hovered = nextHovered; material.color.set(hovered ? "#ffd000" : "#ffffff"); invalidate(); } return; }
    if (event.pointerId !== drag.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const point = localPoint(event, drag.plane);
    if (!point) return;
    let factor = Math.max(0.001, point.dot(diagonal) / diagonal.lengthSq() / drag.initial);
    const width = image.width * object.transform.scale.x;
    if (snap > 0) factor = Math.max(snap, Math.round(width * factor / snap) * snap) / width;
    drag.factor = factor;
    const scaleMatrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z).multiply(new THREE.Matrix4().makeScale(factor, factor, factor)).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    drag.preview.apply(scaleMatrix);
    update(); invalidate();
  };
  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current = drag; drag = null;
    current.preview.restore();
    controls.enabled = true; controls.enableDamping = current.damping;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.type === "pointerup") onScale(current.factor);
    update(); invalidate();
  };
  canvas.addEventListener("pointerdown", down, true); canvas.addEventListener("pointermove", move, true);
  canvas.addEventListener("pointerup", finish, true); canvas.addEventListener("pointercancel", finish, true); canvas.addEventListener("lostpointercapture", finish, true);
  update(); invalidate();
  return { group: layer, labelHandle: handle, scaleFactor: () => drag?.factor ?? 1, update, dispose: () => {
    if (drag) { controls.enabled = true; controls.enableDamping = drag.damping; drag.preview.restore(); }
    canvas.removeEventListener("pointerdown", down, true); canvas.removeEventListener("pointermove", move, true);
    canvas.removeEventListener("pointerup", finish, true); canvas.removeEventListener("pointercancel", finish, true); canvas.removeEventListener("lostpointercapture", finish, true);
    layer.removeFromParent(); texture.dispose(); material.dispose(); invalidate();
  } };
}
