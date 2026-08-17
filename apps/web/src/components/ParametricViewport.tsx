"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";
import { operationPreviewStyle, operationPreviewWireframePositions } from "@/lib/viewportGeometry";
import { AdaptiveViewportResolution, viewportPerformanceOptions, viewportRenderProfile, type ViewportRenderQuality } from "@/lib/viewportPerformance";
import type { ParametricObjectRenderRecord, RenderMesh } from "@/types/parametric";

export type CameraView = { name: "iso" | "top" | "front" | "right" | "zoom-in" | "zoom-out" | "home" | "fit" | "selection" | "custom"; token: number; direction?: [number, number, number] };
export type CameraProjection = "perspective" | "orthographic";
export type CameraOrientation = { azimuth: number; polar: number };

export type ViewportSelection = {
  id: string;
  x: number;
  y: number;
  baseZ: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  operationPreview?: {
    shape: "box" | "cylinder";
    mode: "add" | "hole" | "common";
    color: string;
    historical: boolean;
  };
};

type Props = {
  mesh: RenderMesh | null;
  objectRecords?: ParametricObjectRenderRecord[];
  objectColors?: Record<string, string>;
  operationContext?: { color: string; mesh: RenderMesh; opacity: number } | null;
  isolatedHistoryObjectId?: string | null;
  color: string;
  workplane?: { width: number; depth: number; gridStep: number };
  view: CameraView;
  projection?: CameraProjection;
  renderQuality?: ViewportRenderQuality;
  selection?: ViewportSelection | null;
  snap?: number;
  onSelectionMove?: (x: number, y: number) => void;
  onSelectionRotate?: (rotation: number) => void;
  onSelectionResize?: (x: number, y: number, width: number, depth: number) => void;
  onSelectionHeight?: (height: number) => void;
  onCameraOrientation?: (orientation: CameraOrientation) => void;
  onObjectSelect?: (objectId: string) => void;
  onObjectsSelect?: (objectIds: string[]) => void;
  onEmptySelect?: () => void;
};

type CachedObjectRender = {
  geometryFingerprint: string | null;
  body: THREE.Mesh;
  edges: THREE.LineSegments;
};

function setMaterialColor(material: THREE.Material, color: THREE.ColorRepresentation) {
  if (material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial) material.color.set(color);
}

function workplaneMaterial(quality: ViewportRenderQuality) {
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ color: "#ddf8ff", transparent: true, opacity: 0.68, roughness: 1, metalness: 0 })
    : new THREE.MeshLambertMaterial({ color: "#ddf8ff", transparent: true, opacity: 0.68 });
}

function objectMaterial(quality: ViewportRenderQuality, color: THREE.ColorRepresentation) {
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: 1 })
    : new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1 });
}

function previewMaterial(quality: ViewportRenderQuality, color: THREE.ColorRepresentation, opacity: number) {
  const shared = { color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false };
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ ...shared, roughness: 0.7 })
    : new THREE.MeshLambertMaterial(shared);
}

function disposeCachedObjectRender(group: THREE.Group | null, cached: CachedObjectRender) {
  group?.remove(cached.body, cached.edges);
  cached.body.geometry.dispose();
  cached.edges.geometry.dispose();
  const bodyMaterials = Array.isArray(cached.body.material) ? cached.body.material : [cached.body.material];
  const edgeMaterials = Array.isArray(cached.edges.material) ? cached.edges.material : [cached.edges.material];
  bodyMaterials.forEach((material) => material.dispose());
  edgeMaterials.forEach((material) => material.dispose());
}

export function ParametricViewport({ mesh, objectRecords = [], objectColors, operationContext = null, isolatedHistoryObjectId = null, color, workplane = { width: 200, depth: 200, gridStep: 5 }, view, projection = "orthographic", renderQuality = "normal", selection = null, snap = 1, onSelectionMove, onSelectionRotate, onSelectionResize, onSelectionHeight, onCameraOrientation, onObjectSelect, onObjectsSelect, onEmptySelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const workplaneRef = useRef<THREE.Group | null>(null);
  const selectionRootRef = useRef<THREE.Group | null>(null);
  const operationContextRef = useRef<THREE.Mesh | null>(null);
  const selectionHitboxRef = useRef<THREE.Mesh | null>(null);
  const rotationHitboxRef = useRef<THREE.Mesh | null>(null);
  const resizeHitboxesRef = useRef<THREE.Mesh[]>([]);
  const selectionRef = useRef(selection);
  const moveRef = useRef(onSelectionMove);
  const rotateRef = useRef(onSelectionRotate);
  const resizeRef = useRef(onSelectionResize);
  const heightRef = useRef(onSelectionHeight);
  const orientationRef = useRef(onCameraOrientation);
  const objectSelectRef = useRef(onObjectSelect);
  const objectsSelectRef = useRef(onObjectsSelect);
  const emptySelectRef = useRef(onEmptySelect);
  const snapRef = useRef(snap);
  const isolatedHistoryObjectIdRef = useRef(isolatedHistoryObjectId);
  const invalidateRef = useRef<() => void>(() => undefined);
  const hasFittedRef = useRef(false);
  const objectRenderCacheRef = useRef(new Map<string, CachedObjectRender>());

  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { moveRef.current = onSelectionMove; }, [onSelectionMove]);
  useEffect(() => { rotateRef.current = onSelectionRotate; }, [onSelectionRotate]);
  useEffect(() => { resizeRef.current = onSelectionResize; }, [onSelectionResize]);
  useEffect(() => { heightRef.current = onSelectionHeight; }, [onSelectionHeight]);
  useEffect(() => { orientationRef.current = onCameraOrientation; }, [onCameraOrientation]);
  useEffect(() => { objectSelectRef.current = onObjectSelect; }, [onObjectSelect]);
  useEffect(() => { objectsSelectRef.current = onObjectsSelect; }, [onObjectsSelect]);
  useEffect(() => { emptySelectRef.current = onEmptySelect; }, [onEmptySelect]);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { isolatedHistoryObjectIdRef.current = isolatedHistoryObjectId; }, [isolatedHistoryObjectId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#edf4f7");
    hasFittedRef.current = false;
    const camera = projection === "orthographic"
      ? new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 2000)
      : new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(95, 78, 110);
    const renderProfile = viewportRenderProfile(renderQuality);
    const resolution = new AdaptiveViewportResolution(window.devicePixelRatio, viewportPerformanceOptions(renderQuality));
    const renderer = new THREE.WebGLRenderer({ antialias: renderProfile.antialias, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(resolution.pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = renderQuality === "normal" ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.target.set(0, 5, 0);
    controls.minDistance = 18;
    controls.maxDistance = 420;
    let frame = 0;
    let disposed = false;
    const requestRender = () => {
      if (!disposed && frame === 0) frame = requestAnimationFrame(render);
    };
    const render = (now: number) => {
      frame = 0;
      const controlsChanged = controls.update();
      const nextPixelRatio = resolution.recordFrame(now);
      if (nextPixelRatio !== null) renderer.setPixelRatio(nextPixelRatio);
      renderer.render(scene, camera);
      if (controlsChanged) requestRender();
    };
    const onControlsChange = () => {
      orientationRef.current?.({ azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() });
      requestRender();
    };
    controls.addEventListener("change", onControlsChange);
    invalidateRef.current = requestRender;

    scene.add(new THREE.HemisphereLight("#ffffff", "#9fb4bf", 2.1));
    const key = new THREE.DirectionalLight("#ffffff", 3.2);
    key.position.set(80, 130, 70);
    key.castShadow = true;
    key.shadow.mapSize.set(renderProfile.shadowMapSize, renderProfile.shadowMapSize);
    key.shadow.camera.left = -120;
    key.shadow.camera.right = 120;
    key.shadow.camera.top = 120;
    key.shadow.camera.bottom = -120;
    scene.add(key);

    const workplaneGroup = new THREE.Group();
    scene.add(workplaneGroup);

    const modelGroup = new THREE.Group();
    modelGroup.rotation.x = -Math.PI / 2;
    scene.add(modelGroup);

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let interaction: "move" | "rotate" | "resize" | "height" | null = null;
    let pendingPosition: { x: number; y: number } | null = null;
    let pendingRotation: number | null = null;
    let pendingResize: { x: number; y: number; width: number; depth: number } | null = null;
    let pendingHeight: number | null = null;
    let rotationOffset = 0;
    let resizeAxes = { x: 0, y: 0 };
    let resizeStart: ViewportSelection | null = null;
    let pickCandidate: { pointerId: number; x: number; y: number; boxSelecting: boolean } | null = null;
    const updateSelectionBox = (candidate: NonNullable<typeof pickCandidate>, clientX: number, clientY: number) => {
      const box = selectionBoxRef.current;
      if (!box) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const left = Math.max(bounds.left, Math.min(candidate.x, clientX));
      const top = Math.max(bounds.top, Math.min(candidate.y, clientY));
      const right = Math.min(bounds.right, Math.max(candidate.x, clientX));
      const bottom = Math.min(bounds.bottom, Math.max(candidate.y, clientY));
      box.style.display = "block";
      box.style.left = `${left - bounds.left}px`;
      box.style.top = `${top - bounds.top}px`;
      box.style.width = `${Math.max(0, right - left)}px`;
      box.style.height = `${Math.max(0, bottom - top)}px`;
    };
    const hideSelectionBox = () => {
      const box = selectionBoxRef.current;
      if (box) box.style.display = "none";
    };
    const objectsInSelectionBox = (candidate: NonNullable<typeof pickCandidate>, clientX: number, clientY: number) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      const selectionLeft = Math.max(bounds.left, Math.min(candidate.x, clientX));
      const selectionTop = Math.max(bounds.top, Math.min(candidate.y, clientY));
      const selectionRight = Math.min(bounds.right, Math.max(candidate.x, clientX));
      const selectionBottom = Math.min(bounds.bottom, Math.max(candidate.y, clientY));
      const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
      const corner = new THREE.Vector3();
      const center = new THREE.Vector3();
      const objectBounds = new THREE.Box3();
      const ids: string[] = [];
      for (const body of modelGroup.children) {
        if (!(body instanceof THREE.Mesh) || typeof body.userData.objectId !== "string") continue;
        objectBounds.setFromObject(body);
        objectBounds.getCenter(center);
        if (center.sub(camera.position).dot(cameraDirection) <= 0) continue;
        let left = Number.POSITIVE_INFINITY;
        let top = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < 8; index += 1) {
          corner.set(
            index & 1 ? objectBounds.max.x : objectBounds.min.x,
            index & 2 ? objectBounds.max.y : objectBounds.min.y,
            index & 4 ? objectBounds.max.z : objectBounds.min.z,
          ).project(camera);
          const x = bounds.left + (corner.x + 1) * bounds.width / 2;
          const y = bounds.top + (1 - corner.y) * bounds.height / 2;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
        if (right >= selectionLeft && left <= selectionRight && bottom >= selectionTop && top <= selectionBottom) ids.push(body.userData.objectId);
      }
      return ids;
    };
    const setPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hitbox = selectionHitboxRef.current;
      const rotationHitbox = rotationHitboxRef.current;
      const resizeHitboxes = resizeHitboxesRef.current;
      const selected = selectionRef.current;
      setPointer(event);
      if (hitbox && selected) {
        const center = new THREE.Vector3();
        hitbox.getWorldPosition(center);
        const resizeHit = raycaster.intersectObjects(resizeHitboxes, false)[0];
        if (resizeHit && resizeHit.object.userData.resizeZ) {
          const normal = camera.getWorldDirection(new THREE.Vector3());
          normal.y = 0;
          if (normal.lengthSq() < 0.0001) normal.set(0, 0, 1);
          dragPlane.setFromNormalAndCoplanarPoint(normal.normalize(), center);
          if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
            interaction = "height";
            resizeStart = { ...selected };
            pendingHeight = selected.height;
          }
        } else {
          dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), center);
        }
        if (!interaction && raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          if (rotationHitbox && raycaster.intersectObject(rotationHitbox, false).length > 0) {
            interaction = "rotate";
            const pointerAngle = Math.atan2(-(dragPoint.z - center.z), dragPoint.x - center.x) * 180 / Math.PI;
            rotationOffset = selected.rotation - pointerAngle;
            pendingRotation = selected.rotation;
          } else {
            if (resizeHit) {
              interaction = "resize";
              resizeAxes = { x: Number(resizeHit.object.userData.resizeX), y: Number(resizeHit.object.userData.resizeY) };
              resizeStart = { ...selected };
              pendingResize = { x: selected.x, y: selected.y, width: selected.width, depth: selected.depth };
            }
          }
          if (!interaction && raycaster.intersectObject(hitbox, false).length > 0) {
            interaction = "move";
            dragOffset.set(center.x - dragPoint.x, 0, center.z - dragPoint.z);
            pendingPosition = { x: selected.x, y: selected.y };
          }
        }
      }
      if (!interaction) {
        pickCandidate = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, boxSelecting: false };
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      controls.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!interaction) {
        if (pickCandidate && pickCandidate.pointerId === event.pointerId && Math.hypot(event.clientX - pickCandidate.x, event.clientY - pickCandidate.y) > 5) {
          pickCandidate.boxSelecting = true;
          updateSelectionBox(pickCandidate, event.clientX, event.clientY);
        }
        return;
      }
      setPointer(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
      const root = selectionRootRef.current;
      const selected = selectionRef.current;
      if (!root || !selected) return;
      if (interaction === "move") {
        const grid = Math.max(0.01, snapRef.current);
        const x = Math.round((dragPoint.x + dragOffset.x) / grid) * grid;
        const y = Math.round((-(dragPoint.z + dragOffset.z)) / grid) * grid;
        pendingPosition = { x, y };
        root.position.set(x, y, selected.baseZ + selected.height / 2);
      } else if (interaction === "rotate") {
        const center = new THREE.Vector3();
        root.getWorldPosition(center);
        const pointerAngle = Math.atan2(-(dragPoint.z - center.z), dragPoint.x - center.x) * 180 / Math.PI;
        pendingRotation = Math.round((pointerAngle + rotationOffset) / 5) * 5;
        root.rotation.z = THREE.MathUtils.degToRad(pendingRotation);
      } else if (interaction === "resize" && resizeStart) {
        const grid = Math.max(0.01, snapRef.current);
        const angle = THREE.MathUtils.degToRad(resizeStart.rotation);
        const dx = dragPoint.x - resizeStart.x;
        const dy = -dragPoint.z - resizeStart.y;
        const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
        const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
        const width = resizeAxes.x === 0 ? resizeStart.width : Math.max(grid, Math.round((resizeAxes.x * localX + resizeStart.width / 2) / grid) * grid);
        const depth = resizeAxes.y === 0 ? resizeStart.depth : Math.max(grid, Math.round((resizeAxes.y * localY + resizeStart.depth / 2) / grid) * grid);
        const shiftX = resizeAxes.x * (width - resizeStart.width) / 2;
        const shiftY = resizeAxes.y * (depth - resizeStart.depth) / 2;
        const x = resizeStart.x + shiftX * Math.cos(angle) - shiftY * Math.sin(angle);
        const y = resizeStart.y + shiftX * Math.sin(angle) + shiftY * Math.cos(angle);
        pendingResize = { x, y, width, depth };
        root.position.x = x;
        root.position.y = y;
        root.scale.x = width / resizeStart.width;
        root.scale.y = depth / resizeStart.depth;
      } else if (interaction === "height" && resizeStart) {
        const grid = Math.max(0.01, snapRef.current);
        const height = Math.max(grid, Math.round((dragPoint.y - resizeStart.baseZ) / grid) * grid);
        pendingHeight = height;
        root.position.z = resizeStart.baseZ + height / 2;
        root.scale.z = height / resizeStart.height;
      }
      requestRender();
    };
    const stopDragging = (event: PointerEvent, cancelled = false) => {
      if (!interaction) {
        const candidate = pickCandidate;
        pickCandidate = null;
        hideSelectionBox();
        if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
        if (cancelled || !candidate || candidate.pointerId !== event.pointerId) return;
        if (candidate.boxSelecting) {
          const objectIds = objectsInSelectionBox(candidate, event.clientX, event.clientY);
          if (objectIds.length > 0) objectsSelectRef.current?.(objectIds);
          else emptySelectRef.current?.();
          return;
        }
        setPointer(event);
        const bodies = modelGroup.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && typeof child.userData.objectId === "string");
        const hit = raycaster.intersectObjects(bodies, false)[0];
        const objectId = hit?.object.userData.objectId;
        if (typeof objectId === "string") objectSelectRef.current?.(objectId);
        else emptySelectRef.current?.();
        return;
      }
      interaction = null;
      pickCandidate = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = "default";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (cancelled) {
        const selected = selectionRef.current;
        const root = selectionRootRef.current;
        if (selected && root) {
          root.position.set(selected.x, selected.y, selected.baseZ + selected.height / 2);
          root.rotation.z = THREE.MathUtils.degToRad(selected.rotation);
          root.scale.set(1, 1, 1);
          requestRender();
        }
      } else {
        if (pendingPosition) moveRef.current?.(pendingPosition.x, pendingPosition.y);
        if (pendingRotation !== null) rotateRef.current?.(pendingRotation);
        if (pendingResize) resizeRef.current?.(pendingResize.x, pendingResize.y, pendingResize.width, pendingResize.depth);
        if (pendingHeight !== null) heightRef.current?.(pendingHeight);
      }
      pendingPosition = null;
      pendingRotation = null;
      pendingResize = null;
      pendingHeight = null;
      resizeStart = null;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", stopDragging);
    const cancelDragging = (event: PointerEvent) => stopDragging(event, true);
    renderer.domElement.addEventListener("pointercancel", cancelDragging);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
      else {
        camera.left = -90 * aspect;
        camera.right = 90 * aspect;
        camera.top = 90;
        camera.bottom = -90;
      }
      camera.updateProjectionMatrix();
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    requestRender();

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    modelRef.current = modelGroup;
    workplaneRef.current = workplaneGroup;
    return () => {
      disposed = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      controls.removeEventListener("change", onControlsChange);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", stopDragging);
      renderer.domElement.removeEventListener("pointercancel", cancelDragging);
      for (const cached of objectRenderCacheRef.current.values()) disposeCachedObjectRender(modelGroup, cached);
      objectRenderCacheRef.current.clear();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
      workplaneRef.current = null;
      invalidateRef.current = () => undefined;
    };
  }, [projection, renderQuality]);

  useEffect(() => {
    const group = workplaneRef.current;
    if (!group) return;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose()); else child.material.dispose();
      }
    });
    group.clear();

    const width = Math.max(60, workplane.width);
    const depth = Math.max(60, workplane.depth);
    const requestedStep = Math.max(0.1, workplane.gridStep);
    const step = Math.max(requestedStep, Math.max(width, depth) / 1000);
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      workplaneMaterial(renderQuality),
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = -0.08;
    surface.receiveShadow = true;
    group.add(surface);

    const minor: number[] = [];
    const major: number[] = [];
    const axes: number[] = [];
    const border: number[] = [];
    const pushLine = (target: number[], x1: number, z1: number, x2: number, z2: number) => target.push(x1, 0, z1, x2, 0, z2);
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const xCount = Math.floor(halfWidth / step);
    const zCount = Math.floor(halfDepth / step);
    for (let index = -xCount; index <= xCount; index += 1) {
      const x = index * step;
      if (index === 0) pushLine(axes, x, -halfDepth, x, halfDepth);
      else pushLine(index % 5 === 0 ? major : minor, x, -halfDepth, x, halfDepth);
    }
    for (let index = -zCount; index <= zCount; index += 1) {
      const z = index * step;
      if (index === 0) pushLine(axes, -halfWidth, z, halfWidth, z);
      else pushLine(index % 5 === 0 ? major : minor, -halfWidth, z, halfWidth, z);
    }
    pushLine(border, -halfWidth, -halfDepth, halfWidth, -halfDepth);
    pushLine(border, halfWidth, -halfDepth, halfWidth, halfDepth);
    pushLine(border, halfWidth, halfDepth, -halfWidth, halfDepth);
    pushLine(border, -halfWidth, halfDepth, -halfWidth, -halfDepth);
    const addLines = (positions: number[], color: string, opacity: number) => {
      if (positions.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      lines.position.y = 0.01;
      group.add(lines);
    };
    addLines(minor, "#91dff0", 0.55);
    addLines(major, "#4bbddf", 0.7);
    addLines(axes, "#34aad2", 0.88);
    addLines(border, "#58c5e6", 0.9);
    invalidateRef.current();
  }, [projection, renderQuality, workplane.depth, workplane.gridStep, workplane.width]);

  useEffect(() => {
    const group = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;
    const renderItems = objectRecords.length > 0
      ? objectRecords.map((item) => ({ mesh: item.mesh, color: item.color, objectId: item.objectId as string | null, renderId: item.renderId, geometryFingerprint: item.geometryFingerprint }))
      : mesh ? [{ mesh, color, objectId: null, renderId: "combined", geometryFingerprint: null }] : [];
    const requestedKeys = new Set(renderItems.map((item) => item.objectId ?? "__combined"));
    let resourcesChanged = false;
    for (const [key, cached] of objectRenderCacheRef.current) {
      if (requestedKeys.has(key)) continue;
      disposeCachedObjectRender(group, cached);
      objectRenderCacheRef.current.delete(key);
      resourcesChanged = true;
    }
    if (renderItems.length === 0) {
      invalidateRef.current();
      return;
    }

    for (const item of renderItems) {
      const key = item.objectId ?? "__combined";
      const cached = objectRenderCacheRef.current.get(key);
      if (cached && item.geometryFingerprint !== null && cached.geometryFingerprint === item.geometryFingerprint) {
        cached.body.visible = item.objectId !== isolatedHistoryObjectIdRef.current;
        const materials = Array.isArray(cached.body.material) ? cached.body.material : [cached.body.material];
        for (const material of materials) setMaterialColor(material, item.color);
        continue;
      }
      if (cached) disposeCachedObjectRender(group, cached);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(item.mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(item.mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(item.mesh.indices, 1));
      geometry.computeBoundingSphere();
      geometry.boundsTree = new MeshBVH(geometry);
      const body = new THREE.Mesh(
        geometry,
        objectMaterial(renderQuality, item.color),
      );
      body.raycast = acceleratedRaycast;
      body.castShadow = true;
      body.receiveShadow = true;
      if (item.objectId) body.userData.objectId = item.objectId;
      body.userData.renderId = item.renderId;
      body.visible = item.objectId !== isolatedHistoryObjectIdRef.current;
      group.add(body);

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(item.mesh.edges, 3));
      const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
        color: "#000000",
        linewidth: 1,
        depthTest: !selectionRef.current?.operationPreview,
      }));
      if (item.objectId) edges.userData.objectId = item.objectId;
      edges.userData.renderId = item.renderId;
      edges.userData.finalReferenceWireframe = true;
      edges.renderOrder = 17;
      group.add(edges);
      objectRenderCacheRef.current.set(key, { geometryFingerprint: item.geometryFingerprint, body, edges });
      resourcesChanged = true;
    }

    if (resourcesChanged && rendererRef.current) rendererRef.current.shadowMap.needsUpdate = true;

    if (!hasFittedRef.current) {
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      controls.target.copy(center);
      const distance = Math.max(55, Math.max(size.x, size.y, size.z) * 2.35);
      camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.72, distance));
      camera.near = Math.max(0.1, distance / 1000);
      camera.far = distance * 12;
      if (camera instanceof THREE.OrthographicCamera) camera.zoom = Math.min(8, Math.max(0.1, 110 / Math.max(size.x, size.y, size.z, 1)));
      camera.updateProjectionMatrix();
      controls.update();
      hasFittedRef.current = true;
    }
    invalidateRef.current();
  }, [mesh, objectRecords, color, projection, renderQuality]);

  useEffect(() => {
    const group = modelRef.current;
    if (!group) return;
    const inspectOperation = Boolean(selection?.operationPreview);
    for (const child of group.children) {
      if (!(child instanceof THREE.LineSegments) || !child.userData.finalReferenceWireframe) continue;
      child.visible = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.depthTest = !inspectOperation;
        material.needsUpdate = true;
      }
    }
    invalidateRef.current();
  }, [selection?.operationPreview]);

  useEffect(() => {
    const group = modelRef.current;
    if (!group) return;
    for (const child of group.children) {
      if (child instanceof THREE.Mesh && typeof child.userData.objectId === "string") child.visible = child.userData.objectId !== isolatedHistoryObjectId;
    }
    invalidateRef.current();
  }, [isolatedHistoryObjectId, projection, renderQuality]);

  useEffect(() => {
    if (!objectColors) return;
    const group = modelRef.current;
    if (!group) return;
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || typeof child.userData.objectId !== "string") continue;
      const nextColor = objectColors[child.userData.objectId];
      if (!nextColor) continue;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        setMaterialColor(material, nextColor);
      }
    }
    invalidateRef.current();
  }, [objectColors, projection, renderQuality]);

  useEffect(() => {
    const group = modelRef.current;
    if (!group) return;
    const previous = operationContextRef.current;
    if (previous) {
      previous.geometry.dispose();
      if (Array.isArray(previous.material)) previous.material.forEach((material) => material.dispose());
      else previous.material.dispose();
      group.remove(previous);
    }
    operationContextRef.current = null;
    if (!operationContext) {
      invalidateRef.current();
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(operationContext.mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(operationContext.mesh.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(operationContext.mesh.indices, 1));
    const contextBody = new THREE.Mesh(geometry, previewMaterial(renderQuality, operationContext.color, operationContext.opacity));
    contextBody.renderOrder = 16;
    group.add(contextBody);
    operationContextRef.current = contextBody;
    invalidateRef.current();
  }, [operationContext, projection, renderQuality]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const previous = selectionRootRef.current;
    if (previous) {
      previous.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
          else child.material.dispose();
        }
      });
      model.remove(previous);
    }
    selectionRootRef.current = null;
    selectionHitboxRef.current = null;
    rotationHitboxRef.current = null;
    resizeHitboxesRef.current = [];
    if (!selection) {
      invalidateRef.current();
      return;
    }
    const root = new THREE.Group();
    root.position.set(selection.x, selection.y, selection.baseZ + selection.height / 2);
    root.rotation.z = THREE.MathUtils.degToRad(selection.rotation);
    if (selection.operationPreview) {
      const operationPreview = selection.operationPreview;
      const previewStyle = operationPreviewStyle(operationPreview.mode, operationPreview.historical);
      if (previewStyle.fillOpacity !== null) {
        const previewGeometry = operationPreview.shape === "cylinder"
          ? new THREE.CylinderGeometry(0.5, 0.5, selection.height, 64)
          : new THREE.BoxGeometry(selection.width, selection.depth, selection.height);
        if (operationPreview.shape === "cylinder") {
          previewGeometry.rotateX(Math.PI / 2);
          previewGeometry.scale(selection.width, selection.depth, 1);
        }
        const preview = new THREE.Mesh(previewGeometry, previewMaterial(renderQuality, operationPreview.color, previewStyle.fillOpacity));
        preview.renderOrder = 17;
        root.add(preview);
      }
      if (previewStyle.wireframe) {
        const roleColor = operationPreview.mode === "add" ? "#378451" : operationPreview.mode === "hole" ? "#b6524d" : "#7256aa";
        const lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(operationPreviewWireframePositions(operationPreview.shape, selection.width, selection.depth, selection.height));
        const preview = new LineSegments2(lineGeometry, new LineMaterial({ color: roleColor, linewidth: 2, depthTest: false, transparent: true, opacity: 1 }));
        preview.renderOrder = 18;
        root.add(preview);
      }
    }
    const boxGeometry = axisColoredBoxGeometry(selection.width, selection.depth, selection.height);
    const outline = new THREE.LineSegments(
      boxGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2, depthTest: false }),
    );
    outline.renderOrder = 20;
    root.add(outline);
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(selection.width, selection.depth, selection.height), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.renderOrder = 19;
    root.add(hitbox);
    const handleGeometry = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    const cornerMaterial = new THREE.MeshBasicMaterial({ color: "#f2c94c", depthTest: false });
    const xHandleMaterial = new THREE.MeshBasicMaterial({ color: "#e25353", depthTest: false });
    const yHandleMaterial = new THREE.MeshBasicMaterial({ color: "#42a866", depthTest: false });
    for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const handleMaterial = sy === 0 ? xHandleMaterial : sx === 0 ? yHandleMaterial : cornerMaterial;
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      handle.position.set((selection.width / 2) * sx, (selection.depth / 2) * sy, -selection.height / 2);
      handle.renderOrder = 21;
      root.add(handle);
      const resizeHitbox = new THREE.Mesh(
        new THREE.BoxGeometry(6, 6, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      resizeHitbox.position.copy(handle.position);
      resizeHitbox.userData.resizeX = sx;
      resizeHitbox.userData.resizeY = sy;
      root.add(resizeHitbox);
      resizeHitboxesRef.current.push(resizeHitbox);
    }
    const zGuideGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -selection.height / 2),
      new THREE.Vector3(0, 0, selection.height / 2 + 5),
    ]);
    const zGuide = new THREE.Line(zGuideGeometry, new THREE.LineBasicMaterial({ color: "#398bea", depthTest: false }));
    zGuide.renderOrder = 21;
    root.add(zGuide);
    const zHandle = new THREE.Mesh(handleGeometry, new THREE.MeshBasicMaterial({ color: "#398bea", depthTest: false }));
    zHandle.position.set(0, 0, selection.height / 2 + 5);
    zHandle.renderOrder = 22;
    root.add(zHandle);
    const zHitbox = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    zHitbox.position.copy(zHandle.position);
    zHitbox.userData.resizeZ = true;
    root.add(zHitbox);
    resizeHitboxesRef.current.push(zHitbox);
    const rotationRadius = Math.max(selection.width, selection.depth) * 0.7 + 6;
    const rotationPlaneZ = -selection.height / 2 + 0.2;
    const rotationPoints = Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * rotationRadius, Math.sin(angle) * rotationRadius, rotationPlaneZ);
    });
    const rotationRing = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(rotationPoints),
      new THREE.LineBasicMaterial({ color: "#7256aa", depthTest: false, transparent: true, opacity: 0.95 }),
    );
    rotationRing.renderOrder = 21;
    root.add(rotationRing);
    const rotationHandle = new THREE.Mesh(
      new THREE.SphereGeometry(2, 18, 12),
      new THREE.MeshBasicMaterial({ color: "#7256aa", depthTest: false }),
    );
    rotationHandle.position.set(rotationRadius, 0, rotationPlaneZ);
    rotationHandle.renderOrder = 22;
    root.add(rotationHandle);
    const rotationHitbox = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    rotationHitbox.position.copy(rotationHandle.position);
    root.add(rotationHitbox);
    model.add(root);
    selectionRootRef.current = root;
    selectionHitboxRef.current = hitbox;
    rotationHitboxRef.current = rotationHitbox;
    invalidateRef.current();
  }, [selection, projection, renderQuality]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = controls.target;
    const distance = Math.max(75, camera.position.distanceTo(target));
    if (view.name === "zoom-in" || view.name === "zoom-out") {
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom *= view.name === "zoom-in" ? 1.32 : 0.76;
        camera.zoom = Math.min(20, Math.max(0.05, camera.zoom));
        camera.updateProjectionMatrix();
      } else {
        const offset = camera.position.clone().sub(target).multiplyScalar(view.name === "zoom-in" ? 0.72 : 1.32);
        camera.position.copy(target).add(offset);
      }
      controls.update();
      return;
    }
    if (view.name === "fit" || view.name === "selection") {
      const source = view.name === "selection" ? selectionRootRef.current : modelRef.current;
      if (!source) return;
      const box = new THREE.Box3().setFromObject(source);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z, 1);
      const direction = camera.position.clone().sub(target).normalize();
      controls.target.copy(center);
      camera.position.copy(center).add(direction.multiplyScalar(Math.max(55, extent * 2.35)));
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = Math.min(20, Math.max(0.05, 110 / extent));
        camera.updateProjectionMatrix();
      }
      camera.lookAt(center);
      controls.update();
      return;
    }
    if (view.name === "custom") {
      if (view.direction) {
        const direction = new THREE.Vector3(...view.direction).normalize();
        camera.position.copy(target).add(direction.multiplyScalar(distance));
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        controls.update();
      }
      return;
    }
    const vectors: Record<"iso" | "top" | "front" | "right" | "home", THREE.Vector3> = {
      iso: new THREE.Vector3(1, 0.78, 1),
      top: new THREE.Vector3(0, 1, 0.001),
      front: new THREE.Vector3(0, 0.001, 1),
      right: new THREE.Vector3(1, 0.001, 0),
      home: new THREE.Vector3(1, 0.78, 1),
    };
    camera.position.copy(target).add(vectors[view.name].normalize().multiplyScalar(distance));
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    controls.update();
    invalidateRef.current();
  }, [view]);

  return <div className="parametric-viewport" ref={hostRef} aria-label="Vista 3D de la pieza"><div ref={selectionBoxRef} className="parametric-selection-box" aria-hidden="true" /></div>;
}

function axisColoredBoxGeometry(width: number, depth: number, height: number) {
  const x = width / 2;
  const y = depth / 2;
  const z = height / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const axisColors = {
    x: new THREE.Color("#e25353"),
    y: new THREE.Color("#42a866"),
    z: new THREE.Color("#398bea"),
  };
  const addEdge = (start: [number, number, number], end: [number, number, number], axis: keyof typeof axisColors) => {
    positions.push(...start, ...end);
    const color = axisColors[axis];
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  };
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) addEdge([-x, sy * y, sz * z], [x, sy * y, sz * z], "x");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addEdge([sx * x, -y, sz * z], [sx * x, y, sz * z], "y");
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) addEdge([sx * x, sy * y, -z], [sx * x, sy * y, z], "z");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
