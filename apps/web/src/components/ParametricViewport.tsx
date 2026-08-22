"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";
import { constrainViewportAxisDrag, coplanarFaceRegion, finalReferenceWireframeDepthTest, formatViewportDimension, operationPreviewStyle, operationPreviewWireframePositions, type ViewportDimensionAxis } from "@/lib/viewportGeometry";
import { AdaptiveViewportResolution, viewportPerformanceOptions, viewportRenderProfile, type ViewportRenderQuality } from "@/lib/viewportPerformance";
import { orthographicTouchTargetWorldSize, perspectiveTouchTargetWorldSize, viewportPointerDragIntent, type ViewportPointerDragIntent } from "@/lib/viewportPointer";
import { parametricWorkplaneIsGlobal } from "@/lib/parametricWorkplane";
import type { ParametricDocument, ParametricObjectRenderRecord, RenderMesh } from "@/types/parametric";

export type CameraView = { name: "iso" | "top" | "front" | "right" | "zoom-in" | "zoom-out" | "home" | "fit" | "selection" | "custom"; token: number; direction?: [number, number, number] };
export type CameraProjection = "perspective" | "orthographic";
export type CameraOrientation = { azimuth: number; polar: number };
type ShapeParameter = "width" | "depth" | "height" | "radius" | "baseRadius" | "topRadius" | "outerRadius" | "innerRadius";

export type ViewportSelection = {
  id: string;
  x: number;
  y: number;
  baseZ: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  center?: { x: number; y: number; z: number };
  origin?: { x: number; y: number; z: number };
  rotation3d?: { x: number; y: number; z: number };
  resizeAspectRatio?: number;
  shapeParameters?:
    | { shape: "box"; width: number; depth: number; height: number }
    | { shape: "cylinder"; radius: number; height: number }
    | { shape: "sphere"; radius: number }
    | { shape: "cone"; baseRadius: number; topRadius: number; height: number }
    | { shape: "tube"; outerRadius: number; innerRadius: number; height: number }
    | { shape: "halfSphere"; radius: number; height: number };
  operationPreview?: {
    shape: "box" | "cylinder" | "sphere" | "cone" | "tube" | "halfSphere";
    topRadius?: number;
    innerRadius?: number;
    mode: "add" | "hole" | "common";
    color: string;
    historical: boolean;
  };
};

type Props = {
  mesh: RenderMesh | null;
  objectRecords?: ParametricObjectRenderRecord[];
  objectColors?: Record<string, string>;
  objectOrigins?: Array<{
    objectId: string;
    visible: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
  operationOrigins?: Array<{
    featureId: string;
    visible: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
  editableOriginId?: string | null;
  selectedObjectOriginId?: string | null;
  selectedOperationOriginId?: string | null;
  selectedObjectIds?: string[];
  operationContext?: { color: string; mesh: RenderMesh; opacity: number } | null;
  isolatedHistoryObjectId?: string | null;
  color: string;
  workplane?: ParametricDocument["workplane"];
  view: CameraView;
  projection?: CameraProjection;
  renderQuality?: ViewportRenderQuality;
  selection?: ViewportSelection | null;
  snap?: number;
  onShapeParameterChange?: (parameter: ShapeParameter, value: number) => void;
  onObjectOriginMove?: (objectId: string, position: { x: number; y: number; z: number }) => void;
  onObjectAxisMove?: (objectId: string, position: { x: number; y: number; z: number }) => void;
  onOperationAxisMove?: (featureId: string, delta: { x: number; y: number; z: number }) => void;
  onCameraOrientation?: (orientation: CameraOrientation) => void;
  onObjectSelect?: (objectId: string) => void;
  onObjectsSelect?: (objectIds: string[]) => void;
  onEmptySelect?: () => void;
  workplaneFaceSelection?: boolean;
  onWorkplaneFaceSelect?: (face: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }) => void;
};

type CachedObjectRender = {
  geometryFingerprint: string | null;
  body: THREE.Mesh;
  edges: THREE.LineSegments;
};

function setMaterialColor(material: THREE.Material, color: THREE.ColorRepresentation) {
  if (material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial) material.color.set(color);
}

function workplaneMaterial(quality: ViewportRenderQuality, color = "#ddf8ff", opacity = 0.68) {
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 1, metalness: 0, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
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

function disposeObjectOriginMarker(marker: THREE.Object3D) {
  marker.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function clearObjectOriginLayer(layer: THREE.Group) {
  [...layer.children].forEach(disposeObjectOriginMarker);
  layer.clear();
}

function coplanarFaceGeometry(source: THREE.BufferGeometry, faceIndex: number) {
  const positions = source.getAttribute("position");
  const indices = source.getIndex();
  const region = positions && faceIndex >= 0 ? coplanarFaceRegion(positions.array, indices?.array ?? null, faceIndex) : null;
  const geometry = new THREE.BufferGeometry();
  if (!region) return { geometry, region: null };
  const highlighted = [...region.positions];
  for (let index = 0; index < highlighted.length; index += 3) {
    highlighted[index] += region.normal.x * 0.02;
    highlighted[index + 1] += region.normal.y * 0.02;
    highlighted[index + 2] += region.normal.z * 0.02;
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(highlighted, 3));
  geometry.computeVertexNormals();
  return { geometry, region };
}

function objectOriginMarker(targetId: string, editable: boolean, targetKind: "object" | "feature" = "object") {
  const marker = new THREE.Group();
  marker.name = `${targetKind === "object" ? "Origen" : "Operación"} ${targetId}`;
  marker.userData.transformTargetId = targetId;
  marker.userData.transformTargetKind = targetKind;
  const axes: Array<["x" | "y" | "z", THREE.Vector3, number]> = [
    ["x", new THREE.Vector3(1, 0, 0), 0xd84b4b],
    ["y", new THREE.Vector3(0, 1, 0), 0x35a85b],
    ["z", new THREE.Vector3(0, 0, 1), 0x347fd1],
  ];
  for (const [axis, direction, color] of axes) {
    const arrow = new THREE.ArrowHelper(direction, undefined, 1, color, 0.28, 0.16);
    arrow.line.userData.originAxis = axis;
    arrow.cone.userData.originAxis = axis;
    arrow.cone.userData.originTip = true;
    marker.add(arrow);
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: editable ? 0x8a45b8 : 0xffffff, depthTest: false, depthWrite: false }),
  );
  center.userData.originAxis = "xy";
  marker.add(center);
  marker.traverse((child) => {
    if (!(child instanceof THREE.Line || child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.depthTest = false;
      material.depthWrite = false;
    }
    child.renderOrder = 30;
  });
  return marker;
}

export function ParametricViewport({ mesh, objectRecords = [], objectColors, objectOrigins = [], operationOrigins = [], editableOriginId = null, selectedObjectOriginId = null, selectedOperationOriginId = null, selectedObjectIds = [], operationContext = null, isolatedHistoryObjectId = null, color, workplane = { width: 200, depth: 200, gridStep: 5, snapToGrid: true, gridVisible: true, activeSizePercent: 10, origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } }, view, projection = "orthographic", renderQuality = "normal", selection = null, snap = 1, onShapeParameterChange, onObjectOriginMove, onObjectAxisMove, onOperationAxisMove, onCameraOrientation, onObjectSelect, onObjectsSelect, onEmptySelect, workplaneFaceSelection = false, onWorkplaneFaceSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const dimensionXRef = useRef<HTMLInputElement>(null);
  const dimensionYRef = useRef<HTMLInputElement>(null);
  const dimensionZRef = useRef<HTMLInputElement>(null);
  const dimensionPinnedRef = useRef(new Set<ViewportDimensionAxis>());
  const dimensionHoverRef = useRef(new Set<ViewportDimensionAxis>());
  const dimensionHoverTimerRef = useRef<number | null>(null);
  const dimensionSelectionIdRef = useRef<string | null>(selection?.id ?? null);
  const shapeParameterPreviewRef = useRef<{ parameter: ShapeParameter; value: number } | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const originLayerRef = useRef<THREE.Group | null>(null);
  const workplaneRef = useRef<THREE.Group | null>(null);
  const selectionRootRef = useRef<THREE.Group | null>(null);
  const selectionVisualRootRef = useRef<THREE.Group | null>(null);
  const operationContextRef = useRef<THREE.Mesh | null>(null);
  const faceHighlightRef = useRef<THREE.Mesh | null>(null);
  const resizeHitboxesRef = useRef<THREE.Mesh[]>([]);
  const selectionRef = useRef(selection);
  const shapeParameterRef = useRef(onShapeParameterChange);
  const originMoveRef = useRef(onObjectOriginMove);
  const objectAxisMoveRef = useRef(onObjectAxisMove);
  const operationAxisMoveRef = useRef(onOperationAxisMove);
  const editableOriginIdRef = useRef(editableOriginId);
  const selectedObjectOriginIdRef = useRef(selectedObjectOriginId);
  const selectedOperationOriginIdRef = useRef(selectedOperationOriginId);
  const orientationRef = useRef(onCameraOrientation);
  const objectSelectRef = useRef(onObjectSelect);
  const objectsSelectRef = useRef(onObjectsSelect);
  const emptySelectRef = useRef(onEmptySelect);
  const workplaneFaceSelectionRef = useRef(workplaneFaceSelection);
  const workplaneFaceSelectRef = useRef(onWorkplaneFaceSelect);
  const snapRef = useRef(snap);
  const activeWorkplaneRef = useRef(workplane);
  const isolatedHistoryObjectIdRef = useRef(isolatedHistoryObjectId);
  const invalidateRef = useRef<() => void>(() => undefined);
  const hasFittedRef = useRef(false);
  const objectRenderCacheRef = useRef(new Map<string, CachedObjectRender>());

  useEffect(() => {
    selectionRef.current = selection;
    if ((selection?.id ?? null) !== dimensionSelectionIdRef.current) {
      dimensionSelectionIdRef.current = selection?.id ?? null;
      dimensionPinnedRef.current.clear();
      dimensionHoverRef.current.clear();
    }
  }, [selection]);
  useEffect(() => { shapeParameterRef.current = onShapeParameterChange; }, [onShapeParameterChange]);
  useEffect(() => { originMoveRef.current = onObjectOriginMove; }, [onObjectOriginMove]);
  useEffect(() => { objectAxisMoveRef.current = onObjectAxisMove; }, [onObjectAxisMove]);
  useEffect(() => { operationAxisMoveRef.current = onOperationAxisMove; }, [onOperationAxisMove]);
  useEffect(() => { editableOriginIdRef.current = editableOriginId; }, [editableOriginId]);
  useEffect(() => { selectedObjectOriginIdRef.current = selectedObjectOriginId; }, [selectedObjectOriginId]);
  useEffect(() => { selectedOperationOriginIdRef.current = selectedOperationOriginId; }, [selectedOperationOriginId]);
  useEffect(() => { orientationRef.current = onCameraOrientation; }, [onCameraOrientation]);
  useEffect(() => { objectSelectRef.current = onObjectSelect; }, [onObjectSelect]);
  useEffect(() => { objectsSelectRef.current = onObjectsSelect; }, [onObjectsSelect]);
  useEffect(() => { emptySelectRef.current = onEmptySelect; }, [onEmptySelect]);
  useEffect(() => { workplaneFaceSelectionRef.current = workplaneFaceSelection; }, [workplaneFaceSelection]);
  useEffect(() => { workplaneFaceSelectRef.current = onWorkplaneFaceSelect; }, [onWorkplaneFaceSelect]);
  useEffect(() => {
    if (workplaneFaceSelection) return;
    if (faceHighlightRef.current) faceHighlightRef.current.visible = false;
    if (rendererRef.current) rendererRef.current.domElement.style.cursor = "default";
    invalidateRef.current();
  }, [workplaneFaceSelection]);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { activeWorkplaneRef.current = workplane; }, [workplane]);
  useEffect(() => { isolatedHistoryObjectIdRef.current = isolatedHistoryObjectId; }, [isolatedHistoryObjectId]);

  const setDimensionHover = (axis: ViewportDimensionAxis, active: boolean) => {
    if (dimensionHoverTimerRef.current !== null) {
      window.clearTimeout(dimensionHoverTimerRef.current);
      dimensionHoverTimerRef.current = null;
    }
    if (active) dimensionHoverRef.current.add(axis); else dimensionHoverRef.current.delete(axis);
    invalidateRef.current();
  };

  const dimensionValue = (axis: ViewportDimensionAxis) => {
    const selected = selectionRef.current;
    if (!selected) return 0;
    const parameters = selected.shapeParameters;
    const parameter = axis === "x" ? parameters?.shape === "box" ? "width" : parameters?.shape === "cone" ? "baseRadius" : parameters?.shape === "tube" ? "outerRadius" : parameters ? "radius" : null
      : axis === "y" ? parameters?.shape === "cone" ? "topRadius" : parameters?.shape === "tube" ? "innerRadius" : parameters?.shape === "box" ? "depth" : null
        : axis === "z" && parameters && parameters.shape !== "sphere" ? "height" : null;
    const preview = shapeParameterPreviewRef.current;
    if (parameter && preview?.parameter === parameter) return preview.value;
    if (parameter === "width" && parameters?.shape === "box") return parameters.width;
    if (parameter === "depth" && parameters?.shape === "box") return parameters.depth;
    if (parameter === "radius" && (parameters?.shape === "cylinder" || parameters?.shape === "sphere" || parameters?.shape === "halfSphere")) return parameters.radius;
    if (parameter === "baseRadius" && parameters?.shape === "cone") return parameters.baseRadius;
    if (parameter === "topRadius" && parameters?.shape === "cone") return parameters.topRadius;
    if (parameter === "outerRadius" && parameters?.shape === "tube") return parameters.outerRadius;
    if (parameter === "innerRadius" && parameters?.shape === "tube") return parameters.innerRadius;
    if (parameter === "height" && parameters && parameters.shape !== "sphere") return parameters.height;
    if (axis === "x") return selected.width;
    if (axis === "y") return selected.depth;
    if (axis === "z") return selected.height;
    return selected.rotation;
  };

  const beginDimensionEdit = (axis: ViewportDimensionAxis, input: HTMLInputElement) => {
    dimensionPinnedRef.current.add(axis);
    input.value = formatViewportDimension(dimensionValue(axis));
    window.requestAnimationFrame(() => input.select());
    invalidateRef.current();
  };

  const commitDimensionEdit = (axis: ViewportDimensionAxis, input: HTMLInputElement) => {
    const selected = selectionRef.current;
    const value = Number.parseFloat(input.value.replace(",", "."));
    if (!selected || !Number.isFinite(value)) {
      input.value = formatViewportDimension(dimensionValue(axis));
      invalidateRef.current();
      return;
    }
    const parameters = selected.shapeParameters;
    if (parameters) {
      const parameter = axis === "x" ? parameters.shape === "box" ? "width" : parameters.shape === "cone" ? "baseRadius" : parameters.shape === "tube" ? "outerRadius" : "radius" : axis === "y" ? parameters.shape === "cone" ? "topRadius" : parameters.shape === "tube" ? "innerRadius" : "depth" : axis === "z" ? "height" : null;
      if (parameter && (parameter === "topRadius" ? value >= 0 : value > 0)) shapeParameterRef.current?.(parameter, value);
    }
    input.value = formatViewportDimension(dimensionValue(axis));
    dimensionPinnedRef.current.add(axis);
    invalidateRef.current();
  };

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
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.target.set(0, 5, 0);
    controls.minDistance = 18;
    controls.maxDistance = 420;
    let frame = 0;
    let disposed = false;
    const updateDimensionLabels = () => {
      const root = selectionRootRef.current;
      const visualRoot = selectionVisualRootRef.current;
      const selected = selectionRef.current;
      const labels = [dimensionXRef.current, dimensionYRef.current, dimensionZRef.current];
      const visibleAxes = new Set([...dimensionPinnedRef.current, ...dimensionHoverRef.current]);
      if (!root || !visualRoot || !selected) {
        labels.forEach((label) => { if (label) label.style.display = "none"; });
        return;
      }
      visualRoot.updateWorldMatrix(true, false);
      const parameters = selected.shapeParameters;
      const coneRadialScale = parameters?.shape === "cone" ? selected.width / Math.max(0.01, parameters.baseRadius * 2) : 1;
      const coneHeightScale = parameters?.shape === "cone" ? selected.height / Math.max(0.01, parameters.height) : 1;
      const points = parameters?.shape === "cone"
        ? [
            new THREE.Vector3(dimensionValue("x") * coneRadialScale, 0, -dimensionValue("z") * coneHeightScale / 2),
            new THREE.Vector3(dimensionValue("y") * coneRadialScale, 0, dimensionValue("z") * coneHeightScale / 2),
            new THREE.Vector3(Math.max(dimensionValue("x"), dimensionValue("y")) * coneRadialScale, 0, 0),
          ]
        : parameters?.shape === "tube"
          ? [
              new THREE.Vector3(dimensionValue("x") * selected.width / Math.max(0.01, parameters.outerRadius * 2), 0, -dimensionValue("z") * selected.height / Math.max(0.01, parameters.height) / 2),
              new THREE.Vector3(dimensionValue("y") * selected.width / Math.max(0.01, parameters.outerRadius * 2), 0, dimensionValue("z") * selected.height / Math.max(0.01, parameters.height) / 2),
              new THREE.Vector3(selected.width / 2, 0, 0),
            ]
        : [
            new THREE.Vector3(0, -selected.depth / 2, -selected.height / 2),
            new THREE.Vector3(-selected.width / 2, 0, -selected.height / 2),
            new THREE.Vector3(selected.width / 2, selected.depth / 2, 0),
          ];
      const values = [
        dimensionValue("x") * Math.abs(visualRoot.scale.x),
        dimensionValue("y") * Math.abs(visualRoot.scale.y),
        dimensionValue("z") * Math.abs(visualRoot.scale.z),
      ];
      const axes: ViewportDimensionAxis[] = ["x", "y", "z"];
      const names = parameters?.shape === "cone"
        ? ["Radio inferior", "Radio superior", "Alto"]
        : parameters?.shape === "tube"
          ? ["Radio exterior", "Radio interior", "Alto"]
        : [parameters?.shape === "box" ? "Ancho" : "Radio", "Largo", "Alto"];
      const units = ["mm", "mm", "mm"];
      const offsets = [[0, 18], [-24, 0], [22, 0]];
      points.forEach((point, index) => {
        const label = labels[index];
        if (!label) return;
        if (!visibleAxes.has(axes[index])) {
          label.style.display = "none";
          return;
        }
        const projected = visualRoot.localToWorld(point).project(camera);
        if (projected.z < -1 || projected.z > 1) {
          label.style.display = "none";
          return;
        }
        label.style.display = "block";
        label.style.left = `${(projected.x + 1) * host.clientWidth / 2}px`;
        label.style.top = `${(1 - projected.y) * host.clientHeight / 2}px`;
        label.style.transform = `translate(-50%, -50%) translate(${offsets[index][0]}px, ${offsets[index][1]}px)`;
        if (document.activeElement !== label) label.value = `${names[index]} ${formatViewportDimension(values[index])} ${units[index]}`;
      });
    };
    const requestRender = () => {
      if (!disposed && frame === 0) frame = requestAnimationFrame(render);
    };
    const render = (now: number) => {
      frame = 0;
      const controlsChanged = controls.update();
      const nextPixelRatio = resolution.recordFrame(now);
      if (nextPixelRatio !== null) renderer.setPixelRatio(nextPixelRatio);
      for (const marker of originLayer.children) {
        const worldPosition = marker.getWorldPosition(new THREE.Vector3());
        const size = camera instanceof THREE.OrthographicCamera
          ? orthographicTouchTargetWorldSize(camera.top - camera.bottom, camera.zoom, renderer.domElement.clientHeight, 102)
          : perspectiveTouchTargetWorldSize(camera.position.distanceTo(worldPosition), camera.fov, renderer.domElement.clientHeight, 102);
        marker.scale.setScalar(Math.max(0.35, size));
      }
      renderer.render(scene, camera);
      updateDimensionLabels();
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
    const originLayer = new THREE.Group();
    originLayer.name = "Orígenes de objetos";
    modelGroup.add(originLayer);
    const faceHighlight = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: "#ffe47a", transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    faceHighlight.visible = false;
    faceHighlight.renderOrder = 25;
    modelGroup.add(faceHighlight);
    faceHighlightRef.current = faceHighlight;

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    let interaction: "parameter" | "origin" | "axisMove" | null = null;
    let pendingShapeParameter: { parameter: ShapeParameter; value: number } | null = null;
    let shapeParameterStartValue = 0;
    let shapeParameterWorldScale = 1;
    let parameterPointerOffset = 0;
    let parameterWorldToLocal: THREE.Matrix4 | null = null;
    let resizeStart: ViewportSelection | null = null;
    let resizeRootStart: THREE.Vector3 | null = null;
    let interactionDimensions: ViewportDimensionAxis[] = [];
    let originDragAxis: "x" | "y" | "z" | "xy" | null = null;
    let originDragStart: THREE.Vector3 | null = null;
    let originPointerStart: THREE.Vector3 | null = null;
    let originDragMarker: THREE.Object3D | null = null;
    let pendingOrigin: { objectId: string; position: { x: number; y: number; z: number } } | null = null;
    let pendingAxisMove: { targetId: string; targetKind: "object" | "feature"; start: { x: number; y: number; z: number }; position: { x: number; y: number; z: number } } | null = null;
    let axisMoveRootStart: THREE.Vector3 | null = null;
    let pickCandidate: { pointerId: number; pointerType: string; x: number; y: number; dragIntent: ViewportPointerDragIntent } | null = null;
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
    const faceAtPointer = () => {
      const bodies = modelGroup.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && typeof child.userData.objectId === "string");
      return raycaster.intersectObjects(bodies, false)[0] ?? null;
    };
    const updateWorkplaneFaceHighlight = () => {
      const hit = faceAtPointer();
      faceHighlight.geometry.dispose();
      const selectedFace = hit?.face && typeof hit.faceIndex === "number"
        ? coplanarFaceGeometry((hit.object as THREE.Mesh).geometry, hit.faceIndex)
        : { geometry: new THREE.BufferGeometry(), region: null };
      faceHighlight.geometry = selectedFace.geometry;
      faceHighlight.visible = Boolean(hit?.face && selectedFace.region);
      renderer.domElement.style.cursor = hit && selectedFace.region ? "crosshair" : "not-allowed";
      requestRender();
      return hit && selectedFace.region ? { hit, region: selectedFace.region } : null;
    };
    const updateManipulatorHitTargets = (pointerType: string) => {
      const selected = selectionRef.current;
      if (!selected) return;
      let targetSize = 0;
      if (pointerType === "touch") {
        targetSize = camera instanceof THREE.OrthographicCamera
          ? orthographicTouchTargetWorldSize(camera.top - camera.bottom, camera.zoom, renderer.domElement.clientHeight)
          : perspectiveTouchTargetWorldSize(camera.position.distanceTo(controls.target), camera.fov, renderer.domElement.clientHeight);
        targetSize = Math.min(18, Math.max(8, targetSize));
      }
      for (const target of resizeHitboxesRef.current) {
        const baseSize = Number(target.userData.hitTargetSize) || 1;
        const scale = pointerType === "touch" ? Math.max(1, targetSize / baseSize) : 1;
        target.scale.setScalar(scale);
        target.updateMatrixWorld(true);
      }
    };
    const replaceHoverDimensions = (axes: ViewportDimensionAxis[]) => {
      const current = dimensionHoverRef.current;
      if (current.size === axes.length && axes.every((axis) => current.has(axis))) return;
      dimensionHoverRef.current = new Set(axes);
      requestRender();
    };
    const originHandleAtPointer = () => {
      const editableId = editableOriginIdRef.current;
      const targetId = editableId ?? selectedOperationOriginIdRef.current ?? selectedObjectOriginIdRef.current;
      const targetKind = editableId || (!selectedOperationOriginIdRef.current && selectedObjectOriginIdRef.current) ? "object" as const : "feature" as const;
      const marker = targetId ? originLayer.children.find((child) => child.userData.transformTargetId === targetId && child.userData.transformTargetKind === targetKind) ?? null : null;
      if (!marker) return null;
      const hits = raycaster.intersectObject(marker, true);
      const hit = editableId ? hits[0] : hits.find((candidate) => candidate.object.userData.originTip);
      return hit ? { editable: Boolean(editableId), hit, marker, targetId: targetId!, targetKind } : null;
    };
    const hoveredManipulatorDimensions = (event: PointerEvent): ViewportDimensionAxis[] => {
      if (event.pointerType === "touch") return [];
      setPointer(event);
      if (originHandleAtPointer()) {
        renderer.domElement.style.cursor = "crosshair";
        return [];
      }
      renderer.domElement.style.cursor = "default";
      if (!selectionRef.current) return [];
      updateManipulatorHitTargets(event.pointerType);
      const resizeHit = raycaster.intersectObjects(resizeHitboxesRef.current, false)[0];
      if (resizeHit) {
        const axis = resizeHit.object.userData.dimensionAxis;
        return axis === "x" || axis === "y" || axis === "z" ? [axis] : [];
      }
      return [];
    };
    const updateConePreview = (selected: ViewportSelection, baseRadius: number, topRadius: number, height: number) => {
      if (selected.shapeParameters?.shape !== "cone") return;
      const radialScale = selected.width / Math.max(0.01, selected.shapeParameters.baseRadius * 2);
      const heightScale = selected.height / Math.max(0.01, selected.shapeParameters.height);
      const worldBaseRadius = baseRadius * radialScale;
      const worldTopRadius = topRadius * radialScale;
      const worldHeight = height * heightScale;
      const visualRoot = selectionVisualRootRef.current;
      if (!visualRoot) return;
      visualRoot.traverse((child) => {
        if (child.userData.operationPreviewWireframe && child instanceof LineSegments2) {
          child.geometry.setPositions(operationPreviewWireframePositions("cone", worldBaseRadius * 2, worldBaseRadius * 2, worldHeight, worldTopRadius * 2));
        }
        const parameter = child.userData.shapeParameterVisual as ShapeParameter | undefined;
        const role = child.userData.shapeParameterVisualRole as "guide" | "handle" | "target" | undefined;
        if (!parameter || !role) return;
        const end = parameter === "baseRadius"
          ? new THREE.Vector3(worldBaseRadius + 3, 0, -worldHeight / 2)
          : parameter === "topRadius"
            ? new THREE.Vector3(worldTopRadius + 3, 0, worldHeight / 2)
            : new THREE.Vector3(0, 0, worldHeight / 2 + 3);
        if (role === "guide" && child instanceof THREE.Line) {
          const start = parameter === "height" ? new THREE.Vector3(0, 0, -worldHeight / 2) : new THREE.Vector3(0, 0, end.z);
          child.geometry.setFromPoints([start, end]);
        } else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const updateTubePreview = (selected: ViewportSelection, outerRadius: number, innerRadius: number, height: number) => {
      if (selected.shapeParameters?.shape !== "tube") return;
      const radialScale = selected.width / Math.max(0.01, selected.shapeParameters.outerRadius * 2);
      const heightScale = selected.height / Math.max(0.01, selected.shapeParameters.height);
      const worldOuterRadius = outerRadius * radialScale;
      const worldInnerRadius = innerRadius * radialScale;
      const worldHeight = height * heightScale;
      const visualRoot = selectionVisualRootRef.current;
      if (!visualRoot) return;
      visualRoot.traverse((child) => {
        if (child.userData.operationPreviewWireframe && child instanceof LineSegments2) {
          child.geometry.setPositions(operationPreviewWireframePositions("tube", worldOuterRadius * 2, worldOuterRadius * 2, worldHeight, worldOuterRadius * 2, worldInnerRadius * 2));
        }
        const parameter = child.userData.shapeParameterVisual as ShapeParameter | undefined;
        const role = child.userData.shapeParameterVisualRole as "guide" | "handle" | "target" | undefined;
        if (!parameter || !role) return;
        const end = parameter === "outerRadius"
          ? new THREE.Vector3(worldOuterRadius + 3, 0, -worldHeight / 2)
          : parameter === "innerRadius"
            ? new THREE.Vector3(worldInnerRadius + 3, 0, worldHeight / 2)
            : new THREE.Vector3(0, 0, worldHeight / 2 + 3);
        if (role === "guide" && child instanceof THREE.Line) {
          const start = parameter === "height" ? new THREE.Vector3(0, 0, -worldHeight / 2) : new THREE.Vector3(0, 0, end.z);
          child.geometry.setFromPoints([start, end]);
        } else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (workplaneFaceSelectionRef.current) {
        setPointer(event);
        const selectedFace = updateWorkplaneFaceHighlight();
        if (selectedFace) {
          const { hit, region } = selectedFace;
          const relativeMatrix = new THREE.Matrix4().copy(modelGroup.matrixWorld).invert().multiply(hit.object.matrixWorld);
          const normal = new THREE.Vector3(region.normal.x, region.normal.y, region.normal.z).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(relativeMatrix)).normalize();
          const centroidInWorld = hit.object.localToWorld(new THREE.Vector3(region.centroid.x, region.centroid.y, region.centroid.z));
          const origin = modelGroup.worldToLocal(centroidInWorld);
          workplaneFaceSelectRef.current?.({
            origin: { x: origin.x, y: origin.y, z: origin.z },
            normal: { x: normal.x, y: normal.y, z: normal.z },
          });
        }
        event.preventDefault();
        return;
      }
      updateManipulatorHitTargets(event.pointerType);
      const resizeHitboxes = resizeHitboxesRef.current;
      const selected = selectionRef.current;
      setPointer(event);
      const originHandle = originHandleAtPointer();
      if (originHandle) {
        const worldOrigin = originHandle.marker.getWorldPosition(new THREE.Vector3());
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).normalize(), worldOrigin);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          interaction = originHandle.editable ? "origin" : "axisMove";
          const hitAxis = originHandle.hit.object.userData.originAxis;
          originDragAxis = hitAxis === "x" || hitAxis === "y" || hitAxis === "z" ? hitAxis : "xy";
          originDragStart = originHandle.marker.position.clone();
          originPointerStart = originLayer.worldToLocal(dragPoint.clone());
          originDragMarker = originHandle.marker;
          if (originHandle.editable) pendingOrigin = { objectId: originHandle.targetId, position: { x: originDragStart.x, y: originDragStart.y, z: originDragStart.z } };
          else {
            const start = { x: originDragStart.x, y: originDragStart.y, z: originDragStart.z };
            pendingAxisMove = { targetId: originHandle.targetId, targetKind: originHandle.targetKind, start, position: { ...start } };
            axisMoveRootStart = selectionRootRef.current?.position.clone() ?? null;
          }
        }
      }
      if (!interaction && selected) {
        const root = selectionRootRef.current;
        const resizeHit = raycaster.intersectObjects(resizeHitboxes, false)[0];
        const parameter = resizeHit?.object.userData.shapeParameter as ShapeParameter | undefined;
        if (root && resizeHit && parameter) {
          const center = root.getWorldPosition(new THREE.Vector3());
          const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
          const localAxis = parameter === "depth" ? new THREE.Vector3(0, 1, 0) : parameter === "height" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
          const axis = localAxis.applyQuaternion(rootQuaternion).normalize();
          const cameraDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
          const planeNormal = parameter === "height"
            ? cameraDirection.clone().addScaledVector(axis, -cameraDirection.dot(axis))
            : new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuaternion);
          if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(axis, new THREE.Vector3(1, 0, 0));
          if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(axis, new THREE.Vector3(0, 1, 0));
          dragPlane.setFromNormalAndCoplanarPoint(planeNormal.normalize(), center);
          if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
            interaction = "parameter";
            const dimensionAxis = resizeHit.object.userData.dimensionAxis;
            interactionDimensions = [dimensionAxis === "y" ? "y" : dimensionAxis === "z" ? "z" : "x"];
            resizeStart = { ...selected };
            resizeRootStart = root.position.clone();
            root.updateWorldMatrix(true, false);
            parameterWorldToLocal = root.matrixWorld.clone().invert();
            const localPointer = dragPoint.clone().applyMatrix4(parameterWorldToLocal);
            const values = selected.shapeParameters;
            shapeParameterWorldScale = values?.shape === "cone" || values?.shape === "tube"
              ? selected.width / Math.max(0.01, (values.shape === "cone" ? values.baseRadius : values.outerRadius) * 2)
              : parameter === "height" && values && values.shape !== "sphere"
                ? selected.height / Math.max(0.01, values.height)
                : parameter === "radius" && (values?.shape === "cylinder" || values?.shape === "sphere" || values?.shape === "halfSphere")
                  ? selected.width / Math.max(0.01, values.radius * 2)
                  : 1;
            const visualHalfExtent = parameter === "topRadius" && values?.shape === "cone"
              ? values.topRadius * shapeParameterWorldScale
              : parameter === "baseRadius" && values?.shape === "cone"
                ? values.baseRadius * shapeParameterWorldScale
                : parameter === "innerRadius" && values?.shape === "tube"
                  ? values.innerRadius * shapeParameterWorldScale
                  : parameter === "outerRadius" && values?.shape === "tube"
                    ? values.outerRadius * shapeParameterWorldScale
                : parameter === "depth" ? selected.depth / 2 : parameter === "height" ? selected.height / 2 : selected.width / 2;
            const pointerCoordinate = parameter === "depth" ? localPointer.y : parameter === "height" ? localPointer.z : localPointer.x;
            parameterPointerOffset = pointerCoordinate - visualHalfExtent;
            const value = parameter === "width" && values?.shape === "box" ? values.width
              : parameter === "depth" && values?.shape === "box" ? values.depth
                : parameter === "height" && values && values.shape !== "sphere" ? values.height
                  : parameter === "radius" && (values?.shape === "cylinder" || values?.shape === "sphere" || values?.shape === "halfSphere") ? values.radius
                    : parameter === "baseRadius" && values?.shape === "cone" ? values.baseRadius
                      : parameter === "topRadius" && values?.shape === "cone" ? values.topRadius
                        : parameter === "outerRadius" && values?.shape === "tube" ? values.outerRadius
                          : parameter === "innerRadius" && values?.shape === "tube" ? values.innerRadius
                            : 0;
            pendingShapeParameter = { parameter, value };
            shapeParameterPreviewRef.current = pendingShapeParameter;
            shapeParameterStartValue = value;
          }
        }
      }
      if (!interaction) {
        pickCandidate = { pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, dragIntent: "pending" };
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      controls.enabled = false;
      replaceHoverDimensions(interactionDimensions);
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!interaction) {
        if (workplaneFaceSelectionRef.current && event.buttons === 0) {
          setPointer(event);
          updateWorkplaneFaceHighlight();
          return;
        }
        if (pickCandidate && pickCandidate.pointerId === event.pointerId) {
          pickCandidate.dragIntent = viewportPointerDragIntent(
            pickCandidate.pointerType,
            Math.hypot(event.clientX - pickCandidate.x, event.clientY - pickCandidate.y),
          );
          if (pickCandidate.dragIntent === "marquee") updateSelectionBox(pickCandidate, event.clientX, event.clientY);
          else hideSelectionBox();
        } else if (event.buttons === 0) {
          replaceHoverDimensions(hoveredManipulatorDimensions(event));
        }
        return;
      }
      setPointer(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
      if ((interaction === "origin" || interaction === "axisMove") && originDragStart && originPointerStart && originDragMarker) {
        const currentPointer = originLayer.worldToLocal(dragPoint.clone());
        const delta = currentPointer.sub(originPointerStart);
        const grid = Math.max(0.01, snapRef.current);
        const next = originDragStart.clone();
        if (originDragAxis === "xy") {
          next.x = Math.round((originDragStart.x + delta.x) / grid) * grid;
          next.y = Math.round((originDragStart.y + delta.y) / grid) * grid;
        } else if (originDragAxis) {
          const direction = new THREE.Vector3(
            originDragAxis === "x" ? 1 : 0,
            originDragAxis === "y" ? 1 : 0,
            originDragAxis === "z" ? 1 : 0,
          ).applyEuler(originDragMarker.rotation).normalize();
          const constrained = constrainViewportAxisDrag(originDragStart, delta, direction, grid);
          next.set(constrained.x, constrained.y, constrained.z);
        }
        originDragMarker.position.copy(next);
        if (interaction === "origin" && pendingOrigin) pendingOrigin.position = { x: next.x, y: next.y, z: next.z };
        if (interaction === "axisMove" && pendingAxisMove) {
          pendingAxisMove.position = { x: next.x, y: next.y, z: next.z };
          const root = selectionRootRef.current;
          if (root && axisMoveRootStart) root.position.copy(axisMoveRootStart).add(next.clone().sub(originDragStart));
        }
        requestRender();
        return;
      }
      const root = selectionRootRef.current;
      const visualRoot = selectionVisualRootRef.current;
      const selected = selectionRef.current;
      if (!root || !visualRoot || !selected) return;
      if (interaction === "parameter" && resizeStart && resizeRootStart && pendingShapeParameter) {
        const grid = Math.max(0.01, snapRef.current);
        if (!parameterWorldToLocal) return;
        const localPointer = dragPoint.clone().applyMatrix4(parameterWorldToLocal);
        const parameter = pendingShapeParameter.parameter;
        const pointerCoordinate = parameter === "depth" ? localPointer.y : parameter === "height" ? localPointer.z : localPointer.x;
        const adjusted = pointerCoordinate - parameterPointerOffset;
        const visualExtent = parameter === "height"
          ? Math.max(grid, Math.round((adjusted + resizeStart.height / 2) / grid) * grid)
          : parameter === "topRadius" || parameter === "innerRadius"
            ? Math.max(0, Math.round(Math.abs(adjusted) / grid) * grid)
            : Math.max(grid, Math.round(Math.abs(adjusted) * 2 / grid) * grid);
        const startExtent = parameter === "depth" ? resizeStart.depth : parameter === "height" ? resizeStart.height : resizeStart.width;
        const ratio = visualExtent / Math.max(0.01, startExtent);
        pendingShapeParameter.value = parameter === "topRadius" || parameter === "innerRadius"
          ? visualExtent / Math.max(0.0001, shapeParameterWorldScale)
          : Math.max(0.1, shapeParameterStartValue * ratio);
        shapeParameterPreviewRef.current = pendingShapeParameter;
        root.position.copy(resizeRootStart);
        visualRoot.position.set(0, 0, 0);
        visualRoot.scale.set(1, 1, 1);
        if (selected.shapeParameters?.shape === "cone") {
          const baseRadius = parameter === "baseRadius" ? pendingShapeParameter.value : selected.shapeParameters.baseRadius;
          const topRadius = parameter === "topRadius" ? pendingShapeParameter.value : selected.shapeParameters.topRadius;
          const height = parameter === "height" ? pendingShapeParameter.value : selected.shapeParameters.height;
          if (parameter === "height") visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
          updateConePreview(selected, baseRadius, topRadius, height);
        } else if (selected.shapeParameters?.shape === "tube") {
          const outerRadius = parameter === "outerRadius" ? Math.max(selected.shapeParameters.innerRadius + 0.1, pendingShapeParameter.value) : selected.shapeParameters.outerRadius;
          const innerRadius = parameter === "innerRadius" ? Math.min(selected.shapeParameters.outerRadius - 0.1, Math.max(0.1, pendingShapeParameter.value)) : selected.shapeParameters.innerRadius;
          const height = parameter === "height" ? pendingShapeParameter.value : selected.shapeParameters.height;
          pendingShapeParameter.value = parameter === "outerRadius" ? outerRadius : parameter === "innerRadius" ? innerRadius : pendingShapeParameter.value;
          shapeParameterPreviewRef.current = pendingShapeParameter;
          if (parameter === "height") visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
          updateTubePreview(selected, outerRadius, innerRadius, height);
        } else if (parameter === "width") visualRoot.scale.x = ratio;
        else if (parameter === "depth") visualRoot.scale.y = ratio;
        else if (parameter === "height") {
          visualRoot.scale.z = ratio;
          visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
        } else if (selected.shapeParameters?.shape === "sphere") {
          visualRoot.scale.setScalar(ratio);
        } else {
          visualRoot.scale.x = ratio;
          visualRoot.scale.y = ratio;
        }
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
        if (candidate.dragIntent === "camera") return;
        if (candidate.dragIntent === "marquee") {
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
      const completedDimensions = interactionDimensions;
      const completedInteraction = interaction;
      interaction = null;
      interactionDimensions = [];
      pickCandidate = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = "default";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (cancelled) {
        if ((completedInteraction === "origin" || completedInteraction === "axisMove") && originDragMarker && originDragStart) originDragMarker.position.copy(originDragStart);
        const selected = selectionRef.current;
        const root = selectionRootRef.current;
        const visualRoot = selectionVisualRootRef.current;
        if (selected && root) {
          root.position.set(selected.center?.x ?? selected.x, selected.center?.y ?? selected.y, selected.center?.z ?? selected.baseZ + selected.height / 2);
          root.quaternion.setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad(selected.rotation3d?.x ?? 0),
            THREE.MathUtils.degToRad(selected.rotation3d?.y ?? 0),
            THREE.MathUtils.degToRad(selected.rotation3d?.z ?? selected.rotation),
            "ZYX",
          ));
          root.scale.set(1, 1, 1);
          visualRoot?.position.set(0, 0, 0);
          visualRoot?.scale.set(1, 1, 1);
          if (selected.shapeParameters?.shape === "cone") {
            updateConePreview(selected, selected.shapeParameters.baseRadius, selected.shapeParameters.topRadius, selected.shapeParameters.height);
          } else if (selected.shapeParameters?.shape === "tube") {
            updateTubePreview(selected, selected.shapeParameters.outerRadius, selected.shapeParameters.innerRadius, selected.shapeParameters.height);
          }
          requestRender();
        }
      } else {
        completedDimensions.forEach((axis) => dimensionPinnedRef.current.add(axis));
        if (completedInteraction === "origin" && pendingOrigin) originMoveRef.current?.(pendingOrigin.objectId, pendingOrigin.position);
        if (completedInteraction === "axisMove" && pendingAxisMove) {
          if (pendingAxisMove.targetKind === "object") objectAxisMoveRef.current?.(pendingAxisMove.targetId, pendingAxisMove.position);
          else operationAxisMoveRef.current?.(pendingAxisMove.targetId, {
            x: pendingAxisMove.position.x - pendingAxisMove.start.x,
            y: pendingAxisMove.position.y - pendingAxisMove.start.y,
            z: pendingAxisMove.position.z - pendingAxisMove.start.z,
          });
        }
        if (pendingShapeParameter) shapeParameterRef.current?.(pendingShapeParameter.parameter, pendingShapeParameter.value);
      }
      pendingShapeParameter = null;
      shapeParameterPreviewRef.current = null;
      shapeParameterStartValue = 0;
      shapeParameterWorldScale = 1;
      parameterPointerOffset = 0;
      parameterWorldToLocal = null;
      pendingOrigin = null;
      pendingAxisMove = null;
      originDragAxis = null;
      originDragStart = null;
      originPointerStart = null;
      originDragMarker = null;
      axisMoveRootStart = null;
      resizeStart = null;
      resizeRootStart = null;
      requestRender();
    };
    const leaveManipulatorArea = () => {
      if (workplaneFaceSelectionRef.current) {
        faceHighlight.visible = false;
        renderer.domElement.style.cursor = "default";
        requestRender();
      }
      if (interaction || dimensionHoverTimerRef.current !== null) return;
      dimensionHoverTimerRef.current = window.setTimeout(() => {
        dimensionHoverTimerRef.current = null;
        replaceHoverDimensions([]);
      }, 350);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", leaveManipulatorArea);
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
    originLayerRef.current = originLayer;
    workplaneRef.current = workplaneGroup;
    return () => {
      disposed = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      controls.removeEventListener("change", onControlsChange);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", leaveManipulatorArea);
      renderer.domElement.removeEventListener("pointerup", stopDragging);
      renderer.domElement.removeEventListener("pointercancel", cancelDragging);
      for (const cached of objectRenderCacheRef.current.values()) disposeCachedObjectRender(modelGroup, cached);
      objectRenderCacheRef.current.clear();
      renderer.dispose();
      renderer.domElement.remove();
      if (dimensionHoverTimerRef.current !== null) window.clearTimeout(dimensionHoverTimerRef.current);
      clearObjectOriginLayer(originLayer);
      faceHighlight.geometry.dispose();
      (faceHighlight.material as THREE.Material).dispose();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
      originLayerRef.current = null;
      workplaneRef.current = null;
      faceHighlightRef.current = null;
      [dimensionXRef.current, dimensionYRef.current, dimensionZRef.current].forEach((label) => { if (label) label.style.display = "none"; });
      invalidateRef.current = () => undefined;
    };
  }, [projection, renderQuality]);

  useEffect(() => {
    const layer = originLayerRef.current;
    if (!layer) return;
    clearObjectOriginLayer(layer);
    for (const origin of objectOrigins) {
      if (!origin.visible) continue;
      const marker = objectOriginMarker(origin.objectId, origin.objectId === editableOriginId, "object");
      marker.position.set(origin.position.x, origin.position.y, origin.position.z);
      marker.rotation.set(
        THREE.MathUtils.degToRad(origin.rotation.x),
        THREE.MathUtils.degToRad(origin.rotation.y),
        THREE.MathUtils.degToRad(origin.rotation.z),
        "ZYX",
      );
      layer.add(marker);
    }
    for (const origin of operationOrigins) {
      if (!origin.visible) continue;
      const marker = objectOriginMarker(origin.featureId, false, "feature");
      marker.position.set(origin.position.x, origin.position.y, origin.position.z);
      marker.rotation.set(
        THREE.MathUtils.degToRad(origin.rotation.x),
        THREE.MathUtils.degToRad(origin.rotation.y),
        THREE.MathUtils.degToRad(origin.rotation.z),
        "ZYX",
      );
      layer.add(marker);
    }
    invalidateRef.current();
  }, [editableOriginId, objectOrigins, operationOrigins, projection, renderQuality]);

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
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);

    const width = Math.max(60, workplane.width);
    const depth = Math.max(60, workplane.depth);
    const requestedStep = Math.max(0.1, workplane.gridStep);
    const addGrid = (target: THREE.Group, gridWidth: number, gridDepth: number, yellow = false) => {
      const step = Math.max(requestedStep, Math.max(gridWidth, gridDepth) / 1000);
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(gridWidth, gridDepth),
        workplaneMaterial(renderQuality, yellow ? "#ffe99a" : "#ddf8ff", yellow ? 0.3 : 0.68),
      );
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = yellow ? 0.015 : -0.08;
      surface.receiveShadow = !yellow;
      target.add(surface);
      const minor: number[] = [];
      const major: number[] = [];
      const axes: number[] = [];
      const border: number[] = [];
      const pushLine = (values: number[], x1: number, z1: number, x2: number, z2: number) => values.push(x1, 0, z1, x2, 0, z2);
      const halfWidth = gridWidth / 2;
      const halfDepth = gridDepth / 2;
      for (let index = -Math.floor(halfWidth / step); index <= Math.floor(halfWidth / step); index += 1) {
        const x = index * step;
        if (index === 0) pushLine(axes, x, -halfDepth, x, halfDepth); else pushLine(index % 5 === 0 ? major : minor, x, -halfDepth, x, halfDepth);
      }
      for (let index = -Math.floor(halfDepth / step); index <= Math.floor(halfDepth / step); index += 1) {
        const z = index * step;
        if (index === 0) pushLine(axes, -halfWidth, z, halfWidth, z); else pushLine(index % 5 === 0 ? major : minor, -halfWidth, z, halfWidth, z);
      }
      pushLine(border, -halfWidth, -halfDepth, halfWidth, -halfDepth);
      pushLine(border, halfWidth, -halfDepth, halfWidth, halfDepth);
      pushLine(border, halfWidth, halfDepth, -halfWidth, halfDepth);
      pushLine(border, -halfWidth, halfDepth, -halfWidth, -halfDepth);
      const palette = yellow ? ["#ffeaa0", "#efc83e", "#d9a900", "#c38c00"] : ["#91dff0", "#4bbddf", "#34aad2", "#58c5e6"];
      [minor, major, axes, border].forEach((values, index) => {
        if (values.length === 0) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: palette[index], transparent: true, opacity: [0.55, 0.7, 0.88, 0.9][index] }));
        lines.position.y = 0.025;
        target.add(lines);
      });
    };
    if (workplane.gridVisible) addGrid(group, width, depth);
    if (!parametricWorkplaneIsGlobal(workplane)) {
      const active = new THREE.Group();
      const sceneVector = (value: { x: number; y: number; z: number }) => new THREE.Vector3(value.x, value.z, -value.y);
      active.position.copy(sceneVector(workplane.origin));
      active.setRotationFromMatrix(new THREE.Matrix4().makeBasis(sceneVector(workplane.xAxis), sceneVector(workplane.normal), sceneVector(workplane.yAxis).negate()));
      const side = Math.max(requestedStep * 2, Math.min(width, depth) * workplane.activeSizePercent / 100);
      addGrid(active, side, side, true);
      group.add(active);
    }
    invalidateRef.current();
  }, [projection, renderQuality, workplane.activeSizePercent, workplane.depth, workplane.gridStep, workplane.gridVisible, workplane.normal.x, workplane.normal.y, workplane.normal.z, workplane.origin.x, workplane.origin.y, workplane.origin.z, workplane.width, workplane.xAxis.x, workplane.xAxis.y, workplane.xAxis.z, workplane.yAxis.x, workplane.yAxis.y, workplane.yAxis.z]);

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
      if (resourcesChanged && rendererRef.current) rendererRef.current.shadowMap.needsUpdate = true;
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
        depthTest: true,
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
    for (const child of group.children) {
      if (!(child instanceof THREE.LineSegments) || !child.userData.finalReferenceWireframe) continue;
      const objectId = typeof child.userData.objectId === "string" ? child.userData.objectId : null;
      child.visible = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.depthTest = finalReferenceWireframeDepthTest(objectId, selectedObjectIds);
        material.needsUpdate = true;
      }
    }
    invalidateRef.current();
  }, [selectedObjectIds]);

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
    selectionVisualRootRef.current = null;
    resizeHitboxesRef.current = [];
    if (!selection) {
      invalidateRef.current();
      return;
    }
    const root = new THREE.Group();
    root.position.set(selection.center?.x ?? selection.x, selection.center?.y ?? selection.y, selection.center?.z ?? selection.baseZ + selection.height / 2);
    const selectionQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(selection.rotation3d?.x ?? 0),
      THREE.MathUtils.degToRad(selection.rotation3d?.y ?? 0),
      THREE.MathUtils.degToRad(selection.rotation3d?.z ?? selection.rotation),
      "ZYX",
    ));
    root.quaternion.copy(selectionQuaternion);
    const visualRoot = new THREE.Group();
    root.add(visualRoot);
    const previewRoot = new THREE.Group();
    previewRoot.quaternion.identity();
    visualRoot.add(previewRoot);
    if (selection.operationPreview) {
      const operationPreview = selection.operationPreview;
      const previewStyle = operationPreviewStyle(operationPreview.mode, operationPreview.historical);
      if (previewStyle.fillOpacity !== null) {
        const previewGeometry = operationPreview.shape === "cylinder"
          ? new THREE.CylinderGeometry(0.5, 0.5, selection.height, 64)
          : operationPreview.shape === "cone"
            ? new THREE.CylinderGeometry(operationPreview.topRadius ?? 0, selection.width / 2, selection.height, 64)
          : operationPreview.shape === "sphere"
            ? new THREE.SphereGeometry(0.5, 64, 32)
            : new THREE.BoxGeometry(selection.width, selection.depth, selection.height);
        if (operationPreview.shape === "cylinder") {
          previewGeometry.rotateX(Math.PI / 2);
          previewGeometry.scale(selection.width, selection.depth, 1);
        } else if (operationPreview.shape === "cone") {
          previewGeometry.rotateX(Math.PI / 2);
        } else if (operationPreview.shape === "sphere") {
          previewGeometry.scale(selection.width, selection.depth, selection.height);
        }
        const preview = new THREE.Mesh(previewGeometry, previewMaterial(renderQuality, operationPreview.color, previewStyle.fillOpacity));
        preview.renderOrder = 17;
        previewRoot.add(preview);
      }
      if (previewStyle.wireframe) {
        const roleColor = operationPreview.mode === "add" ? "#378451" : operationPreview.mode === "hole" ? "#b6524d" : "#7256aa";
        const lineGeometry = new LineSegmentsGeometry();
        const previewParameters = selection.shapeParameters;
        const topWidth = previewParameters?.shape === "cone"
          ? previewParameters.topRadius * selection.width / Math.max(0.01, previewParameters.baseRadius)
          : selection.width;
        const innerWidth = previewParameters?.shape === "tube"
          ? previewParameters.innerRadius * selection.width / Math.max(0.01, previewParameters.outerRadius)
          : 0;
        lineGeometry.setPositions(operationPreviewWireframePositions(operationPreview.shape, selection.width, selection.depth, selection.height, topWidth, innerWidth));
        const preview = new LineSegments2(lineGeometry, new LineMaterial({ color: roleColor, linewidth: 2, depthTest: false, transparent: true, opacity: 1 }));
        preview.userData.operationPreviewWireframe = true;
        preview.renderOrder = 18;
        previewRoot.add(preview);
      }
    }
    const parameters = selection.shapeParameters;
    const addParameterHandle = (
      parameter: ShapeParameter,
      axis: ViewportDimensionAxis,
      start: THREE.Vector3,
      end: THREE.Vector3,
    ) => {
      const guide = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, end]),
        new THREE.LineBasicMaterial({ color: "#d6a600", depthTest: false, transparent: true, opacity: 0.9 }),
      );
      guide.renderOrder = 21;
      guide.userData.shapeParameterVisual = parameter;
      guide.userData.shapeParameterVisualRole = "guide";
      visualRoot.add(guide);
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(2, 18, 12),
        new THREE.MeshBasicMaterial({ color: "#f2c94c", depthTest: false }),
      );
      handle.position.copy(end);
      handle.renderOrder = 22;
      handle.userData.shapeParameterVisual = parameter;
      handle.userData.shapeParameterVisualRole = "handle";
      visualRoot.add(handle);
      const target = new THREE.Mesh(
        new THREE.SphereGeometry(5, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      target.position.copy(end);
      target.userData.shapeParameter = parameter;
      target.userData.dimensionAxis = axis;
      target.userData.hitTargetSize = 10;
      target.userData.shapeParameterVisual = parameter;
      target.userData.shapeParameterVisualRole = "target";
      visualRoot.add(target);
      resizeHitboxesRef.current.push(target);
    };
    if (parameters?.shape === "box") {
      addParameterHandle("width", "x", new THREE.Vector3(0, 0, 0), new THREE.Vector3(selection.width / 2 + 3, 0, 0));
      addParameterHandle("depth", "y", new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, selection.depth / 2 + 3, 0));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "cylinder") {
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, 0), new THREE.Vector3(selection.width / 2 + 3, 0, 0));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "sphere") {
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, 0), new THREE.Vector3(selection.width / 2 + 3, 0, 0));
    } else if (parameters?.shape === "cone") {
      const radialScale = selection.width / Math.max(0.01, parameters.baseRadius * 2);
      const topRadius = parameters.topRadius * radialScale;
      addParameterHandle("baseRadius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("topRadius", "y", new THREE.Vector3(0, 0, selection.height / 2), new THREE.Vector3(topRadius + 3, 0, selection.height / 2));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "tube") {
      const radialScale = selection.width / Math.max(0.01, parameters.outerRadius * 2);
      const innerRadius = parameters.innerRadius * radialScale;
      addParameterHandle("outerRadius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("innerRadius", "y", new THREE.Vector3(0, 0, selection.height / 2), new THREE.Vector3(innerRadius + 3, 0, selection.height / 2));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "halfSphere") {
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    }
    model.add(root);
    selectionRootRef.current = root;
    selectionVisualRootRef.current = visualRoot;
    invalidateRef.current();
  }, [selection, projection, renderQuality, workplane.normal.x, workplane.normal.y, workplane.normal.z, workplane.xAxis.x, workplane.xAxis.y, workplane.xAxis.z, workplane.yAxis.x, workplane.yAxis.y, workplane.yAxis.z]);

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

  const dimensionInput = (axis: ViewportDimensionAxis, ref: typeof dimensionXRef, className: string, label: string) => <input
    ref={ref}
    className={className}
    type="text"
    inputMode="decimal"
    aria-label={label}
    onFocus={(event) => beginDimensionEdit(axis, event.currentTarget)}
    onBlur={(event) => commitDimensionEdit(axis, event.currentTarget)}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        event.currentTarget.value = formatViewportDimension(dimensionValue(axis));
        event.currentTarget.blur();
      }
    }}
    onPointerEnter={() => setDimensionHover(axis, true)}
    onPointerLeave={(event) => {
      if (document.activeElement !== event.currentTarget) setDimensionHover(axis, false);
    }}
  />;

  return <div className="parametric-viewport" ref={hostRef} aria-label="Vista 3D de la pieza">
    <div ref={selectionBoxRef} className="parametric-selection-box" aria-hidden="true" />
    <div className="parametric-selection-dimensions">
      {dimensionInput("x", dimensionXRef, "axis-x", "Editar dimensión X")}
      {dimensionInput("y", dimensionYRef, "axis-y", "Editar dimensión Y")}
      {dimensionInput("z", dimensionZRef, "axis-z", "Editar dimensión Z")}
    </div>
  </div>;
}
