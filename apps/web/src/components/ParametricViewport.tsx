"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { AlignmentItem, AlignmentTarget } from "@/lib/parametricAlignment";
import { createAlignmentOverlay, disposeAlignmentOverlay } from "@/lib/viewportAlignment";
import { positionAlignmentButtons } from "@/lib/viewportAlignmentButtons";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";
import { Check, X } from "lucide-react";
import { ShellCornerButtons } from "@/components/ShellCornerButtons";
import { constrainViewportAxisDrag, coplanarFaceRegion, exactEdgeRegion, exactFaceRegion, finalReferenceWireframeDepthTest, formatViewportDimension, operationPreviewStyle, operationPreviewWireframePositions, type ViewportDimensionAxis, type ViewportEdgeGroup, type ViewportFaceGroup } from "@/lib/viewportGeometry";
import { AdaptiveViewportResolution, viewportPerformanceOptions, viewportRenderProfile, type ViewportRenderQuality } from "@/lib/viewportPerformance";
import { orthographicTouchTargetWorldSize, perspectiveTouchTargetWorldSize, viewportPointerDragIntent, type ViewportPointerDragIntent } from "@/lib/viewportPointer";
import { parametricWorkplaneIsGlobal } from "@/lib/parametricWorkplane";
import { ToolbarBooleanModeIcon, ToolbarChamferIcon, ToolbarEditOperationIcon, ToolbarFilletIcon } from "@/components/icons";
import { displayLengthToMillimeters, displayUnitLabel, formatDisplayLength, millimetersToDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
import { createAnnotationScene } from "@/lib/annotationScene";
import { AnnotationInteraction } from "@/components/AnnotationInteraction";
import type { AnnotationTool } from "@/lib/annotationPresets";
import { viewportSelectionBounds } from "@/lib/viewportBounds";
import type { ParametricDocument, ParametricFeature, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference, RenderMesh, SketchFeature } from "@/types/parametric";

export type ParametricViewportPerformance = {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
};

declare global {
  interface Window {
    educadParametricPerf?: { get: () => ParametricViewportPerformance };
  }
}

export type CameraView = { name: "iso" | "top" | "front" | "right" | "zoom-in" | "zoom-out" | "home" | "fit" | "selection" | "custom"; token: number; direction?: [number, number, number]; smooth?: boolean };
export type CameraProjection = "perspective" | "orthographic";
export type ViewportDisplayMode = "solid" | "wireframe";
export type ViewportShadingMode = "shadows" | "basic" | "noShadows";
export type CameraOrientation = { azimuth: number; polar: number };
type ViewportMoveDimension = { originX: number; originY: number; currentX: number; currentY: number; startX: number; startY: number; endX: number; endY: number; labelX: number; labelY: number; value: string };
export type TopologyFacePick = {
  key: string;
  objectId: string;
  selected: boolean;
  additive: boolean;
  centroid: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  area: number;
  faceId?: number;
  origin?: number;
  planar: boolean;
};
export type TopologyEdgePick = {
  key: string;
  objectId: string;
  selected: boolean;
  additive: boolean;
  midpoint: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  straight: boolean;
  length: number;
  edgeId: number;
};
type ShapeParameter = "width" | "depth" | "height" | "size" | "radius" | "baseRadius" | "topRadius" | "outerRadius" | "innerRadius" | "thickness" | "majorRadius" | "tubeRadius" | "cornerRadius" | "sides" | "teeth" | "toothDepth" | "boreRadius";

function ViewportEdgeRadiusInput({ radius, displayUnit, snap, locale, onCommit }: { radius: number; displayUnit: ParametricDisplayUnit; snap: number; locale: "en" | "es"; onCommit: (radius: number) => void }) {
  return <ViewportFloatingNumberInput value={radius} unit="length" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Radio" : "Radius"} min={0.01} max={Infinity} onCommit={onCommit} />;
}

function ViewportFloatingNumberInput({ value, unit, displayUnit, snap, label, min, max, onCommit }: { value: number; unit: "length" | "angle" | "count"; displayUnit: ParametricDisplayUnit; snap: number; label: string; min: number; max: number; onCommit: (value: number) => void }) {
  const format = (number: number) => unit === "length" ? formatDisplayLength(number, displayUnit) : formatViewportDimension(number);
  const shown = format(value);
  const [draft, setDraft] = useState(shown);
  const draftRef = useRef(draft);
  const editingRef = useRef(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const updateDraft = (text: string) => { draftRef.current = text; setDraft(text); };
  useEffect(() => { if (!editingRef.current) { draftRef.current = shown; setDraft(shown); } }, [shown]);
  const parsedValue = () => {
    const parsed = parseNumericExpression(draftRef.current, unit === "length" ? displayUnit : unit === "angle" ? "deg" : "");
    return unit === "length" ? displayLengthToMillimeters(parsed, displayUnit) : parsed;
  };
  const apply = (raw: number) => {
    const next = Math.min(max, Math.max(min, unit === "count" ? Math.round(raw) : raw));
    updateDraft(format(next));
    if (Math.abs(next - value) > 1e-6) onCommit(next);
  };
  const commit = () => {
    const raw = parsedValue();
    const input = fieldRef.current?.querySelector("input");
    if (input && !validateNumericExpression(input, raw)) return;
    if (!Number.isFinite(raw)) return;
    editingRef.current = false;
    apply(raw);
  };
  const increment = (direction: number) => {
    const raw = parsedValue();
    const step = unit === "length" ? Math.max(0.01, snap / 2) : 1;
    apply((Number.isFinite(raw) ? raw : value) + direction * step);
  };
  const incrementRef = useRef(increment);
  incrementRef.current = increment;
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY) incrementRef.current(event.deltaY < 0 ? 1 : -1);
    };
    field.addEventListener("wheel", wheel, { passive: false });
    return () => field.removeEventListener("wheel", wheel);
  }, []);
  return <div className="educad-viewport-edge-treatment-radius"><div ref={fieldRef}>
    <input type="text" inputMode="text" aria-label={label} value={draft}
      onFocus={(event) => { editingRef.current = true; event.currentTarget.select(); }}
      onChange={(event) => updateDraft(event.currentTarget.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { updateDraft(shown); editingRef.current = false; event.currentTarget.blur(); }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); increment(event.key === "ArrowUp" ? 1 : -1); }
      }} />
    <span>{unit === "length" ? displayUnitLabel(displayUnit) : unit === "angle" ? "°" : "×"}</span>
    <div className="educad-viewport-number-steppers">
      <button type="button" aria-label={`${label} +`} onPointerDown={(event) => event.preventDefault()} onClick={() => increment(1)}>▴</button>
      <button type="button" aria-label={`${label} −`} onPointerDown={(event) => event.preventDefault()} onClick={() => increment(-1)}>▾</button>
    </div>
  </div></div>;
}

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
  allowNegativeHeight?: boolean;
  shapeParameters?:
    | { shape: "box"; width: number; depth: number; height: number }
    | { shape: "roundedBox"; width: number; depth: number; height: number; cornerRadius: number }
    | { shape: "text"; size: number; height: number }
    | { shape: "cylinder"; radius: number; height: number }
    | { shape: "sphere"; radius: number }
    | { shape: "cone"; baseRadius: number; topRadius: number; height: number }
    | { shape: "tube"; outerRadius: number; innerRadius: number; height: number }
    | { shape: "torus"; majorRadius: number; tubeRadius: number }
    | { shape: "pyramid" | "wedge" | "roof" | "roundRoof"; width: number; depth: number; height: number }
    | { shape: "polygon"; radius: number; sides: number; height: number }
    | { shape: "gear"; outerRadius: number; toothDepth: number; boreRadius: number; teeth: number; height: number }
    | { shape: "halfSphere"; radius: number; height: number };
  operationPreview?: {
    shape: "box" | "roundedBox" | "cylinder" | "sphere" | "cone" | "tube" | "halfSphere" | "torus" | "pyramid" | "wedge" | "roof" | "roundRoof" | "polygon" | "gear";
    topRadius?: number;
    innerRadius?: number;
    cornerRadius?: number;
    sides?: number;
    teeth?: number;
    toothDepth?: number;
    boreRadius?: number;
    mode: "add" | "hole" | "common";
    color: string;
    historical: boolean;
  };
  parameterHandles?: ShapeParameter[];
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
    positionVisible?: boolean;
    rotationEditable?: boolean;
  }>;
  operationOrigins?: Array<{
    featureId: string;
    visible: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    positionVisible?: boolean;
    rotationEditable?: boolean;
  }>;
  sketchOverlays?: Array<{ feature: SketchFeature; object: ParametricObject | null; selected: boolean }>;
  editableOriginId?: string | null;
  selectedObjectOriginId?: string | null;
  selectedOperationOriginId?: string | null;
  selectedObjectIds?: string[];
  operationContext?: { color: string; mesh: RenderMesh; opacity: number; selectionMesh?: RenderMesh; detailMesh?: RenderMesh; detailColor?: "green" | "red" } | null;
  isolatedHistoryObjectId?: string | null;
  color: string;
  workplane?: ParametricDocument["workplane"];
  view: CameraView;
  projection?: CameraProjection;
  renderQuality?: ViewportRenderQuality;
  displayMode?: ViewportDisplayMode;
  shadingMode?: ViewportShadingMode;
  displayUnit?: ParametricDisplayUnit;
  annotations?: ParametricDocument["annotations"];
  annotationsVisible?: boolean;
  selectedAnnotationId?: string | null;
  onAnnotationSelect?: (id: string) => void;
  selectedAnnotationEndpoint?: "start" | "end" | null;
  onSelectAnnotationEndpoint?: (endpoint: "start" | "end") => void;
  onMoveAnnotationEndpoint?: (id: string, endpoint: "start" | "end", position: { x: number; y: number; z: number }) => void;
  annotationTool?: AnnotationTool | null;
  editingAnnotationId?: string | null;
  onPlaceAnnotation?: (kind: AnnotationTool, start: { x: number; y: number; z: number }, end?: { x: number; y: number; z: number }) => void;
  onFinishAnnotation?: (id: string, text: string, size: number) => void;
  onEditAnnotation?: (id: string | null) => void;
  onCancelAnnotationTool?: () => void;
  locale?: "en" | "es";
  parameterHandlesVisible?: boolean;
  selection?: ViewportSelection | null;
  snap?: number;
  onShapeParameterChange?: (parameter: ShapeParameter, value: number) => void;
  onOperationModeChange?: (operation: "add" | "cut" | "intersect") => void;
  onObjectOriginMove?: (objectId: string, position: { x: number; y: number; z: number }) => void;
  onObjectAxisMove?: (objectId: string, position: { x: number; y: number; z: number }) => void;
  onObjectRotate?: (objectId: string, axis: { x: number; y: number; z: number }, deltaDegrees: number, localAxis: "x" | "y" | "z") => void;
  onOperationAxisMove?: (featureId: string, delta: { x: number; y: number; z: number }) => void;
  onOperationRotate?: (featureId: string, axis: { x: number; y: number; z: number }, deltaDegrees: number) => void;
  onCameraOrientation?: (orientation: CameraOrientation) => void;
  onObjectSelect?: (objectId: string, featureId?: string) => void;
  alignmentActive?: boolean;
  alignmentBusy?: boolean;
  alignmentTargets?: AlignmentTarget[];
  alignmentReference?: AlignmentItem | null;
  onAlignmentSelect?: (item: AlignmentItem | null) => void;
  onAlign?: (axis: "x" | "y" | "z", anchor: "min" | "center" | "max") => void;
  onObjectsSelect?: (objectIds: string[]) => void;
  onEmptySelect?: () => void;
  workplaneFaceSelection?: boolean;
  onWorkplaneFaceSelect?: (face: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }) => void;
  topologyFaceSelection?: boolean;
  onTopologyFaceSelect?: (face: TopologyFacePick) => void;
  topologyEdgeSelection?: boolean;
  onTopologyEdgeSelect?: (edge: TopologyEdgePick) => void;
  topologySelections?: ParametricTopologyReference[];
  topologyMultiSelection?: boolean;
  historicalTopologySelections?: ParametricTopologyReference[];
  historicalTopologyRecords?: ParametricObjectRenderRecord[];
  faceExtrudeHandle?: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; distance: number; operation: "add" | "cut" } | null;
  onFaceExtrudeDistanceChange?: (distance: number, operation: "add" | "cut") => void;
  faceExtrudeDraft?: { distance: number; operation: "add" | "cut" } | null;
  onFaceExtrudeAccept?: () => void;
  onFaceExtrudeCancel?: () => void;
  faceExtrudeCanAccept?: boolean;
  edgeTreatmentHandle?: { origin: { x: number; y: number; z: number }; radius: number; treatment: "fillet" | "chamfer" } | null;
  onEdgeTreatmentRadiusChange?: (radius: number) => void;
  onEdgeTreatmentTypeChange?: (treatment: "fillet" | "chamfer") => void;
  onEdgeTreatmentAccept?: () => void;
  onEdgeTreatmentCancel?: () => void;
  edgeTreatmentCanAccept?: boolean;
  revolveHandle?: { origin: { x: number; y: number; z: number }; axis: { x: number; y: number; z: number }; angle: number; radius: number } | null;
  onRevolveAngleDragStart?: () => void;
  onRevolveAnglePreview?: (angle: number) => void;
  onRevolveAngleChange?: (angle: number) => void;
  onRevolveAngleCancel?: () => void;
  revolveDraft?: { operation: "add" | "cut" | "intersect"; angle: number } | null;
  onRevolveDraftChange?: (update: Partial<{ operation: "add" | "cut" | "intersect"; angle: number }>) => void;
  onRevolveAccept?: () => void;
  onRevolveCancel?: () => void;
  revolveCanAccept?: boolean;
  distanceHandle?: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number }; value: number; min?: number; max?: number; valueScale?: number; offset?: number } | null;
  onDistanceParameterDragStart?: () => void;
  onDistanceParameterPreview?: (value: number) => void;
  onDistanceParameterChange?: (value: number) => void;
  onDistanceParameterCancel?: () => void;
  shellDraft?: { thickness: number; cornerType?: "rounded" | "sharp" } | null;
  onShellCornerTypeChange?: (cornerType: "rounded" | "sharp") => void;
  onShellDraftChange?: (thickness: number) => void;
  onShellAccept?: () => void;
  onShellCancel?: () => void;
  shellCanAccept?: boolean;
  floatingFeature?: ParametricFeature | null;
  booleanObjects?: Array<{ id: string; name: string }>;
  patternSources?: Array<{ id: string; name: string }>;
  booleanAddOnly?: boolean;
  operationModesVisible?: boolean;
  contextToolbarVisible?: boolean;
  manipulatorControls?: ReactNode;
  onEditSketch?: (featureId: string) => void;
  onEditEdgeTreatmentSelection?: (featureId: string) => void;
  onEditFaceExtrudeSelection?: (featureId: string) => void;
  onEditShellSelection?: (featureId: string) => void;
  onEditRevolveFace?: (featureId: string) => void;
  onEditRevolveAxis?: (featureId: string) => void;
  onEditMirrorPlane?: (featureId: string) => void;
  onFloatingFeatureChange?: (featureId: string, update: Partial<{ distance: number; angle: number; thickness: number; cornerType: "rounded" | "sharp"; duplicate: boolean; operation: "add" | "cut" | "intersect"; sourceObjectId: string; count: number; axis: "x" | "y" | "z"; sourceFeatureId: string }>) => void;
  projectName?: string;
  onProjectRename?: () => void;
  onThumbnail?: (dataUrl: string) => void;
  thumbnailRequestToken?: number;
  thumbnailRequestOptions?: { includeOverlays?: boolean; width?: number; height?: number; quality?: number };
};

type CachedObjectRender = {
  geometryFingerprint: string | null;
  body: THREE.Mesh;
  edges: THREE.LineSegments;
  wireframeEdges: LineSegments2;
  referenceDisplayMode?: "solid" | "wireframe" | "solidEdges";
};

function setMaterialColor(material: THREE.Material, color: THREE.ColorRepresentation) {
  if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial) material.color.set(color);
}

function workplaneMaterial(quality: ViewportRenderQuality, shading: ViewportShadingMode, color = "#ddf8ff", opacity = 0.68) {
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 1, metalness: 0, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
}

function objectMaterial(quality: ViewportRenderQuality, shading: ViewportShadingMode, color: THREE.ColorRepresentation) {
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: 1 })
    : new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1 });
}

function referenceMaterial(quality: ViewportRenderQuality, shading: ViewportShadingMode, color: THREE.ColorRepresentation, opacity: number) {
  const material = objectMaterial(quality, shading, color);
  material.transparent = opacity < 1;
  material.opacity = opacity;
  material.depthWrite = opacity >= 1;
  return material;
}

function previewMaterial(quality: ViewportRenderQuality, shading: ViewportShadingMode, color: THREE.ColorRepresentation, opacity: number) {
  const shared = { color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false };
  return quality === "normal"
    ? new THREE.MeshStandardMaterial({ ...shared, roughness: 0.7 })
    : new THREE.MeshLambertMaterial(shared);
}

function roundedBoxPreviewGeometry(width: number, depth: number, height: number, cornerRadius: number) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const radius = Math.min(halfWidth - 0.001, halfDepth - 0.001, Math.max(0.001, cornerRadius));
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfDepth);
  shape.lineTo(halfWidth - radius, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + radius);
  shape.lineTo(halfWidth, halfDepth - radius);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - radius, halfDepth);
  shape.lineTo(-halfWidth + radius, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - radius);
  shape.lineTo(-halfWidth, -halfDepth + radius);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + radius, -halfDepth);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
  geometry.translate(0, 0, -height / 2);
  return geometry;
}

function roundedBoxRadiusHandlePoints(width: number, depth: number, height: number, radius: number) {
  const center = new THREE.Vector3(width / 2 - radius, -depth / 2 + radius, height / 2);
  const outward = new THREE.Vector3(1, -1, 0).normalize();
  return {
    start: center,
    end: center.clone().addScaledVector(outward, radius * 2 + 4),
  };
}

function sketchOverlayPositions(feature: SketchFeature) {
  const positions: number[] = [];
  const addPolyline = (points: Array<{ x: number; y: number }>) => {
    for (let index = 1; index < points.length; index += 1) positions.push(points[index - 1].x, points[index - 1].y, 0.025, points[index].x, points[index].y, 0.025);
  };
  if (feature.profile.shape === "rectangle") {
    const halfWidth = feature.profile.width / 2;
    const halfDepth = feature.profile.depth / 2;
    addPolyline([{ x: -halfWidth, y: -halfDepth }, { x: halfWidth, y: -halfDepth }, { x: halfWidth, y: halfDepth }, { x: -halfWidth, y: halfDepth }, { x: -halfWidth, y: -halfDepth }]);
    return positions;
  }
  if (feature.profile.shape === "circle") {
    const radius = feature.profile.diameter / 2;
    addPolyline(Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }));
    return positions;
  }
  const profile = feature.profile.geometry;
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  for (const segment of profile.segments.filter((candidate) => !candidate.construction)) {
    const start = pointById.get(segment.startId);
    const end = pointById.get(segment.endId);
    if (!start || !end) continue;
    if (segment.kind === "arc" && segment.center) {
      const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
      const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
      const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
      const positive = segment.clockwise !== false;
      const sweep = positive ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) : -((startAngle - endAngle + Math.PI * 2) % (Math.PI * 2));
      const divisions = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
      addPolyline(Array.from({ length: divisions + 1 }, (_, index) => {
        const angle = startAngle + sweep * index / divisions;
        return { x: segment.center!.x + Math.cos(angle) * radius, y: segment.center!.z + Math.sin(angle) * radius };
      }));
      continue;
    }
    if (segment.kind !== "line" && start.handleOut && end.handleIn) {
      addPolyline(Array.from({ length: 25 }, (_, index) => {
        const amount = index / 24;
        const inverse = 1 - amount;
        return {
          x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * start.handleOut!.x + 3 * inverse * amount ** 2 * end.handleIn!.x + amount ** 3 * end.x,
          y: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * start.handleOut!.z + 3 * inverse * amount ** 2 * end.handleIn!.z + amount ** 3 * end.z,
        };
      }));
      continue;
    }
    addPolyline([{ x: start.x, y: start.z }, { x: end.x, y: end.z }]);
  }
  for (const circle of (profile.circles ?? []).filter((candidate) => !candidate.construction)) {
    addPolyline(Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return { x: circle.x + Math.cos(angle) * circle.radius, y: circle.z + Math.sin(angle) * circle.radius };
    }));
  }
  return positions;
}

function disposeCachedObjectRender(group: THREE.Group | null, cached: CachedObjectRender) {
  group?.remove(cached.body, cached.edges, cached.wireframeEdges);
  cached.body.geometry.dispose();
  cached.edges.geometry.dispose();
  cached.wireframeEdges.geometry.dispose();
  const bodyMaterials = Array.isArray(cached.body.material) ? cached.body.material : [cached.body.material];
  const edgeMaterials = Array.isArray(cached.edges.material) ? cached.edges.material : [cached.edges.material];
  const wireframeMaterials = Array.isArray(cached.wireframeEdges.material) ? cached.wireframeEdges.material : [cached.wireframeEdges.material];
  bodyMaterials.forEach((material) => material.dispose());
  edgeMaterials.forEach((material) => material.dispose());
  wireframeMaterials.forEach((material) => material.dispose());
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

function yellowManipulatorLine(start: THREE.Vector3, end: THREE.Vector3, color: THREE.ColorRepresentation) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
  return new LineSegments2(geometry, new LineMaterial({
    color,
    linewidth: 2,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.92,
  }));
}

function updateYellowManipulatorLine(line: LineSegments2, start: THREE.Vector3, end: THREE.Vector3) {
  line.geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
}

function updateRevolveAngleArc(line: LineSegments2, radius: number, angleDegrees: number) {
  const segments = Math.max(2, Math.ceil(Math.abs(angleDegrees) / 4));
  const positions: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const first = THREE.MathUtils.degToRad(angleDegrees * index / segments);
    const second = THREE.MathUtils.degToRad(angleDegrees * (index + 1) / segments);
    positions.push(
      Math.cos(first) * radius, Math.sin(first) * radius, 0,
      Math.cos(second) * radius, Math.sin(second) * radius, 0,
    );
  }
  line.geometry.setPositions(positions);
}

function addYellowManipulatorOutline(handle: THREE.Mesh, radius: number) {
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.12, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xb67c00, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }),
  );
  outline.renderOrder = handle.renderOrder - 1;
  outline.userData.yellowManipulatorOutline = true;
  handle.add(outline);
}

function preserveYellowManipulatorShape(root: THREE.Object3D) {
  const inverseScale = new THREE.Vector3(
    1 / Math.max(0.0001, Math.abs(root.scale.x)),
    1 / Math.max(0.0001, Math.abs(root.scale.y)),
    1 / Math.max(0.0001, Math.abs(root.scale.z)),
  );
  root.traverse((child) => {
    const role = child.userData.shapeParameterVisualRole;
    if (role === "handle" || role === "target") child.scale.copy(inverseScale);
  });
}

function coplanarFaceGeometry(source: THREE.BufferGeometry, faceIndex: number) {
  const positions = source.getAttribute("position");
  const indices = source.getIndex();
  const faceGroups = source.userData.faceGroups as ViewportFaceGroup[] | undefined;
  const region = positions && indices && faceIndex >= 0 && faceGroups?.length
    ? exactFaceRegion(positions.array, indices.array, faceIndex, faceGroups)
    : positions && faceIndex >= 0 ? coplanarFaceRegion(positions.array, indices?.array ?? null, faceIndex) : null;
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

function objectOriginMarker(targetId: string, editable: boolean, targetKind: "object" | "feature" = "object", positionVisible = true, rotationEditable = false) {
  const marker = new THREE.Group();
  marker.name = `${targetKind === "object" ? "Origin" : "Operation"} ${targetId}`;
  marker.userData.transformTargetId = targetId;
  marker.userData.transformTargetKind = targetKind;
  const axes: Array<["x" | "y" | "z", THREE.Vector3, number, number]> = [
    ["x", new THREE.Vector3(1, 0, 0), 0xd84b4b, 0xff0000],
    ["y", new THREE.Vector3(0, 1, 0), 0x35a85b, 0x00ff00],
    ["z", new THREE.Vector3(0, 0, 1), 0x347fd1, 0x0000ff],
  ];
  if (positionVisible) for (const [axis, direction, color, hoverColor] of axes) {
    const arrow = new THREE.ArrowHelper(direction, undefined, 1, color, 0.28, 0.16);
    arrow.line.visible = false;
    const arrowMaterials = Array.isArray(arrow.cone.material) ? arrow.cone.material : [arrow.cone.material];
    for (const material of arrowMaterials) {
      material.transparent = true;
      material.opacity = 0.92;
      material.depthTest = false;
      material.depthWrite = false;
    }
    arrow.cone.userData.originAxis = axis;
    arrow.cone.userData.originTip = true;
    arrow.cone.userData.originDragHandle = true;
    arrow.cone.userData.handleGroup = `translate:${axis}`;
    arrow.cone.userData.handleColor = color;
    arrow.cone.userData.handleHoverColor = hoverColor;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.72, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }),
    );
    shaft.position.copy(direction).multiplyScalar(0.36);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    shaft.userData.originAxis = axis;
    shaft.userData.originDragHandle = true;
    shaft.userData.handleGroup = `translate:${axis}`;
    shaft.userData.handleColor = color;
    shaft.userData.handleHoverColor = hoverColor;
    const shaftTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.72, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    shaftTarget.position.copy(shaft.position);
    shaftTarget.quaternion.copy(shaft.quaternion);
    shaftTarget.userData.originAxis = axis;
    shaftTarget.userData.originDragHandle = true;
    shaftTarget.userData.handleGroup = `translate:${axis}`;
    marker.add(arrow, shaft, shaftTarget);
  }
  if (rotationEditable) {
    for (const [axis, , color, hoverColor] of axes) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.576, 0.015, 8, 64),
        new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }),
      );
      const ringTarget = new THREE.Mesh(
        new THREE.TorusGeometry(0.576, 0.055, 8, 64),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      if (axis === "x") ring.rotation.y = Math.PI / 2;
      else if (axis === "y") ring.rotation.x = -Math.PI / 2;
      ringTarget.rotation.copy(ring.rotation);
      ring.userData.rotationAxis = axis;
      ring.userData.handleGroup = `rotate:${axis}`;
      ring.userData.handleColor = color;
      ring.userData.handleHoverColor = hoverColor;
      ringTarget.userData.rotationAxis = axis;
      ringTarget.userData.handleGroup = `rotate:${axis}`;
      ring.renderOrder = 31;
      marker.add(ring, ringTarget);
    }
  }
  if (positionVisible || rotationEditable) {
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 10, 8),
      new THREE.MeshBasicMaterial({ color: editable ? 0x8a45b8 : 0xffffff, depthTest: false, depthWrite: false, transparent: true, opacity: 1 }),
    );
    center.userData.originCenter = true;
    if (positionVisible) center.userData.originAxis = "xy";
    if (positionVisible && !editable) {
      center.userData.snapDragHandle = true;
      center.userData.handleGroup = "snap:center";
      center.userData.handleColor = 0xffffff;
      center.userData.handleHoverColor = 0xffd84a;
      const centerTarget = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
      );
      centerTarget.userData.snapDragHandle = true;
      centerTarget.userData.handleGroup = "snap:center";
      marker.add(centerTarget);
    }
    marker.add(center);
  }
  marker.traverse((child) => {
    if (!(child instanceof THREE.Line || child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.depthTest = false;
      material.depthWrite = false;
    }
    child.renderOrder = child.userData.originCenter ? 32 : 30;
  });
  return marker;
}

export function ParametricViewport({ onAnnotationSelect, annotationsVisible = true, onMoveAnnotationEndpoint, selectedAnnotationEndpoint = null, onSelectAnnotationEndpoint, annotationTool = null, editingAnnotationId = null, onPlaceAnnotation, onFinishAnnotation, onEditAnnotation, onCancelAnnotationTool, annotations, selectedAnnotationId = null, onProjectRename, mesh, objectRecords = [], objectColors, objectOrigins = [], operationOrigins = [], sketchOverlays = [], editableOriginId = null, selectedObjectOriginId = null, selectedOperationOriginId = null, selectedObjectIds = [], operationContext = null, isolatedHistoryObjectId = null, color, workplane = { width: 200, depth: 200, gridStep: 5, snapSpacing: 1, snapToGrid: true, gridVisible: true, activeSizePercent: 20, origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } }, view, projection = "orthographic", renderQuality = "normal", displayMode = "solid", shadingMode = "shadows", displayUnit = "mm", locale = "en", parameterHandlesVisible = true, selection = null, snap = 1, onShapeParameterChange, onOperationModeChange, onObjectOriginMove, onObjectAxisMove, onObjectRotate, onOperationAxisMove, onOperationRotate, onCameraOrientation, onObjectSelect, onObjectsSelect, onEmptySelect, workplaneFaceSelection = false, onWorkplaneFaceSelect, topologyFaceSelection = false, onTopologyFaceSelect, topologyEdgeSelection = false, onTopologyEdgeSelect, topologySelections = [], topologyMultiSelection = true, historicalTopologySelections = [], historicalTopologyRecords = [], faceExtrudeHandle = null, onFaceExtrudeDistanceChange, faceExtrudeDraft = null, onFaceExtrudeAccept, onFaceExtrudeCancel, faceExtrudeCanAccept = true, edgeTreatmentHandle = null, onEdgeTreatmentRadiusChange, onEdgeTreatmentTypeChange, onEdgeTreatmentAccept, onEdgeTreatmentCancel, edgeTreatmentCanAccept = true, revolveHandle = null, onRevolveAngleDragStart, onRevolveAnglePreview, onRevolveAngleChange, onRevolveAngleCancel, revolveDraft = null, onRevolveDraftChange, onRevolveAccept, onRevolveCancel, revolveCanAccept = true, distanceHandle = null, onDistanceParameterDragStart, onDistanceParameterPreview, onDistanceParameterChange, onDistanceParameterCancel, shellDraft = null, onShellDraftChange, onShellCornerTypeChange, onShellAccept, onShellCancel, shellCanAccept = true, floatingFeature = null, booleanObjects = [], patternSources = [], booleanAddOnly = false, operationModesVisible = true, contextToolbarVisible, manipulatorControls, onEditSketch, onEditEdgeTreatmentSelection, onEditFaceExtrudeSelection, onEditShellSelection, onEditRevolveFace, onEditRevolveAxis, onEditMirrorPlane, onFloatingFeatureChange, projectName = "Untitled design", onThumbnail, thumbnailRequestToken = 0, thumbnailRequestOptions, alignmentActive = false, alignmentBusy = false, alignmentTargets = [], alignmentReference = null, onAlignmentSelect, onAlign }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const annotationSnapRef = useRef<(event: PointerEvent) => THREE.Vector3 | null>(() => null);
  const annotationPositionHandleRef = useRef<(event: PointerEvent) => boolean>(() => false);
  const annotationLayerRef = useRef<THREE.Group | null>(null);
  const annotationSelectRef = useRef(onAnnotationSelect);
  annotationSelectRef.current = onAnnotationSelect;
  const [annotationPreview, setAnnotationPreview] = useState<NonNullable<ParametricDocument["annotations"]>[number] | null>(null);
  const annotationStateRef = useRef({ annotations, selectedAnnotationId, selectedAnnotationEndpoint, editingAnnotationId });
  annotationStateRef.current = { annotations, selectedAnnotationId, selectedAnnotationEndpoint, editingAnnotationId };
  const alignmentRef = useRef({ active: alignmentActive, targets: alignmentTargets, onSelect: onAlignmentSelect });
  alignmentRef.current = { active: alignmentActive, targets: alignmentTargets, onSelect: onAlignmentSelect };
  const alignmentOverlayRef = useRef<THREE.Group | null>(null);
  const alignmentBusyRef = useRef(alignmentBusy);
  alignmentBusyRef.current = alignmentBusy;
  const alignmentButtonsRef = useRef<HTMLDivElement | null>(null);
  const alignmentReferenceRef = useRef(alignmentReference);
  alignmentReferenceRef.current = alignmentReference;
  const alignmentPickMeshesRef = useRef<THREE.Mesh[]>([]);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const dimensionXRef = useRef<HTMLInputElement>(null);
  const dimensionYRef = useRef<HTMLInputElement>(null);
  const dimensionZRef = useRef<HTMLInputElement>(null);
  const dimensionPinnedRef = useRef(new Set<ViewportDimensionAxis>());
  const dimensionHoverRef = useRef(new Set<ViewportDimensionAxis>());
  const dimensionHoverTimerRef = useRef<number | null>(null);
  const dimensionSelectionIdRef = useRef<string | null>(selection?.id ?? null);
  const [moveDimension, setMoveDimension] = useState<ViewportMoveDimension | null>(null);
  const [edgeTreatmentRadiusPreview, setEdgeTreatmentRadiusPreview] = useState<number | null>(null);
  const [revolveAnglePreview, setRevolveAnglePreview] = useState<number | null>(null);
  const [distanceParameterPreview, setDistanceParameterPreview] = useState<number | null>(null);
  const shapeParameterPreviewRef = useRef<{ parameter: ShapeParameter; value: number } | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const thumbnailCallbackRef = useRef(onThumbnail);
  const thumbnailRequestedRef = useRef(true);
  const thumbnailRequestOptionsRef = useRef<Props["thumbnailRequestOptions"]>(undefined);
  const manualThumbnailRequestRef = useRef(false);
  const controlsRef = useRef<OrbitControls | null>(null);
  const projectBandRef = useRef<THREE.Mesh | null>(null);
  const projectRenameButtonRef = useRef<THREE.Mesh | null>(null);
  const projectionChangeRef = useRef<((projection: CameraProjection) => void) | null>(null);
  const cameraTransitionRef = useRef<number | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const originLayerRef = useRef<THREE.Group | null>(null);
  const workplaneRef = useRef<THREE.Group | null>(null);
  const workplaneSelectionPlanesRef = useRef<THREE.Group | null>(null);
  const sketchLayerRef = useRef<THREE.Group | null>(null);
  const selectionRootRef = useRef<THREE.Group | null>(null);
  const selectionVisualRootRef = useRef<THREE.Group | null>(null);
  const operationContextRef = useRef<THREE.Group | null>(null);
  const faceHighlightRef = useRef<THREE.Mesh | null>(null);
  const edgeHighlightRef = useRef<LineSegments2 | null>(null);
  const topologyFaceLayerRef = useRef<THREE.Group | null>(null);
  const faceExtrudeHandleRef = useRef<THREE.Group | null>(null);
  const edgeTreatmentHandleRef = useRef<THREE.Group | null>(null);
  const revolveHandleRef = useRef<THREE.Group | null>(null);
  const distanceHandleRef = useRef<THREE.Group | null>(null);
  const faceExtrudeDistanceChangeRef = useRef(onFaceExtrudeDistanceChange);
  const edgeTreatmentRadiusChangeRef = useRef(onEdgeTreatmentRadiusChange);
  const revolveAngleChangeRef = useRef(onRevolveAngleChange);
  const revolveAngleDragStartRef = useRef(onRevolveAngleDragStart);
  const revolveAnglePreviewRef = useRef(onRevolveAnglePreview);
  const revolveAngleCancelRef = useRef(onRevolveAngleCancel);
  const distanceParameterDragStartRef = useRef(onDistanceParameterDragStart);
  const distanceParameterPreviewRef = useRef(onDistanceParameterPreview);
  const distanceParameterChangeRef = useRef(onDistanceParameterChange);
  const distanceParameterCancelRef = useRef(onDistanceParameterCancel);
  const resizeHitboxesRef = useRef<THREE.Mesh[]>([]);
  const selectionRef = useRef(selection);
  const shapeParameterRef = useRef(onShapeParameterChange);
  const originMoveRef = useRef(onObjectOriginMove);
  const objectAxisMoveRef = useRef(onObjectAxisMove);
  const objectRotateRef = useRef(onObjectRotate);
  const operationAxisMoveRef = useRef(onOperationAxisMove);
  const operationRotateRef = useRef(onOperationRotate);
  const editableOriginIdRef = useRef(editableOriginId);
  const selectedObjectOriginIdRef = useRef(selectedObjectOriginId);
  const selectedOperationOriginIdRef = useRef(selectedOperationOriginId);
  const orientationRef = useRef(onCameraOrientation);
  const objectSelectRef = useRef(onObjectSelect);
  const objectsSelectRef = useRef(onObjectsSelect);
  const emptySelectRef = useRef(onEmptySelect);
  const workplaneFaceSelectionRef = useRef(workplaneFaceSelection);
  const workplaneFaceSelectRef = useRef(onWorkplaneFaceSelect);
  const topologyFaceSelectionRef = useRef(topologyFaceSelection);
  const topologyFaceSelectRef = useRef(onTopologyFaceSelect);
  const topologyEdgeSelectionRef = useRef(topologyEdgeSelection);
  const topologyMultiSelectionRef = useRef(topologyMultiSelection);
  const topologyEdgeSelectRef = useRef(onTopologyEdgeSelect);
  const snapRef = useRef(snap);
  const activeWorkplaneRef = useRef(workplane);
  const isolatedHistoryObjectIdRef = useRef(isolatedHistoryObjectId);
  const invalidateRef = useRef<() => void>(() => undefined);
  const groundOpacityDirtyRef = useRef(true);
  const hasFittedRef = useRef(false);
  const objectRenderCacheRef = useRef(new Map<string, CachedObjectRender>());
  const batchedSolidEdgesRef = useRef<THREE.LineSegments | null>(null);

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
  useEffect(() => { objectRotateRef.current = onObjectRotate; }, [onObjectRotate]);
  useEffect(() => { operationAxisMoveRef.current = onOperationAxisMove; }, [onOperationAxisMove]);
  useEffect(() => { operationRotateRef.current = onOperationRotate; }, [onOperationRotate]);
  useEffect(() => { editableOriginIdRef.current = editableOriginId; }, [editableOriginId]);
  useEffect(() => { selectedObjectOriginIdRef.current = selectedObjectOriginId; }, [selectedObjectOriginId]);
  useEffect(() => { selectedOperationOriginIdRef.current = selectedOperationOriginId; }, [selectedOperationOriginId]);
  useEffect(() => { orientationRef.current = onCameraOrientation; }, [onCameraOrientation]);
  useEffect(() => { objectSelectRef.current = onObjectSelect; }, [onObjectSelect]);
  useEffect(() => { objectsSelectRef.current = onObjectsSelect; }, [onObjectsSelect]);
  useEffect(() => { emptySelectRef.current = onEmptySelect; }, [onEmptySelect]);
  useEffect(() => { workplaneFaceSelectionRef.current = workplaneFaceSelection; }, [workplaneFaceSelection]);
  useEffect(() => { workplaneFaceSelectRef.current = onWorkplaneFaceSelect; }, [onWorkplaneFaceSelect]);
  useEffect(() => { topologyFaceSelectionRef.current = topologyFaceSelection; }, [topologyFaceSelection]);
  useEffect(() => { topologyFaceSelectRef.current = onTopologyFaceSelect; }, [onTopologyFaceSelect]);
  useEffect(() => { topologyEdgeSelectionRef.current = topologyEdgeSelection; }, [topologyEdgeSelection]);
  useEffect(() => { topologyMultiSelectionRef.current = topologyMultiSelection; }, [topologyMultiSelection]);
  useEffect(() => { faceExtrudeDistanceChangeRef.current = onFaceExtrudeDistanceChange; }, [onFaceExtrudeDistanceChange]);
  useEffect(() => { edgeTreatmentRadiusChangeRef.current = onEdgeTreatmentRadiusChange; }, [onEdgeTreatmentRadiusChange]);
  useEffect(() => { revolveAngleChangeRef.current = onRevolveAngleChange; }, [onRevolveAngleChange]);
  useEffect(() => { revolveAngleDragStartRef.current = onRevolveAngleDragStart; }, [onRevolveAngleDragStart]);
  useEffect(() => { revolveAnglePreviewRef.current = onRevolveAnglePreview; }, [onRevolveAnglePreview]);
  useEffect(() => { revolveAngleCancelRef.current = onRevolveAngleCancel; }, [onRevolveAngleCancel]);
  useEffect(() => { distanceParameterDragStartRef.current = onDistanceParameterDragStart; }, [onDistanceParameterDragStart]);
  useEffect(() => { distanceParameterPreviewRef.current = onDistanceParameterPreview; }, [onDistanceParameterPreview]);
  useEffect(() => { distanceParameterChangeRef.current = onDistanceParameterChange; }, [onDistanceParameterChange]);
  useEffect(() => { distanceParameterCancelRef.current = onDistanceParameterCancel; }, [onDistanceParameterCancel]);
  useEffect(() => { topologyEdgeSelectRef.current = onTopologyEdgeSelect; }, [onTopologyEdgeSelect]);
  useEffect(() => {
    if (workplaneFaceSelection || topologyFaceSelection || topologyEdgeSelection) return;
    if (faceHighlightRef.current) faceHighlightRef.current.visible = false;
    if (edgeHighlightRef.current) edgeHighlightRef.current.visible = false;
    if (rendererRef.current) rendererRef.current.domElement.style.cursor = "default";
    invalidateRef.current();
  }, [topologyEdgeSelection, topologyFaceSelection, workplaneFaceSelection]);
  useEffect(() => {
    if (topologyFaceSelection || topologyEdgeSelection) return;
    const layer = topologyFaceLayerRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      child.traverse((item) => {
        if (!(item instanceof THREE.Mesh || item instanceof THREE.LineSegments || item instanceof LineSegments2)) return;
        item.geometry.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      });
    }
    invalidateRef.current();
  }, [topologyEdgeSelection, topologyFaceSelection]);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { thumbnailCallbackRef.current = onThumbnail; }, [onThumbnail]);
  useEffect(() => { thumbnailRequestOptionsRef.current = thumbnailRequestOptions; }, [thumbnailRequestOptions]);
  useEffect(() => {
    thumbnailRequestedRef.current = true;
    invalidateRef.current();
  }, [objectRecords]);
  useEffect(() => {
    if (thumbnailRequestToken <= 0) return;
    manualThumbnailRequestRef.current = true;
    thumbnailRequestedRef.current = true;
    invalidateRef.current();
  }, [thumbnailRequestToken]);
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
    const boxLike = parameters && (parameters.shape === "box" || parameters.shape === "roundedBox" || parameters.shape === "pyramid" || parameters.shape === "wedge" || parameters.shape === "roof" || parameters.shape === "roundRoof");
    const parameter = axis === "x" ? parameters?.shape === "text" ? null : boxLike ? "width" : parameters?.shape === "cone" ? "baseRadius" : parameters?.shape === "tube" ? "outerRadius" : parameters?.shape === "gear" ? "outerRadius" : parameters?.shape === "torus" ? "majorRadius" : parameters ? "radius" : null
      : axis === "y" ? parameters?.shape === "text" ? "size" : parameters?.shape === "cone" ? "topRadius" : parameters?.shape === "tube" ? "thickness" : parameters?.shape === "polygon" ? "sides" : boxLike ? "depth" : null
        : axis === "z" && parameters ? parameters.shape === "torus" ? "tubeRadius" : parameters.shape !== "sphere" ? "height" : null : null;
    const preview = shapeParameterPreviewRef.current;
    if (parameter && preview?.parameter === parameter) return preview.value;
    if (parameter === "width" && boxLike) return parameters.width;
    if (parameter === "size" && parameters?.shape === "text") return parameters.size;
    if (parameter === "depth" && boxLike) return parameters.depth;
    if (parameter === "radius" && (parameters?.shape === "cylinder" || parameters?.shape === "sphere" || parameters?.shape === "halfSphere" || parameters?.shape === "polygon")) return parameters.radius;
    if (parameter === "baseRadius" && parameters?.shape === "cone") return parameters.baseRadius;
    if (parameter === "topRadius" && parameters?.shape === "cone") return parameters.topRadius;
    if (parameter === "outerRadius" && (parameters?.shape === "tube" || parameters?.shape === "gear")) return parameters.outerRadius;
    if (parameter === "thickness" && parameters?.shape === "tube") return parameters.outerRadius - parameters.innerRadius;
    if (parameter === "sides" && parameters?.shape === "polygon") return parameters.sides;
    if (parameter === "majorRadius" && parameters?.shape === "torus") return parameters.majorRadius;
    if (parameter === "tubeRadius" && parameters?.shape === "torus") return parameters.tubeRadius;
    if (parameter === "height" && parameters && parameters.shape !== "sphere" && parameters.shape !== "torus") return parameters.height;
    if (axis === "x") return selected.width;
    if (axis === "y") return selected.depth;
    if (axis === "z") return selected.height;
    return selected.rotation;
  };

  const beginDimensionEdit = (axis: ViewportDimensionAxis, input: HTMLInputElement) => {
    dimensionPinnedRef.current.add(axis);
    const scalar = selectionRef.current?.shapeParameters?.shape === "polygon" && axis === "y";
    input.value = scalar ? formatViewportDimension(dimensionValue(axis)) : formatDisplayLength(dimensionValue(axis), displayUnit);
    window.requestAnimationFrame(() => input.select());
    invalidateRef.current();
  };

  const commitDimensionEdit = (axis: ViewportDimensionAxis, input: HTMLInputElement) => {
    const selected = selectionRef.current;
    const scalar = selected?.shapeParameters?.shape === "polygon" && axis === "y";
    const parsedValue = parseNumericExpression(input.value, scalar ? "" : displayUnit);
    const value = scalar ? parsedValue : displayLengthToMillimeters(parsedValue, displayUnit);
    if (!validateNumericExpression(input, value)) return;
    if (!selected) {
      input.value = scalar ? formatViewportDimension(dimensionValue(axis)) : formatDisplayLength(dimensionValue(axis), displayUnit);
      invalidateRef.current();
      return;
    }
    const parameters = selected.shapeParameters;
    if (parameters) {
      const boxLike = parameters.shape === "box" || parameters.shape === "roundedBox" || parameters.shape === "pyramid" || parameters.shape === "wedge" || parameters.shape === "roof" || parameters.shape === "roundRoof";
      const parameter = axis === "x" ? parameters.shape === "text" ? null : boxLike ? "width" : parameters.shape === "cone" ? "baseRadius" : parameters.shape === "tube" ? "outerRadius" : parameters.shape === "gear" ? "outerRadius" : parameters.shape === "torus" ? "majorRadius" : "radius" : axis === "y" ? parameters.shape === "text" ? "size" : parameters.shape === "cone" ? "topRadius" : parameters.shape === "tube" ? "thickness" : parameters.shape === "polygon" ? "sides" : boxLike ? "depth" : null : axis === "z" ? parameters.shape === "torus" ? "tubeRadius" : parameters.shape !== "sphere" ? "height" : null : null;
      if (parameter && (parameter === "topRadius" ? value >= 0 : value > 0)) shapeParameterRef.current?.(parameter, value);
    }
    input.value = scalar ? formatViewportDimension(dimensionValue(axis)) : formatDisplayLength(dimensionValue(axis), displayUnit);
    dimensionPinnedRef.current.add(axis);
    invalidateRef.current();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#edf4f7");
    hasFittedRef.current = false;
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = projection === "orthographic"
      ? new THREE.OrthographicCamera(-90, 90, 90, -90, -2000, 2000)
      : new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    // Start in the same quadrant as Home so the provisional frame shown while
    // the CAD worker loads does not flash a mirrored camera orientation.
    camera.position.set(-118, 96, 118);
    const renderProfile = viewportRenderProfile(renderQuality);
    const resolution = new AdaptiveViewportResolution(window.devicePixelRatio, viewportPerformanceOptions(renderQuality));
    const renderer = new THREE.WebGLRenderer({ antialias: renderProfile.antialias, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(resolution.pixelRatio);
    renderer.shadowMap.enabled = shadingMode !== "noShadows";
    renderer.shadowMap.type = shadingMode === "basic" || renderQuality === "optimized" ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    // The light and shadow camera are fixed. Camera orbit/pan does not change
    // the shadow texture, so only rebuild it when scene resources change.
    renderer.shadowMap.autoUpdate = renderProfile.shadowMapAutoUpdate;
    renderer.shadowMap.needsUpdate = shadingMode !== "noShadows";
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.target.set(0, 0, 0);
    controls.minDistance = 18;
    controls.maxDistance = 420;
    const updateCameraClipping = () => {
      const distance = Math.max(1, camera.position.distanceTo(controls.target));
      const near = camera instanceof THREE.OrthographicCamera
        ? -Math.max(2000, distance * 50)
        : Math.max(0.05, distance / 2000);
      const far = Math.max(2000, distance * 50);
      if (Math.abs(camera.near - near) > 0.0001 || Math.abs(camera.far - far) > 0.1) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    };
    projectionChangeRef.current = (nextProjection) => {
      const wantsOrthographic = nextProjection === "orthographic";
      if (wantsOrthographic === (camera instanceof THREE.OrthographicCamera)) return;
      const width = Math.max(1, renderer.domElement.clientWidth);
      const height = Math.max(1, renderer.domElement.clientHeight);
      const aspect = width / height;
      const direction = camera.position.clone().sub(controls.target).normalize();
      const currentHeight = camera instanceof THREE.OrthographicCamera
        ? (camera.top - camera.bottom) / Math.max(0.0001, camera.zoom)
        : 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const nextCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = wantsOrthographic
        ? new THREE.OrthographicCamera(-90 * aspect, 90 * aspect, 90, -90, -2000, 2000)
        : new THREE.PerspectiveCamera(38, aspect, 0.1, 2000);
      nextCamera.up.copy(camera.up);
      if (nextCamera instanceof THREE.OrthographicCamera) {
        nextCamera.position.copy(camera.position);
        nextCamera.zoom = Math.max(0.01, 180 / Math.max(0.01, currentHeight));
      } else {
        const distance = currentHeight / (2 * Math.tan(THREE.MathUtils.degToRad(nextCamera.fov) / 2));
        nextCamera.position.copy(controls.target).add(direction.multiplyScalar(distance));
      }
      nextCamera.lookAt(controls.target);
      nextCamera.updateProjectionMatrix();
      controls.object = nextCamera;
      camera = nextCamera;
      cameraRef.current = nextCamera;
      controls.update();
      updateCameraClipping();
      groundOpacityDirtyRef.current = true;
      requestRender();
    };
    let frame = 0;
    let disposed = false;
    let previousRenderedAt: number | null = null;
    let sampledRenderTime = 0;
    let sampledRenderFrames = 0;
    let pendingHoverEvent: PointerEvent | null = null;
    let processPendingHover: () => void = () => undefined;
    const performanceStats: ParametricViewportPerformance = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
    window.educadParametricPerf = { get: () => ({ ...performanceStats }) };
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
              new THREE.Vector3(dimensionValue("x") * selected.width / Math.max(0.01, parameters.outerRadius * 2), 0, -selected.height / 2),
              new THREE.Vector3(Math.max(0, parameters.outerRadius - dimensionValue("y") - 5) * selected.width / Math.max(0.01, parameters.outerRadius * 2), 0, dimensionValue("z") * selected.height / Math.max(0.01, parameters.height) / 2),
              new THREE.Vector3(selected.width / 2, 0, 0),
            ]
        : parameters?.shape === "torus"
          ? [
              new THREE.Vector3(dimensionValue("x") * selected.width / Math.max(0.01, (parameters.majorRadius + parameters.tubeRadius) * 2), 0, 0),
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(parameters.majorRadius * selected.width / Math.max(0.01, (parameters.majorRadius + parameters.tubeRadius) * 2), 0, dimensionValue("z") * selected.height / Math.max(0.01, parameters.tubeRadius * 2)),
            ]
        : parameters?.shape === "polygon"
          ? [
              new THREE.Vector3(selected.width / 2, 0, -selected.height / 2),
              new THREE.Vector3(0, selected.depth / 2, selected.height / 2),
              new THREE.Vector3(selected.width / 2, 0, 0),
            ]
        : parameters?.shape === "text"
          ? [
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, selected.depth / 2 + 3, -selected.height / 2),
              new THREE.Vector3(selected.width / 2, selected.depth / 2, 0),
            ]
        : [
            new THREE.Vector3(0, -selected.depth / 2, -selected.height / 2),
            new THREE.Vector3(-selected.width / 2, 0, -selected.height / 2),
            new THREE.Vector3(selected.width / 2, selected.depth / 2, 0),
          ];
      const values = [
        dimensionValue("x"),
        dimensionValue("y"),
        dimensionValue("z"),
      ];
      const axes: ViewportDimensionAxis[] = ["x", "y", "z"];
      const names = locale === "es"
        ? parameters?.shape === "cone"
          ? ["Radio inferior", "Radio superior", "Alto"]
          : parameters?.shape === "tube"
            ? ["Radio", "Espesor", "Alto"]
            : parameters?.shape === "gear"
              ? ["Radio exterior", "", "Alto"]
              : parameters?.shape === "polygon"
                ? ["Radio", "Lados", "Alto"]
                : parameters?.shape === "torus"
                  ? ["Radio", "Largo", "Espesor"]
                  : parameters?.shape === "text"
                    ? ["", "Tamaño", "Alto"]
                    : [parameters?.shape === "box" || parameters?.shape === "roundedBox" || parameters?.shape === "pyramid" || parameters?.shape === "wedge" || parameters?.shape === "roof" || parameters?.shape === "roundRoof" ? "Ancho" : "Radio", "Largo", "Alto"]
        : parameters?.shape === "cone"
          ? ["Bottom radius", "Top radius", "Height"]
          : parameters?.shape === "tube"
            ? ["Radius", "Thickness", "Height"]
            : parameters?.shape === "gear"
              ? ["Outer radius", "", "Height"]
              : parameters?.shape === "polygon"
                ? ["Radius", "Sides", "Height"]
                : parameters?.shape === "torus"
                  ? ["Radius", "Length", "Thickness"]
                  : parameters?.shape === "text"
                    ? ["", "Size", "Height"]
                    : [parameters?.shape === "box" || parameters?.shape === "roundedBox" || parameters?.shape === "pyramid" || parameters?.shape === "wedge" || parameters?.shape === "roof" || parameters?.shape === "roundRoof" ? "Width" : "Radius", "Depth", "Height"];
      const lengthUnit = displayUnitLabel(displayUnit);
      const units = parameters?.shape === "polygon" ? [lengthUnit, "", lengthUnit] : [lengthUnit, lengthUnit, lengthUnit];
      const offsets = [[0, 18], [-24, 0], [22, 0]];
      if (parameters?.shape === "text") {
        // push the `size` label a bit outward so it doesn't overlap the yellow circle
        offsets[1] = [-40, 0];
      }
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
        if (document.activeElement !== label) {
          const text = `${names[index]} ${units[index] ? formatDisplayLength(values[index], displayUnit) : formatViewportDimension(values[index])} ${units[index]}`;
          label.value = text;
          label.style.width = `${Math.max(76, Math.min(172, text.length * 7.2 + 18))}px`;
        }
      });
    };
    let cameraWasBelowGround: boolean | null = null;
    const updateGroundOpacity = () => {
      const belowGround = camera.position.y < 0;
      if (!groundOpacityDirtyRef.current && belowGround === cameraWasBelowGround) return;
      cameraWasBelowGround = belowGround;
      groundOpacityDirtyRef.current = false;
      workplaneRef.current?.traverse((child) => {
        if (!child.userData.globalWorkplaneElement || !("material" in child)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!(material instanceof THREE.Material)) continue;
          const baseOpacity = Number(material.userData.baseOpacity ?? material.opacity);
          material.userData.baseOpacity = baseOpacity;
          material.transparent = true;
          material.opacity = belowGround ? baseOpacity * 0.2 : baseOpacity;
        }
      });
    };
    const requestRender = () => {
      if (!disposed && frame === 0) frame = requestAnimationFrame(render);
    };
    const yellowWorldPosition = new THREE.Vector3();
    const yellowParentScale = new THREE.Vector3();
    const updateYellowManipulatorScreenSizes = () => {
      const updateRoot = (root: THREE.Object3D | null) => root?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const baseRadius = Number(child.userData.yellowManipulatorBaseRadius);
        const diameterPixels = Number(child.userData.yellowManipulatorDiameterPixels);
        if (!(baseRadius > 0) || !(diameterPixels > 0)) return;
        const worldPosition = child.getWorldPosition(yellowWorldPosition);
        const worldDiameter = camera instanceof THREE.OrthographicCamera
          ? orthographicTouchTargetWorldSize(camera.top - camera.bottom, camera.zoom, renderer.domElement.clientHeight, diameterPixels)
          : perspectiveTouchTargetWorldSize(camera.position.distanceTo(worldPosition), camera.fov, renderer.domElement.clientHeight, diameterPixels);
        const parentScale = child.parent?.getWorldScale(yellowParentScale) ?? yellowParentScale.set(1, 1, 1);
        const worldRadiusScale = worldDiameter / (baseRadius * 2);
        child.scale.set(
          worldRadiusScale / Math.max(0.0001, Math.abs(parentScale.x)),
          worldRadiusScale / Math.max(0.0001, Math.abs(parentScale.y)),
          worldRadiusScale / Math.max(0.0001, Math.abs(parentScale.z)),
        );
      });
      updateRoot(selectionVisualRootRef.current);
      updateRoot(faceExtrudeHandleRef.current);
      updateRoot(edgeTreatmentHandleRef.current);
      updateRoot(revolveHandleRef.current);
      updateRoot(distanceHandleRef.current);
    };
    const originWorldPosition = new THREE.Vector3();
    const render = (now: number) => {
      processPendingHover();
      frame = 0;
      if (previousRenderedAt !== null) {
        const elapsed = now - previousRenderedAt;
        if (elapsed > 0 && elapsed <= 150) {
          sampledRenderTime += elapsed;
          sampledRenderFrames += 1;
          if (sampledRenderTime >= 500) {
            performanceStats.fps = sampledRenderFrames * 1000 / sampledRenderTime;
            performanceStats.frameMs = sampledRenderTime / sampledRenderFrames;
            sampledRenderTime = 0;
            sampledRenderFrames = 0;
          }
        } else {
          sampledRenderTime = 0;
          sampledRenderFrames = 0;
        }
      }
      previousRenderedAt = now;
      const controlsChanged = controls.update();
      // Keep a generous range on every frame. This is especially important
      // when returning from the sketch editor, where the 3D viewport is
      // recreated while retaining the previous camera position.
      updateCameraClipping();
      const nextPixelRatio = resolution.recordFrame(now);
      if (nextPixelRatio !== null) renderer.setPixelRatio(nextPixelRatio);
      for (const marker of originLayer.children) {
        const worldPosition = marker.getWorldPosition(originWorldPosition);
        const size = camera instanceof THREE.OrthographicCamera
          ? orthographicTouchTargetWorldSize(camera.top - camera.bottom, camera.zoom, renderer.domElement.clientHeight, 102)
          : perspectiveTouchTargetWorldSize(camera.position.distanceTo(worldPosition), camera.fov, renderer.domElement.clientHeight, 102);
        marker.scale.setScalar(Math.max(0.35, size));
      }
      updateYellowManipulatorScreenSizes();
      updateGroundOpacity();
      if (alignmentButtonsRef.current) {
        const reference = alignmentReferenceRef.current;
        const target = alignmentRef.current.targets.find(item => reference && item.id === reference.id && item.kind === reference.kind);
        positionAlignmentButtons(alignmentButtonsRef.current, target, modelGroup, camera, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
      }
      renderer.render(scene, camera);
      if (thumbnailRequestedRef.current && thumbnailCallbackRef.current) {
        thumbnailRequestedRef.current = false;
        const captureOptions = manualThumbnailRequestRef.current ? thumbnailRequestOptionsRef.current : undefined;
        manualThumbnailRequestRef.current = false;
        // Project cards represent the model itself, rather than the currently
        // selected editing state. Hide every interactive overlay for the
        // capture only, then immediately restore the live viewport.
        const thumbnailOverlayCandidates: Array<THREE.Object3D | null> = [
          projectRenameButtonRef.current,
          alignmentOverlayRef.current,
          originLayerRef.current,
          selectionRootRef.current,
          faceExtrudeHandleRef.current,
          edgeTreatmentHandleRef.current,
          operationContextRef.current,
          workplaneSelectionPlanesRef.current,
          topologyFaceLayerRef.current,
          faceHighlightRef.current,
          edgeHighlightRef.current,
        ];
        const thumbnailOverlays = captureOptions?.includeOverlays ? [] : thumbnailOverlayCandidates.filter((item): item is THREE.Object3D => item !== null);
        const overlayVisibility = thumbnailOverlays.map((item) => item.visible);
        thumbnailOverlays.forEach((item) => { item.visible = false; });
        renderer.render(scene, camera);
        const source = renderer.domElement;
        const width = captureOptions?.width ? Math.max(1, Math.round(captureOptions.width)) : Math.min(1200, Math.max(1, source.width));
        const height = captureOptions?.height ? Math.max(1, Math.round(captureOptions.height)) : Math.max(1, Math.round(width * source.height / Math.max(1, source.width)));
        const thumbnail = document.createElement("canvas");
        thumbnail.width = width;
        thumbnail.height = height;
        const context = thumbnail.getContext("2d");
        if (context) {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
        }
        if (context && captureOptions?.height) {
          const sourceAspect = source.width / Math.max(1, source.height);
          const targetAspect = width / height;
          const sourceWidth = sourceAspect > targetAspect ? source.height * targetAspect : source.width;
          const sourceHeight = sourceAspect > targetAspect ? source.height : source.width / targetAspect;
          context.drawImage(source, (source.width - sourceWidth) / 2, (source.height - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
        } else context?.drawImage(source, 0, 0, width, height);
        thumbnailOverlays.forEach((item, index) => { item.visible = overlayVisibility[index]; });
        renderer.render(scene, camera);
        thumbnailCallbackRef.current(thumbnail.toDataURL("image/jpeg", captureOptions?.quality ?? 0.9));
      }
      performanceStats.drawCalls = renderer.info.render.calls;
      performanceStats.triangles = renderer.info.render.triangles;
      updateDimensionLabels();
      if (controlsChanged) requestRender();
    };
    const onControlsChange = () => {
      orientationRef.current?.({ azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() });
      requestRender();
    };
    const onControlsStart = () => {
      if (cameraTransitionRef.current === null) return;
      cancelAnimationFrame(cameraTransitionRef.current);
      cameraTransitionRef.current = null;
    };
    controls.addEventListener("change", onControlsChange);
    controls.addEventListener("start", onControlsStart);
    invalidateRef.current = requestRender;

    scene.add(new THREE.HemisphereLight("#ffffff", "#d6edf5", 2.1));
    const key = new THREE.DirectionalLight("#ffffff", 3.1);
    key.position.set(70, 130, 75);
    key.castShadow = true;
    key.shadow.mapSize.set(renderProfile.shadowMapSize, renderProfile.shadowMapSize);
    key.shadow.camera.left = -120;
    key.shadow.camera.right = 120;
    key.shadow.camera.top = 120;
    key.shadow.camera.bottom = -120;
    key.shadow.bias = -0.00008;
    key.shadow.normalBias = 0.045;
    key.shadow.radius = renderQuality === "normal" ? 2 : 1;
    scene.add(key);
    const fill = new THREE.DirectionalLight("#c8f4ff", 1.2);
    fill.position.set(-95, 45, -60);
    scene.add(fill);

    const workplaneGroup = new THREE.Group();
    scene.add(workplaneGroup);

    const modelGroup = new THREE.Group();
    modelGroup.rotation.x = -Math.PI / 2;
    scene.add(modelGroup);
    const workplaneSelectionPlanes = new THREE.Group();
    workplaneSelectionPlanes.name = "Temporary standard workplanes";
    modelGroup.add(workplaneSelectionPlanes);
    workplaneSelectionPlanesRef.current = workplaneSelectionPlanes;
    const sketchLayer = new THREE.Group();
    sketchLayer.name = "2D sketches";
    modelGroup.add(sketchLayer);
    sketchLayerRef.current = sketchLayer;
    const originLayer = new THREE.Group();
    originLayer.name = "Object origins";
    modelGroup.add(originLayer);
    const faceHighlight = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: "#ffe47a", transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    faceHighlight.visible = false;
    faceHighlight.renderOrder = 25;
    modelGroup.add(faceHighlight);
    faceHighlightRef.current = faceHighlight;
    const edgeHighlightMaterial = new LineMaterial({ color: "#ffe47a", linewidth: 2, transparent: true, opacity: 0.95, depthTest: false });
    edgeHighlightMaterial.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
    const edgeHighlight = new LineSegments2(new LineSegmentsGeometry(), edgeHighlightMaterial);
    edgeHighlight.visible = false;
    edgeHighlight.renderOrder = 27;
    modelGroup.add(edgeHighlight);
    edgeHighlightRef.current = edgeHighlight;
    const topologyFaceLayer = new THREE.Group();
    topologyFaceLayer.name = "Selected faces";
    modelGroup.add(topologyFaceLayer);
    topologyFaceLayerRef.current = topologyFaceLayer;
    const faceExtrudeHandleLayer = new THREE.Group();
    faceExtrudeHandleLayer.name = "Extrusion length";
    modelGroup.add(faceExtrudeHandleLayer);
    faceExtrudeHandleRef.current = faceExtrudeHandleLayer;
    const edgeTreatmentHandleLayer = new THREE.Group();
    edgeTreatmentHandleLayer.name = "Fillet or chamfer radius";
    modelGroup.add(edgeTreatmentHandleLayer);
    edgeTreatmentHandleRef.current = edgeTreatmentHandleLayer;
    const revolveHandleLayer = new THREE.Group();
    revolveHandleLayer.name = "Revolution angle";
    modelGroup.add(revolveHandleLayer);
    revolveHandleRef.current = revolveHandleLayer;
    const distanceHandleLayer = new THREE.Group();
    distanceHandleLayer.name = "Distance parameter";
    modelGroup.add(distanceHandleLayer);
    distanceHandleRef.current = distanceHandleLayer;

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    let interaction: "parameter" | "origin" | "axisMove" | "snapMove" | "axisRotate" | "faceExtrude" | "edgeTreatmentRadius" | "revolveAngle" | "distanceParameter" | null = null;
    let faceExtrudeAxis: THREE.Vector3 | null = null;
    let faceExtrudeOriginWorld: THREE.Vector3 | null = null;
    let faceExtrudeStartDistance = 0;
    let faceExtrudeStartOperation: "add" | "cut" = "add";
    let pendingFaceExtrudeDistance: number | null = null;
    let pendingFaceExtrudeOperation: "add" | "cut" | null = null;
    let pendingEdgeTreatmentRadius: number | null = null;
    let edgeTreatmentPointerOffset = 0;
    let edgeTreatmentOriginWorld: THREE.Vector3 | null = null;
    let edgeTreatmentAxisWorld: THREE.Vector3 | null = null;
    let revolveOriginWorld: THREE.Vector3 | null = null;
    let revolveAxisWorld: THREE.Vector3 | null = null;
    let revolveReferenceWorld: THREE.Vector3 | null = null;
    let revolveStartAngle = 0;
    let revolvePointerAngle = 0;
    let revolveAccumulatedAngle = 0;
    let pendingRevolveAngle: number | null = null;
    let revolveGuide: THREE.Group | null = null;
    let revolveGuideHighlight: LineSegments2 | null = null;
    let revolveGuideScale = 1;
    let distanceOriginWorld: THREE.Vector3 | null = null;
    let distanceDirectionWorld: THREE.Vector3 | null = null;
    let distancePointerOffset = 0;
    let pendingDistanceParameter: number | null = null;
    let pendingShapeParameter: { parameter: ShapeParameter; value: number } | null = null;
    let shapeParameterStartValue = 0;
    let shapeParameterWorldScale = 1;
    let signedHeightBaseCoordinate = 0;
    let shapeParameterDragAxis: "x" | "y" | "z" = "x";
    let shapeParameterDragSign: 1 | -1 = 1;
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
    let rotationDragMarker: THREE.Object3D | null = null;
    let rotationStartQuaternion: THREE.Quaternion | null = null;
    let rotationPlaneAxis: THREE.Vector3 | null = null;
    let rotationStartVector: THREE.Vector3 | null = null;
    let rotationGuideReferenceVector: THREE.Vector3 | null = null;
    let rotationCenterWorld: THREE.Vector3 | null = null;
    let rotationGuide: THREE.Group | null = null;
    let rotationGuideHighlight: LineSegments2 | null = null;
    let rotationGuideScale = 1;
    let rotationPreview: THREE.Group | null = null;
    let pendingRotation: { targetId: string; targetKind: "object" | "feature"; localAxis: "x" | "y" | "z"; axis: { x: number; y: number; z: number }; deltaDegrees: number } | null = null;
    let sketchPreviewRoot: THREE.Object3D | null = null;
    let sketchPreviewStartWorldPosition: THREE.Vector3 | null = null;
    let sketchPreviewStartWorldQuaternion: THREE.Quaternion | null = null;
    let pickCandidate: { pointerId: number; pointerType: string; x: number; y: number; dragIntent: ViewportPointerDragIntent } | null = null;
    const updateMoveDimension = (start: THREE.Vector3, end: THREE.Vector3, value: number) => {
      const project = (point: THREE.Vector3) => {
        const projected = point.clone().project(camera);
        return { x: (projected.x + 1) * renderer.domElement.clientWidth / 2, y: (1 - projected.y) * renderer.domElement.clientHeight / 2 };
      };
      const first = project(start);
      const second = project(end);
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.5 || Math.abs(value) < 1e-9) { setMoveDimension(null); return; }
      const offset = 28;
      const normalX = -dy / length;
      const normalY = dx / length;
      const startX = first.x + normalX * offset;
      const startY = first.y + normalY * offset;
      const endX = second.x + normalX * offset;
      const endY = second.y + normalY * offset;
      setMoveDimension({
        originX: first.x, originY: first.y, currentX: second.x, currentY: second.y,
        startX, startY, endX, endY,
        labelX: (startX + endX) / 2 + normalX * 13,
        labelY: (startY + endY) / 2 + normalY * 13,
        value: `${formatDisplayLength(value, displayUnit)} ${displayUnitLabel(displayUnit)}`,
      });
    };
    const disposeTemporaryLineGroup = (group: THREE.Group | null) => {
      if (!group) return;
      group.parent?.remove(group);
      group.traverse((child) => {
        if (!(child instanceof LineSegments2 || child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
    };
    const rotationGuideAt = (center: THREE.Vector3, axis: THREE.Vector3, reference: THREE.Vector3, markerScale: number) => {
      const group = new THREE.Group();
      group.position.copy(center);
      const radial = reference.clone().normalize();
      const tangent = axis.clone().cross(radial).normalize();
      const pointAt = (degrees: number, radius: number) => radial.clone().multiplyScalar(Math.cos(THREE.MathUtils.degToRad(degrees)) * radius).addScaledVector(tangent, Math.sin(THREE.MathUtils.degToRad(degrees)) * radius);
      const ringRadius = markerScale * 0.576;
      const maximumRadius = ringRadius * 2;
      const circleRadius = maximumRadius + markerScale * 0.03;
      const backgroundRadius = circleRadius + markerScale * 0.12;
      const background = new THREE.Mesh(
        new THREE.CircleGeometry(backgroundRadius, 96),
        new THREE.MeshBasicMaterial({ color: "#43b9e8", side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.3 }),
      );
      background.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
      background.renderOrder = 39;
      group.add(background);
      const circlePositions: number[] = [];
      for (let index = 0; index < 144; index += 1) {
        const first = pointAt(index * 2.5, circleRadius);
        const second = pointAt((index + 1) * 2.5, circleRadius);
        circlePositions.push(first.x, first.y, first.z, second.x, second.y, second.z);
      }
      const tickPositions: number[] = [];
      for (let degrees = 0; degrees < 360; degrees += 5) {
        const length = markerScale * (degrees % 10 === 0 ? 0.192 : 0.08);
        const first = pointAt(degrees, circleRadius);
        const second = pointAt(degrees, circleRadius + length);
        tickPositions.push(first.x, first.y, first.z, second.x, second.y, second.z);
      }
      for (let degrees = 0; degrees < 360; degrees += 45) {
        const first = pointAt(degrees, circleRadius * 0.25);
        const second = pointAt(degrees, circleRadius * 0.75);
        tickPositions.push(first.x, first.y, first.z, second.x, second.y, second.z);
      }
      const addLines = (positions: number[], linewidth: number, renderOrder: number) => {
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({ color: "#174f78", linewidth, depthTest: false, depthWrite: false, transparent: true, opacity: 0.96 });
        material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
        const lines = new LineSegments2(geometry, material);
        lines.renderOrder = renderOrder;
        group.add(lines);
      };
      addLines(circlePositions, 1, 40);
      addLines(tickPositions, 3, 41);
      const highlightGeometry = new LineSegmentsGeometry();
      highlightGeometry.setPositions([0, 0, 0, 0, 0, 0]);
      const highlightMaterial = new LineMaterial({ color: "#f0b83f", linewidth: 3, depthTest: false, depthWrite: false, transparent: true, opacity: 1 });
      highlightMaterial.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
      const highlight = new LineSegments2(highlightGeometry, highlightMaterial);
      highlight.renderOrder = 42;
      highlight.visible = false;
      group.add(highlight);
      scene.add(group);
      return { group, highlight };
    };
    const rotationWireframePreviewAt = (targetId: string, targetKind: "object" | "feature", center: THREE.Vector3) => {
      const inverseCenter = center.clone().negate();
      const positions: number[] = [];
      if (targetKind === "feature") {
        const visualRoot = selectionVisualRootRef.current;
        visualRoot?.updateWorldMatrix(true, true);
        visualRoot?.traverse((child) => {
          if (!(child instanceof LineSegments2) || !child.userData.operationPreviewWireframe) return;
          const starts = child.geometry.getAttribute("instanceStart");
          const ends = child.geometry.getAttribute("instanceEnd");
          if (!starts || !ends) return;
          for (let index = 0; index < Math.min(starts.count, ends.count); index += 1) {
            const start = new THREE.Vector3(starts.getX(index), starts.getY(index), starts.getZ(index)).applyMatrix4(child.matrixWorld).add(inverseCenter);
            const end = new THREE.Vector3(ends.getX(index), ends.getY(index), ends.getZ(index)).applyMatrix4(child.matrixWorld).add(inverseCenter);
            positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
          }
        });
      } else {
        const cached = objectRenderCacheRef.current.get(targetId);
        const attribute = cached?.edges.geometry.getAttribute("position");
        if (attribute) for (let index = 0; index < attribute.count; index += 1) {
          const point = new THREE.Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index)).applyMatrix4(modelGroup.matrixWorld).add(inverseCenter);
          positions.push(point.x, point.y, point.z);
        }
      }
      if (positions.length === 0) return null;
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({ color: 0x263746, linewidth: 2, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 });
      material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
      const lines = new LineSegments2(geometry, material);
      lines.renderOrder = 39;
      const group = new THREE.Group();
      group.position.copy(center);
      group.add(lines);
      scene.add(group);
      return group;
    };
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
        if (!(body instanceof THREE.Mesh) || typeof body.userData.objectId !== "string" || body.userData.editorPickable === false) continue;
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
      const bodyHit = raycaster.intersectObjects(bodies, false)[0] ?? null;
      if (bodyHit || !workplaneFaceSelectionRef.current) return bodyHit;
      const standardPlanes = workplaneSelectionPlanesRef.current?.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData.standardWorkplane) ?? [];
      return raycaster.intersectObjects(standardPlanes, false)[0] ?? null;
    };
    const edgeAtPointer = () => {
      const edges = modelGroup.children.filter((child): child is THREE.LineSegments => child instanceof THREE.LineSegments && typeof child.userData.objectId === "string" && child.userData.finalReferenceWireframe);
      const threshold = camera instanceof THREE.OrthographicCamera ? Math.max(0.4, (camera.top - camera.bottom) / camera.zoom / Math.max(1, renderer.domElement.clientHeight) * 7) : 0.8;
      raycaster.params.Line = { threshold };
      const hit = raycaster.intersectObjects(edges, false)[0] ?? null;
      if (!hit) return null;
      const surface = faceAtPointer();
      return surface && hit.distance > surface.distance + threshold * 1.5 ? null : hit;
    };
    const relativeObjectTransform = (object: THREE.Object3D) => new THREE.Matrix4().copy(modelGroup.matrixWorld).invert().multiply(object.matrixWorld);
    const applyRelativeTransform = (target: THREE.Object3D, object: THREE.Object3D) => {
      relativeObjectTransform(object).decompose(target.position, target.quaternion, target.scale);
    };
    const updateWorkplaneFaceHighlight = () => {
      const hit = faceAtPointer();
      faceHighlight.geometry.dispose();
      const selectedFace = hit?.face && typeof hit.faceIndex === "number"
        ? coplanarFaceGeometry((hit.object as THREE.Mesh).geometry, hit.faceIndex)
        : { geometry: new THREE.BufferGeometry(), region: null };
      faceHighlight.geometry = selectedFace.geometry;
      faceHighlight.visible = Boolean(hit?.face && selectedFace.region);
      edgeHighlight.visible = false;
      if (hit && selectedFace.region) applyRelativeTransform(faceHighlight, hit.object);
      renderer.domElement.style.cursor = hit && selectedFace.region ? "crosshair" : "not-allowed";
      requestRender();
      return hit && selectedFace.region ? { hit, region: selectedFace.region } : null;
    };
    const updateTopologyEdgeHighlight = () => {
      const hit = edgeAtPointer();
      edgeHighlight.geometry.dispose();
      const groups = hit?.object instanceof THREE.LineSegments ? hit.object.geometry.userData.edgeGroups as ViewportEdgeGroup[] | undefined : undefined;
      const positions = hit?.object instanceof THREE.LineSegments ? hit.object.geometry.getAttribute("position") : null;
      const region = hit && positions && groups?.length && typeof hit.index === "number" ? exactEdgeRegion(positions.array, hit.index, groups) : null;
      const geometry = new LineSegmentsGeometry();
      if (region) geometry.setPositions(region.positions);
      edgeHighlight.geometry = geometry;
      edgeHighlight.visible = Boolean(hit && region);
      if (hit && region) faceHighlight.visible = false;
      if (hit && region) applyRelativeTransform(edgeHighlight, hit.object);
      renderer.domElement.style.cursor = hit && region ? "crosshair" : "not-allowed";
      requestRender();
      return hit && region ? { hit, region } : null;
    };
    const disposeTopologyHighlight = (object: THREE.Object3D) => {
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof LineSegments2)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
    };
    const clearTopologyFaceHighlights = () => {
      for (const child of [...topologyFaceLayer.children]) {
        topologyFaceLayer.remove(child);
        disposeTopologyHighlight(child);
      }
    };
    const topologyFaceKey = (objectId: string, region: NonNullable<ReturnType<typeof coplanarFaceRegion>> | NonNullable<ReturnType<typeof exactFaceRegion>>) => {
      if ("faceId" in region) return `${objectId}:face:${region.faceId}:origin:${region.origin}`;
      const values = [region.normal.x, region.normal.y, region.normal.z, region.centroid.x, region.centroid.y, region.centroid.z, region.area];
      return `${objectId}:planar:${values.map((value) => Math.round(value * 1000)).join(":")}`;
    };
    const toggleTopologyFace = (hit: THREE.Intersection<THREE.Object3D>, region: NonNullable<ReturnType<typeof coplanarFaceRegion>> | NonNullable<ReturnType<typeof exactFaceRegion>>, additive: boolean) => {
      const objectId = typeof hit.object.userData.objectId === "string" ? hit.object.userData.objectId : null;
      if (!objectId) return;
      const key = topologyFaceKey(objectId, region);
      const existing = topologyFaceLayer.children.find((child) => child.userData.topologyFaceKey === key);
      if (!additive) clearTopologyFaceHighlights();
      let selected = true;
      if (existing && additive) {
        topologyFaceLayer.remove(existing);
        disposeTopologyHighlight(existing);
        selected = false;
      } else {
        const highlight = new THREE.Group();
        const fill = new THREE.Mesh(
          faceHighlight.geometry.clone(),
          new THREE.MeshBasicMaterial({ color: "#43b9e8", transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
        );
        fill.renderOrder = 26;
        highlight.add(fill);
        highlight.userData.topologyFaceKey = key;
        applyRelativeTransform(highlight, hit.object);
        topologyFaceLayer.add(highlight);
      }
      const relativeMatrix = relativeObjectTransform(hit.object);
      const centroid = new THREE.Vector3(region.centroid.x, region.centroid.y, region.centroid.z).applyMatrix4(relativeMatrix);
      const pickedNormal = hit.face?.normal ?? region.normal;
      const normal = new THREE.Vector3(pickedNormal.x, pickedNormal.y, pickedNormal.z).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(relativeMatrix)).normalize();
      const exactIdentity = "faceId" in region && typeof region.faceId === "number" && "origin" in region && typeof region.origin === "number"
        ? { faceId: region.faceId, origin: region.origin }
        : {};
      topologyFaceSelectRef.current?.({
        key,
        objectId,
        selected,
        additive,
        centroid: { x: centroid.x, y: centroid.y, z: centroid.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        area: region.area,
        planar: "planar" in region ? region.planar : true,
        ...exactIdentity,
      });
      requestRender();
    };
    const toggleTopologyEdge = (hit: THREE.Intersection<THREE.Object3D>, region: NonNullable<ReturnType<typeof exactEdgeRegion>>, additive: boolean) => {
      const objectId = typeof hit.object.userData.objectId === "string" ? hit.object.userData.objectId : null;
      if (!objectId) return;
      const key = `${objectId}:edge:${region.edgeId}`;
      const existing = topologyFaceLayer.children.find((child) => child.userData.topologyEdgeKey === key);
      if (!additive) clearTopologyFaceHighlights();
      let selected = true;
      if (existing && additive) {
        topologyFaceLayer.remove(existing);
        disposeTopologyHighlight(existing);
        selected = false;
      } else {
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(region.positions);
        const material = new LineMaterial({ color: "#43b9e8", linewidth: 2, depthTest: false, transparent: true, opacity: 1 });
        material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
        const highlight = new LineSegments2(geometry, material);
        highlight.userData.topologyEdgeKey = key;
        highlight.renderOrder = 28;
        applyRelativeTransform(highlight, hit.object);
        topologyFaceLayer.add(highlight);
      }
      const relativeMatrix = relativeObjectTransform(hit.object);
      const midpoint = new THREE.Vector3(region.midpoint.x, region.midpoint.y, region.midpoint.z).applyMatrix4(relativeMatrix);
      const points = Array.from(region.positions);
      const localStart = new THREE.Vector3(points[0] ?? 0, points[1] ?? 0, points[2] ?? 0);
      const localEnd = new THREE.Vector3(points.at(-3) ?? 0, points.at(-2) ?? 0, points.at(-1) ?? 0);
      const localDirection = localEnd.clone().sub(localStart);
      const chordLength = localDirection.length();
      const straight = chordLength > 1e-6 && Math.abs(chordLength - region.length) <= Math.max(0.01, region.length * 0.002);
      const direction = localDirection.normalize().transformDirection(relativeMatrix);
      topologyEdgeSelectRef.current?.({ key, objectId, selected, additive, midpoint: { x: midpoint.x, y: midpoint.y, z: midpoint.z }, direction: { x: direction.x, y: direction.y, z: direction.z }, straight, length: region.length, edgeId: region.edgeId });
      requestRender();
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
      const snapHit = !editableId ? hits.find((candidate) => candidate.object.userData.snapDragHandle) : null;
      const translationHit = hits.find((candidate) => candidate.object.userData.originDragHandle);
      const rotationHit = !editableId && !snapHit && !translationHit ? hits.find((candidate) => candidate.object.userData.rotationAxis) : null;
      const hit = editableId ? hits[0] : snapHit ?? translationHit ?? rotationHit;
      return hit ? { editable: Boolean(editableId), snap: Boolean(snapHit), hit, marker, targetId: targetId!, targetKind, rotationAxis: rotationHit?.object.userData.rotationAxis as "x" | "y" | "z" | undefined, handleGroup: hit.object.userData.handleGroup as string | undefined } : null;
    };
    annotationPositionHandleRef.current = (event) => {
      setPointer(event);
      const handle = originHandleAtPointer();
      return Boolean(handle && handle.targetId === annotationStateRef.current.selectedAnnotationId);
    };
    const setOriginHandleHover = (handle: ReturnType<typeof originHandleAtPointer>) => {
      let changed = false;
      for (const marker of originLayer.children) {
        const nextGroup = marker === handle?.marker ? handle.handleGroup ?? null : null;
        if ((marker.userData.hoverHandleGroup ?? null) === nextGroup) continue;
        marker.userData.hoverHandleGroup = nextGroup;
        marker.traverse((child) => {
          const baseColor = child.userData.handleColor as number | undefined;
          const hoverColor = child.userData.handleHoverColor as number | undefined;
          if (baseColor === undefined || !(child instanceof THREE.Mesh)) return;
          if (child.userData.snapDragHandle) child.scale.setScalar(child.userData.handleGroup === nextGroup ? 2 : 1);
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (material instanceof THREE.MeshBasicMaterial) material.color.set(child.userData.handleGroup === nextGroup ? hoverColor ?? baseColor : baseColor);
          });
        });
        changed = true;
      }
      if (changed) requestRender();
    };
    let hoveredShapeParameter: ShapeParameter | null = null;
    const setShapeParameterHandleHover = (parameter: ShapeParameter | null) => {
      if (hoveredShapeParameter === parameter) return;
      hoveredShapeParameter = parameter;
      selectionVisualRootRef.current?.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || child.userData.shapeParameterVisualRole !== "handle") return;
        const material = child.material;
        if (!(material instanceof THREE.MeshBasicMaterial)) return;
        material.color.set(child.userData.shapeParameterVisual === parameter ? 0xffe000 : 0xf2c94c);
      });
      requestRender();
    };
    let faceExtrudeHandleHovered = false;
    const setFaceExtrudeHandleHover = (hovered: boolean) => {
      if (faceExtrudeHandleHovered === hovered) return;
      faceExtrudeHandleHovered = hovered;
      faceExtrudeHandleRef.current?.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.userData.faceExtrudeHandle) return;
        const material = child.material;
        if (material instanceof THREE.MeshBasicMaterial) material.color.set(hovered ? 0xffe000 : 0xf0b83f);
      });
      requestRender();
    };
    let edgeTreatmentHandleHovered = false;
    const setEdgeTreatmentHandleHover = (hovered: boolean) => {
      if (edgeTreatmentHandleHovered === hovered) return;
      edgeTreatmentHandleHovered = hovered;
      edgeTreatmentHandleRef.current?.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.userData.edgeTreatmentRadiusHandle) return;
        const material = child.material;
        if (material instanceof THREE.MeshBasicMaterial) material.color.set(hovered ? 0xffe000 : 0xf0b83f);
      });
      requestRender();
    };
    let revolveHandleHovered = false;
    const setRevolveHandleHover = (hovered: boolean) => {
      if (revolveHandleHovered === hovered) return;
      revolveHandleHovered = hovered;
      revolveHandleRef.current?.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.userData.revolveAngleHandle) return;
        const material = child.material;
        if (material instanceof THREE.MeshBasicMaterial) material.color.set(hovered ? 0xffe000 : 0xf0b83f);
      });
      requestRender();
    };
    let distanceHandleHovered = false;
    const setShellHandleHover = (hovered: boolean) => {
      if (distanceHandleHovered === hovered) return;
      distanceHandleHovered = hovered;
      distanceHandleRef.current?.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.userData.distanceParameterHandle) return;
        const material = child.material;
        if (material instanceof THREE.MeshBasicMaterial) material.color.set(hovered ? 0xffe000 : 0xf0b83f);
      });
      requestRender();
    };
    const sketchTransformRootForFeature = (featureId: string): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      sketchLayer.traverse((child) => {
        if (!found && child.userData.sketchFeatureId === featureId && child.userData.sketchTransformRoot) found = child;
      });
      return found;
    };
    const hoveredManipulatorDimensions = (event: PointerEvent): ViewportDimensionAxis[] => {
      if (event.pointerType === "touch") return [];
      setPointer(event);
      const originHandle = originHandleAtPointer();
      setOriginHandleHover(originHandle);
      if (originHandle) {
        setShapeParameterHandleHover(null);
        setFaceExtrudeHandleHover(false);
        setEdgeTreatmentHandleHover(false);
        setRevolveHandleHover(false);
        setShellHandleHover(false);
        renderer.domElement.style.cursor = "crosshair";
        return [];
      }
      setOriginHandleHover(null);
      renderer.domElement.style.cursor = "default";
      const shellLayer = distanceHandleRef.current;
      const shellHit = shellLayer
        ? raycaster.intersectObject(shellLayer, true).some((hit) => hit.object.userData.distanceParameterTarget)
        : false;
      setShellHandleHover(shellHit);
      if (shellHit) {
        setShapeParameterHandleHover(null);
        setFaceExtrudeHandleHover(false);
        setEdgeTreatmentHandleHover(false);
        setRevolveHandleHover(false);
        renderer.domElement.style.cursor = "crosshair";
        return [];
      }
      const revolveLayer = revolveHandleRef.current;
      const revolveHit = revolveLayer
        ? raycaster.intersectObject(revolveLayer, true).some((hit) => hit.object.userData.revolveAngleTarget)
        : false;
      setRevolveHandleHover(revolveHit);
      if (revolveHit) {
        setShapeParameterHandleHover(null);
        setFaceExtrudeHandleHover(false);
        setEdgeTreatmentHandleHover(false);
        renderer.domElement.style.cursor = "crosshair";
        return [];
      }
      const edgeTreatmentLayer = edgeTreatmentHandleRef.current;
      const edgeTreatmentHit = edgeTreatmentLayer
        ? raycaster.intersectObject(edgeTreatmentLayer, true).some((hit) => hit.object.userData.edgeTreatmentRadiusTarget)
        : false;
      setEdgeTreatmentHandleHover(edgeTreatmentHit);
      if (edgeTreatmentHit) {
        setRevolveHandleHover(false);
        setShapeParameterHandleHover(null);
        setFaceExtrudeHandleHover(false);
        renderer.domElement.style.cursor = "crosshair";
        return [];
      }
      const faceExtrudeLayer = faceExtrudeHandleRef.current;
      const faceExtrudeHit = faceExtrudeLayer
        ? raycaster.intersectObject(faceExtrudeLayer, true).some((hit) => hit.object.userData.faceExtrudeHandle)
        : false;
      setFaceExtrudeHandleHover(faceExtrudeHit);
      if (faceExtrudeHit) {
        setShapeParameterHandleHover(null);
        renderer.domElement.style.cursor = "crosshair";
        return [];
      }
      if (!selectionRef.current) {
        setShapeParameterHandleHover(null);
        return [];
      }
      updateManipulatorHitTargets(event.pointerType);
      const resizeHit = raycaster.intersectObjects(resizeHitboxesRef.current, false)[0];
      setShapeParameterHandleHover((resizeHit?.object.userData.shapeParameter as ShapeParameter | undefined) ?? null);
      if (resizeHit) {
        const axis = resizeHit.object.userData.dimensionAxis;
        return axis === "x" || axis === "y" || axis === "z" ? [axis] : [];
      }
      return [];
    };
    const annotationAtPointer = () => {
      const layer = annotationLayerRef.current;
      if (!layer?.visible) return null;
      layer.updateWorldMatrix(true, true);
      const labels = layer.children.filter((child) => (child instanceof THREE.Sprite || child.userData.annotationPickable) && child.visible && annotationStateRef.current.annotations?.some((annotation) => annotation.id === child.userData.annotationId && annotation.visible));
      Object.assign(raycaster.params, { Line2: { threshold: 4 } });
      return raycaster.intersectObjects(labels, false)[0]?.object.userData.annotationId as string | undefined;
    };
    processPendingHover = () => {
      const event = pendingHoverEvent;
      pendingHoverEvent = null;
      if (!event || interaction || event.buttons !== 0) return;
      if (workplaneFaceSelectionRef.current || topologyFaceSelectionRef.current || topologyEdgeSelectionRef.current) {
        setPointer(event);
        const edge = topologyEdgeSelectionRef.current ? updateTopologyEdgeHighlight() : null;
        if (!edge && (workplaneFaceSelectionRef.current || topologyFaceSelectionRef.current)) updateWorkplaneFaceHighlight();
        return;
      }
      replaceHoverDimensions(hoveredManipulatorDimensions(event));
      if (!alignmentRef.current.active && annotationAtPointer() && !originHandleAtPointer()) renderer.domElement.style.cursor = "pointer";
    };
    const snapTargetAtPointer = (event: PointerEvent): THREE.Vector3 | null => {
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      let closestPoint: THREE.Vector3 | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      const consider = (point: THREE.Vector3) => {
        const world = modelGroup.localToWorld(point.clone());
        const projected = world.project(camera);
        if (projected.z < -1 || projected.z > 1) return;
        const screenX = (projected.x + 1) * bounds.width / 2;
        const screenY = (1 - projected.y) * bounds.height / 2;
        const distance = Math.hypot(screenX - pointerX, screenY - pointerY);
        if (distance <= 28 && distance < closestDistance) {
          closestPoint = point.clone();
          closestDistance = distance;
        }
      };
      for (const cached of objectRenderCacheRef.current.values()) {
        if (!cached.body.visible && !cached.edges.visible && !cached.wireframeEdges.visible) continue;
        const positions = cached.edges.geometry.getAttribute("position");
        if (!positions) continue;
        const groups = cached.edges.geometry.userData.edgeGroups as ViewportEdgeGroup[] | undefined;
        if (groups?.length) {
          for (const group of groups) {
            const first = group.start;
            const last = group.start + group.count - 1;
            consider(new THREE.Vector3(positions.getX(first), positions.getY(first), positions.getZ(first)));
            consider(new THREE.Vector3(positions.getX(last), positions.getY(last), positions.getZ(last)));
            const region = exactEdgeRegion(positions.array, group.start, groups);
            if (region) consider(new THREE.Vector3(region.midpoint.x, region.midpoint.y, region.midpoint.z));
          }
        } else {
          for (let index = 0; index + 1 < positions.count; index += 2) {
            const start = new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index));
            const end = new THREE.Vector3(positions.getX(index + 1), positions.getY(index + 1), positions.getZ(index + 1));
            consider(start);
            consider(end);
            consider(start.clone().add(end).multiplyScalar(0.5));
          }
        }
      }
      return closestPoint as THREE.Vector3 | null;
    };
    annotationSnapRef.current = snapTargetAtPointer;
    const previewAnnotationPosition = (id: string, position: THREE.Vector3) => {
      const state = annotationStateRef.current;
      const annotation = state.annotations?.find((candidate) => candidate.id === id);
      if (!annotation) return;
      const point = { x: position.x, y: position.y, z: position.z };
      if (annotation.kind === "text") setAnnotationPreview({ ...annotation, position: point, text: state.editingAnnotationId === id ? "" : annotation.text });
      else if (state.selectedAnnotationEndpoint) setAnnotationPreview({ ...annotation, [state.selectedAnnotationEndpoint]: point });
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
        if (role === "guide" && child instanceof LineSegments2) {
          const start = parameter === "height" ? new THREE.Vector3(0, 0, -worldHeight / 2) : new THREE.Vector3(0, 0, end.z);
          updateYellowManipulatorLine(child, start, end);
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
          : parameter === "thickness"
            ? new THREE.Vector3(worldInnerRadius, 0, worldHeight / 2)
            : new THREE.Vector3(0, 0, worldHeight / 2 + 3);
        if (role === "guide" && child instanceof LineSegments2) {
          const start = parameter === "height"
            ? new THREE.Vector3(0, 0, -worldHeight / 2)
            : parameter === "thickness"
              ? new THREE.Vector3(worldOuterRadius, 0, worldHeight / 2)
              : new THREE.Vector3(0, 0, -worldHeight / 2);
          updateYellowManipulatorLine(child, start, end);
        } else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const updateRoundedBoxPreview = (selected: ViewportSelection, width: number, depth: number, height: number, cornerRadius: number) => {
      if (selected.shapeParameters?.shape !== "roundedBox") return;
      const widthScale = selected.width / Math.max(0.01, selected.shapeParameters.width);
      const depthScale = selected.depth / Math.max(0.01, selected.shapeParameters.depth);
      const heightScale = selected.height / Math.max(0.01, selected.shapeParameters.height);
      const worldWidth = width * widthScale;
      const worldDepth = depth * depthScale;
      const worldHeight = height * heightScale;
      const worldRadius = Math.min(worldWidth / 2 - 0.1, worldDepth / 2 - 0.1, cornerRadius * Math.min(widthScale, depthScale));
      const visualRoot = selectionVisualRootRef.current;
      if (!visualRoot) return;
      visualRoot.traverse((child) => {
        if (child.userData.operationPreviewWireframe && child instanceof LineSegments2) child.geometry.setPositions(operationPreviewWireframePositions("roundedBox", worldWidth, worldDepth, worldHeight, worldWidth, 0, 0, 64, worldRadius));
        if (child.userData.roundedBoxPreviewFill && child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.geometry = roundedBoxPreviewGeometry(worldWidth, worldDepth, worldHeight, worldRadius);
        }
        const parameter = child.userData.shapeParameterVisual as ShapeParameter | undefined;
        const role = child.userData.shapeParameterVisualRole as "guide" | "handle" | "target" | undefined;
        if (!parameter || !role) return;
        const baseZ = -worldHeight / 2;
        const radiusHandle = roundedBoxRadiusHandlePoints(worldWidth, worldDepth, worldHeight, worldRadius);
        const end = parameter === "width"
          ? new THREE.Vector3(worldWidth / 2 + 3, 0, baseZ)
          : parameter === "depth"
            ? new THREE.Vector3(0, worldDepth / 2 + 3, baseZ)
            : parameter === "height"
              ? new THREE.Vector3(0, 0, worldHeight / 2 + 3)
              : parameter === "cornerRadius"
                ? radiusHandle.end
                : new THREE.Vector3(worldRadius + 3, 0, worldHeight / 2);
        if (role === "guide" && child instanceof LineSegments2) {
          const start = parameter === "height"
            ? new THREE.Vector3(0, 0, baseZ)
            : parameter === "cornerRadius"
              ? radiusHandle.start
              : new THREE.Vector3(0, 0, baseZ);
          updateYellowManipulatorLine(child, start, end);
        }
        else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const updateTorusPreview = (selected: ViewportSelection, majorRadius: number, tubeRadius: number) => {
      if (selected.shapeParameters?.shape !== "torus") return;
      const originalOuterRadius = selected.shapeParameters.majorRadius + selected.shapeParameters.tubeRadius;
      const radialScale = selected.width / Math.max(0.01, originalOuterRadius * 2);
      const heightScale = selected.height / Math.max(0.01, selected.shapeParameters.tubeRadius * 2);
      const worldMajorRadius = majorRadius * radialScale;
      const worldTubeRadius = tubeRadius * radialScale;
      const worldHalfHeight = tubeRadius * heightScale;
      const worldWidth = (worldMajorRadius + worldTubeRadius) * 2;
      const depthScale = selected.depth / Math.max(0.01, originalOuterRadius * 2);
      const worldDepth = (majorRadius + tubeRadius) * depthScale * 2;
      const visualRoot = selectionVisualRootRef.current;
      if (!visualRoot) return;
      visualRoot.traverse((child) => {
        if (child.userData.operationPreviewWireframe && child instanceof LineSegments2) {
          child.geometry.setPositions(operationPreviewWireframePositions("torus", worldWidth, worldDepth, worldHalfHeight * 2));
        }
        const parameter = child.userData.shapeParameterVisual as ShapeParameter | undefined;
        const role = child.userData.shapeParameterVisualRole as "guide" | "handle" | "target" | undefined;
        if (!parameter || !role) return;
        const end = parameter === "majorRadius"
          ? new THREE.Vector3(worldMajorRadius + worldHalfHeight + 3, 0, 0)
          : new THREE.Vector3(worldMajorRadius, 0, worldHalfHeight + 3);
        if (role === "guide" && child instanceof LineSegments2) {
          const start = parameter === "majorRadius" ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(worldMajorRadius, 0, 0);
          updateYellowManipulatorLine(child, start, end);
        }
        else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const updatePolygonPreview = (selected: ViewportSelection, sides: number) => {
      if (selected.shapeParameters?.shape !== "polygon") return;
      const visualRoot = selectionVisualRootRef.current;
      if (!visualRoot) return;
      const handleOffset = selected.depth / 2 + 3 - selected.shapeParameters.sides;
      visualRoot.traverse((child) => {
        if (child.userData.operationPreviewWireframe && child instanceof LineSegments2) {
          child.geometry.setPositions(operationPreviewWireframePositions("polygon", selected.width, selected.depth, selected.height, selected.width, 0, 0, sides));
        }
        if (child.userData.shapeParameterVisual !== "sides") return;
        const role = child.userData.shapeParameterVisualRole as "guide" | "handle" | "target" | undefined;
        const end = new THREE.Vector3(0, handleOffset + sides, selected.height / 2);
        if (role === "guide" && child instanceof LineSegments2) updateYellowManipulatorLine(child, new THREE.Vector3(0, 0, selected.height / 2), end);
        else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const updateGearPreview = (selected: ViewportSelection, outerRadius: number, toothDepth: number, boreRadius: number, teeth: number, height: number) => {
      if (selected.shapeParameters?.shape !== "gear") return;
      const radialScale = selected.width / Math.max(0.01, selected.shapeParameters.outerRadius * 2);
      const heightScale = selected.height / Math.max(0.01, selected.shapeParameters.height);
      const worldOuterRadius = outerRadius * radialScale;
      const worldToothDepth = toothDepth * radialScale;
      const worldBoreRadius = boreRadius * radialScale;
      const worldHeight = height * heightScale;
      const visualRoot = selectionVisualRootRef.current;
      if (!visualRoot) return;
      const teethOffset = selected.depth / 2 + 3 - selected.shapeParameters.teeth;
      visualRoot.traverse((child) => {
        if (child.userData.operationPreviewWireframe && child instanceof LineSegments2) {
          child.geometry.setPositions(operationPreviewWireframePositions("gear", worldOuterRadius * 2, worldOuterRadius * 2, worldHeight, worldOuterRadius * 2, worldBoreRadius * 2, worldToothDepth, teeth));
        }
        const parameter = child.userData.shapeParameterVisual as ShapeParameter | undefined;
        const role = child.userData.shapeParameterVisualRole as "guide" | "handle" | "target" | undefined;
        if (!parameter || !role) return;
        const end = parameter === "outerRadius"
          ? new THREE.Vector3(worldOuterRadius + 3, 0, -worldHeight / 2)
          : parameter === "toothDepth"
            ? new THREE.Vector3(worldOuterRadius + 3, 0, worldHeight / 2)
            : parameter === "boreRadius"
              ? new THREE.Vector3(0, worldBoreRadius + 3, worldHeight / 2)
              : parameter === "teeth"
                ? new THREE.Vector3(0, teethOffset + teeth, 0)
                : new THREE.Vector3(0, 0, worldHeight / 2 + 3);
        if (role === "guide" && child instanceof LineSegments2) {
          const start = parameter === "height"
            ? new THREE.Vector3(0, 0, -worldHeight / 2)
            : parameter === "toothDepth"
              ? new THREE.Vector3(worldOuterRadius - worldToothDepth, 0, worldHeight / 2)
              : new THREE.Vector3(0, 0, end.z);
          updateYellowManipulatorLine(child, start, end);
        } else if (role === "handle" || role === "target") child.position.copy(end);
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      setMoveDimension(null);
      setPointer(event);
      if (alignmentRef.current.active) {
        pickCandidate = { pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, dragIntent: "pending" };
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      if (!workplaneFaceSelectionRef.current && !topologyFaceSelectionRef.current && !topologyEdgeSelectionRef.current) {
        const annotationId = annotationAtPointer();
        if (annotationId && annotationSelectRef.current && !originHandleAtPointer()) { annotationSelectRef.current(annotationId); return; }
      }
      const shellLayer = distanceHandleRef.current;
      const shellHit = shellLayer ? raycaster.intersectObject(shellLayer, true).find((hit) => hit.object.userData.distanceParameterTarget) : null;
      if (shellLayer && shellHit) {
        const localOrigin = (shellLayer.userData.origin as THREE.Vector3).clone();
        const localDirection = (shellLayer.userData.direction as THREE.Vector3).clone().normalize();
        distanceOriginWorld = modelGroup.localToWorld(localOrigin);
        distanceDirectionWorld = localDirection.applyQuaternion(modelGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const cameraDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const planeNormal = cameraDirection.clone().addScaledVector(distanceDirectionWorld, -cameraDirection.dot(distanceDirectionWorld));
        if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(distanceDirectionWorld, new THREE.Vector3(1, 0, 0));
        if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(distanceDirectionWorld, new THREE.Vector3(0, 1, 0));
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal.normalize(), distanceOriginWorld);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          const thickness = Number(shellLayer.userData.value) || 0.01;
          distancePointerOffset = dragPoint.clone().sub(distanceOriginWorld).dot(distanceDirectionWorld) / shellLayer.userData.valueScale - thickness;
          pendingDistanceParameter = thickness;
          interaction = "distanceParameter";
          distanceParameterDragStartRef.current?.();
        }
      }
      const revolveLayer = revolveHandleRef.current;
      const revolveHit = !interaction && revolveLayer ? raycaster.intersectObject(revolveLayer, true).find((hit) => hit.object.userData.revolveAngleTarget) : null;
      if (revolveLayer && revolveHit) {
        revolveOriginWorld = revolveLayer.getWorldPosition(new THREE.Vector3());
        const worldQuaternion = revolveLayer.getWorldQuaternion(new THREE.Quaternion());
        revolveAxisWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
        revolveReferenceWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();
        revolveStartAngle = Number(revolveLayer.userData.angle) || 0;
        pendingRevolveAngle = revolveStartAngle;
        dragPlane.setFromNormalAndCoplanarPoint(revolveAxisWorld, revolveOriginWorld);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          const pointer = dragPoint.clone().sub(revolveOriginWorld).normalize();
          const tangent = revolveAxisWorld.clone().cross(revolveReferenceWorld).normalize();
          revolvePointerAngle = THREE.MathUtils.radToDeg(Math.atan2(pointer.dot(tangent), pointer.dot(revolveReferenceWorld)));
          revolveAccumulatedAngle = 0;
          interaction = "revolveAngle";
          revolveGuideScale = (Number(revolveLayer.userData.radius) || 10) / 0.576;
          const guide = rotationGuideAt(revolveOriginWorld, revolveAxisWorld, revolveReferenceWorld, revolveGuideScale);
          revolveGuide = guide.group;
          revolveGuideHighlight = guide.highlight;
          revolveAngleDragStartRef.current?.();
        }
      }
      const edgeTreatmentLayer = edgeTreatmentHandleRef.current;
      const edgeTreatmentHit = !interaction && edgeTreatmentLayer ? raycaster.intersectObject(edgeTreatmentLayer, true).find((hit) => hit.object.userData.edgeTreatmentRadiusTarget) : null;
      if (edgeTreatmentLayer && edgeTreatmentHit) {
        edgeTreatmentOriginWorld = edgeTreatmentLayer.getWorldPosition(new THREE.Vector3());
        edgeTreatmentAxisWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(edgeTreatmentLayer.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const cameraDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const planeNormal = cameraDirection.clone().addScaledVector(edgeTreatmentAxisWorld, -cameraDirection.dot(edgeTreatmentAxisWorld));
        if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(edgeTreatmentAxisWorld, new THREE.Vector3(0, 1, 0));
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal.normalize(), edgeTreatmentOriginWorld);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          const radius = Number(edgeTreatmentLayer.userData.radius) || 0.01;
          edgeTreatmentPointerOffset = dragPoint.clone().sub(edgeTreatmentOriginWorld).dot(edgeTreatmentAxisWorld) - radius;
          pendingEdgeTreatmentRadius = radius;
          interaction = "edgeTreatmentRadius";
        }
      }
      const faceExtrudeLayer = faceExtrudeHandleRef.current;
      const faceExtrudeHit = !interaction && faceExtrudeLayer ? raycaster.intersectObject(faceExtrudeLayer, true).find((hit) => hit.object.userData.faceExtrudeHandle) : null;
      if (faceExtrudeLayer && faceExtrudeHit) {
        const localDirection = (faceExtrudeLayer.userData.direction as THREE.Vector3).clone().normalize();
        const localOrigin = (faceExtrudeLayer.userData.origin as THREE.Vector3).clone();
        faceExtrudeAxis = localDirection.applyQuaternion(modelGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
        faceExtrudeOriginWorld = modelGroup.localToWorld(localOrigin);
        const cameraDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const planeNormal = cameraDirection.clone().addScaledVector(faceExtrudeAxis, -cameraDirection.dot(faceExtrudeAxis));
        if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(faceExtrudeAxis, new THREE.Vector3(1, 0, 0));
        if (planeNormal.lengthSq() < 0.0001) planeNormal.crossVectors(faceExtrudeAxis, new THREE.Vector3(0, 1, 0));
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal.normalize(), faceExtrudeOriginWorld);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          interaction = "faceExtrude";
          faceExtrudeStartDistance = Number(faceExtrudeLayer.userData.distance) || 0.01;
          faceExtrudeStartOperation = faceExtrudeLayer.userData.operation === "cut" ? "cut" : "add";
          pendingFaceExtrudeDistance = faceExtrudeStartDistance;
          pendingFaceExtrudeOperation = faceExtrudeStartOperation;
        }
      }
      if (!interaction && (workplaneFaceSelectionRef.current || topologyFaceSelectionRef.current || topologyEdgeSelectionRef.current)) {
        if (topologyEdgeSelectionRef.current) {
          const selectedEdge = updateTopologyEdgeHighlight();
          if (selectedEdge) {
            toggleTopologyEdge(selectedEdge.hit, selectedEdge.region, topologyMultiSelectionRef.current);
            event.preventDefault();
            return;
          }
        }
        const selectedFace = updateWorkplaneFaceHighlight();
        if (selectedFace) {
          const { hit, region } = selectedFace;
          if (topologyFaceSelectionRef.current) {
            toggleTopologyFace(hit, region, topologyMultiSelectionRef.current);
            event.preventDefault();
            return;
          }
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
      if (!interaction) updateManipulatorHitTargets(event.pointerType);
      const resizeHitboxes = resizeHitboxesRef.current;
      const selected = selectionRef.current;
      const originHandle = interaction ? null : originHandleAtPointer();
      setOriginHandleHover(originHandle);
      if (originHandle) {
        sketchPreviewRoot = sketchTransformRootForFeature(originHandle.targetId);
        sketchPreviewStartWorldPosition = sketchPreviewRoot?.getWorldPosition(new THREE.Vector3()) ?? null;
        sketchPreviewStartWorldQuaternion = sketchPreviewRoot?.getWorldQuaternion(new THREE.Quaternion()) ?? null;
        const worldOrigin = originHandle.marker.getWorldPosition(new THREE.Vector3());
        const localRotationAxis = originHandle.rotationAxis === "x" ? new THREE.Vector3(1, 0, 0)
          : originHandle.rotationAxis === "y" ? new THREE.Vector3(0, 1, 0)
          : originHandle.rotationAxis === "z" ? new THREE.Vector3(0, 0, 1)
          : null;
        const worldRotationAxis = localRotationAxis?.clone().applyQuaternion(originHandle.marker.getWorldQuaternion(new THREE.Quaternion())).normalize() ?? null;
        dragPlane.setFromNormalAndCoplanarPoint(worldRotationAxis ?? camera.getWorldDirection(new THREE.Vector3()).normalize(), worldOrigin);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          if (localRotationAxis && worldRotationAxis) {
            interaction = "axisRotate";
            rotationDragMarker = originHandle.marker;
            rotationStartQuaternion = originHandle.marker.quaternion.clone();
            rotationPlaneAxis = worldRotationAxis;
            rotationCenterWorld = worldOrigin;
            rotationStartVector = dragPoint.clone().sub(worldOrigin).normalize();
            const markerWorldQuaternion = originHandle.marker.getWorldQuaternion(new THREE.Quaternion());
            const localGuideReference = originHandle.rotationAxis === "x"
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(1, 0, 0);
            rotationGuideReferenceVector = localGuideReference.applyQuaternion(markerWorldQuaternion).normalize();
            const parentAxis = localRotationAxis.clone().applyQuaternion(originHandle.marker.quaternion).normalize();
            pendingRotation = { targetId: originHandle.targetId, targetKind: originHandle.targetKind, localAxis: originHandle.rotationAxis!, axis: { x: parentAxis.x, y: parentAxis.y, z: parentAxis.z }, deltaDegrees: 0 };
            const markerWorldScale = originHandle.marker.getWorldScale(new THREE.Vector3());
            rotationGuideScale = Math.max(markerWorldScale.x, markerWorldScale.y, markerWorldScale.z, 0.001);
            const guide = rotationGuideAt(worldOrigin, worldRotationAxis, rotationGuideReferenceVector, rotationGuideScale);
            rotationGuide = guide.group;
            rotationGuideHighlight = guide.highlight;
            rotationPreview = rotationWireframePreviewAt(originHandle.targetId, originHandle.targetKind, worldOrigin);
          } else {
            interaction = originHandle.editable ? "origin" : originHandle.snap ? "snapMove" : "axisMove";
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
      }
      if (!interaction && selected) {
        const root = selectionRootRef.current;
        const resizeHit = raycaster.intersectObjects(resizeHitboxes, false)[0];
        const parameter = resizeHit?.object.userData.shapeParameter as ShapeParameter | undefined;
        if (root && resizeHit && parameter) {
          const center = root.getWorldPosition(new THREE.Vector3());
          const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
          shapeParameterDragAxis = resizeHit.object.userData.shapeParameterDragAxis === "z" ? "z" : resizeHit.object.userData.shapeParameterDragAxis === "y" ? "y" : parameter === "depth" ? "y" : parameter === "height" ? "z" : "x";
          shapeParameterDragSign = resizeHit.object.userData.shapeParameterDragSign === -1 ? -1 : 1;
          const localAxis = shapeParameterDragAxis === "y" ? new THREE.Vector3(0, 1, 0) : shapeParameterDragAxis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
          const axis = localAxis.applyQuaternion(rootQuaternion).normalize();
          const cameraDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
          const planeNormal = shapeParameterDragAxis === "z"
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
            shapeParameterWorldScale = (parameter === "sides" && values?.shape === "polygon") || (parameter === "teeth" && values?.shape === "gear")
              ? 1
              : parameter === "tubeRadius" && values?.shape === "torus"
              ? selected.height / Math.max(0.01, values.tubeRadius * 2)
              : parameter === "cornerRadius" && values?.shape === "roundedBox"
                ? Math.min(selected.width / Math.max(0.01, values.width), selected.depth / Math.max(0.01, values.depth)) * (Math.SQRT2 - 1)
              : values?.shape === "cone" || values?.shape === "tube" || values?.shape === "gear" || values?.shape === "torus"
              ? selected.width / Math.max(0.01, (values.shape === "cone" ? values.baseRadius : values.shape === "tube" || values.shape === "gear" ? values.outerRadius : values.majorRadius + values.tubeRadius) * 2)
              : parameter === "height" && values && values.shape !== "sphere"
                ? selected.height / Math.max(0.01, Math.abs(values.height))
                : parameter === "radius" && (values?.shape === "cylinder" || values?.shape === "sphere" || values?.shape === "halfSphere" || values?.shape === "polygon")
                  ? selected.width / Math.max(0.01, values.radius * 2)
                  : 1;
            const visualHalfExtent = parameter === "topRadius" && values?.shape === "cone"
              ? values.topRadius * shapeParameterWorldScale
              : parameter === "baseRadius" && values?.shape === "cone"
                ? values.baseRadius * shapeParameterWorldScale
                : parameter === "innerRadius" && values?.shape === "tube"
                  ? values.innerRadius * shapeParameterWorldScale
                  : parameter === "thickness" && values?.shape === "tube"
                    ? (values.outerRadius - values.innerRadius) * shapeParameterWorldScale
                  : parameter === "outerRadius" && (values?.shape === "tube" || values?.shape === "gear")
                    ? values.outerRadius * shapeParameterWorldScale
                  : parameter === "majorRadius" && values?.shape === "torus"
                    ? values.majorRadius * shapeParameterWorldScale
                  : parameter === "tubeRadius" && values?.shape === "torus"
                    ? values.tubeRadius * shapeParameterWorldScale
                  : parameter === "cornerRadius" && values?.shape === "roundedBox"
                    ? values.cornerRadius * shapeParameterWorldScale
                  : parameter === "sides" && values?.shape === "polygon"
                    ? values.sides
                  : parameter === "teeth" && values?.shape === "gear"
                    ? values.teeth
                  : parameter === "toothDepth" && values?.shape === "gear"
                    ? values.toothDepth * shapeParameterWorldScale
                  : parameter === "boreRadius" && values?.shape === "gear"
                    ? values.boreRadius * shapeParameterWorldScale
                : parameter === "depth" || (parameter === "size" && values?.shape === "text") ? selected.depth / 2 : parameter === "height" ? selected.height / 2 * (selected.allowNegativeHeight && values && "height" in values && values.height < 0 ? -1 : 1) : selected.width / 2;
            const pointerCoordinate = (shapeParameterDragAxis === "y" ? localPointer.y : shapeParameterDragAxis === "z" ? localPointer.z : localPointer.x) * shapeParameterDragSign;
            parameterPointerOffset = pointerCoordinate - visualHalfExtent;
            signedHeightBaseCoordinate = parameter === "height" && selected.allowNegativeHeight ? -visualHalfExtent : 0;
            const boxLikeValues = values && (values.shape === "box" || values.shape === "roundedBox" || values.shape === "pyramid" || values.shape === "wedge" || values.shape === "roof" || values.shape === "roundRoof");
            const value = parameter === "width" && boxLikeValues ? values.width
              : parameter === "depth" && boxLikeValues ? values.depth
                : parameter === "height" && values && values.shape !== "sphere" && values.shape !== "torus" ? values.height
                  : parameter === "size" && values?.shape === "text" ? values.size
                  : parameter === "radius" && (values?.shape === "cylinder" || values?.shape === "sphere" || values?.shape === "halfSphere" || values?.shape === "polygon") ? values.radius
                    : parameter === "baseRadius" && values?.shape === "cone" ? values.baseRadius
                      : parameter === "topRadius" && values?.shape === "cone" ? values.topRadius
                        : parameter === "outerRadius" && (values?.shape === "tube" || values?.shape === "gear") ? values.outerRadius
                          : parameter === "innerRadius" && values?.shape === "tube" ? values.innerRadius
                            : parameter === "thickness" && values?.shape === "tube" ? values.outerRadius - values.innerRadius
                            : parameter === "majorRadius" && values?.shape === "torus" ? values.majorRadius
                              : parameter === "tubeRadius" && values?.shape === "torus" ? values.tubeRadius
                                : parameter === "cornerRadius" && values?.shape === "roundedBox" ? values.cornerRadius
                                : parameter === "sides" && values?.shape === "polygon" ? values.sides
                                  : parameter === "teeth" && values?.shape === "gear" ? values.teeth
                                    : parameter === "toothDepth" && values?.shape === "gear" ? values.toothDepth
                                      : parameter === "boreRadius" && values?.shape === "gear" ? values.boreRadius
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
        if (event.buttons === 0 && (workplaneFaceSelectionRef.current || topologyFaceSelectionRef.current || topologyEdgeSelectionRef.current)) {
          pendingHoverEvent = event;
          requestRender();
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
          pendingHoverEvent = event;
          requestRender();
        }
        return;
      }
      setPointer(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
      if (interaction === "distanceParameter" && distanceOriginWorld && distanceDirectionWorld) {
        const step = Math.max(0.01, snapRef.current);
        const layer = distanceHandleRef.current;
        if (!layer) return;
        const coordinate = dragPoint.clone().sub(distanceOriginWorld).dot(distanceDirectionWorld) / layer.userData.valueScale - distancePointerOffset;
        const previousValue = pendingDistanceParameter;
        pendingDistanceParameter = Math.min(layer.userData.max, Math.max(layer.userData.min, Math.round(coordinate / step) * step));
        if (Math.abs(pendingDistanceParameter) < 0.01) pendingDistanceParameter = coordinate < 0 ? -0.01 : 0.01;
        setDistanceParameterPreview(pendingDistanceParameter);
        if (pendingDistanceParameter !== previousValue) distanceParameterPreviewRef.current?.(pendingDistanceParameter);
        if (layer) {
          const origin = layer.userData.origin as THREE.Vector3;
          const direction = layer.userData.direction as THREE.Vector3;
          const end = origin.clone().addScaledVector(direction, pendingDistanceParameter * layer.userData.valueScale + layer.userData.offset);
          const guide = layer.children.find((child) => child.userData.distanceParameterGuide);
          const handle = layer.children.find((child) => child.userData.distanceParameterHandle);
          const target = layer.children.find((child) => child.userData.distanceParameterTarget);
          if (guide instanceof LineSegments2) updateYellowManipulatorLine(guide, origin, end);
          handle?.position.copy(end);
          target?.position.copy(end);
        }
        requestRender();
        return;
      }
      if (interaction === "revolveAngle" && revolveOriginWorld && revolveAxisWorld && revolveReferenceWorld) {
        const current = dragPoint.clone().sub(revolveOriginWorld).normalize();
        const tangent = revolveAxisWorld.clone().cross(revolveReferenceWorld).normalize();
        const raw = THREE.MathUtils.radToDeg(Math.atan2(current.dot(tangent), current.dot(revolveReferenceWorld)));
        let pointerDelta = raw - revolvePointerAngle;
        if (pointerDelta > 180) pointerDelta -= 360;
        if (pointerDelta < -180) pointerDelta += 360;
        revolveAccumulatedAngle += pointerDelta;
        revolvePointerAngle = raw;
        const signedStart = Math.abs(revolveStartAngle) >= 359.999 ? 0 : revolveStartAngle;
        const pointerRadius = dragPoint.distanceTo(revolveOriginWorld);
        const radialLineDistance = (degrees: number, minimumRadius: number, maximumRadius: number) => {
          const difference = THREE.MathUtils.degToRad(raw - degrees);
          const perpendicular = Math.abs(Math.sin(difference)) * pointerRadius;
          const radialGap = pointerRadius < minimumRadius ? minimumRadius - pointerRadius : pointerRadius > maximumRadius ? pointerRadius - maximumRadius : 0;
          return Math.hypot(perpendicular, radialGap);
        };
        const ringRadius = revolveGuideScale * 0.576;
        const circleRadius = ringRadius * 2 + revolveGuideScale * 0.03;
        const outerDegrees = Math.round(raw / 5) * 5;
        const outerLength = revolveGuideScale * (Math.abs(outerDegrees) % 10 === 0 ? 0.192 : 0.08);
        const outerDistance = radialLineDistance(outerDegrees, circleRadius, circleRadius + outerLength);
        const innerDegrees = Math.round(raw / 45) * 45;
        const innerDistance = radialLineDistance(innerDegrees, circleRadius * 0.25, circleRadius * 0.75);
        const sensitiveDistance = revolveGuideScale * 0.055;
        const activeGuide = outerDistance <= sensitiveDistance || innerDistance <= sensitiveDistance
          ? outerDistance <= innerDistance
            ? { degrees: outerDegrees, minimumRadius: circleRadius, maximumRadius: circleRadius + outerLength }
            : { degrees: innerDegrees, minimumRadius: circleRadius * 0.25, maximumRadius: circleRadius * 0.75 }
          : null;
        if (revolveGuideHighlight) {
          revolveGuideHighlight.visible = activeGuide !== null;
          if (activeGuide) {
            const radians = THREE.MathUtils.degToRad(activeGuide.degrees);
            const tangent = revolveAxisWorld.clone().cross(revolveReferenceWorld).normalize();
            const direction = revolveReferenceWorld.clone().multiplyScalar(Math.cos(radians)).addScaledVector(tangent, Math.sin(radians));
            const first = direction.clone().multiplyScalar(activeGuide.minimumRadius);
            const second = direction.multiplyScalar(activeGuide.maximumRadius);
            revolveGuideHighlight.geometry.setPositions([first.x, first.y, first.z, second.x, second.y, second.z]);
          }
        }
        const freeAngle = signedStart + revolveAccumulatedAngle;
        const snappedCandidates = activeGuide ? [activeGuide.degrees - 360, activeGuide.degrees, activeGuide.degrees + 360] : [];
        const guidedAngle = snappedCandidates.reduce<number | null>((best, candidate) => best === null || Math.abs(candidate - freeAngle) < Math.abs(best - freeAngle) ? candidate : best, null);
        const previousAngle = pendingRevolveAngle;
        pendingRevolveAngle = Math.min(360, Math.max(-360, Math.round(guidedAngle ?? freeAngle)));
        if (Math.abs(pendingRevolveAngle) < 1) pendingRevolveAngle = pendingRevolveAngle < 0 ? -1 : 1;
        setRevolveAnglePreview(pendingRevolveAngle);
        if (pendingRevolveAngle !== previousAngle) revolveAnglePreviewRef.current?.(pendingRevolveAngle);
        const layer = revolveHandleRef.current;
        if (layer) {
          const radius = Number(layer.userData.radius) || 10;
          const arc = layer.children.find((child) => child.userData.revolveAngleArc);
          const handle = layer.children.find((child) => child.userData.revolveAngleHandle);
          const target = layer.children.find((child) => child.userData.revolveAngleTarget);
          if (arc instanceof LineSegments2) updateRevolveAngleArc(arc, radius, pendingRevolveAngle);
          const radians = THREE.MathUtils.degToRad(pendingRevolveAngle);
          const end = new THREE.Vector3(Math.cos(radians) * radius, Math.sin(radians) * radius, 0);
          handle?.position.copy(end);
          target?.position.copy(end);
        }
        requestRender();
        return;
      }
      if (interaction === "edgeTreatmentRadius" && edgeTreatmentOriginWorld && edgeTreatmentAxisWorld) {
        const grid = Math.max(0.01, snapRef.current);
        const coordinate = dragPoint.clone().sub(edgeTreatmentOriginWorld).dot(edgeTreatmentAxisWorld) - edgeTreatmentPointerOffset;
        pendingEdgeTreatmentRadius = Math.max(0.01, Math.round(coordinate / grid) * grid);
        setEdgeTreatmentRadiusPreview(pendingEdgeTreatmentRadius);
        const layer = edgeTreatmentHandleRef.current;
        if (layer) {
          const start = new THREE.Vector3();
          const end = new THREE.Vector3(pendingEdgeTreatmentRadius + 4, 0, 0);
          const guide = layer.children.find((child) => child.userData.edgeTreatmentRadiusGuide);
          const handle = layer.children.find((child) => child.userData.edgeTreatmentRadiusHandle);
          const target = layer.children.find((child) => child.userData.edgeTreatmentRadiusTarget);
          if (guide instanceof LineSegments2) updateYellowManipulatorLine(guide, start, end);
          if (handle) handle.position.copy(end);
          if (target) target.position.copy(end);
        }
        requestRender();
        return;
      }
      if (interaction === "faceExtrude" && faceExtrudeAxis && faceExtrudeOriginWorld) {
        const grid = Math.max(0.01, snapRef.current);
        const coordinate = dragPoint.clone().sub(faceExtrudeOriginWorld).dot(faceExtrudeAxis);
        const crossedOrigin = coordinate < 0;
        const rawDistance = Math.max(0, Math.abs(coordinate) - 2);
        pendingFaceExtrudeDistance = Math.max(grid, Math.round(rawDistance / grid) * grid);
        pendingFaceExtrudeOperation = crossedOrigin ? (faceExtrudeStartOperation === "add" ? "cut" : "add") : faceExtrudeStartOperation;
        const layer = faceExtrudeHandleRef.current;
        if (layer) {
          const origin = layer.userData.origin as THREE.Vector3;
          const initialDirection = layer.userData.direction as THREE.Vector3;
          const direction = crossedOrigin ? initialDirection.clone().negate() : initialDirection;
          const end = origin.clone().addScaledVector(direction, pendingFaceExtrudeDistance + 2);
          const guide = layer.children.find((child) => child.userData.faceExtrudeGuide);
          const handle = layer.children.find((child) => child.userData.faceExtrudeHandle);
          if (guide instanceof LineSegments2) updateYellowManipulatorLine(guide, origin, end);
          if (handle) handle.position.copy(end);
        }
        requestRender();
        return;
      }
      if (interaction === "axisRotate" && rotationDragMarker && rotationStartQuaternion && rotationPlaneAxis && rotationStartVector && rotationGuideReferenceVector && rotationCenterWorld && pendingRotation) {
        const pointerFromCenter = dragPoint.clone().sub(rotationCenterWorld);
        const pointerRadius = pointerFromCenter.length();
        const currentVector = pointerFromCenter.clone().normalize();
        const sine = rotationPlaneAxis.dot(rotationStartVector.clone().cross(currentVector));
        const cosine = rotationStartVector.dot(currentVector);
        const rawDegrees = THREE.MathUtils.radToDeg(Math.atan2(sine, cosine));
        const guideTangent = rotationPlaneAxis.clone().cross(rotationGuideReferenceVector).normalize();
        const pointerGuideDegrees = THREE.MathUtils.radToDeg(Math.atan2(
          currentVector.dot(guideTangent),
          currentVector.dot(rotationGuideReferenceVector),
        ));
        const radialLineDistance = (degrees: number, minimumRadius: number, maximumRadius: number) => {
          const difference = THREE.MathUtils.degToRad(pointerGuideDegrees - degrees);
          const perpendicular = Math.abs(Math.sin(difference)) * pointerRadius;
          const radialGap = pointerRadius < minimumRadius ? minimumRadius - pointerRadius : pointerRadius > maximumRadius ? pointerRadius - maximumRadius : 0;
          return Math.hypot(perpendicular, radialGap);
        };
        const ringRadius = rotationGuideScale * 0.576;
        const maximumRadius = ringRadius * 2;
        const circleRadius = maximumRadius + rotationGuideScale * 0.03;
        const outerDegrees = Math.round(pointerGuideDegrees / 5) * 5;
        const outerLength = rotationGuideScale * (Math.abs(outerDegrees) % 10 === 0 ? 0.192 : 0.08);
        const outerDistance = radialLineDistance(outerDegrees, circleRadius, circleRadius + outerLength);
        const innerDegrees = Math.round(pointerGuideDegrees / 45) * 45;
        const innerDistance = radialLineDistance(innerDegrees, circleRadius * 0.25, circleRadius * 0.75);
        const sensitiveDistance = rotationGuideScale * 0.055;
        const activeGuide = outerDistance <= sensitiveDistance || innerDistance <= sensitiveDistance
          ? outerDistance <= innerDistance
            ? { degrees: outerDegrees, minimumRadius: circleRadius, maximumRadius: circleRadius + outerLength }
            : { degrees: innerDegrees, minimumRadius: circleRadius * 0.25, maximumRadius: circleRadius * 0.75 }
          : null;
        if (rotationGuideHighlight) {
          rotationGuideHighlight.visible = activeGuide !== null;
          if (activeGuide) {
            const radians = THREE.MathUtils.degToRad(activeGuide.degrees);
            const guideDirection = rotationGuideReferenceVector.clone().multiplyScalar(Math.cos(radians)).addScaledVector(guideTangent, Math.sin(radians));
            const first = guideDirection.clone().multiplyScalar(activeGuide.minimumRadius);
            const second = guideDirection.multiplyScalar(activeGuide.maximumRadius);
            rotationGuideHighlight.geometry.setPositions([first.x, first.y, first.z, second.x, second.y, second.z]);
          }
        }
        const preciseGuideDegrees = activeGuide?.degrees ?? null;
        const preciseDegrees = preciseGuideDegrees === null
          ? null
          : THREE.MathUtils.radToDeg(Math.atan2(
              Math.sin(THREE.MathUtils.degToRad(preciseGuideDegrees)),
              Math.cos(THREE.MathUtils.degToRad(preciseGuideDegrees)),
            ));
        const rotationStep = event.shiftKey ? 15 : 1;
        const degrees = preciseDegrees ?? Math.round(rawDegrees / rotationStep) * rotationStep;
        pendingRotation.deltaDegrees = degrees;
        const parentAxis = new THREE.Vector3(pendingRotation.axis.x, pendingRotation.axis.y, pendingRotation.axis.z).normalize();
        rotationDragMarker.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(parentAxis, THREE.MathUtils.degToRad(degrees)).multiply(rotationStartQuaternion));
        rotationPreview?.quaternion.setFromAxisAngle(rotationPlaneAxis, THREE.MathUtils.degToRad(degrees));
        if (sketchPreviewRoot?.parent && sketchPreviewStartWorldQuaternion) {
          const desiredWorld = new THREE.Quaternion().setFromAxisAngle(rotationPlaneAxis, THREE.MathUtils.degToRad(degrees)).multiply(sketchPreviewStartWorldQuaternion);
          const parentWorld = sketchPreviewRoot.parent.getWorldQuaternion(new THREE.Quaternion());
          sketchPreviewRoot.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
        }
        requestRender();
        return;
      }
      if (interaction === "snapMove" && originDragStart && originDragMarker && pendingAxisMove) {
        const target = snapTargetAtPointer(event);
        if (!target) return;
        originDragMarker.position.copy(target);
        pendingAxisMove.position = { x: target.x, y: target.y, z: target.z };
        previewAnnotationPosition(pendingAxisMove.targetId, target);
        const delta = target.clone().sub(originDragStart);
        updateMoveDimension(originLayer.localToWorld(originDragStart.clone()), originLayer.localToWorld(target.clone()), delta.length());
        const root = selectionRootRef.current;
        if (root && axisMoveRootStart) root.position.copy(axisMoveRootStart).add(delta);
        if (sketchPreviewRoot?.parent && sketchPreviewStartWorldPosition) {
          const worldOrigin = originLayer.localToWorld(new THREE.Vector3());
          const worldDelta = originLayer.localToWorld(delta).sub(worldOrigin);
          sketchPreviewRoot.position.copy(sketchPreviewRoot.parent.worldToLocal(sketchPreviewStartWorldPosition.clone().add(worldDelta)));
        }
        requestRender();
        return;
      }
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
        const movement = next.clone().sub(originDragStart);
        const signedDistance = originDragAxis === "x" ? movement.x : originDragAxis === "y" ? movement.y : originDragAxis === "z" ? movement.z : movement.length();
        updateMoveDimension(originLayer.localToWorld(originDragStart.clone()), originLayer.localToWorld(next.clone()), signedDistance);
        if (interaction === "origin" && pendingOrigin) pendingOrigin.position = { x: next.x, y: next.y, z: next.z };
        if (interaction === "axisMove" && pendingAxisMove) {
          pendingAxisMove.position = { x: next.x, y: next.y, z: next.z };
          previewAnnotationPosition(pendingAxisMove.targetId, next);
          const root = selectionRootRef.current;
          if (root && axisMoveRootStart) root.position.copy(axisMoveRootStart).add(next.clone().sub(originDragStart));
          if (sketchPreviewRoot?.parent && sketchPreviewStartWorldPosition) {
            const localDelta = next.clone().sub(originDragStart);
            const worldOrigin = originLayer.localToWorld(new THREE.Vector3());
            const worldDelta = originLayer.localToWorld(localDelta).sub(worldOrigin);
            sketchPreviewRoot.position.copy(sketchPreviewRoot.parent.worldToLocal(sketchPreviewStartWorldPosition.clone().add(worldDelta)));
          }
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
        const parameterStep = grid;
        const pointerCoordinate = (shapeParameterDragAxis === "y" ? localPointer.y : shapeParameterDragAxis === "z" ? localPointer.z : localPointer.x) * shapeParameterDragSign;
        const adjusted = pointerCoordinate - parameterPointerOffset;
        const parameterAdjusted = adjusted;
        const signedHeightDrag = parameter === "height" && selected.allowNegativeHeight;
        let signedVisualExtent = 0;
        let visualExtent = parameter === "sides" || parameter === "teeth"
          ? parameter === "sides" ? Math.min(32, Math.max(3, Math.round(Math.abs(parameterAdjusted)))) : Math.min(64, Math.max(6, Math.round(Math.abs(parameterAdjusted))))
          : parameter === "height" && !signedHeightDrag
          ? Math.max(parameterStep, Math.round((parameterAdjusted + resizeStart.height / 2) / parameterStep) * parameterStep)
          : signedHeightDrag
            ? Math.abs(parameterAdjusted - signedHeightBaseCoordinate)
          : parameter === "topRadius" || parameter === "innerRadius" || parameter === "thickness" || parameter === "majorRadius" || parameter === "tubeRadius" || parameter === "cornerRadius" || parameter === "toothDepth" || parameter === "boreRadius"
            ? Math.max(0, Math.round(Math.abs(parameterAdjusted) / parameterStep) * parameterStep)
            : Math.max(parameterStep, Math.round(Math.abs(parameterAdjusted) * 2 / parameterStep) * parameterStep);
        const startExtent = parameter === "depth" || parameter === "size" ? resizeStart.depth : parameter === "height" ? resizeStart.height : resizeStart.width;
        let ratio = visualExtent / Math.max(0.01, startExtent);
        pendingShapeParameter.value = parameter === "sides" || parameter === "teeth"
          ? visualExtent
          : signedHeightDrag
            ? (() => {
                const rawValue = (parameterAdjusted - signedHeightBaseCoordinate) / Math.max(0.0001, shapeParameterWorldScale);
                const snapped = Math.round(rawValue / parameterStep) * parameterStep;
                return Math.abs(snapped) < parameterStep ? (rawValue < 0 ? -parameterStep : parameterStep) : snapped;
              })()
          : parameter === "topRadius" || parameter === "innerRadius" || parameter === "thickness" || parameter === "majorRadius" || parameter === "tubeRadius" || parameter === "cornerRadius" || parameter === "toothDepth" || parameter === "boreRadius"
          ? visualExtent / Math.max(0.0001, shapeParameterWorldScale)
          : Math.max(0.1, shapeParameterStartValue * ratio);
        if (signedHeightDrag) {
          signedVisualExtent = pendingShapeParameter.value * shapeParameterWorldScale;
          visualExtent = Math.abs(signedVisualExtent);
          ratio = visualExtent / Math.max(0.01, startExtent);
        } else if (parameter !== "sides" && parameter !== "teeth") {
          const minimum = parameter === "topRadius" || parameter === "boreRadius" ? 0 : parameterStep;
          pendingShapeParameter.value = Math.max(minimum, Math.round(pendingShapeParameter.value / parameterStep) * parameterStep);
          ratio = pendingShapeParameter.value / Math.max(0.0001, shapeParameterStartValue);
          visualExtent = startExtent * ratio;
        }
        shapeParameterPreviewRef.current = pendingShapeParameter;
        root.position.copy(resizeRootStart);
        visualRoot.position.set(0, 0, 0);
        visualRoot.scale.set(1, 1, 1);
        if (selected.shapeParameters?.shape === "roundedBox") {
          const width = parameter === "width" ? pendingShapeParameter.value : selected.shapeParameters.width;
          const depth = parameter === "depth" ? pendingShapeParameter.value : selected.shapeParameters.depth;
          const height = parameter === "height" ? pendingShapeParameter.value : selected.shapeParameters.height;
          const cornerRadius = parameter === "cornerRadius" ? pendingShapeParameter.value : selected.shapeParameters.cornerRadius;
          if (parameter === "cornerRadius") pendingShapeParameter.value = Math.min(width / 2 - 0.1, depth / 2 - 0.1, Math.max(0.1, cornerRadius));
          shapeParameterPreviewRef.current = pendingShapeParameter;
          if (parameter === "height") visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
          updateRoundedBoxPreview(selected, width, depth, height, parameter === "cornerRadius" ? pendingShapeParameter.value : Math.min(cornerRadius, width / 2 - 0.1, depth / 2 - 0.1));
        } else if (selected.shapeParameters?.shape === "cone") {
          const baseRadius = parameter === "baseRadius" ? pendingShapeParameter.value : selected.shapeParameters.baseRadius;
          const topRadius = parameter === "topRadius" ? pendingShapeParameter.value : selected.shapeParameters.topRadius;
          const height = parameter === "height" ? pendingShapeParameter.value : selected.shapeParameters.height;
          if (parameter === "height") visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
          updateConePreview(selected, baseRadius, topRadius, height);
        } else if (selected.shapeParameters?.shape === "tube") {
          const originalThickness = selected.shapeParameters.outerRadius - selected.shapeParameters.innerRadius;
          const outerRadius = parameter === "outerRadius" ? Math.max(originalThickness + 0.1, pendingShapeParameter.value) : selected.shapeParameters.outerRadius;
          const thickness = parameter === "thickness" ? Math.max(0.1, pendingShapeParameter.value) : originalThickness;
          const innerRadius = Math.max(0.1, outerRadius - Math.min(thickness, outerRadius - 0.1));
          const height = parameter === "height" ? pendingShapeParameter.value : selected.shapeParameters.height;
          pendingShapeParameter.value = parameter === "outerRadius" ? outerRadius : parameter === "thickness" ? outerRadius - innerRadius : pendingShapeParameter.value;
          shapeParameterPreviewRef.current = pendingShapeParameter;
          if (parameter === "height") visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
          updateTubePreview(selected, outerRadius, innerRadius, height);
        } else if (selected.shapeParameters?.shape === "torus") {
          const majorRadius = parameter === "majorRadius" ? Math.max(selected.shapeParameters.tubeRadius + 0.1, pendingShapeParameter.value) : selected.shapeParameters.majorRadius;
          const tubeRadius = parameter === "tubeRadius" ? Math.min(selected.shapeParameters.majorRadius - 0.1, Math.max(0.1, pendingShapeParameter.value)) : selected.shapeParameters.tubeRadius;
          pendingShapeParameter.value = parameter === "majorRadius" ? majorRadius : tubeRadius;
          shapeParameterPreviewRef.current = pendingShapeParameter;
          updateTorusPreview(selected, majorRadius, tubeRadius);
        } else if (selected.shapeParameters?.shape === "polygon" && parameter === "sides") {
          pendingShapeParameter.value = Math.min(32, Math.max(3, Math.round(pendingShapeParameter.value)));
          shapeParameterPreviewRef.current = pendingShapeParameter;
          updatePolygonPreview(selected, pendingShapeParameter.value);
        } else if (selected.shapeParameters?.shape === "gear") {
          const outerRadius = parameter === "outerRadius" ? Math.max(selected.shapeParameters.toothDepth + selected.shapeParameters.boreRadius + 0.1, pendingShapeParameter.value) : selected.shapeParameters.outerRadius;
          const toothDepth = parameter === "toothDepth" ? Math.min(outerRadius - selected.shapeParameters.boreRadius - 0.1, Math.max(0.2, pendingShapeParameter.value)) : selected.shapeParameters.toothDepth;
          const boreRadius = parameter === "boreRadius" ? Math.min(outerRadius - toothDepth - 0.1, Math.max(0, pendingShapeParameter.value)) : selected.shapeParameters.boreRadius;
          const teeth = parameter === "teeth" ? Math.min(64, Math.max(6, Math.round(pendingShapeParameter.value))) : selected.shapeParameters.teeth;
          const height = parameter === "height" ? pendingShapeParameter.value : selected.shapeParameters.height;
          pendingShapeParameter.value = parameter === "outerRadius" ? outerRadius : parameter === "toothDepth" ? toothDepth : parameter === "boreRadius" ? boreRadius : parameter === "teeth" ? teeth : height;
          shapeParameterPreviewRef.current = pendingShapeParameter;
          if (parameter === "height") visualRoot.position.z = (visualExtent - resizeStart.height) / 2;
          updateGearPreview(selected, outerRadius, toothDepth, boreRadius, teeth, height);
        } else if (parameter === "width") visualRoot.scale.x = ratio;
        else if (parameter === "depth") visualRoot.scale.y = ratio;
        else if (parameter === "height") {
          const startDirection = shapeParameterStartValue < 0 ? -1 : 1;
          visualRoot.scale.z = signedHeightDrag ? signedVisualExtent / Math.max(0.01, resizeStart.height) * startDirection : ratio;
          visualRoot.position.z = signedHeightDrag ? signedHeightBaseCoordinate + signedVisualExtent / 2 : (visualExtent - resizeStart.height) / 2;
        } else if (selected.shapeParameters?.shape === "sphere") {
          visualRoot.scale.setScalar(ratio);
        } else {
          visualRoot.scale.x = ratio;
          visualRoot.scale.y = ratio;
        }
        preserveYellowManipulatorShape(visualRoot);
      }
      requestRender();
    };
    const stopDragging = (event: PointerEvent, cancelled = false) => {
      setMoveDimension(null);
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
        const bodies = modelGroup.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && typeof child.userData.objectId === "string" && (alignmentRef.current.active || child.userData.editorPickable !== false));
        const hit = raycaster.intersectObjects(bodies, false)[0];
        if (alignmentRef.current.active) {
          const alignment = alignmentRef.current;
          // A click while geometry is loading must still cancel on empty space
          // or an outside object, but preserve members of the current group.
          if (!alignment.targets.length || alignmentBusyRef.current) {
            if (typeof hit?.object.userData.objectId === "string") objectSelectRef.current?.(hit.object.userData.objectId);
            else alignment.onSelect?.(null);
            return;
          }
          modelGroup.updateMatrixWorld(true);
          const operandHit = raycaster.intersectObjects(alignmentPickMeshesRef.current, false)[0];
          const outsideHit = raycaster.intersectObjects(bodies.filter(body => !alignment.targets.some(target => target.objectId === body.userData.objectId)), false)[0];
          if (outsideHit && (!operandHit || outsideHit.distance < operandHit.distance - 1e-5)) alignment.onSelect?.(null);
          else if (operandHit) alignment.onSelect?.(operandHit.object.userData.alignmentItem as AlignmentItem);
          else alignment.onSelect?.(null);
          return;
        }
        const sketchDrawings: THREE.Object3D[] = [];
        sketchLayer.traverse((child) => {
          if (child instanceof LineSegments2 && child.userData.editorPickable !== false && typeof child.userData.objectId === "string") sketchDrawings.push(child);
        });
        Object.assign(raycaster.params, { Line2: { threshold: 4 } });
        sketchLayer.updateMatrixWorld(true);
        const sketchHit = raycaster.intersectObjects(sketchDrawings, false)[0];
        if (sketchHit && (!hit || sketchHit.distance <= hit.distance + 0.01)) {
          objectSelectRef.current?.(sketchHit.object.userData.objectId, sketchHit.object.userData.sketchFeatureId);
          return;
        }
        const objectId = hit?.object.userData.objectId;
        if (typeof objectId === "string") objectSelectRef.current?.(objectId);
        else emptySelectRef.current?.();
        return;
      }
      const completedDimensions = interactionDimensions;
      const completedInteraction = interaction;
      if (completedInteraction === "axisMove" || completedInteraction === "snapMove") setAnnotationPreview(null);
      interaction = null;
      interactionDimensions = [];
      pickCandidate = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = "default";
      setOriginHandleHover(null);
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (cancelled) {
        if (completedInteraction === "distanceParameter") {
          setDistanceParameterPreview(null);
          distanceParameterCancelRef.current?.();
          const layer = distanceHandleRef.current;
          if (layer) {
            const origin = layer.userData.origin as THREE.Vector3;
            const direction = layer.userData.direction as THREE.Vector3;
            const thickness = Number(layer.userData.value) || 0.01;
            const end = origin.clone().addScaledVector(direction, thickness * layer.userData.valueScale + layer.userData.offset);
            const guide = layer.children.find((child) => child.userData.distanceParameterGuide);
            const handle = layer.children.find((child) => child.userData.distanceParameterHandle);
            const target = layer.children.find((child) => child.userData.distanceParameterTarget);
            if (guide instanceof LineSegments2) updateYellowManipulatorLine(guide, origin, end);
            handle?.position.copy(end);
            target?.position.copy(end);
          }
        }
        if (completedInteraction === "revolveAngle") {
          setRevolveAnglePreview(null);
          revolveAngleCancelRef.current?.();
          const layer = revolveHandleRef.current;
          if (layer) {
            const radius = Number(layer.userData.radius) || 10;
            const angle = Number(layer.userData.angle) || 0;
            const arc = layer.children.find((child) => child.userData.revolveAngleArc);
            const handle = layer.children.find((child) => child.userData.revolveAngleHandle);
            const target = layer.children.find((child) => child.userData.revolveAngleTarget);
            if (arc instanceof LineSegments2) updateRevolveAngleArc(arc, radius, angle);
            const radians = THREE.MathUtils.degToRad(angle);
            const end = new THREE.Vector3(Math.cos(radians) * radius, Math.sin(radians) * radius, 0);
            handle?.position.copy(end);
            target?.position.copy(end);
          }
        }
        if (completedInteraction === "edgeTreatmentRadius") {
          setEdgeTreatmentRadiusPreview(null);
          const layer = edgeTreatmentHandleRef.current;
          if (layer) {
            const radius = Number(layer.userData.radius) || 0.01;
            const start = new THREE.Vector3();
            const end = new THREE.Vector3(radius + 4, 0, 0);
            const guide = layer.children.find((child) => child.userData.edgeTreatmentRadiusGuide);
            const handle = layer.children.find((child) => child.userData.edgeTreatmentRadiusHandle);
            const target = layer.children.find((child) => child.userData.edgeTreatmentRadiusTarget);
            if (guide instanceof LineSegments2) updateYellowManipulatorLine(guide, start, end);
            if (handle) handle.position.copy(end);
            if (target) target.position.copy(end);
          }
        }
        if ((completedInteraction === "origin" || completedInteraction === "axisMove" || completedInteraction === "snapMove") && originDragMarker && originDragStart) originDragMarker.position.copy(originDragStart);
        if (completedInteraction === "axisRotate" && rotationDragMarker && rotationStartQuaternion) rotationDragMarker.quaternion.copy(rotationStartQuaternion);
        if (sketchPreviewRoot?.parent && sketchPreviewStartWorldPosition) sketchPreviewRoot.position.copy(sketchPreviewRoot.parent.worldToLocal(sketchPreviewStartWorldPosition.clone()));
        if (sketchPreviewRoot?.parent && sketchPreviewStartWorldQuaternion) sketchPreviewRoot.quaternion.copy(sketchPreviewRoot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(sketchPreviewStartWorldQuaternion));
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
          } else if (selected.shapeParameters?.shape === "roundedBox") {
            updateRoundedBoxPreview(selected, selected.shapeParameters.width, selected.shapeParameters.depth, selected.shapeParameters.height, selected.shapeParameters.cornerRadius);
          }
          requestRender();
        }
      } else {
        completedDimensions.forEach((axis) => dimensionPinnedRef.current.add(axis));
        if (completedInteraction === "origin" && pendingOrigin) originMoveRef.current?.(pendingOrigin.objectId, pendingOrigin.position);
        if ((completedInteraction === "axisMove" || completedInteraction === "snapMove") && pendingAxisMove) {
          if (pendingAxisMove.targetKind === "object") objectAxisMoveRef.current?.(pendingAxisMove.targetId, pendingAxisMove.position);
          else operationAxisMoveRef.current?.(pendingAxisMove.targetId, {
            x: pendingAxisMove.position.x - pendingAxisMove.start.x,
            y: pendingAxisMove.position.y - pendingAxisMove.start.y,
            z: pendingAxisMove.position.z - pendingAxisMove.start.z,
          });
        }
        if (completedInteraction === "axisRotate" && pendingRotation && Math.abs(pendingRotation.deltaDegrees) > 0.0001) {
          if (pendingRotation.targetKind === "object") objectRotateRef.current?.(pendingRotation.targetId, pendingRotation.axis, pendingRotation.deltaDegrees, pendingRotation.localAxis);
          else operationRotateRef.current?.(pendingRotation.targetId, pendingRotation.axis, pendingRotation.deltaDegrees);
        }
        if (pendingShapeParameter) shapeParameterRef.current?.(pendingShapeParameter.parameter, pendingShapeParameter.value);
        if (completedInteraction === "faceExtrude" && pendingFaceExtrudeDistance !== null && pendingFaceExtrudeOperation) faceExtrudeDistanceChangeRef.current?.(pendingFaceExtrudeDistance, pendingFaceExtrudeOperation);
        if (completedInteraction === "edgeTreatmentRadius" && pendingEdgeTreatmentRadius !== null) {
          edgeTreatmentRadiusChangeRef.current?.(pendingEdgeTreatmentRadius);
          setEdgeTreatmentRadiusPreview(null);
        }
        if (completedInteraction === "revolveAngle" && pendingRevolveAngle !== null) {
          revolveAngleChangeRef.current?.(pendingRevolveAngle);
          setRevolveAnglePreview(null);
        }
        if (completedInteraction === "distanceParameter" && pendingDistanceParameter !== null) {
          distanceParameterChangeRef.current?.(pendingDistanceParameter);
          setDistanceParameterPreview(null);
        }
      }
      pendingShapeParameter = null;
      pendingFaceExtrudeDistance = null;
      pendingFaceExtrudeOperation = null;
      faceExtrudeAxis = null;
      faceExtrudeOriginWorld = null;
      faceExtrudeStartDistance = 0;
      faceExtrudeStartOperation = "add";
      pendingEdgeTreatmentRadius = null;
      edgeTreatmentOriginWorld = null;
      edgeTreatmentAxisWorld = null;
      edgeTreatmentPointerOffset = 0;
      pendingRevolveAngle = null;
      revolveOriginWorld = null;
      revolveAxisWorld = null;
      revolveReferenceWorld = null;
      revolveStartAngle = 0;
      revolvePointerAngle = 0;
      revolveAccumulatedAngle = 0;
      disposeTemporaryLineGroup(revolveGuide);
      revolveGuide = null;
      revolveGuideHighlight = null;
      revolveGuideScale = 1;
      pendingDistanceParameter = null;
      distanceOriginWorld = null;
      distanceDirectionWorld = null;
      distancePointerOffset = 0;
      shapeParameterPreviewRef.current = null;
      shapeParameterStartValue = 0;
      shapeParameterWorldScale = 1;
      signedHeightBaseCoordinate = 0;
      parameterPointerOffset = 0;
      parameterWorldToLocal = null;
      pendingOrigin = null;
      pendingAxisMove = null;
      originDragAxis = null;
      originDragStart = null;
      originPointerStart = null;
      originDragMarker = null;
      axisMoveRootStart = null;
      rotationDragMarker = null;
      rotationStartQuaternion = null;
      rotationPlaneAxis = null;
      rotationStartVector = null;
      rotationGuideReferenceVector = null;
      rotationCenterWorld = null;
      disposeTemporaryLineGroup(rotationGuide);
      disposeTemporaryLineGroup(rotationPreview);
      rotationGuide = null;
      rotationGuideHighlight = null;
      rotationPreview = null;
      rotationGuideScale = 1;
      pendingRotation = null;
      sketchPreviewRoot = null;
      sketchPreviewStartWorldPosition = null;
      sketchPreviewStartWorldQuaternion = null;
      resizeStart = null;
      resizeRootStart = null;
      requestRender();
    };
    const leaveManipulatorArea = () => {
      pendingHoverEvent = null;
      setOriginHandleHover(null);
      setShapeParameterHandleHover(null);
      setFaceExtrudeHandleHover(false);
      setEdgeTreatmentHandleHover(false);
      if (workplaneFaceSelectionRef.current || topologyFaceSelectionRef.current || topologyEdgeSelectionRef.current) {
        faceHighlight.visible = false;
        edgeHighlight.visible = false;
        renderer.domElement.style.cursor = "default";
        requestRender();
      }
      if (interaction || dimensionHoverTimerRef.current !== null) return;
      dimensionHoverTimerRef.current = window.setTimeout(() => {
        dimensionHoverTimerRef.current = null;
        replaceHoverDimensions([]);
      }, 350);
    };
    const onTrackpadWheel = (event: WheelEvent) => {
      // Pinch gestures arrive as Ctrl+wheel in Chromium/WebKit. Leave those,
      // as well as stepped physical mouse wheels, to OrbitControls' zoom.
      if (event.ctrlKey || event.metaKey) return;
      const verticalStep = Math.abs(event.deltaY);
      const looksLikeSteppedWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL
        || Math.abs(event.deltaX) < 0.5
        || (Number.isInteger(event.deltaY) && verticalStep >= 40);
      const continuousDelta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
        && !looksLikeSteppedWheel;
      if (!continuousDelta) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) {
        const height = Math.max(1, renderer.domElement.clientHeight);
        const distance = camera.position.distanceTo(controls.target);
        const worldPerPixel = camera instanceof THREE.OrthographicCamera
          ? (camera.top - camera.bottom) / Math.max(0.0001, camera.zoom) / height
          : 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / height;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const offset = right.multiplyScalar(event.deltaX * worldPerPixel).add(up.multiplyScalar(-event.deltaY * worldPerPixel));
        camera.position.add(offset);
        controls.target.add(offset);
      } else {
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta -= event.deltaX * 0.006;
        spherical.phi -= event.deltaY * 0.006;
        spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        camera.lookAt(controls.target);
      }
      controls.update();
      requestRender();
    };
    renderer.domElement.addEventListener("wheel", onTrackpadWheel, { capture: true, passive: false });
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
      edgeHighlightMaterial.resolution.set(width, height);
      for (const cached of objectRenderCacheRef.current.values()) {
        const material = cached.wireframeEdges.material;
        if (material instanceof LineMaterial) material.resolution.set(width, height);
      }
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
      controls.removeEventListener("start", onControlsStart);
      if (cameraTransitionRef.current !== null) cancelAnimationFrame(cameraTransitionRef.current);
      cameraTransitionRef.current = null;
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("wheel", onTrackpadWheel, { capture: true });
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", leaveManipulatorArea);
      renderer.domElement.removeEventListener("pointerup", stopDragging);
      renderer.domElement.removeEventListener("pointercancel", cancelDragging);
      for (const cached of objectRenderCacheRef.current.values()) disposeCachedObjectRender(modelGroup, cached);
      objectRenderCacheRef.current.clear();
      delete window.educadParametricPerf;
      renderer.dispose();
      renderer.domElement.remove();
      if (dimensionHoverTimerRef.current !== null) window.clearTimeout(dimensionHoverTimerRef.current);
      disposeTemporaryLineGroup(rotationGuide);
      disposeTemporaryLineGroup(rotationPreview);
      disposeTemporaryLineGroup(revolveGuide);
      clearObjectOriginLayer(originLayer);
      clearTopologyFaceHighlights();
      faceHighlight.geometry.dispose();
      (faceHighlight.material as THREE.Material).dispose();
      edgeHighlight.geometry.dispose();
      (edgeHighlight.material as THREE.Material).dispose();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      projectionChangeRef.current = null;
      modelRef.current = null;
      originLayerRef.current = null;
      workplaneRef.current = null;
      workplaneSelectionPlanesRef.current = null;
      sketchLayerRef.current = null;
      faceHighlightRef.current = null;
      edgeHighlightRef.current = null;
      topologyFaceLayerRef.current = null;
      faceExtrudeHandleRef.current = null;
      edgeTreatmentHandleRef.current = null;
      revolveHandleRef.current = null;
      distanceHandleRef.current = null;
      [dimensionXRef.current, dimensionYRef.current, dimensionZRef.current].forEach((label) => { if (label) label.style.display = "none"; });
      invalidateRef.current = () => undefined;
    };
  }, [displayUnit, locale, renderQuality, shadingMode]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const displayed = (annotations ?? []).map((annotation) => {
      const shown = annotationPreview?.id === annotation.id ? annotationPreview : annotation;
      return shown.kind === "text" && shown.id === editingAnnotationId ? { ...shown, text: "" } : shown;
    });
    if (annotationPreview && !displayed.some((annotation) => annotation.id === annotationPreview.id)) displayed.push(annotationPreview);
    const layer = createAnnotationScene(displayed, displayUnit, selectedAnnotationId);
    layer.group.visible = annotationsVisible;
    annotationLayerRef.current = layer.group;
    model.add(layer.group);
    invalidateRef.current();
    return () => { if (annotationLayerRef.current === layer.group) annotationLayerRef.current = null; layer.dispose(); invalidateRef.current(); };
  }, [annotations, annotationsVisible, annotationPreview, selectedAnnotationId, editingAnnotationId, displayUnit, locale, renderQuality, shadingMode]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || !alignmentActive) return;
    const { group, pickMeshes } = createAlignmentOverlay(alignmentTargets, alignmentReference);
    model.add(group);
    alignmentOverlayRef.current = group;
    alignmentPickMeshesRef.current = pickMeshes;
    invalidateRef.current();
    return () => {
      disposeAlignmentOverlay(group);
      alignmentOverlayRef.current = null;
      alignmentPickMeshesRef.current = [];
      invalidateRef.current();
    };
  }, [alignmentActive, alignmentTargets, alignmentReference, displayUnit, locale, renderQuality, shadingMode]);

  useEffect(() => {
    projectionChangeRef.current?.(projection);
  }, [projection]);

  useEffect(() => {
    const layer = workplaneSelectionPlanesRef.current;
    if (!layer) return;
    layer.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    });
    layer.clear();
    if (!workplaneFaceSelection) {
      invalidateRef.current();
      return;
    }
    const side = Math.max(
      Math.max(0.1, workplane.gridStep) * 2,
      Math.min(Math.max(1, workplane.width), Math.max(1, workplane.depth)) * workplane.activeSizePercent / 100,
    );
    const addStandardPlane = (plane: "XY" | "XZ" | "YZ", color: string, rotation: THREE.Euler) => {
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(side, side),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
      );
      surface.name = `${plane} workplane`;
      surface.rotation.copy(rotation);
      surface.renderOrder = 7;
      surface.userData.standardWorkplane = plane;
      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(side, side)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }),
      );
      border.rotation.copy(rotation);
      border.renderOrder = 8;
      layer.add(surface, border);
    };
    addStandardPlane("XY", "#729ed8", new THREE.Euler(0, 0, 0));
    addStandardPlane("XZ", "#72bf78", new THREE.Euler(Math.PI / 2, 0, 0));
    addStandardPlane("YZ", "#dd7777", new THREE.Euler(0, Math.PI / 2, 0));
    invalidateRef.current();
  }, [workplane.activeSizePercent, workplane.depth, workplane.gridStep, workplane.width, workplaneFaceSelection]);

  useEffect(() => {
    const layer = faceExtrudeHandleRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      child.traverse((item) => {
        if (!(item instanceof THREE.Mesh || item instanceof THREE.Line)) return;
        item.geometry.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      });
    }
    if (!faceExtrudeHandle || !parameterHandlesVisible) {
      invalidateRef.current();
      return;
    }
    const origin = new THREE.Vector3(faceExtrudeHandle.origin.x, faceExtrudeHandle.origin.y, faceExtrudeHandle.origin.z);
    const sign = faceExtrudeHandle.operation === "cut" ? -1 : 1;
    const direction = new THREE.Vector3(faceExtrudeHandle.normal.x, faceExtrudeHandle.normal.y, faceExtrudeHandle.normal.z).normalize().multiplyScalar(sign);
    const end = origin.clone().addScaledVector(direction, faceExtrudeHandle.distance + 2);
    const guide = yellowManipulatorLine(origin, end, 0xf0b83f);
    guide.userData.faceExtrudeGuide = true;
    guide.renderOrder = 31;
    const handle = new THREE.Mesh(new THREE.SphereGeometry(1.0625, 18, 12), new THREE.MeshBasicMaterial({ color: 0xf0b83f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    handle.position.copy(end);
    handle.userData.faceExtrudeHandle = true;
    handle.userData.yellowManipulatorBaseRadius = 1.0625;
    handle.userData.yellowManipulatorDiameterPixels = 28;
    handle.renderOrder = 32;
    addYellowManipulatorOutline(handle, 1.0625);
    layer.userData.origin = origin;
    layer.userData.direction = direction;
    layer.userData.distance = faceExtrudeHandle.distance;
    layer.userData.operation = faceExtrudeHandle.operation;
    layer.add(guide, handle);
    invalidateRef.current();
  }, [faceExtrudeHandle, parameterHandlesVisible]);

  useEffect(() => {
    const layer = edgeTreatmentHandleRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      child.traverse((item) => {
        if (!(item instanceof THREE.Mesh || item instanceof THREE.Line)) return;
        item.geometry.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      });
    }
    if (!edgeTreatmentHandle || !parameterHandlesVisible) {
      invalidateRef.current();
      return;
    }
    layer.position.set(edgeTreatmentHandle.origin.x, edgeTreatmentHandle.origin.y, edgeTreatmentHandle.origin.z);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3(edgeTreatmentHandle.radius + 4, 0, 0);
    const guide = yellowManipulatorLine(start, end, 0xf0b83f);
    guide.userData.edgeTreatmentRadiusGuide = true;
    guide.renderOrder = 31;
    const handle = new THREE.Mesh(new THREE.SphereGeometry(1.7, 18, 12), new THREE.MeshBasicMaterial({ color: 0xf0b83f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    handle.position.copy(end);
    handle.userData.edgeTreatmentRadiusHandle = true;
    handle.userData.yellowManipulatorBaseRadius = 1.7;
    handle.userData.yellowManipulatorDiameterPixels = 28;
    handle.renderOrder = 32;
    addYellowManipulatorOutline(handle, 1.7);
    const target = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    target.position.copy(end);
    target.userData.edgeTreatmentRadiusTarget = true;
    target.userData.yellowManipulatorBaseRadius = 5;
    target.userData.yellowManipulatorDiameterPixels = 68;
    layer.userData.radius = edgeTreatmentHandle.radius;
    layer.add(guide, handle, target);
    invalidateRef.current();
  }, [edgeTreatmentHandle, parameterHandlesVisible]);

  useEffect(() => {
    const layer = revolveHandleRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      child.traverse((item) => {
        if (!(item instanceof THREE.Mesh || item instanceof THREE.Line)) return;
        item.geometry.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      });
    }
    if (!revolveHandle || !parameterHandlesVisible) {
      invalidateRef.current();
      return;
    }
    const axis = new THREE.Vector3(revolveHandle.axis.x, revolveHandle.axis.y, revolveHandle.axis.z).normalize();
    layer.position.set(revolveHandle.origin.x, revolveHandle.origin.y, revolveHandle.origin.z);
    layer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    const radius = Math.max(6, revolveHandle.radius);
    const arc = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 0xd6a600, linewidth: 2, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    updateRevolveAngleArc(arc, radius, revolveHandle.angle);
    arc.userData.revolveAngleArc = true;
    arc.renderOrder = 31;
    const radians = THREE.MathUtils.degToRad(revolveHandle.angle);
    const end = new THREE.Vector3(Math.cos(radians) * radius, Math.sin(radians) * radius, 0);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(1.0625, 18, 12), new THREE.MeshBasicMaterial({ color: 0xf0b83f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    handle.position.copy(end);
    handle.userData.revolveAngleHandle = true;
    handle.userData.yellowManipulatorBaseRadius = 1.0625;
    handle.userData.yellowManipulatorDiameterPixels = 28;
    handle.renderOrder = 32;
    addYellowManipulatorOutline(handle, 1.0625);
    const target = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    target.position.copy(end);
    target.userData.revolveAngleTarget = true;
    target.userData.yellowManipulatorBaseRadius = 4;
    target.userData.yellowManipulatorDiameterPixels = 56;
    layer.userData.angle = revolveHandle.angle;
    layer.userData.radius = radius;
    layer.add(arc, handle, target);
    invalidateRef.current();
  }, [parameterHandlesVisible, revolveHandle]);

  useEffect(() => {
    const layer = distanceHandleRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      child.traverse((item) => {
        if (!(item instanceof THREE.Mesh || item instanceof THREE.Line)) return;
        item.geometry.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      });
    }
    if (!distanceHandle || !parameterHandlesVisible) {
      invalidateRef.current();
      return;
    }
    const origin = new THREE.Vector3(distanceHandle.origin.x, distanceHandle.origin.y, distanceHandle.origin.z);
    const direction = new THREE.Vector3(distanceHandle.direction.x, distanceHandle.direction.y, distanceHandle.direction.z).normalize();
    const valueScale = Math.max(1e-8, distanceHandle.valueScale ?? 1);
    const offset = distanceHandle.offset ?? 2;
    const end = origin.clone().addScaledVector(direction, distanceHandle.value * valueScale + offset);
    const guide = yellowManipulatorLine(origin, end, 0xf0b83f);
    guide.userData.distanceParameterGuide = true;
    guide.renderOrder = 31;
    const handle = new THREE.Mesh(new THREE.SphereGeometry(1.0625, 18, 12), new THREE.MeshBasicMaterial({ color: 0xf0b83f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    handle.position.copy(end);
    handle.userData.distanceParameterHandle = true;
    handle.userData.yellowManipulatorBaseRadius = 1.0625;
    handle.userData.yellowManipulatorDiameterPixels = 28;
    handle.renderOrder = 32;
    addYellowManipulatorOutline(handle, 1.0625);
    const target = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    target.position.copy(end);
    target.userData.distanceParameterTarget = true;
    target.userData.yellowManipulatorBaseRadius = 4;
    target.userData.yellowManipulatorDiameterPixels = 56;
    layer.userData.origin = origin;
    layer.userData.direction = direction;
    layer.userData.value = distanceHandle.value;
    layer.userData.valueScale = valueScale;
    layer.userData.offset = offset;
    layer.userData.min = distanceHandle.min ?? 0.01;
    layer.userData.max = distanceHandle.max ?? Infinity;
    layer.add(guide, handle, target);
    invalidateRef.current();
  }, [parameterHandlesVisible, distanceHandle]);

  useEffect(() => {
    const layer = originLayerRef.current;
    if (!layer) return;
    clearObjectOriginLayer(layer);
    for (const origin of objectOrigins) {
      if (!origin.visible) continue;
      const marker = objectOriginMarker(origin.objectId, origin.objectId === editableOriginId, "object", origin.positionVisible !== false, origin.rotationEditable && origin.objectId !== editableOriginId);
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
      const marker = objectOriginMarker(origin.featureId, false, "feature", origin.positionVisible !== false, origin.rotationEditable);
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
  }, [editableOriginId, objectOrigins, operationOrigins, projection, renderQuality, shadingMode]);

  useEffect(() => {
    const annotation = annotationPreview?.id === selectedAnnotationId ? annotationPreview : annotations?.find((item) => item.id === selectedAnnotationId);
    const marker = originLayerRef.current?.children.find((item) => item.userData.transformTargetId === selectedAnnotationId);
    if (!marker || !annotation) return;
    const point = annotation.kind === "text" ? annotation.position : selectedAnnotationEndpoint ? annotation[selectedAnnotationEndpoint] : null;
    if (!point) return;
    marker.position.set(point.x, point.y, point.z);
    invalidateRef.current();
  }, [annotationPreview, annotations, selectedAnnotationId, selectedAnnotationEndpoint, objectOrigins]);

  useEffect(() => {
    const group = workplaneRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;
    projectBandRef.current = null;
    projectRenameButtonRef.current = null;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        const disposeMaterial = (material: THREE.Material) => {
          if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
          material.dispose();
        };
        if (Array.isArray(child.material)) child.material.forEach(disposeMaterial); else disposeMaterial(child.material);
      }
    });
    group.clear();
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);

    const width = Math.max(1, workplane.width);
    const depth = Math.max(1, workplane.depth);
    const requestedStep = Math.max(0.1, workplane.gridStep);
    const addGrid = (target: THREE.Group, gridWidth: number, gridDepth: number, yellow = false) => {
      const step = Math.max(requestedStep, Math.max(gridWidth, gridDepth) / 1000);
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(gridWidth, gridDepth),
        workplaneMaterial(renderQuality, shadingMode, yellow ? "#ffe99a" : "#ddf8ff", yellow ? 0.3 : 0.68),
      );
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = yellow ? 0.015 : -0.08;
      surface.renderOrder = yellow ? -1 : -2;
      surface.receiveShadow = !yellow && shadingMode !== "noShadows";
      surface.userData.globalWorkplaneElement = !yellow;
      target.add(surface);
      const minor: number[] = [];
      const major: number[] = [];
      const xAxis: number[] = [];
      const yAxis: number[] = [];
      const border: number[] = [];
      const pushLine = (values: number[], x1: number, z1: number, x2: number, z2: number) => values.push(x1, 0, z1, x2, 0, z2);
      const halfWidth = gridWidth / 2;
      const halfDepth = gridDepth / 2;
      for (let index = -Math.floor(halfWidth / step); index <= Math.floor(halfWidth / step); index += 1) {
        const x = index * step;
        if (index === 0) pushLine(yAxis, x, -halfDepth, x, halfDepth); else pushLine(index % 5 === 0 ? major : minor, x, -halfDepth, x, halfDepth);
      }
      for (let index = -Math.floor(halfDepth / step); index <= Math.floor(halfDepth / step); index += 1) {
        const z = index * step;
        if (index === 0) pushLine(xAxis, -halfWidth, z, halfWidth, z); else pushLine(index % 5 === 0 ? major : minor, -halfWidth, z, halfWidth, z);
      }
      pushLine(border, -halfWidth, -halfDepth, halfWidth, -halfDepth);
      pushLine(border, halfWidth, -halfDepth, halfWidth, halfDepth);
      pushLine(border, halfWidth, halfDepth, -halfWidth, halfDepth);
      pushLine(border, -halfWidth, halfDepth, -halfWidth, -halfDepth);
      const palette = yellow ? ["#ffeaa0", "#efc83e", "#c38c00"] : ["#91dff0", "#4bbddf", "#58c5e6"];
      [minor, major, border].forEach((values, index) => {
        if (values.length === 0) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: palette[index], transparent: true, opacity: [0.55, 0.7, 0.9][index], depthWrite: false }));
        lines.position.y = 0.025;
        lines.renderOrder = yellow ? 0 : -1;
        lines.userData.globalWorkplaneElement = !yellow;
        target.add(lines);
      });
      [[xAxis, yellow ? "#d9a900" : "#c67676"], [yAxis, yellow ? "#d9a900" : "#62946e"]].forEach(([values, color]) => {
        if (!Array.isArray(values) || values.length === 0) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: color as string, transparent: true, opacity: 0.95, depthWrite: false }));
        lines.position.y = 0.03;
        lines.renderOrder = yellow ? 0 : 1;
        lines.userData.globalWorkplaneElement = !yellow;
        target.add(lines);
      });
      if (!yellow) {
        const length = Math.min(gridWidth, gridDepth) * 0.09;
        const head = length * 0.18;
        const headOffset = head * 0.12;
        const originX = -halfWidth;
        const originZ = halfDepth;
        const addAxisArrow = (color: string, shaft: number[]) => {
          const lineGeometry = new LineSegmentsGeometry();
          lineGeometry.setPositions(shaft);
          const lineMaterial = new LineMaterial({ color, linewidth: 3, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false });
          lineMaterial.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
          const line = new LineSegments2(lineGeometry, lineMaterial);
          const headGeometry = new THREE.ConeGeometry(head * 0.44 * 0.8, head, 12);
          const headMesh = new THREE.Mesh(headGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false }));
          line.position.y = 0.055;
          const start = new THREE.Vector3(shaft[0], shaft[1], shaft[2]);
          const end = new THREE.Vector3(shaft[3], shaft[4], shaft[5]);
          const direction = end.clone().sub(start).normalize();
          headMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
          headMesh.position.copy(end).addScaledVector(direction, headOffset - head / 2);
          headMesh.position.y += 0.055;
          line.renderOrder = 100;
          headMesh.renderOrder = 100;
          target.add(line, headMesh);
        };
        addAxisArrow("#d83b3b", [
          originX, 0, originZ, originX + length, 0, originZ,
        ]);
        addAxisArrow("#319653", [
          originX, 0, originZ, originX, 0, originZ - length,
        ]);
        addAxisArrow("#3279d6", [
          originX, 0, originZ, originX, length, originZ,
        ]);
        const bandDepth = Math.min(15, gridDepth);
        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = 2048;
        labelCanvas.height = Math.max(128, Math.round(2048 * bandDepth / gridWidth));
        const context = labelCanvas.getContext("2d");
        if (context) {
          context.fillStyle = "#dfebee";
          context.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
          context.fillStyle = "#afbfc3";
          context.font = `700 ${Math.round(labelCanvas.height * 0.42)}px Inter, Arial, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(projectName, labelCanvas.width / 2, labelCanvas.height / 2, labelCanvas.width * 0.9);
          const texture = new THREE.CanvasTexture(labelCanvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          const label = new THREE.Mesh(new THREE.PlaneGeometry(gridWidth, bandDepth), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
          label.rotation.x = -Math.PI / 2;
          // Scene Z is the inverse of CAD Y: place the band beyond Y minimum,
          // so it does not consume any of the editable ground plane.
          label.position.set(0, 0.04, halfDepth + bandDepth / 2);
          label.renderOrder = 1;
          label.userData.globalWorkplaneElement = true;
          label.userData.renameAnchorX = Math.min(context.measureText(projectName).width, labelCanvas.width * 0.9) / labelCanvas.width * gridWidth / 2;
          projectBandRef.current = label;
          target.add(label);
          const buttonSize = bandDepth * 0.56;
          // Paint the background and SVG into one texture: two nearly coplanar
          // surfaces can hide the pencil at some camera angles/depth ranges.
          const buttonCanvas = document.createElement("canvas");
          buttonCanvas.width = buttonCanvas.height = 256;
          const buttonContext = buttonCanvas.getContext("2d")!;
          const buttonTexture = new THREE.CanvasTexture(buttonCanvas);
          buttonTexture.colorSpace = THREE.SRGBColorSpace;
          buttonTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          const button = new THREE.Mesh(new THREE.PlaneGeometry(buttonSize, buttonSize), new THREE.MeshBasicMaterial({ map: buttonTexture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
          // The band is also transparent. Draw this overlay after it so the
          // band cannot cover the pencil when its white background is removed.
          button.renderOrder = 20;
          button.rotation.x = -Math.PI / 2;
          button.position.set(label.userData.renameAnchorX + buttonSize * 0.65, 0.06, label.position.z);
          button.visible = false;
          let icon: HTMLImageElement | null = null;
          let hovered = false;
          const redraw = () => {
            buttonContext.clearRect(0, 0, 256, 256);
            if (hovered) {
              buttonContext.fillStyle = "rgba(0, 0, 0, 0.05)";
              buttonContext.beginPath();
              buttonContext.roundRect(0, 0, 256, 256, 36);
              buttonContext.fill();
            }
            if (icon) buttonContext.drawImage(icon, 26, 26, 204, 204);
            buttonTexture.needsUpdate = true;
            invalidateRef.current();
          };
          button.userData.setHovered = (value: boolean) => {
            if (value === hovered) return;
            hovered = value;
            redraw();
          };
          new THREE.ImageLoader().load("/assets/educad/operations/edit-project-ground.svg", (image) => {
            if (projectRenameButtonRef.current !== button) return;
            icon = image;
            redraw();
          });
          target.add(button);
          projectRenameButtonRef.current = button;
        }
      }
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
    groundOpacityDirtyRef.current = true;
    invalidateRef.current();
  }, [projectName, projection, renderQuality, shadingMode, workplane.activeSizePercent, workplane.depth, workplane.gridStep, workplane.gridVisible, workplane.normal.x, workplane.normal.y, workplane.normal.z, workplane.origin.x, workplane.origin.y, workplane.origin.z, workplane.width, workplane.xAxis.x, workplane.xAxis.y, workplane.xAxis.z, workplane.yAxis.x, workplane.yAxis.y, workplane.yAxis.z]);

  useEffect(() => {
    const layer = sketchLayerRef.current;
    const renderer = rendererRef.current;
    if (!layer || !renderer) return;
    const clearLayer = () => layer.traverse((child) => {
      if (!(child instanceof LineSegments2)) return;
      child.geometry.dispose();
      child.material.dispose();
    });
    clearLayer();
    layer.clear();
    for (const overlay of sketchOverlays) {
      const positions = sketchOverlayPositions(overlay.feature);
      if (positions.length === 0) continue;
      const objectRoot = new THREE.Group();
      if (overlay.object) {
        objectRoot.position.set(overlay.object.transform.position.x, overlay.object.transform.position.y, overlay.object.transform.position.z);
        objectRoot.rotation.set(
          THREE.MathUtils.degToRad(overlay.object.transform.rotation.x),
          THREE.MathUtils.degToRad(overlay.object.transform.rotation.y),
          THREE.MathUtils.degToRad(overlay.object.transform.rotation.z),
          "ZYX",
        );
        objectRoot.scale.set(overlay.object.transform.scale.x, overlay.object.transform.scale.y, overlay.object.transform.scale.z);
      }
      const sketchRoot = new THREE.Group();
      sketchRoot.userData.sketchFeatureId = overlay.feature.id;
      sketchRoot.userData.sketchTransformRoot = true;
      sketchRoot.position.set(overlay.feature.x, overlay.feature.y, overlay.feature.offset);
      sketchRoot.rotation.set(
        THREE.MathUtils.degToRad(overlay.feature.rotation.x),
        THREE.MathUtils.degToRad(overlay.feature.rotation.y),
        THREE.MathUtils.degToRad(overlay.feature.rotation.z),
        "ZYX",
      );
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({
        color: overlay.selected ? "#f08036" : "#087fa4",
        linewidth: overlay.selected ? 2.4 : 1.6,
        transparent: true,
        opacity: overlay.selected ? 1 : 0.82,
        depthTest: true,
        depthWrite: false,
      });
      material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
      const drawing = new LineSegments2(geometry, material);
      drawing.renderOrder = 19;
      drawing.userData.sketchFeatureId = overlay.feature.id;
      drawing.userData.objectId = overlay.object?.id;
      drawing.userData.editorPickable = Boolean(overlay.object && overlay.object.visible !== false && !overlay.object.locked);
      sketchRoot.add(drawing);
      objectRoot.add(sketchRoot);
      layer.add(objectRoot);
    }
    invalidateRef.current();
    return () => {
      clearLayer();
      layer.clear();
    };
  }, [projection, renderQuality, shadingMode, sketchOverlays]);

  useEffect(() => {
    const group = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;
    const renderItems = objectRecords.length > 0
      // Mesh records can outlive color edits because recoloring does not rebuild
      // geometry. Always use the current document color when reusing a mesh.
      ? objectRecords.map((item) => ({ mesh: item.mesh, color: objectColors?.[item.objectId] ?? item.color, objectId: item.objectId as string | null, renderId: item.renderId, geometryFingerprint: item.geometryFingerprint, reference: item.reference }))
      : mesh ? [{ mesh, color, objectId: null, renderId: "combined", geometryFingerprint: null, reference: undefined }] : [];
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
        cached.referenceDisplayMode = item.reference?.displayMode;
        cached.body.visible = displayMode === "solid" && item.objectId !== isolatedHistoryObjectIdRef.current && item.reference?.displayMode !== "wireframe";
        cached.edges.visible = displayMode === "solid" && Boolean(item.objectId && selectedObjectIds.includes(item.objectId)) && item.reference?.displayMode !== "solid";
        cached.wireframeEdges.visible = displayMode === "wireframe";
        cached.body.userData.editorPickable = item.reference?.pickable ?? true;
        const materials = Array.isArray(cached.body.material) ? cached.body.material : [cached.body.material];
        for (const material of materials) setMaterialColor(material, item.color);
        const wireframeMaterials = Array.isArray(cached.wireframeEdges.material) ? cached.wireframeEdges.material : [cached.wireframeEdges.material];
        for (const material of wireframeMaterials) setMaterialColor(material, item.color);
        continue;
      }
      if (cached) disposeCachedObjectRender(group, cached);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(item.mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(item.mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(item.mesh.indices, 1));
      geometry.userData.faceGroups = item.mesh.faceGroups ?? [];
      geometry.computeBoundingSphere();
      // Preserve the OpenCascade index order because faceGroups address exact
      // index ranges. The default BVH build reorders the index buffer.
      geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
      const body = new THREE.Mesh(
        geometry,
        item.reference ? referenceMaterial(renderQuality, shadingMode, item.color, item.reference.opacity) : objectMaterial(renderQuality, shadingMode, item.color),
      );
      body.raycast = acceleratedRaycast;
      body.castShadow = shadingMode !== "noShadows";
      // Full shadows include object-to-object and self-shadowing. Basic shadows
      // remain a lightweight grounding cue rendered only on the workplane.
      body.receiveShadow = shadingMode === "shadows";
      if (item.objectId) body.userData.objectId = item.objectId;
      body.userData.editorPickable = item.reference?.pickable ?? true;
      body.userData.renderId = item.renderId;
      body.visible = displayMode === "solid" && item.objectId !== isolatedHistoryObjectIdRef.current;
      group.add(body);

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(item.mesh.edges, 3));
      edgeGeometry.userData.edgeGroups = item.mesh.edgeGroups ?? [];
      const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
        color: "#000000",
        linewidth: 1,
        depthTest: true,
      }));
      if (item.objectId) edges.userData.objectId = item.objectId;
      edges.userData.renderId = item.renderId;
      edges.userData.finalReferenceWireframe = true;
      edges.renderOrder = 17;
      edges.visible = displayMode === "solid" && Boolean(item.objectId && selectedObjectIds.includes(item.objectId));
      const wireframeGeometry = new LineSegmentsGeometry();
      wireframeGeometry.setPositions(item.mesh.edges);
      const wireframeMaterial = new LineMaterial({ color: item.color, linewidth: 2, depthTest: true });
      wireframeMaterial.resolution.set(Math.max(1, rendererRef.current?.domElement.clientWidth ?? 1), Math.max(1, rendererRef.current?.domElement.clientHeight ?? 1));
      const wireframeEdges = new LineSegments2(wireframeGeometry, wireframeMaterial);
      wireframeEdges.visible = displayMode === "wireframe";
      wireframeEdges.renderOrder = 17;
      if (item.reference) {
        body.visible = displayMode === "solid" && item.reference.displayMode !== "wireframe" && item.objectId !== isolatedHistoryObjectIdRef.current;
        edges.visible = displayMode === "solid" && Boolean(item.objectId && selectedObjectIds.includes(item.objectId)) && item.reference.displayMode !== "solid";
      }
      group.add(edges, wireframeEdges);
      objectRenderCacheRef.current.set(key, { geometryFingerprint: item.geometryFingerprint, body, edges, wireframeEdges, referenceDisplayMode: item.reference?.displayMode });
      resourcesChanged = true;
    }

    if (resourcesChanged && rendererRef.current) rendererRef.current.shadowMap.needsUpdate = true;

    if (!hasFittedRef.current) {
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      controls.target.copy(center);
      const distance = Math.max(55, Math.max(size.x, size.y, size.z) * 2.35);
      camera.position.copy(center).add(new THREE.Vector3(-distance, distance * 0.72, distance));
      // Perspective needs enough separation between near and far to retain
      // depth precision; an almost-zero near plane causes z-fighting.
      camera.near = camera instanceof THREE.OrthographicCamera ? -Math.max(2000, distance * 50) : Math.max(0.05, distance / 2000);
      camera.far = Math.max(2000, distance * 50);
      if (camera instanceof THREE.OrthographicCamera) camera.zoom = Math.min(8, Math.max(0.1, 110 / Math.max(size.x, size.y, size.z, 1)));
      camera.updateProjectionMatrix();
      controls.update();
      hasFittedRef.current = true;
    }
    invalidateRef.current();
  }, [mesh, objectRecords, objectColors, color, displayMode, projection, renderQuality, selectedObjectIds, shadingMode]);

  useEffect(() => {
    const group = modelRef.current;
    if (!group) return;
    const previous = batchedSolidEdgesRef.current;
    if (previous) {
      group.remove(previous);
      previous.geometry.dispose();
      const materials = Array.isArray(previous.material) ? previous.material : [previous.material];
      materials.forEach((material) => material.dispose());
      batchedSolidEdgesRef.current = null;
    }
    if (displayMode !== "solid") {
      invalidateRef.current();
      return;
    }
    const selectedIds = new Set(selectedObjectIds);
    const renderItems = objectRecords.length > 0
      ? objectRecords
          .filter((item) => item.objectId !== isolatedHistoryObjectId && !selectedIds.has(item.objectId) && item.reference?.displayMode !== "solid")
          .map((item) => item.mesh.edges)
      : mesh ? [mesh.edges] : [];
    const coordinateCount = renderItems.reduce((total, positions) => total + positions.length, 0);
    if (coordinateCount === 0) {
      invalidateRef.current();
      return;
    }
    const positions = new Float32Array(coordinateCount);
    let offset = 0;
    for (const item of renderItems) {
      positions.set(item, offset);
      offset += item.length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const batchedEdges = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#000000", linewidth: 1, depthTest: true }));
    batchedEdges.renderOrder = 17;
    group.add(batchedEdges);
    batchedSolidEdgesRef.current = batchedEdges;
    invalidateRef.current();
    return () => {
      if (batchedSolidEdgesRef.current !== batchedEdges) return;
      group.remove(batchedEdges);
      geometry.dispose();
      const materials = Array.isArray(batchedEdges.material) ? batchedEdges.material : [batchedEdges.material];
      materials.forEach((material) => material.dispose());
      batchedSolidEdgesRef.current = null;
    };
  }, [displayMode, isolatedHistoryObjectId, mesh, objectRecords, selectedObjectIds]);

  useEffect(() => {
    const layer = topologyFaceLayerRef.current;
    const renderer = rendererRef.current;
    if (!layer || !renderer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      child.traverse((item) => {
        if (!(item instanceof THREE.Mesh || item instanceof THREE.LineSegments || item instanceof LineSegments2)) return;
        item.geometry.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      });
    }
    const interactiveTopologySelection = topologyFaceSelection || topologyEdgeSelection;
    const displayedSelections = interactiveTopologySelection ? topologySelections : historicalTopologySelections;
    for (const reference of displayedSelections) {
      const cached = objectRenderCacheRef.current.get(reference.objectId);
      const sourceRecord = historicalTopologyRecords.find((record) => record.objectId === reference.objectId);
      const topologyId = reference.reference.hint.topologyId;
      if ((!cached && !sourceRecord) || topologyId === undefined) continue;
      if (reference.reference.hint.entityType === "face") {
        const faceHint = reference.reference.hint;
        const geometry = cached?.body.geometry;
        const positions = sourceRecord?.mesh.positions ?? geometry?.getAttribute("position")?.array;
        const indices = sourceRecord?.mesh.indices ?? geometry?.getIndex()?.array;
        const groups = sourceRecord?.mesh.faceGroups ?? geometry?.userData.faceGroups as ViewportFaceGroup[] | undefined;
        const group = groups?.find((candidate) => candidate.faceId === topologyId && (faceHint.originId === undefined || candidate.origin === faceHint.originId));
        if (!positions || !indices || !groups || !group) continue;
        const region = exactFaceRegion(positions, indices, group.start / 3, groups);
        if (!region) continue;
        const highlight = new THREE.Group();
        const fillGeometry = new THREE.BufferGeometry();
        fillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(region.positions, 3));
        const fill = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ color: "#43b9e8", transparent: interactiveTopologySelection, opacity: interactiveTopologySelection ? 0.62 : 1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
        fill.renderOrder = 26;
        highlight.userData.topologyFaceKey = `${reference.objectId}:face:${region.faceId}:origin:${region.origin}`;
        highlight.add(fill);
        layer.add(highlight);
      } else {
        const geometry = cached?.edges.geometry;
        const positions = sourceRecord?.mesh.edges ?? geometry?.getAttribute("position")?.array;
        const groups = sourceRecord?.mesh.edgeGroups ?? geometry?.userData.edgeGroups as ViewportEdgeGroup[] | undefined;
        const group = groups?.find((candidate) => candidate.edgeId === topologyId);
        if (!positions || !groups || !group) continue;
        const region = exactEdgeRegion(positions, group.start, groups);
        if (!region) continue;
        const lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(region.positions);
        const material = new LineMaterial({ color: "#43b9e8", linewidth: 2, depthTest: false });
        material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
        const highlight = new LineSegments2(lineGeometry, material);
        highlight.userData.topologyEdgeKey = `${reference.objectId}:edge:${region.edgeId}`;
        highlight.renderOrder = 28;
        layer.add(highlight);
      }
    }
    invalidateRef.current();
  }, [historicalTopologyRecords, historicalTopologySelections, objectRecords, topologyEdgeSelection, topologyFaceSelection, topologySelections]);

  useEffect(() => {
    const group = modelRef.current;
    if (!group) return;
    const selectedIds = new Set(selectedObjectIds);
    for (const [objectId, cached] of objectRenderCacheRef.current) {
      cached.edges.visible = displayMode === "solid" && selectedIds.has(objectId) && cached.referenceDisplayMode !== "solid";
      const materials = Array.isArray(cached.edges.material) ? cached.edges.material : [cached.edges.material];
      for (const material of materials) {
        material.depthTest = finalReferenceWireframeDepthTest(objectId, selectedObjectIds);
        material.needsUpdate = true;
      }
    }
    invalidateRef.current();
  }, [displayMode, selectedObjectIds]);

  useEffect(() => {
    for (const [objectId, cached] of objectRenderCacheRef.current) {
      cached.body.visible = displayMode === "solid" && objectId !== isolatedHistoryObjectId && cached.referenceDisplayMode !== "wireframe";
      cached.edges.visible = displayMode === "solid" && selectedObjectIds.includes(objectId) && cached.referenceDisplayMode !== "solid";
      cached.wireframeEdges.visible = displayMode === "wireframe";
    }
    invalidateRef.current();
  }, [displayMode, isolatedHistoryObjectId, projection, renderQuality, selectedObjectIds, shadingMode]);

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
    for (const [objectId, cached] of objectRenderCacheRef.current) {
      const nextColor = objectColors[objectId];
      if (!nextColor) continue;
      const materials = Array.isArray(cached.wireframeEdges.material) ? cached.wireframeEdges.material : [cached.wireframeEdges.material];
      for (const material of materials) setMaterialColor(material, nextColor);
    }
    invalidateRef.current();
  }, [objectColors, projection, renderQuality, shadingMode]);

  useEffect(() => {
    const group = modelRef.current;
    if (!group) return;
    const previous = operationContextRef.current;
    if (previous) {
      previous.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof LineSegments2)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
      group.remove(previous);
    }
    operationContextRef.current = null;
    if (!operationContext) {
      invalidateRef.current();
      return;
    }
    const contextGroup = new THREE.Group();
    if (displayMode === "solid" && operationContext.opacity > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(operationContext.mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(operationContext.mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(operationContext.mesh.indices, 1));
      const contextBody = new THREE.Mesh(geometry, previewMaterial(renderQuality, shadingMode, operationContext.color, operationContext.opacity));
      contextBody.renderOrder = 16;
      contextGroup.add(contextBody);
    }
    if (operationContext.detailMesh) {
      const detailColor = operationContext.detailColor === "red" ? "#e25353" : "#3fbe78";
      const detailGeometry = new THREE.BufferGeometry();
      detailGeometry.setAttribute("position", new THREE.BufferAttribute(operationContext.detailMesh.positions, 3));
      detailGeometry.setAttribute("normal", new THREE.BufferAttribute(operationContext.detailMesh.normals, 3));
      detailGeometry.setIndex(new THREE.BufferAttribute(operationContext.detailMesh.indices, 1));
      const detailBody = new THREE.Mesh(detailGeometry, new THREE.MeshBasicMaterial({ color: detailColor, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      const detailEdgeGeometry = new LineSegmentsGeometry();
      detailEdgeGeometry.setPositions(operationContext.detailMesh.edges);
      const detailEdgeMaterial = new LineMaterial({ color: detailColor, linewidth: 2, depthTest: false });
      detailEdgeMaterial.resolution.set(Math.max(1, rendererRef.current?.domElement.clientWidth ?? 1), Math.max(1, rendererRef.current?.domElement.clientHeight ?? 1));
      const detailEdges = new LineSegments2(detailEdgeGeometry, detailEdgeMaterial);
      detailBody.renderOrder = 29;
      detailEdges.renderOrder = 30;
      contextGroup.add(detailBody, detailEdges);
    }
    group.add(contextGroup);
    operationContextRef.current = contextGroup;
    invalidateRef.current();
  }, [displayMode, operationContext, projection, renderQuality, shadingMode]);

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
    if (!parameterHandlesVisible) {
      dimensionPinnedRef.current.clear();
      dimensionHoverRef.current.clear();
      [dimensionXRef.current, dimensionYRef.current, dimensionZRef.current].forEach((label) => { if (label) label.style.display = "none"; });
    }
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
      if (displayMode === "solid" && previewStyle.fillOpacity !== null) {
        const previewGeometry = operationPreview.shape === "cylinder"
          ? new THREE.CylinderGeometry(0.5, 0.5, selection.height, 64)
          : operationPreview.shape === "cone"
            ? new THREE.CylinderGeometry(operationPreview.topRadius ?? 0, selection.width / 2, selection.height, 64)
          : operationPreview.shape === "sphere"
            ? new THREE.SphereGeometry(0.5, 64, 32)
            : operationPreview.shape === "roundedBox"
              ? roundedBoxPreviewGeometry(selection.width, selection.depth, selection.height, selection.shapeParameters?.shape === "roundedBox" ? selection.shapeParameters.cornerRadius * Math.min(selection.width / Math.max(0.01, selection.shapeParameters.width), selection.depth / Math.max(0.01, selection.shapeParameters.depth)) : 3)
            : new THREE.BoxGeometry(selection.width, selection.depth, selection.height);
        if (operationPreview.shape === "cylinder") {
          previewGeometry.rotateX(Math.PI / 2);
          previewGeometry.scale(selection.width, selection.depth, 1);
        } else if (operationPreview.shape === "cone") {
          previewGeometry.rotateX(Math.PI / 2);
        } else if (operationPreview.shape === "sphere") {
          previewGeometry.scale(selection.width, selection.depth, selection.height);
        }
        const preview = new THREE.Mesh(previewGeometry, previewMaterial(renderQuality, shadingMode, operationPreview.color, previewStyle.fillOpacity));
        preview.userData.roundedBoxPreviewFill = operationPreview.shape === "roundedBox";
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
          : previewParameters?.shape === "gear"
            ? previewParameters.boreRadius * selection.width / Math.max(0.01, previewParameters.outerRadius)
          : 0;
        const profileInsetWidth = previewParameters?.shape === "gear"
          ? previewParameters.toothDepth * selection.width / Math.max(0.01, previewParameters.outerRadius * 2)
          : 0;
        const radialSegments = previewParameters?.shape === "polygon" ? previewParameters.sides : previewParameters?.shape === "gear" ? previewParameters.teeth : 64;
        const cornerRadius = previewParameters?.shape === "roundedBox" ? previewParameters.cornerRadius * selection.width / Math.max(0.01, previewParameters.width) : 0;
        lineGeometry.setPositions(operationPreviewWireframePositions(operationPreview.shape, selection.width, selection.depth, selection.height, topWidth, innerWidth, profileInsetWidth, radialSegments, cornerRadius));
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
      dragAxis?: "x" | "y" | "z",
      dragSign: 1 | -1 = 1,
    ) => {
      if (!parameterHandlesVisible) return;
      if (selection.parameterHandles && !selection.parameterHandles.includes(parameter)) return;
      const guide = yellowManipulatorLine(start, end, "#d6a600");
      guide.renderOrder = 21;
      guide.userData.shapeParameterVisual = parameter;
      guide.userData.shapeParameterVisualRole = "guide";
      visualRoot.add(guide);
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 18, 12),
        new THREE.MeshBasicMaterial({ color: "#f2c94c", depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }),
      );
      handle.position.copy(end);
      handle.renderOrder = 22;
      handle.userData.shapeParameterVisual = parameter;
      handle.userData.shapeParameterVisualRole = "handle";
      handle.userData.yellowManipulatorBaseRadius = 1.7;
      handle.userData.yellowManipulatorDiameterPixels = 28;
      addYellowManipulatorOutline(handle, 1.7);
      visualRoot.add(handle);
      const target = new THREE.Mesh(
        new THREE.SphereGeometry(5, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
      );
      target.position.copy(end);
      target.userData.shapeParameter = parameter;
      target.userData.dimensionAxis = axis;
      target.userData.shapeParameterDragAxis = dragAxis;
      target.userData.shapeParameterDragSign = dragSign;
      target.userData.hitTargetSize = 10;
      target.userData.shapeParameterVisual = parameter;
      target.userData.shapeParameterVisualRole = "target";
      target.userData.yellowManipulatorBaseRadius = 5;
      target.userData.yellowManipulatorDiameterPixels = 68;
      visualRoot.add(target);
      resizeHitboxesRef.current.push(target);
    };
    const heightDirection = selection.allowNegativeHeight && parameters && "height" in parameters && parameters.height < 0 ? -1 : 1;
    const heightBase = -selection.height / 2 * heightDirection;
    const heightEnd = selection.height / 2 * heightDirection + 3 * heightDirection;
    if (parameters?.shape === "box" || parameters?.shape === "roundedBox") {
      const baseZ = heightBase;
      addParameterHandle("width", "x", new THREE.Vector3(0, 0, baseZ), new THREE.Vector3(selection.width / 2 + 3, 0, baseZ));
      addParameterHandle("depth", "y", new THREE.Vector3(0, 0, baseZ), new THREE.Vector3(0, selection.depth / 2 + 3, baseZ));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, baseZ), new THREE.Vector3(0, 0, heightEnd));
      if (parameters.shape === "roundedBox") {
        const radiusScale = Math.min(selection.width / Math.max(0.01, parameters.width), selection.depth / Math.max(0.01, parameters.depth));
        const worldRadius = parameters.cornerRadius * radiusScale;
        const radiusHandle = roundedBoxRadiusHandlePoints(selection.width, selection.depth, selection.height, worldRadius);
        addParameterHandle("cornerRadius", "x", radiusHandle.start, radiusHandle.end, "x");
      }
    } else if (parameters?.shape === "text") {
      addParameterHandle("size", "y", new THREE.Vector3(0, 0, heightBase), new THREE.Vector3(0, selection.depth / 2 + 3, heightBase), "y");
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, heightBase), new THREE.Vector3(0, 0, heightEnd));
    } else if (parameters?.shape === "pyramid" || parameters?.shape === "wedge" || parameters?.shape === "roof" || parameters?.shape === "roundRoof") {
      const base = -selection.height / 2;
      addParameterHandle("width", "x", new THREE.Vector3(0, 0, base), new THREE.Vector3(selection.width / 2 + 3, 0, base));
      addParameterHandle("depth", "y", new THREE.Vector3(0, 0, base), new THREE.Vector3(0, selection.depth / 2 + 3, base));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, base), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "cylinder") {
      const baseZ = heightBase;
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, baseZ), new THREE.Vector3(selection.width / 2 + 3, 0, baseZ));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, baseZ), new THREE.Vector3(0, 0, heightEnd));
    } else if (parameters?.shape === "sphere") {
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, 0), new THREE.Vector3(selection.width / 2 + 3, 0, 0));
    } else if (parameters?.shape === "polygon") {
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("sides", "y", new THREE.Vector3(0, 0, selection.height / 2), new THREE.Vector3(0, selection.depth / 2 + 3, selection.height / 2), "y");
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "cone") {
      const radialScale = selection.width / Math.max(0.01, parameters.baseRadius * 2);
      const topRadius = parameters.topRadius * radialScale;
      addParameterHandle("baseRadius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("topRadius", "y", new THREE.Vector3(0, 0, selection.height / 2), new THREE.Vector3(topRadius + 3, 0, selection.height / 2));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "tube") {
      const radialScale = selection.width / Math.max(0.01, parameters.outerRadius * 2);
      const innerRadius = parameters.innerRadius * radialScale;
      const outerRadius = parameters.outerRadius * radialScale;
      addParameterHandle("outerRadius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("thickness", "y", new THREE.Vector3(outerRadius, 0, selection.height / 2), new THREE.Vector3(innerRadius, 0, selection.height / 2), "x", -1);
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "gear") {
      const radialScale = selection.width / Math.max(0.01, parameters.outerRadius * 2);
      addParameterHandle("outerRadius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("toothDepth", "x", new THREE.Vector3(selection.width / 2 - parameters.toothDepth * radialScale, 0, selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, selection.height / 2));
      addParameterHandle("boreRadius", "y", new THREE.Vector3(0, 0, selection.height / 2), new THREE.Vector3(0, parameters.boreRadius * radialScale + 3, selection.height / 2), "y");
      addParameterHandle("teeth", "y", new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, selection.depth / 2 + 3, 0), "y");
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "halfSphere") {
      addParameterHandle("radius", "x", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(selection.width / 2 + 3, 0, -selection.height / 2));
      addParameterHandle("height", "z", new THREE.Vector3(0, 0, -selection.height / 2), new THREE.Vector3(0, 0, selection.height / 2 + 3));
    } else if (parameters?.shape === "torus") {
      const radialScale = selection.width / Math.max(0.01, (parameters.majorRadius + parameters.tubeRadius) * 2);
      const majorRadius = parameters.majorRadius * radialScale;
      addParameterHandle("majorRadius", "x", new THREE.Vector3(0, 0, 0), new THREE.Vector3(majorRadius + selection.height / 2 + 3, 0, 0));
      addParameterHandle("tubeRadius", "z", new THREE.Vector3(majorRadius, 0, 0), new THREE.Vector3(majorRadius, 0, selection.height / 2 + 3), "z");
    }
    model.add(root);
    selectionRootRef.current = root;
    selectionVisualRootRef.current = visualRoot;
    invalidateRef.current();
  }, [displayMode, parameterHandlesVisible, selection, projection, renderQuality, shadingMode, workplane.normal.x, workplane.normal.y, workplane.normal.z, workplane.xAxis.x, workplane.xAxis.y, workplane.xAxis.z, workplane.yAxis.x, workplane.yAxis.y, workplane.yAxis.z]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (cameraTransitionRef.current !== null) cancelAnimationFrame(cameraTransitionRef.current);
    cameraTransitionRef.current = null;
    const target = controls.target;
    const distance = Math.max(75, camera.position.distanceTo(target));
    const dampingEnabled = controls.enableDamping;
    const stableDirection = (direction: THREE.Vector3) => {
      const result = direction.clone().normalize();
      // At either pole lookAt has no unique screen-up direction. Keep a
      // deterministic, imperceptible tilt toward front for OrbitControls.
      if (Math.hypot(result.x, result.z) < 0.00001) {
        result.x = 0;
        result.z = 0.00001;
        result.normalize();
      }
      return result;
    };
    const animateToDirection = (requestedDirection: THREE.Vector3) => {
      if (cameraTransitionRef.current !== null) cancelAnimationFrame(cameraTransitionRef.current);
      controls.enableDamping = false;
      controls.update();
      const destination = stableDirection(requestedDirection);
      const startDirection = camera.position.clone().sub(target).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(startDirection, destination);
      const identity = new THREE.Quaternion();
      const targetPosition = target.clone();
      const duration = 220 + startDirection.angleTo(destination) / Math.PI * 300;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || duration <= 225) {
        camera.position.copy(targetPosition).addScaledVector(destination, distance);
        camera.up.set(0, 1, 0);
        camera.lookAt(targetPosition);
        controls.update();
        controls.enableDamping = dampingEnabled;
        invalidateRef.current();
        cameraTransitionRef.current = null;
        return;
      }
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        const frameRotation = identity.clone().slerp(rotation, eased);
        const direction = stableDirection(startDirection.clone().applyQuaternion(frameRotation));
        camera.position.copy(targetPosition).addScaledVector(direction, distance);
        camera.up.set(0, 1, 0);
        camera.lookAt(targetPosition);
        controls.update();
        invalidateRef.current();
        if (progress < 1) cameraTransitionRef.current = requestAnimationFrame(step);
        else {
          controls.enableDamping = dampingEnabled;
          cameraTransitionRef.current = null;
        }
      };
      cameraTransitionRef.current = requestAnimationFrame(step);
    };
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
      const selected = selectionRef.current;
      const source = modelRef.current;
      if ((view.name === "selection" && !selected) || (view.name === "fit" && !source)) return;
      const box = view.name === "selection" ? viewportSelectionBounds(selected!) : new THREE.Box3().setFromObject(source!);
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
      invalidateRef.current();
      return;
    }
    if (view.name === "custom") {
      if (view.direction && view.smooth === false) {
        controls.enableDamping = false;
        controls.update();
        camera.position.copy(target).add(stableDirection(new THREE.Vector3(...view.direction)).multiplyScalar(distance));
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        controls.update();
        controls.enableDamping = dampingEnabled;
        invalidateRef.current();
      } else if (view.direction) animateToDirection(new THREE.Vector3(...view.direction));
      return () => {
        if (cameraTransitionRef.current !== null) cancelAnimationFrame(cameraTransitionRef.current);
        cameraTransitionRef.current = null;
        controls.enableDamping = dampingEnabled;
      };
    }
    const vectors: Record<"iso" | "top" | "front" | "right" | "home", THREE.Vector3> = {
      iso: new THREE.Vector3(118, 96, 118),
      top: new THREE.Vector3(0, 1, 0.001),
      front: new THREE.Vector3(0, 0.001, 1),
      right: new THREE.Vector3(1, 0.001, 0),
      home: new THREE.Vector3(-118, 96, 118),
    };
    animateToDirection(vectors[view.name]);
    return () => {
      if (cameraTransitionRef.current !== null) cancelAnimationFrame(cameraTransitionRef.current);
      cameraTransitionRef.current = null;
      controls.enableDamping = dampingEnabled;
    };
  }, [view]);

  const dimensionInput = (axis: ViewportDimensionAxis, ref: typeof dimensionXRef, className: string, label: string) => <input
    ref={ref}
    className={className}
    type="text"
    inputMode="text"
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
  const faceExtrudeControls = faceExtrudeDraft ?? faceExtrudeHandle;
  const floatingBoolean = floatingFeature?.kind === "objectBoolean" ? floatingFeature : null;
  const showOperationModes = !faceExtrudeControls && !revolveDraft && !shellDraft && (Boolean(floatingBoolean) || operationModesVisible && Boolean(selection?.operationPreview));
  const showEdgeTreatmentControls = Boolean(edgeTreatmentHandle);
  const showFeatureControls = Boolean(floatingFeature && floatingFeature.kind !== "fillet");
  const showContextToolbar = contextToolbarVisible ?? (showOperationModes || showEdgeTreatmentControls || showFeatureControls || Boolean(faceExtrudeControls) || Boolean(revolveDraft) || Boolean(shellDraft));
  const selectedAnnotationForInteraction = annotations?.find((annotation) => annotation.id === selectedAnnotationId);
  // Text preview can hide the sprite while the overlay edits its contents. Keep
  // that display-only empty string separate from the editor's saved text/size.
  const annotationInteractionSelection = annotationPreview?.id === selectedAnnotationId
    ? annotationPreview.kind === "text" && selectedAnnotationForInteraction?.kind === "text"
      ? { ...selectedAnnotationForInteraction, position: annotationPreview.position }
      : annotationPreview
    : selectedAnnotationForInteraction;

  useEffect(() => {
    const host = hostRef.current;
    const controls = controlsRef.current;
    if (!host || !onProjectRename) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastPointer: PointerEvent | null = null;
    const hide = () => {
      const button = projectRenameButtonRef.current;
      button?.userData.setHovered?.(false);
      if (button?.visible) { button.visible = false; invalidateRef.current(); }
    };
    const hit = (event: PointerEvent) => {
      const camera = cameraRef.current;
      const canvas = rendererRef.current?.domElement;
      if (!camera || !canvas || event.target !== canvas) return false;
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointer, camera);
      return true;
    };
    const hover = (event: PointerEvent) => {
      lastPointer = event;
      const button = projectRenameButtonRef.current;
      const band = projectBandRef.current;
      if (!button || !band || event.buttons || !hit(event)) { hide(); return; }
      band.updateWorldMatrix(true, false);
      button.updateWorldMatrix(true, false);
      const buttonHovered = Boolean(button.visible && raycaster.intersectObject(button, false).length);
      const visible = Boolean(raycaster.intersectObject(band, false).length || buttonHovered);
      button.userData.setHovered?.(buttonHovered);
      if (button.visible !== visible) { button.visible = visible; invalidateRef.current(); }
    };
    let pressed = false;
    const down = (event: PointerEvent) => {
      const button = projectRenameButtonRef.current;
      if (event.button !== 0 || !button?.visible || !hit(event) || !raycaster.intersectObject(button, false).length) return;
      pressed = true;
      event.preventDefault();
      event.stopPropagation();
    };
    const up = (event: PointerEvent) => {
      if (!pressed) { hover(event); return; }
      pressed = false;
      event.preventDefault();
      event.stopPropagation();
      const button = projectRenameButtonRef.current;
      if (button?.visible && hit(event) && raycaster.intersectObject(button, false).length) { hide(); onProjectRename(); }
    };
    const leave = () => { lastPointer = null; pressed = false; hide(); };
    // Re-evaluate the band under the stationary cursor as the camera moves,
    // instead of hiding the button on every damped OrbitControls update.
    const cameraChanged = () => { if (lastPointer) hover(lastPointer); };
    host.addEventListener("pointermove", hover);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointerup", up, true);
    controls?.addEventListener("change", cameraChanged);
    return () => {
      host.removeEventListener("pointermove", hover);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("pointerup", up, true);
      controls?.removeEventListener("change", cameraChanged);
    };
  }, [onProjectRename, projection, renderQuality, shadingMode]);
  return <div className="parametric-viewport" ref={hostRef} aria-label={locale === "es" ? "Vista 3D de la pieza" : "3D model view"}>
    <AnnotationInteraction host={hostRef} camera={cameraRef} model={modelRef} snapPoint={annotationSnapRef} positionHandleAtPointer={(event) => annotationPositionHandleRef.current(event)} workplane={workplane} tool={annotationTool} selected={annotationInteractionSelection ? { ...annotationInteractionSelection, visible: annotationInteractionSelection.visible && annotationsVisible } : undefined} parameterHandlesVisible={parameterHandlesVisible} positionManipulatorVisible={objectOrigins.some((origin) => origin.objectId === selectedAnnotationId && origin.visible && origin.positionVisible !== false)} selectedEndpoint={selectedAnnotationEndpoint} onSelectEndpoint={(endpoint) => onSelectAnnotationEndpoint?.(endpoint)} onMoveEndpoint={(id, endpoint, position) => onMoveAnnotationEndpoint?.(id, endpoint, position)} onMoveText={(id, position) => onObjectAxisMove?.(id, position)} editing={Boolean(editingAnnotationId && editingAnnotationId === selectedAnnotationId)} locale={locale} onPlace={(kind, start, end) => onPlaceAnnotation?.(kind, start, end)} onFinish={(id, text, size) => onFinishAnnotation?.(id, text, size)} onEdit={(id) => onEditAnnotation?.(id)} onCancelTool={() => onCancelAnnotationTool?.()} onPreview={setAnnotationPreview} />
    {alignmentActive ? <div ref={alignmentButtonsRef} className="educad-alignment-face-buttons" role="group" aria-label={locale === "es" ? "Alinear con la referencia" : "Align with reference"}>
      {(["x", "y", "z"] as const).flatMap(axis => (["min", "center", "max"] as const).map(anchor => {
        const label = locale === "es"
          ? `Alinear ${axis.toUpperCase()}: ${anchor === "min" ? "mínimo" : anchor === "center" ? "centro" : "máximo"}`
          : `Align ${axis.toUpperCase()}: ${anchor === "min" ? "minimum" : anchor === "center" ? "center" : "maximum"}`;
        return <button key={`${axis}-${anchor}`} type="button" data-alignment-axis={axis} data-alignment-anchor={anchor} title={label} aria-label={label} aria-disabled={alignmentBusy || !alignmentTargets.length}
          onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); if (!alignmentBusy && alignmentTargets.length) onAlign?.(axis, anchor); }}>
          {/* SVG assets remain editable outside the code. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/educad/alignment/${axis}-${anchor}.svg`} alt="" draggable={false} />
        </button>;
      }))}
    </div> : null}
    <div ref={selectionBoxRef} className="parametric-selection-box" aria-hidden="true" />
    {showContextToolbar ? <div className="educad-viewport-context-toolbar" aria-label={locale === "es" ? "Herramientas de la selección" : "Selection tools"} onPointerDown={(event) => event.stopPropagation()}>
      {manipulatorControls && !floatingBoolean ? <div className="educad-context-toolbar-group" aria-label={alignmentActive ? (locale === "es" ? "Modo de alineación" : "Alignment mode") : (locale === "es" ? "Manipuladores" : "Manipulators")}>{manipulatorControls}</div> : null}
      {showOperationModes ? <div className="educad-context-toolbar-group" aria-label={locale === "es" ? "Modo de la operación" : "Operation mode"}>
        {(["add", "cut", "intersect"] as const).map((mode) => {
          const activeMode = floatingBoolean ? (booleanAddOnly ? "add" : floatingBoolean.operation) === mode : selection?.operationPreview?.mode === (mode === "cut" ? "hole" : mode === "intersect" ? "common" : "add");
          const label = locale === "es" ? mode === "add" ? "Añadir" : mode === "cut" ? "Hueco" : "Común" : mode === "add" ? "Add" : mode === "cut" ? "Hole" : "Common";
          return <button key={mode} type="button" className={`mode-${mode} ${activeMode ? "active" : ""}`} aria-label={label} title={label} aria-pressed={activeMode} disabled={Boolean(floatingBoolean && booleanAddOnly && mode !== "add")} onClick={() => floatingBoolean ? onFloatingFeatureChange?.(floatingBoolean.id, { operation: mode }) : onOperationModeChange?.(mode)}><ToolbarBooleanModeIcon mode={mode === "cut" ? "hole" : mode === "intersect" ? "common" : "add"} /></button>;
        })}
      </div> : null}
      {faceExtrudeControls ? <div className="educad-context-toolbar-group" aria-label={locale === "es" ? "Extrusión de cara" : "Face extrusion"}>
        {(["add", "cut"] as const).map((mode) => {
          const label = locale === "es" ? mode === "add" ? "Añadir" : "Hueco" : mode === "add" ? "Add" : "Hole";
          return <button key={mode} type="button" className={`mode-${mode} ${faceExtrudeControls.operation === mode ? "active" : ""}`} aria-label={label} title={label} aria-pressed={faceExtrudeControls.operation === mode} onClick={() => onFaceExtrudeDistanceChange?.(faceExtrudeControls.distance, mode)}><ToolbarBooleanModeIcon mode={mode === "cut" ? "hole" : "add"} /></button>;
        })}
        <ViewportFloatingNumberInput value={faceExtrudeControls.distance * (faceExtrudeControls.operation === "cut" ? -1 : 1)} unit="length" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Profundidad" : "Depth"} min={-200} max={200} onCommit={(distance) => onFaceExtrudeDistanceChange?.(Math.max(0.01, Math.abs(distance)), distance < 0 ? "cut" : "add")} />
        {onFaceExtrudeCancel && onFaceExtrudeAccept ? <><button type="button" className="cancel" aria-label={locale === "es" ? "Cancelar" : "Cancel"} title={locale === "es" ? "Cancelar" : "Cancel"} onClick={onFaceExtrudeCancel}><X /></button><button type="button" className="accept" disabled={!faceExtrudeCanAccept} aria-label={locale === "es" ? "Aceptar" : "Accept"} title={locale === "es" ? "Aceptar" : "Accept"} onClick={onFaceExtrudeAccept}><Check /></button></> : null}
      </div> : null}
      {revolveDraft ? <div className="educad-context-toolbar-group" aria-label={locale === "es" ? "Revolución" : "Revolve"}>
        {(["add", "cut", "intersect"] as const).map((mode) => {
          const label = locale === "es" ? mode === "add" ? "Añadir" : mode === "cut" ? "Hueco" : "Común" : mode === "add" ? "Add" : mode === "cut" ? "Hole" : "Common";
          return <button key={mode} type="button" className={`mode-${mode} ${revolveDraft.operation === mode ? "active" : ""}`} aria-label={label} title={label} aria-pressed={revolveDraft.operation === mode} onClick={() => onRevolveDraftChange?.({ operation: mode })}><ToolbarBooleanModeIcon mode={mode === "cut" ? "hole" : mode === "intersect" ? "common" : "add"} /></button>;
        })}
        <ViewportFloatingNumberInput value={revolveDraft.angle} unit="angle" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Ángulo" : "Angle"} min={-360} max={360} onCommit={(angle) => onRevolveDraftChange?.({ angle: Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle })} />
        {onRevolveCancel && onRevolveAccept ? <><button type="button" className="cancel" aria-label={locale === "es" ? "Cancelar" : "Cancel"} title={locale === "es" ? "Cancelar" : "Cancel"} onClick={onRevolveCancel}><X /></button><button type="button" className="accept" disabled={!revolveCanAccept} aria-label={locale === "es" ? "Aceptar" : "Accept"} title={locale === "es" ? "Aceptar" : "Accept"} onClick={onRevolveAccept}><Check /></button></> : null}
      </div> : null}
      {shellDraft ? <div className="educad-context-toolbar-group" aria-label="Shell">
        <ShellCornerButtons value={shellDraft.cornerType} locale={locale} onChange={(cornerType) => onShellCornerTypeChange?.(cornerType)} />
        <ViewportFloatingNumberInput value={shellDraft.thickness} unit="length" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Espesor" : "Thickness"} min={0.01} max={50} onCommit={(thickness) => onShellDraftChange?.(thickness)} />
        {onShellCancel && onShellAccept ? <><button type="button" className="cancel" aria-label={locale === "es" ? "Cancelar" : "Cancel"} title={locale === "es" ? "Cancelar" : "Cancel"} onClick={onShellCancel}><X /></button><button type="button" className="accept" disabled={!shellCanAccept} aria-label={locale === "es" ? "Aceptar" : "Accept"} title={locale === "es" ? "Aceptar" : "Accept"} onClick={onShellAccept}><Check /></button></> : null}
      </div> : null}
      {showEdgeTreatmentControls ? <div className="educad-context-toolbar-group" aria-label={locale === "es" ? "Tratamiento de arista" : "Edge treatment"}>
        {floatingFeature?.kind === "fillet" ? <button type="button" aria-label={locale === "es" ? "Editar caras y aristas" : "Edit faces and edges"} title={locale === "es" ? "Editar caras y aristas" : "Edit faces and edges"} onClick={() => onEditEdgeTreatmentSelection?.(floatingFeature.id)}><ToolbarEditOperationIcon /></button> : null}
        <button type="button" className={edgeTreatmentHandle?.treatment === "fillet" ? "active" : ""} aria-label={locale === "es" ? "Redondeo" : "Fillet"} title={locale === "es" ? "Redondeo" : "Fillet"} aria-pressed={edgeTreatmentHandle?.treatment === "fillet"} onClick={() => onEdgeTreatmentTypeChange?.("fillet")}><ToolbarFilletIcon /></button>
        <button type="button" className={edgeTreatmentHandle?.treatment === "chamfer" ? "active" : ""} aria-label={locale === "es" ? "Chaflán" : "Chamfer"} title={locale === "es" ? "Chaflán" : "Chamfer"} aria-pressed={edgeTreatmentHandle?.treatment === "chamfer"} onClick={() => onEdgeTreatmentTypeChange?.("chamfer")}><ToolbarChamferIcon /></button>
        {onEdgeTreatmentRadiusChange ? <ViewportEdgeRadiusInput radius={edgeTreatmentRadiusPreview ?? edgeTreatmentHandle!.radius} displayUnit={displayUnit} snap={snap} locale={locale} onCommit={onEdgeTreatmentRadiusChange} /> : null}
        {onEdgeTreatmentCancel && onEdgeTreatmentAccept ? <><button type="button" className="cancel" aria-label={locale === "es" ? "Cancelar" : "Cancel"} title={locale === "es" ? "Cancelar" : "Cancel"} onClick={onEdgeTreatmentCancel}><X /></button><button type="button" className="accept" disabled={!edgeTreatmentCanAccept} aria-label={locale === "es" ? "Aceptar" : "Accept"} title={locale === "es" ? "Aceptar" : "Accept"} onClick={onEdgeTreatmentAccept}><Check /></button></> : null}
      </div> : null}
      {showFeatureControls ? <div className="educad-context-toolbar-group">
        {floatingFeature?.kind === "linearPattern" || floatingFeature?.kind === "polarPattern" ? <ViewportFloatingNumberInput value={floatingFeature.count} unit="count" displayUnit={displayUnit} snap={1} label={locale === "es" ? "Repeticiones" : "Repetitions"} min={2} max={50} onCommit={(count) => onFloatingFeatureChange?.(floatingFeature.id, { count })} /> : null}
        {floatingFeature?.kind === "polarPattern" ? <>
          {(["x", "y", "z"] as const).map((axis) => <button key={axis} type="button" className={floatingFeature.axis === axis ? "active" : ""} aria-label={`${locale === "es" ? "Eje" : "Axis"} ${axis.toUpperCase()}`} title={`${locale === "es" ? "Eje" : "Axis"} ${axis.toUpperCase()}`} aria-pressed={floatingFeature.axis === axis} onClick={() => onFloatingFeatureChange?.(floatingFeature.id, { axis })}><strong>{axis.toUpperCase()}</strong></button>)}
          <select className="educad-context-object-select" aria-label={locale === "es" ? "Fuente" : "Source"} value={floatingFeature.source === "feature" ? floatingFeature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onFloatingFeatureChange?.(floatingFeature.id, { sourceFeatureId: event.target.value })}>
            <option value="body">{locale === "es" ? "Cuerpo completo" : "Full body"}</option>
            {patternSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
        </> : null}
        {floatingBoolean ? <select className="educad-context-object-select" aria-label={locale === "es" ? "Objeto" : "Object"} value={floatingBoolean.sourceObjectId} onChange={(event) => onFloatingFeatureChange?.(floatingBoolean.id, { sourceObjectId: event.target.value })}>{booleanObjects.filter((object) => object.id !== floatingBoolean.objectId).map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select> : null}
        {floatingFeature?.kind === "sketch" ? <button type="button" aria-label={locale === "es" ? "Editar boceto" : "Edit sketch"} title={locale === "es" ? "Editar boceto" : "Edit sketch"} onClick={() => onEditSketch?.(floatingFeature.id)}><ToolbarEditOperationIcon /></button> : null}
        {floatingFeature?.kind === "faceExtrude" ? <button type="button" aria-label={locale === "es" ? "Editar cara" : "Edit face"} title={locale === "es" ? "Editar cara" : "Edit face"} onClick={() => onEditFaceExtrudeSelection?.(floatingFeature.id)}><ToolbarEditOperationIcon /></button> : null}
        {floatingFeature?.kind === "extrude" ? <ViewportFloatingNumberInput value={floatingFeature.distance} unit="length" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Profundidad" : "Depth"} min={-200} max={200} onCommit={(distance) => onFloatingFeatureChange?.(floatingFeature.id, { distance })} /> : null}
        {floatingFeature?.kind === "revolve" ? <><button type="button" aria-label={locale === "es" ? "Editar cara" : "Edit face"} title={locale === "es" ? "Editar cara" : "Edit face"} onClick={() => onEditRevolveFace?.(floatingFeature.id)}><ToolbarEditOperationIcon /><small>F</small></button><button type="button" aria-label={locale === "es" ? "Editar eje" : "Edit axis"} title={locale === "es" ? "Editar eje" : "Edit axis"} onClick={() => onEditRevolveAxis?.(floatingFeature.id)}><ToolbarEditOperationIcon /><small>A</small></button><ViewportFloatingNumberInput value={revolveAnglePreview ?? floatingFeature.angle} unit="angle" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Ángulo" : "Angle"} min={-360} max={360} onCommit={(angle) => onFloatingFeatureChange?.(floatingFeature.id, { angle: Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle })} /></> : null}
        {floatingFeature?.kind === "shell" ? <><ShellCornerButtons value={floatingFeature.cornerType} locale={locale} onChange={(cornerType) => onFloatingFeatureChange?.(floatingFeature.id, { cornerType })} /><button type="button" aria-label={locale === "es" ? "Editar caras" : "Edit faces"} title={locale === "es" ? "Editar caras" : "Edit faces"} onClick={() => onEditShellSelection?.(floatingFeature.id)}><ToolbarEditOperationIcon /></button><ViewportFloatingNumberInput value={distanceParameterPreview ?? floatingFeature.thickness} unit="length" displayUnit={displayUnit} snap={snap} label={locale === "es" ? "Espesor" : "Thickness"} min={0.01} max={50} onCommit={(thickness) => onFloatingFeatureChange?.(floatingFeature.id, { thickness })} /></> : null}
        {floatingFeature?.kind === "mirror" ? <><button type="button" className={floatingFeature.duplicate ? "active" : ""} aria-label={locale === "es" ? "Duplicar" : "Duplicate"} title={locale === "es" ? "Duplicar" : "Duplicate"} onClick={() => onFloatingFeatureChange?.(floatingFeature.id, { duplicate: true })}><strong>D</strong></button><button type="button" className={!floatingFeature.duplicate ? "active" : ""} aria-label={locale === "es" ? "Transformar" : "Transform"} title={locale === "es" ? "Transformar" : "Transform"} onClick={() => onFloatingFeatureChange?.(floatingFeature.id, { duplicate: false })}><strong>T</strong></button><button type="button" aria-label={locale === "es" ? "Editar plano" : "Edit plane"} title={locale === "es" ? "Editar plano" : "Edit plane"} onClick={() => onEditMirrorPlane?.(floatingFeature.id)}><ToolbarEditOperationIcon /></button></> : null}
      </div> : null}
    </div> : null}
    {moveDimension ? <div className="parametric-move-dimension" aria-live="polite">
      <svg aria-hidden="true">
        <defs><marker id="parametric-move-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M 0 0 L 7 3.5 L 0 7 z" /></marker></defs>
        <line className="extension" x1={moveDimension.originX} y1={moveDimension.originY} x2={moveDimension.startX} y2={moveDimension.startY} />
        <line className="extension" x1={moveDimension.currentX} y1={moveDimension.currentY} x2={moveDimension.endX} y2={moveDimension.endY} />
        <line className="distance" x1={moveDimension.startX} y1={moveDimension.startY} x2={moveDimension.endX} y2={moveDimension.endY} />
      </svg>
      <span style={{ left: moveDimension.labelX, top: moveDimension.labelY }}>{moveDimension.value}</span>
    </div> : null}
    <div className="parametric-selection-dimensions">
      {dimensionInput("x", dimensionXRef, "axis-x", locale === "es" ? "Editar dimensión X" : "Edit X dimension")}
      {dimensionInput("y", dimensionYRef, "axis-y", locale === "es" ? "Editar dimensión Y" : "Edit Y dimension")}
      {dimensionInput("z", dimensionZRef, "axis-z", locale === "es" ? "Editar dimensión Z" : "Edit Z dimension")}
    </div>
  </div>;
}
