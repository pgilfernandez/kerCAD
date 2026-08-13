"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RenderMesh } from "@/types/parametric";

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
};

type Props = {
  mesh: RenderMesh | null;
  objectMeshes?: Array<{ objectId: string; color: string; mesh: RenderMesh }>;
  color: string;
  workplane?: { width: number; depth: number; gridStep: number };
  view: CameraView;
  projection?: CameraProjection;
  selection?: ViewportSelection | null;
  snap?: number;
  onSelectionMove?: (x: number, y: number) => void;
  onSelectionRotate?: (rotation: number) => void;
  onSelectionResize?: (x: number, y: number, width: number, depth: number) => void;
  onCameraOrientation?: (orientation: CameraOrientation) => void;
  onObjectSelect?: (objectId: string) => void;
  onEmptySelect?: () => void;
};

export function ParametricViewport({ mesh, objectMeshes = [], color, workplane = { width: 200, depth: 200, gridStep: 5 }, view, projection = "perspective", selection = null, snap = 1, onSelectionMove, onSelectionRotate, onSelectionResize, onCameraOrientation, onObjectSelect, onEmptySelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const workplaneRef = useRef<THREE.Group | null>(null);
  const selectionRootRef = useRef<THREE.Group | null>(null);
  const selectionHitboxRef = useRef<THREE.Mesh | null>(null);
  const rotationHitboxRef = useRef<THREE.Mesh | null>(null);
  const resizeHitboxesRef = useRef<THREE.Mesh[]>([]);
  const selectionRef = useRef(selection);
  const moveRef = useRef(onSelectionMove);
  const rotateRef = useRef(onSelectionRotate);
  const resizeRef = useRef(onSelectionResize);
  const orientationRef = useRef(onCameraOrientation);
  const objectSelectRef = useRef(onObjectSelect);
  const emptySelectRef = useRef(onEmptySelect);
  const snapRef = useRef(snap);
  const hasFittedRef = useRef(false);

  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { moveRef.current = onSelectionMove; }, [onSelectionMove]);
  useEffect(() => { rotateRef.current = onSelectionRotate; }, [onSelectionRotate]);
  useEffect(() => { resizeRef.current = onSelectionResize; }, [onSelectionResize]);
  useEffect(() => { orientationRef.current = onCameraOrientation; }, [onCameraOrientation]);
  useEffect(() => { objectSelectRef.current = onObjectSelect; }, [onObjectSelect]);
  useEffect(() => { emptySelectRef.current = onEmptySelect; }, [onEmptySelect]);
  useEffect(() => { snapRef.current = snap; }, [snap]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#edf4f7");
    scene.fog = new THREE.Fog("#edf4f7", 210, 380);
    hasFittedRef.current = false;
    const camera = projection === "orthographic"
      ? new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 2000)
      : new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(95, 78, 110);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.target.set(0, 5, 0);
    controls.minDistance = 18;
    controls.maxDistance = 420;
    const emitOrientation = () => orientationRef.current?.({ azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() });
    controls.addEventListener("change", emitOrientation);

    scene.add(new THREE.HemisphereLight("#ffffff", "#9fb4bf", 2.1));
    const key = new THREE.DirectionalLight("#ffffff", 3.2);
    key.position.set(80, 130, 70);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
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
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let interaction: "move" | "rotate" | "resize" | null = null;
    let pendingPosition: { x: number; y: number } | null = null;
    let pendingRotation: number | null = null;
    let pendingResize: { x: number; y: number; width: number; depth: number } | null = null;
    let rotationOffset = 0;
    let resizeAxes = { x: 0, y: 0 };
    let resizeStart: ViewportSelection | null = null;
    let pickCandidate: { pointerId: number; x: number; y: number } | null = null;
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
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), center);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          if (rotationHitbox && raycaster.intersectObject(rotationHitbox, false).length > 0) {
            interaction = "rotate";
            const pointerAngle = Math.atan2(-(dragPoint.z - center.z), dragPoint.x - center.x) * 180 / Math.PI;
            rotationOffset = selected.rotation - pointerAngle;
            pendingRotation = selected.rotation;
          } else {
            const resizeHit = raycaster.intersectObjects(resizeHitboxes, false)[0];
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
        pickCandidate = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        return;
      }
      controls.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!interaction) {
        if (pickCandidate && pickCandidate.pointerId === event.pointerId && Math.hypot(event.clientX - pickCandidate.x, event.clientY - pickCandidate.y) > 5) pickCandidate = null;
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
      } else if (resizeStart) {
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
      }
    };
    const stopDragging = (event: PointerEvent, cancelled = false) => {
      if (!interaction) {
        const candidate = pickCandidate;
        pickCandidate = null;
        if (cancelled || !candidate || candidate.pointerId !== event.pointerId) return;
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
      if (pendingPosition) moveRef.current?.(pendingPosition.x, pendingPosition.y);
      if (pendingRotation !== null) rotateRef.current?.(pendingRotation);
      if (pendingResize) resizeRef.current?.(pendingResize.x, pendingResize.y, pendingResize.width, pendingResize.depth);
      pendingPosition = null;
      pendingRotation = null;
      pendingResize = null;
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
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    modelRef.current = modelGroup;
    workplaneRef.current = workplaneGroup;
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      controls.removeEventListener("change", emitOrientation);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", stopDragging);
      renderer.domElement.removeEventListener("pointercancel", cancelDragging);
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
      workplaneRef.current = null;
    };
  }, [projection]);

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
      new THREE.MeshStandardMaterial({ color: "#ddf8ff", transparent: true, opacity: 0.68, roughness: 1, metalness: 0 }),
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
  }, [projection, workplane.depth, workplane.gridStep, workplane.width]);

  useEffect(() => {
    const group = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;
    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      }
    });
    group.clear();
    const renderItems = objectMeshes.length > 0
      ? objectMeshes.map((item) => ({ mesh: item.mesh, color: item.color, objectId: item.objectId as string | null }))
      : mesh ? [{ mesh, color, objectId: null }] : [];
    if (renderItems.length === 0) return;

    for (const item of renderItems) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(item.mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(item.mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(item.mesh.indices, 1));
      geometry.computeBoundingSphere();
      const body = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.68, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: 1 }),
      );
      body.castShadow = true;
      body.receiveShadow = true;
      if (item.objectId) body.userData.objectId = item.objectId;
      group.add(body);

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(item.mesh.edges, 3));
      const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: "#384c58", transparent: true, opacity: 0.68 }));
      group.add(edges);
    }

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
  }, [mesh, objectMeshes, color, projection]);

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
    if (!selection) return;
    const root = new THREE.Group();
    root.position.set(selection.x, selection.y, selection.baseZ + selection.height / 2);
    root.rotation.z = THREE.MathUtils.degToRad(selection.rotation);
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
    const cornerMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false });
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
    const rotationRadius = Math.max(selection.width, selection.depth) * 0.7 + 6;
    const rotationPoints = Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * rotationRadius, Math.sin(angle) * rotationRadius, selection.height / 2 + 1);
    });
    const rotationRing = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(rotationPoints),
      new THREE.LineBasicMaterial({ color: "#00a6db", depthTest: false, transparent: true, opacity: 0.9 }),
    );
    rotationRing.renderOrder = 21;
    root.add(rotationRing);
    const rotationHandle = new THREE.Mesh(
      new THREE.SphereGeometry(2, 18, 12),
      new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false }),
    );
    rotationHandle.position.set(rotationRadius, 0, selection.height / 2 + 1);
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
  }, [selection, projection]);

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
  }, [view]);

  return <div className="parametric-viewport" ref={hostRef} aria-label="Vista 3D de la pieza" />;
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
