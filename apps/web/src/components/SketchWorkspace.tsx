"use client";

import { ChevronUp, CornerDownRight, Home, Link, Link2Off, Minus, Plus, Split, Trash2, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { SketchAnnotationLayer, sketchAnnotationFromPicks } from "@/components/SketchAnnotationLayer";
import type { AnnotationTool } from "@/lib/annotationPresets";
import type { ParametricAnnotation } from "@/types/parametric";
import type { ParametricDisplayUnit } from "@/lib/parametricUnits";
import { ViewToolbarIcon } from "@/components/icons";
import { SnapGridControl } from "@/components/workplane/ShapeInspector";
import { SketchRevolvePreview } from "@/components/SketchRevolvePreview";
import { lengthDisplayUnit } from "@/lib/measurementUnits";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
import { sketchSlot } from "@/lib/sketchSlots";
import { sketchRectangle } from "@/lib/sketchRectangles";
import { sketchEllipse } from "@/lib/sketchEllipse";
import { sketchSelectionBounds, transformSketchSelection, type SketchSelectionBounds, type SketchTransformHandle } from "@/lib/sketchSelectionTransform";
import { WORKPLANE_MAJOR_GRID_INTERVAL } from "@/lib/workplaneGrid";
import { mirrorSign, resizedImportedMeshPositions } from "@/lib/workplaneShapes";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE, normalizeSnapGrid, normalizeWorkspaceSettings } from "@/lib/workplaneSettings";
import { SKETCH_ORIGIN_POINT_ID, SKETCH_X_AXIS_ID, SKETCH_Y_AXIS_ID, solveSketchConstraints } from "@/lib/sketchConstraints";
import type { SketchProfileValidation } from "@/lib/sketchProfileValidation";
import { isOpenSketchProfile } from "@/lib/sketchProfileValidation";
import type { KercadLocale } from "@/lib/kercadI18n";
import type { GridSize, SketchCircle, SketchImage, SketchOperation, SketchPoint, SketchProfile, SketchSegment, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";
import { uiText, pluralMessage } from "@/lib/kercadI18n";

export type SketchTool = "line" | "connect" | "rectangle" | "centerRectangle" | "roundedRectangle" | "ellipse" | "polygon" | "slot" | "arcSlot" | "bezier" | "smooth" | "freehand" | "freehandSmooth" | "circle" | "arc" | "select" | "refine" | "trim" | "erase" | "measure";
export type SketchSelection =
  | { kind: "point"; id: string }
  | { kind: "segment"; id: string }
  | { kind: "circle"; id: string }
  | { kind: "circlePoint"; circleId: string; point: "center" | "radius" }
  | { kind: "arcPoint"; segmentId: string }
  | { kind: "image"; id: string }
  | { kind: "multiple"; pointIds: string[]; segmentIds: string[]; circleIds?: string[]; imageIds?: string[] }
  | null;
export type SketchMeasurement = { start: SketchPoint; end: SketchPoint } | null;

function translatedSketchSelection(profile: SketchProfile, selection: NonNullable<SketchSelection>, dx: number, dz: number): SketchProfile {
  const pointIds = new Set(selection.kind === "point" ? [selection.id] : selection.kind === "multiple" ? selection.pointIds : []);
  const segmentIds = new Set(selection.kind === "segment" ? [selection.id] : selection.kind === "multiple" ? selection.segmentIds : []);
  const circleIds = new Set(selection.kind === "circle" ? [selection.id] : selection.kind === "multiple" ? selection.circleIds ?? [] : []);
  const imageIds = new Set(selection.kind === "image" ? [selection.id] : selection.kind === "multiple" ? selection.imageIds ?? [] : []);
  for (const segment of profile.segments) if (segmentIds.has(segment.id)) {
    pointIds.add(segment.startId);
    pointIds.add(segment.endId);
  }
  const translate = (point: { x: number; z: number }) => ({ x: point.x + dx, z: point.z + dz });
  const next: SketchProfile = {
    ...profile,
    points: profile.points.map((point) => pointIds.has(point.id) ? { ...point, ...translate(point), handleIn: point.handleIn ? translate(point.handleIn) : undefined, handleOut: point.handleOut ? translate(point.handleOut) : undefined } : { ...point }),
    segments: profile.segments.map((segment) => ({ ...segment, center: segment.center ? segmentIds.has(segment.id) || (pointIds.has(segment.startId) && pointIds.has(segment.endId)) ? translate(segment.center) : { ...segment.center } : undefined })),
    circles: profile.circles?.map((circle) => circleIds.has(circle.id) || pointIds.has(`circle:${circle.id}:center`) ? { ...circle, ...translate(circle) } : { ...circle }),
    images: profile.images?.map((image) => imageIds.has(image.id) ? { ...image, ...translate(image) } : { ...image }),
  };
  return solveSketchConstraints(next, [...pointIds][0] ?? (circleIds.size ? `circle:${[...circleIds][0]}:center` : undefined));
}
export type SketchSceneReference = {
  positions: Float32Array;
  indices: Uint32Array;
  edges: Float32Array;
  images?: Array<{ id: string; dataUrl: string; transform: string; opacity: number }>;
};

type SketchWorkspaceProps = {
  annotations?: ParametricAnnotation[];
  annotationTool?: AnnotationTool | null;
  selectedAnnotationId?: string | null;
  annotationToolbar?: ReactNode;
  annotationDisplayUnit?: ParametricDisplayUnit;
  onAddAnnotation?: (annotation: ParametricAnnotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  onCommitAnnotation?: (annotation: ParametricAnnotation) => void;
  locale?: KercadLocale;
  profile: SketchProfile;
  profileValidation?: SketchProfileValidation | null;
  operation?: SketchOperation;
  revolvePreviewPositions?: number[] | null;
  referenceShapes: WorkplaneShape[];
  sceneReference?: SketchSceneReference | null;
  tool: SketchTool;
  activePointId: string | null;
  selected: SketchSelection;
  measurement: SketchMeasurement;
  pendingMeasurementStart: SketchPoint | null;
  initialSnap?: GridSize;
  exactSnapStep?: number;
  initialWorkspace?: WorkplaneWorkspaceSettings;
  onPlanePoint: (point: { x: number; z: number }, handles?: { handleIn: { x: number; z: number }; handleOut: { x: number; z: number } }) => void;
  onFreehandContour?: (points: Array<{ x: number; z: number }>, smooth: boolean) => void;
  onAddRectangle?: (corners: Array<{ x: number; z: number }>) => void;
  onAddRectangleVariant?: (contour: SketchProfile) => void;
  onAddSlot?: (contour: SketchProfile) => void;
  polygonSides?: number;
  onAddPolygon?: (center: { x: number; z: number }, radius: number, angle: number) => void;
  onMoveSelection?: (profile: SketchProfile) => void;
  onPointPress: (id: string, additive?: boolean) => void;
  onSelectSegment: (id: string, additive?: boolean) => void;
  onSelectMany: (pointIds: string[], segmentIds: string[], imageIds: string[], circleIds?: string[]) => void;
  onAddCircle?: (circle: Omit<SketchCircle, "id">) => void;
  onAddArc?: (arc: { center: { x: number; z: number }; start: { x: number; z: number }; end: { x: number; z: number }; clockwise: boolean }) => void;
  onMoveArcCenter?: (id: string, center: { x: number; z: number }) => void;
  onSelectCircle?: (id: string, additive?: boolean) => void;
  onSelectCirclePoint?: (id: string, point: "center" | "radius", additive: boolean) => void;
  onSelectArcPoint?: (id: string, additive: boolean) => void;
  onDeleteCircle?: (id: string) => void;
  onTrimCircle?: (id: string, point: { x: number; z: number }) => void;
  onMoveCircle?: (id: string, center: { x: number; z: number }) => void;
  onResizeCircle?: (id: string, radius: number, angle: number) => void;
  onSelectImage: (id: string) => void;
  onUpdateImage: (id: string, patch: Partial<SketchImage>, message?: string) => void;
  onDeleteImage: (id: string) => void;
  onDeletePoint: (id: string) => void;
  onDeleteSegment: (id: string) => void;
  onTrimSegment?: (id: string, point: { x: number; z: number }) => void;
  onMovePoint: (id: string, point: { x: number; z: number }) => void;
  onMoveHandle: (id: string, handle: "in" | "out", point: { x: number; z: number }) => void;
  onInsertPoint: (segmentId: string, point: { x: number; z: number }) => void;
  onSetPointMode: (id: string, mode: "corner" | "smooth" | "split") => void;
  onUpdateConstraintValue?: (id: string, value: number) => void;
  onDeleteConstraint?: (id: string) => void;
  onClearMeasurement: () => void;
  onCancelActiveTool?: () => void;
  showPointActions?: boolean;
  showGridControls?: boolean;
};

type PathStep = { segment: SketchSegment; from: SketchPoint; to: SketchPoint };
type DisplayPath = { id: string; points: SketchPoint[]; steps: PathStep[]; closed: boolean };
type SketchReferenceFootprint = { fillD: string | null; outlineD: string | null };
type PointerAction =
  | { kind: "transform-selection"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number }; selection: NonNullable<SketchSelection>; bounds: SketchSelectionBounds; handle: SketchTransformHandle; shift: boolean; pivot: { x: number; z: number } }
  | { kind: "move-selection-pivot"; pointerId: number; current: { x: number; z: number }; offset: { x: number; z: number }; snapTarget?: { x: number; z: number } }
  | { kind: "move-selection"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number }; selection: NonNullable<SketchSelection>; entityKind: string; entityId: string }
  | { kind: "bezier"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number } }
  | { kind: "move-circle"; pointerId: number; circleId: string; origin: { x: number; z: number }; current: { x: number; z: number }; start: SketchCircle }
  | { kind: "resize-circle"; pointerId: number; circleId: string; current: { x: number; z: number }; start: SketchCircle }
  | { kind: "move-arc-center"; pointerId: number; segmentId: string; origin: { x: number; z: number }; current: { x: number; z: number }; startCenter: { x: number; z: number } }
  | { kind: "move-point"; pointerId: number; pointId: string; current: { x: number; z: number } }
  | { kind: "move-handle"; pointerId: number; pointId: string; handle: "in" | "out"; current: { x: number; z: number } }
  | { kind: "pan"; pointerId: number; clientX: number; clientY: number }
  | { kind: "marquee"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number } }
  | { kind: "freehand"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number }; points: Array<{ x: number; z: number }>; smooth: boolean }
  | { kind: "move-image"; pointerId: number; imageId: string; origin: { x: number; z: number }; current: { x: number; z: number }; start: SketchImage }
  | { kind: "resize-image"; pointerId: number; imageId: string; handle: ResizeHandle; current: { x: number; z: number }; start: SketchImage };

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

function snapStep(size: GridSize) {
  if (size === "Off") return 0;
  if (size === "Brick") return 8;
  return Number.parseFloat(size) || 1;
}

function snapValue(value: number, step: number) {
  return step > 0 ? Math.round(value / step) * step : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resizeSketchImage(start: SketchImage, handle: ResizeHandle, point: { x: number; z: number }): Partial<SketchImage> {
  const minimum = 0.5;
  const startsWest = handle.includes("w");
  const startsEast = handle.includes("e");
  const startsNorth = handle.includes("n");
  const startsSouth = handle.includes("s");
  const minX = start.x - start.width / 2;
  const maxX = start.x + start.width / 2;
  const minZ = start.z - start.depth / 2;
  const maxZ = start.z + start.depth / 2;
  const aspect = start.width / Math.max(minimum, start.depth);

  if (start.lockAspect !== false) {
    if ((startsWest || startsEast) && (startsNorth || startsSouth)) {
      const fixedX = startsWest ? maxX : minX;
      const fixedZ = startsNorth ? minZ : maxZ;
      const widthScale = Math.abs(point.x - fixedX) / Math.max(minimum, start.width);
      const depthScale = Math.abs(point.z - fixedZ) / Math.max(minimum, start.depth);
      const scale = Math.max(minimum / Math.min(start.width, start.depth), widthScale, depthScale);
      const width = Math.max(minimum, start.width * scale);
      const depth = Math.max(minimum, start.depth * scale);
      const xDirection = startsWest ? -1 : 1;
      const zDirection = startsNorth ? 1 : -1;
      return { width, depth, x: fixedX + xDirection * width / 2, z: fixedZ + zDirection * depth / 2 };
    }
    if (startsWest || startsEast) {
      const fixedX = startsWest ? maxX : minX;
      const width = Math.max(minimum, Math.abs(point.x - fixedX));
      return { width, depth: Math.max(minimum, width / aspect), x: fixedX + (startsWest ? -1 : 1) * width / 2 };
    }
    const fixedZ = startsNorth ? minZ : maxZ;
    const depth = Math.max(minimum, Math.abs(point.z - fixedZ));
    return { depth, width: Math.max(minimum, depth * aspect), z: fixedZ + (startsNorth ? 1 : -1) * depth / 2 };
  }

  let nextMinX = minX;
  let nextMaxX = maxX;
  let nextMinZ = minZ;
  let nextMaxZ = maxZ;
  if (startsWest) nextMinX = Math.min(point.x, maxX - minimum);
  if (startsEast) nextMaxX = Math.max(point.x, minX + minimum);
  if (startsNorth) nextMaxZ = Math.max(point.z, minZ + minimum);
  if (startsSouth) nextMinZ = Math.min(point.z, maxZ - minimum);
  return {
    x: (nextMinX + nextMaxX) / 2,
    z: (nextMinZ + nextMaxZ) / 2,
    width: nextMaxX - nextMinX,
    depth: nextMaxZ - nextMinZ,
  };
}

function formatDimension(value: number, accuracy: number) {
  const threshold = 0.5 * 10 ** -accuracy;
  return (Math.abs(value) < threshold ? 0 : value).toFixed(accuracy);
}

function dimensionPillSize(label: string, screenUnit: number, extra = 24) {
  return {
    width: Math.max(48, label.length * 7.5 + extra) * screenUnit,
    height: 26 * screenUnit,
    radius: 5 * screenUnit,
  };
}

function SketchFixedLengthDimension({ start, end, contour, axis, screenUnit, labelWidth, index, children }: { start: { x: number; z: number }; end: { x: number; z: number }; contour?: Array<{ x: number; z: number }>; axis: "aligned" | "x" | "z"; screenUnit: number; labelWidth: number; index: number; children: ReactNode }) {
  const dx = end.x - start.x, dz = end.z - start.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-8) return null;
  let nx = axis === "x" ? 0 : axis === "z" ? 1 : -dz / distance;
  let nz = axis === "x" ? -1 : axis === "z" ? 0 : dx / distance;
  const projections = (contour?.length ? contour : [start, end]).map((point) => point.x * nx + point.z * nz);
  const low = Math.min(...projections), high = Math.max(...projections);
  const midpoint = ((start.x + end.x) * nx + (start.z + end.z) * nz) / 2;
  // Choose the nearest outer support line of this contour, independently of
  // segment direction, then leave enough room for the complete label.
  const flip = midpoint - low < high - midpoint;
  if (flip) { nx = -nx; nz = -nz; }
  const boundary = flip ? -low : high;
  const offset = (22 + index * 30) * screenUnit + Math.abs(nx) * labelWidth / 2 + Math.abs(nz) * 12 * screenUnit;
  const projectOutside = (point: typeof start) => {
    const shift = boundary + offset - (point.x * nx + point.z * nz);
    return { x: point.x + nx * shift, z: point.z + nz * shift };
  };
  const a = projectOutside(start), b = projectOutside(end);
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = span > 1e-8 ? (b.x - a.x) / span : 1, uz = span > 1e-8 ? (b.z - a.z) / span : 0;
  const arrowLength = Math.min(7 * screenUnit, span / 4), halfWidth = arrowLength * .4;
  const head = (tip: typeof a, sign: number) => `${tip.x},${tip.z} ${tip.x + ux * arrowLength * sign - uz * halfWidth},${tip.z + uz * arrowLength * sign + ux * halfWidth} ${tip.x + ux * arrowLength * sign + uz * halfWidth},${tip.z + uz * arrowLength * sign - ux * halfWidth}`;
  return <g>
    <g pointerEvents="none" style={{ stroke: "#858d95", fill: "#858d95", strokeWidth: 1 }}>
      <line x1={start.x} y1={start.z} x2={a.x + nx * 5 * screenUnit} y2={a.z + nz * 5 * screenUnit} vectorEffect="non-scaling-stroke" />
      <line x1={end.x} y1={end.z} x2={b.x + nx * 5 * screenUnit} y2={b.z + nz * 5 * screenUnit} vectorEffect="non-scaling-stroke" />
      <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} vectorEffect="non-scaling-stroke" />
      <polygon points={head(a, 1)} stroke="none" /><polygon points={head(b, -1)} stroke="none" />
    </g>
    <g transform={`translate(${(a.x + b.x) / 2} ${(a.z + b.z) / 2})`}>{children}</g>
  </g>;
}

function SketchRadialLeader({ center, label, radius, screenUnit }: { center: { x: number; z: number }; label: { x: number; z: number }; radius: number; screenUnit: number }) {
  const distance = Math.hypot(label.x - center.x, label.z - center.z);
  if (distance < 1e-8 || radius <= 0) return null;
  const ux = (label.x - center.x) / distance, uz = (label.z - center.z) / distance;
  const length = Math.min(7 * screenUnit, radius * .3), halfWidth = length * .4;
  const head = (tipDistance: number, direction: number) => {
    const x = center.x + ux * tipDistance, z = center.z + uz * tipDistance;
    const bx = x - ux * length * direction, bz = z - uz * length * direction;
    return `${x},${z} ${bx - uz * halfWidth},${bz + ux * halfWidth} ${bx + uz * halfWidth},${bz - ux * halfWidth}`;
  };
  return <g pointerEvents="none" style={{ stroke: "#858d95", fill: "#858d95", strokeWidth: 1 }}>
    <line x1={center.x} y1={center.z} x2={label.x} y2={label.z} vectorEffect="non-scaling-stroke" />
    <polygon points={head(radius, 1)} stroke="none" />
    <polygon points={head(0, -1)} stroke="none" />
  </g>;
}

function SketchDimensionInput({ id, label, indicator, value: storedValue, millimetersPerUnit = 1, accuracy, screenUnit, locale, align = "center", allowSigned = false, onCommit: commitStoredValue, onDelete }: { id: string; label: string; indicator: string; value: number; millimetersPerUnit?: number; accuracy: 1 | 2 | 3; screenUnit: number; locale: KercadLocale; align?: "center" | "start"; allowSigned?: boolean; onCommit?: (id: string, value: number) => void; onDelete?: (id: string) => void }) {
  const value = storedValue / millimetersPerUnit;
  const onCommit = commitStoredValue ? (key: string, next: number) => commitStoredValue(key, next * millimetersPerUnit) : undefined;
  const formatted = formatDimension(value, accuracy + Math.max(0, Math.ceil(Math.log10(millimetersPerUnit))));
  const [draft, setDraft] = useState(formatted);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => setDraft(formatted), [formatted]);
  useEffect(() => {
    if (!editing) return;
    const acceptOnOutsidePointer = (event: PointerEvent) => {
      const input = inputRef.current;
      if (input && event.target !== input) input.blur();
    };
    document.addEventListener("pointerdown", acceptOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", acceptOnOutsidePointer, true);
  }, [editing]);
  const removeWidth = 22 * screenUnit;
  const indicatorWidth = 20 * screenUnit;
  const controlsWidth = removeWidth + indicatorWidth;
  const pill = dimensionPillSize(draft || formatted, screenUnit, 60);
  const x = align === "start" ? 0 : -pill.width / 2;
  const borderInset = 0.75 * screenUnit;
  return <g className={`sketch-dimension-editor-group ${editing ? "editing" : ""}`} onPointerDown={(event) => { if (!editing) { event.preventDefault(); event.stopPropagation(); setEditing(true); } }}>
    <rect className="sketch-dimension-editor-background" x={x} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
    {editing ? <foreignObject className="sketch-dimension-editor" x={0} y={0} width={pill.width / screenUnit} height={pill.height / screenUnit} transform={`translate(${x} ${-pill.height / 2}) scale(${screenUnit})`}>
      <div className="sketch-dimension-editor-content">
        <input
          ref={inputRef}
          autoFocus
        aria-label={label}
        type="text"
        inputMode="text"
        value={draft}
          style={{ fontSize: 13, padding: "0 25px 0 23px" }}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          const parsed = parseNumericExpression(draft, indicator === "A" ? "deg" : millimetersPerUnit);
          if (!validateNumericExpression(event.currentTarget, parsed)) return;
          if (Number.isFinite(parsed) && (allowSigned || parsed > 0)) onCommit?.(id, parsed);
          else setDraft(formatted);
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setDraft(formatted); event.currentTarget.blur(); }
        }}
        />
      </div>
    </foreignObject> : null}
    <text className="sketch-dimension-editor-value" pointerEvents="none" x={x + indicatorWidth + (pill.width - controlsWidth) / 2} y={5 * screenUnit} fontSize={13 * screenUnit}>{draft}</text>
    <text className="sketch-dimension-editor-indicator" pointerEvents="none" x={x + indicatorWidth / 2} y={5 * screenUnit} fontSize={11 * screenUnit}>{indicator}</text>
    <line className="sketch-constraint-remove-separator" pointerEvents="none" x1={x + indicatorWidth} y1={-pill.height / 2 + 4 * screenUnit} x2={x + indicatorWidth} y2={pill.height / 2 - 4 * screenUnit} />
    <line className="sketch-constraint-remove-separator" pointerEvents="none" x1={x + pill.width - removeWidth} y1={-pill.height / 2 + 4 * screenUnit} x2={x + pill.width - removeWidth} y2={pill.height / 2 - 4 * screenUnit} />
    <g className="sketch-constraint-remove" role="button" tabIndex={0} aria-label={`${uiText("ui.sketchworkspace.delete.constraint.0e1bde", {}, locale)} ${label}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onDelete?.(id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onDelete?.(id); } }}>
      <rect x={x + pill.width - removeWidth} y={-pill.height / 2} width={removeWidth} height={pill.height} />
      <text pointerEvents="none" x={x + pill.width - removeWidth / 2} y={5 * screenUnit} fontSize={14 * screenUnit}>×</text>
    </g>
    <rect className="sketch-dimension-editor-frame" pointerEvents="none" x={x + borderInset} y={-pill.height / 2 + borderInset} width={pill.width - borderInset * 2} height={pill.height - borderInset * 2} rx={Math.max(0, pill.radius - borderInset)} />
  </g>;
}

function SketchConstraintBadge({ id, label, x, z, screenUnit, locale, onDelete }: { id: string; label: string; x: number; z: number; screenUnit: number; locale: KercadLocale; onDelete?: (id: string) => void }) {
  const width = 34 * screenUnit;
  const height = 18 * screenUnit;
  const removeWidth = 17 * screenUnit;
  return <g className="sketch-constraint-badge" transform={`translate(${x} ${z})`}>
    <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={3 * screenUnit} />
    <text pointerEvents="none" x={-removeWidth / 2} y={4 * screenUnit} fontSize={11 * screenUnit}>{label}</text>
    <line pointerEvents="none" x1={0} y1={-height / 2 + 3 * screenUnit} x2={0} y2={height / 2 - 3 * screenUnit} />
    <g className="sketch-constraint-remove" role="button" tabIndex={0} aria-label={`${uiText("ui.sketchworkspace.delete.constraint.0e1bde", {}, locale)} ${label}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onDelete?.(id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onDelete?.(id); } }}>
      <rect x={0} y={-height / 2} width={removeWidth} height={height} />
      <text pointerEvents="none" x={removeWidth / 2} y={4 * screenUnit} fontSize={12 * screenUnit}>×</text>
    </g>
  </g>;
}

function cubicPoint(start: SketchPoint, first: { x: number; z: number }, second: { x: number; z: number }, end: SketchPoint, amount: number) {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * end.x,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * end.z,
  };
}

function arcDimensionGeometry(segment: SketchSegment, pointById: Map<string, SketchPoint>) {
  const start = pointById.get(segment.startId);
  const end = pointById.get(segment.endId);
  if (segment.kind !== "arc" || !segment.center || !start || !end) return null;
  const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
  const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
  const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
  const forward = segment.clockwise !== false;
  const sweep = forward ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) : (startAngle - endAngle + Math.PI * 2) % (Math.PI * 2);
  const middleAngle = startAngle + (forward ? 1 : -1) * sweep / 2;
  return { radius, sweep, middleAngle, center: segment.center };
}

function segmentDimension(segment: SketchSegment, pointById: Map<string, SketchPoint>) {
  const start = pointById.get(segment.startId);
  const end = pointById.get(segment.endId);
  if (!start || !end) return null;
  if (segment.kind === "arc" && segment.center) {
    const arc = arcDimensionGeometry(segment, pointById);
    return arc ? { length: arc.radius * arc.sweep, midpoint: { x: arc.center.x + Math.cos(arc.middleAngle) * arc.radius, z: arc.center.z + Math.sin(arc.middleAngle) * arc.radius } } : null;
  }
  const first = start.handleOut;
  const second = end.handleIn;
  if (segment.kind === "line" || !first || !second) {
    return {
      length: Math.hypot(end.x - start.x, end.z - start.z),
      midpoint: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 },
    };
  }
  let length = 0;
  let previous = start;
  for (let index = 1; index <= 32; index += 1) {
    const point = cubicPoint(start, first, second, end, index / 32);
    length += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = { ...point, id: "curve-sample" };
  }
  return { length, midpoint: cubicPoint(start, first, second, end, 0.5) };
}

function orderedPaths(profile: SketchProfile): DisplayPath[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchSegment }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const valid = profile.segments.filter((segment) => {
    if (!pointById.has(segment.startId) || !pointById.has(segment.endId)) return false;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(valid.map((segment) => segment.id));
  const paths: DisplayPath[] = [];
  while (unvisited.size > 0) {
    const seedId = unvisited.values().next().value as string;
    const seed = valid.find((segment) => segment.id === seedId);
    if (!seed) break;
    const component = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length) {
      const id = queue.pop();
      if (!id || component.has(id)) continue;
      component.add(id);
      adjacency.get(id)?.forEach((edge) => queue.push(edge.pointId));
    }
    const startId = [...component].find((id) => (adjacency.get(id)?.filter((edge) => unvisited.has(edge.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const first = pointById.get(startId);
    if (!first) break;
    const points = [first];
    const steps: PathStep[] = [];
    let currentId = startId;
    for (let guard = 0; guard <= valid.length; guard += 1) {
      const edge = adjacency.get(currentId)?.find((candidate) => unvisited.has(candidate.segment.id));
      if (!edge) break;
      const from = pointById.get(currentId);
      const to = pointById.get(edge.pointId);
      if (!from || !to) break;
      unvisited.delete(edge.segment.id);
      steps.push({ segment: edge.segment, from, to });
      currentId = to.id;
      if (currentId === startId) break;
      points.push(to);
    }
    // An arc closed by its chord is a complete filled contour with two edges.
    paths.push({ id: seed.id, points, steps, closed: currentId === startId && steps.length >= 2 });
  }
  return paths;
}

function curveControls(step: PathStep) {
  const forward = step.segment.startId === step.from.id;
  return {
    first: forward ? step.from.handleOut : step.from.handleIn,
    second: forward ? step.to.handleIn : step.to.handleOut,
  };
}

function arcCommand(step: PathStep) {
  const center = step.segment.center;
  if (!center) return `L ${step.to.x} ${step.to.z}`;
  const radius = Math.hypot(step.from.x - center.x, step.from.z - center.z);
  const startAngle = Math.atan2(step.from.z - center.z, step.from.x - center.x);
  const endAngle = Math.atan2(step.to.z - center.z, step.to.x - center.x);
  const forward = step.segment.startId === step.from.id;
  const clockwise = forward ? step.segment.clockwise !== false : step.segment.clockwise === false;
  const sweep = clockwise ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) : (startAngle - endAngle + Math.PI * 2) % (Math.PI * 2);
  return `A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} ${clockwise ? 1 : 0} ${step.to.x} ${step.to.z}`;
}

function pathData(path: DisplayPath) {
  const first = path.points[0];
  if (!first) return "";
  const commands = [`M ${first.x} ${first.z}`];
  path.steps.forEach((step) => {
    if (step.segment.kind === "arc") {
      commands.push(arcCommand(step));
      return;
    }
    const controls = curveControls(step);
    if (step.segment.kind !== "line" && controls.first && controls.second) {
      commands.push(`C ${controls.first.x} ${controls.first.z} ${controls.second.x} ${controls.second.z} ${step.to.x} ${step.to.z}`);
    } else {
      commands.push(`L ${step.to.x} ${step.to.z}`);
    }
  });
  if (path.closed) commands.push("Z");
  return commands.join(" ");
}

function circlePathData(circle: SketchCircle) {
  return `M ${circle.x + circle.radius} ${circle.z} A ${circle.radius} ${circle.radius} 0 1 0 ${circle.x - circle.radius} ${circle.z} A ${circle.radius} ${circle.radius} 0 1 0 ${circle.x + circle.radius} ${circle.z} Z`;
}

function segmentData(segment: SketchSegment, pointById: Map<string, SketchPoint>) {
  const from = pointById.get(segment.startId);
  const to = pointById.get(segment.endId);
  if (!from || !to) return "";
  const step = { segment, from, to };
  if (segment.kind === "arc") return `M ${from.x} ${from.z} ${arcCommand(step)}`;
  const controls = curveControls(step);
  return segment.kind !== "line" && controls.first && controls.second
    ? `M ${from.x} ${from.z} C ${controls.first.x} ${controls.first.z} ${controls.second.x} ${controls.second.z} ${to.x} ${to.z}`
    : `M ${from.x} ${from.z} L ${to.x} ${to.z}`;
}

function isRoundReference(shape: WorkplaneShape) {
  return ["cylinder", "sphere", "cone", "torus", "tube", "ring", "halfSphere"].includes(shape.kind);
}

function sketchReferencePoint(shape: WorkplaneShape, x: number, z: number) {
  return {
    x: shape.x + x * mirrorSign(shape.mirrorX),
    z: shape.z + z * mirrorSign(shape.mirrorZ),
  };
}

function pointKey(point: { x: number; z: number }, tolerance: number) {
  return `${Math.round(point.x / tolerance)},${Math.round(point.z / tolerance)}`;
}

function triangleArea2d(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }) {
  return Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
}

function trianglePath(points: Array<{ x: number; z: number }>) {
  return `M ${points[0].x} ${points[0].z} L ${points[1].x} ${points[1].z} L ${points[2].x} ${points[2].z} Z`;
}

function convexHull(points: Array<{ x: number; z: number }>) {
  const unique = new Map<string, { x: number; z: number }>();
  points.forEach((point) => unique.set(pointKey(point, 0.001), point));
  const sorted = [...unique.values()].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
  if (sorted.length <= 2) return sorted;
  const cross = (origin: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
  const lower: Array<{ x: number; z: number }> = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: Array<{ x: number; z: number }> = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function boundaryPath(points: Array<{ x: number; z: number }>, triangles: number[][], tolerance: number) {
  const pointByKey = new Map<string, { x: number; z: number }>();
  const edgeCounts = new Map<string, { count: number; a: string; b: string }>();
  const addEdge = (aIndex: number, bIndex: number) => {
    const a = points[aIndex];
    const b = points[bIndex];
    const aKey = pointKey(a, tolerance);
    const bKey = pointKey(b, tolerance);
    pointByKey.set(aKey, a);
    pointByKey.set(bKey, b);
    const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    const current = edgeCounts.get(key);
    edgeCounts.set(key, current ? { ...current, count: current.count + 1 } : { count: 1, a: aKey, b: bKey });
  };
  triangles.forEach(([a, b, c]) => {
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  });

  const boundaryEdges = [...edgeCounts.values()].filter((edge) => edge.count === 1);
  if (boundaryEdges.length === 0) return null;
  const adjacency = new Map<string, string[]>();
  boundaryEdges.forEach(({ a, b }) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  const unused = new Set(boundaryEdges.map(({ a, b }) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const takeEdge = (a: string, b: string) => unused.delete(a < b ? `${a}|${b}` : `${b}|${a}`);
  const hasEdge = (a: string, b: string) => unused.has(a < b ? `${a}|${b}` : `${b}|${a}`);
  const commands: string[] = [];

  while (unused.size > 0) {
    const firstKey = unused.values().next().value as string;
    const [start, firstNext] = firstKey.split("|");
    const chain = [start, firstNext];
    takeEdge(start, firstNext);
    while (chain.length <= boundaryEdges.length + 1) {
      const current = chain[chain.length - 1];
      const previous = chain[chain.length - 2];
      const next = (adjacency.get(current) ?? []).find((candidate) => candidate !== previous && hasEdge(current, candidate))
        ?? (adjacency.get(current) ?? []).find((candidate) => hasEdge(current, candidate));
      if (!next) break;
      takeEdge(current, next);
      chain.push(next);
      if (next === start) break;
    }
    const startPoint = pointByKey.get(chain[0]);
    if (!startPoint) continue;
    const pointsD = chain
      .slice(1)
      .map((key) => pointByKey.get(key))
      .filter((point): point is { x: number; z: number } => Boolean(point))
      .map((point) => `L ${point.x} ${point.z}`);
    commands.push(`M ${startPoint.x} ${startPoint.z} ${pointsD.join(" ")}${chain[chain.length - 1] === chain[0] ? " Z" : ""}`);
  }

  return commands.join(" ");
}

function importedMeshFootprint(shape: WorkplaneShape): SketchReferenceFootprint | null {
  if (!shape.importedMesh) return null;
  const positions = resizedImportedMeshPositions(shape);
  if (positions.length < 9) return null;
  let minY = Number.POSITIVE_INFINITY;
  for (let index = 1; index < positions.length; index += 3) {
    minY = Math.min(minY, positions[index]);
  }
  if (!Number.isFinite(minY)) return null;

  const tolerance = Math.max(0.001, Math.max(shape.width, shape.depth, shape.height) / 100000);
  const bottomTolerance = Math.max(0.025, shape.height * 0.003);
  const points: Array<{ x: number; z: number }> = [];
  const triangles: number[][] = [];
  const allProjected: Array<{ x: number; z: number }> = [];

  for (let index = 0; index + 8 < positions.length; index += 9) {
    const ys = [positions[index + 1], positions[index + 4], positions[index + 7]];
    const projected = [
      sketchReferencePoint(shape, positions[index], positions[index + 2]),
      sketchReferencePoint(shape, positions[index + 3], positions[index + 5]),
      sketchReferencePoint(shape, positions[index + 6], positions[index + 8]),
    ];
    allProjected.push(...projected);
    if (!ys.every((value) => value <= minY + bottomTolerance) || triangleArea2d(projected[0], projected[1], projected[2]) <= tolerance) {
      continue;
    }
    const offset = points.length;
    points.push(...projected);
    triangles.push([offset, offset + 1, offset + 2]);
  }

  if (triangles.length > 0) {
    return {
      fillD: triangles.length <= 5000 ? triangles.map((triangle) => trianglePath(triangle.map((index) => points[index]))).join(" ") : null,
      outlineD: boundaryPath(points, triangles, tolerance),
    };
  }

  const hull = convexHull(allProjected);
  if (hull.length < 3) return null;
  const d = `M ${hull[0].x} ${hull[0].z} ${hull.slice(1).map((point) => `L ${point.x} ${point.z}`).join(" ")} Z`;
  return { fillD: d, outlineD: d };
}

export function SketchWorkspace({
  annotations = [], annotationTool = null, selectedAnnotationId = null, annotationToolbar, annotationDisplayUnit = "mm", onAddAnnotation, onSelectAnnotation, onCommitAnnotation,
  locale = "en",
  profile,
  profileValidation = null,
  operation = "extrude",
  revolvePreviewPositions = null,
  referenceShapes,
  sceneReference = null,
  tool,
  activePointId,
  selected,
  measurement,
  pendingMeasurementStart,
  initialSnap,
  exactSnapStep,
  initialWorkspace,
  onPlanePoint,
  onFreehandContour,
  onAddRectangle,
  onAddRectangleVariant,
  onAddSlot,
  polygonSides = 6,
  onAddPolygon,
  onMoveSelection,
  onPointPress,
  onSelectSegment,
  onSelectMany,
  onAddCircle,
  onAddArc,
  onMoveArcCenter,
  onSelectCircle,
  onSelectCirclePoint,
  onSelectArcPoint,
  onDeleteCircle,
  onTrimCircle,
  onMoveCircle,
  onResizeCircle,
  onSelectImage,
  onUpdateImage,
  onDeleteImage,
  onDeletePoint,
  onDeleteSegment,
  onTrimSegment,
  onMovePoint,
  onMoveHandle,
  onInsertPoint,
  onSetPointMode,
  onUpdateConstraintValue,
  onDeleteConstraint,
  onClearMeasurement,
  onCancelActiveTool,
  showPointActions = true,
  showGridControls = true,
}: SketchWorkspaceProps) {
  const workspace = useMemo(() => normalizeWorkspaceSettings(initialWorkspace, DEFAULT_WORKPLANE_WORKSPACE), [initialWorkspace]);
  const [annotationPicks, setAnnotationPicks] = useState<Array<{ x: number; y: number }>>([]);
  const [annotationHover, setAnnotationHover] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { setAnnotationPicks([]); setAnnotationHover(null); }, [annotationTool]);
  const annotationPreview = useMemo(() => {
    if (!annotationTool || !annotationPicks.length || !annotationHover) return null;
    const picks = [...annotationPicks, annotationHover];
    if (annotationTool === "angle" && picks.length < 3) return { ...sketchAnnotationFromPicks("dashedLine", picks, locale), id: "annotation-preview" };
    return { ...sketchAnnotationFromPicks(annotationTool, picks, locale), id: "annotation-preview" };
  }, [annotationTool, annotationPicks, annotationHover, locale]);
  const millimetersPerUnit = lengthDisplayUnit(workspace).millimetersPerUnit;
  const formatLength = (value: number, accuracy: 1 | 2 | 3) => formatDimension(value / millimetersPerUnit, accuracy + Math.max(0, Math.ceil(Math.log10(millimetersPerUnit))));
  const [snap, setSnap] = useState<GridSize>(() => normalizeSnapGrid(initialSnap, DEFAULT_SNAP_GRID));
  const [snapOpen, setSnapOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, z: 0 });
  const [showDimensionLabels, setShowDimensionLabels] = useState(tool !== "freehand" && tool !== "freehandSmooth");
  const [showConstraintLabels, setShowConstraintLabels] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [labelPreferencesLoaded, setLabelPreferencesLoaded] = useState(false);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [pendingCircleCenter, setPendingCircleCenter] = useState<{ x: number; z: number } | null>(null);
  const [pendingRectangleCorner, setPendingRectangleCorner] = useState<{ x: number; z: number } | null>(null);
  const [slotPicks, setSlotPicks] = useState<Array<{ x: number; z: number }>>([]);
  const [creationRotationLocked, setCreationRotationLocked] = useState(false);
  useEffect(() => {
    const updateShift = (event: KeyboardEvent) => setCreationRotationLocked(event.shiftKey);
    const clearShift = () => setCreationRotationLocked(false);
    window.addEventListener("keydown", updateShift);
    window.addEventListener("keyup", updateShift);
    window.addEventListener("blur", clearShift);
    return () => {
      window.removeEventListener("keydown", updateShift);
      window.removeEventListener("keyup", updateShift);
      window.removeEventListener("blur", clearShift);
    };
  }, []);
  const [pendingArc, setPendingArc] = useState<{ center: { x: number; z: number }; start?: { x: number; z: number } } | null>(null);
  const [pointerAction, setPointerAction] = useState<PointerAction | null>(null);
  const selectionKey = JSON.stringify(selected);
  const [selectionPivot, setSelectionPivot] = useState<{ key: string; point: { x: number; z: number } } | null>(null);
  useEffect(() => { setSelectionPivot(null); }, [selectionKey]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (pointerAction?.kind !== "transform-selection" && pointerAction?.kind !== "move-selection-pivot") return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (svgRef.current?.hasPointerCapture(pointerAction.pointerId)) svgRef.current.releasePointerCapture(pointerAction.pointerId);
      setPointerAction(null);
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [pointerAction]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const width = workspace.width / zoom;
  const depth = workspace.depth / zoom;
  const viewportAspect = svgSize.width > 0 && svgSize.height > 0 ? svgSize.width / svgSize.height : width / depth;
  const contentAspect = width / depth;
  const viewWidth = viewportAspect > contentAspect ? depth * viewportAspect : width;
  const viewDepth = viewportAspect > contentAspect ? depth : width / viewportAspect;
  const screenUnit = useMemo(() => {
    const fittedScale = Math.min(
      svgSize.width > 0 ? svgSize.width / width : 0,
      svgSize.height > 0 ? svgSize.height / depth : 0,
    );
    return fittedScale > 0 ? 1 / fittedScale : Math.max(width, depth) / 720;
  }, [depth, svgSize.height, svgSize.width, width]);

  useEffect(() => {
    try {
      const dimensions = window.localStorage.getItem("kercad.sketch-dimension-labels");
      const constraints = window.localStorage.getItem("kercad.sketch-constraint-labels");
      const annotationsVisible = window.localStorage.getItem("kercad.sketch-annotations-visible");
      if (dimensions !== null) setShowDimensionLabels(dimensions !== "false");
      if (constraints !== null) setShowConstraintLabels(constraints !== "false");
      if (annotationsVisible !== null) setShowAnnotations(annotationsVisible !== "false");
    } catch {
      // Keep session preferences when browser storage is unavailable.
    }
    setLabelPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!labelPreferencesLoaded) return;
    try {
      window.localStorage.setItem("kercad.sketch-dimension-labels", String(showDimensionLabels));
      window.localStorage.setItem("kercad.sketch-constraint-labels", String(showConstraintLabels));
      window.localStorage.setItem("kercad.sketch-annotations-visible", String(showAnnotations));
    } catch {
      // The toggles remain usable without persistent storage.
    }
  }, [labelPreferencesLoaded, showDimensionLabels, showConstraintLabels, showAnnotations]);

  useEffect(() => { if (annotationTool) setShowAnnotations(true); }, [annotationTool]);

  useEffect(() => {
    if (tool === "freehand" || tool === "freehandSmooth") setShowDimensionLabels(false);
    setPendingRectangleCorner(null);
    setSlotPicks([]);
  }, [tool, labelPreferencesLoaded]);

  useEffect(() => {
    if (tool !== "circle" && tool !== "polygon") setPendingCircleCenter(null);
    if (tool !== "arc") setPendingArc(null);
  }, [tool]);
  const displayProfile = useMemo(() => {
    if (pointerAction?.kind === "transform-selection") return transformSketchSelection(profile, pointerAction.selection, pointerAction.bounds, pointerAction.handle, pointerAction.origin, pointerAction.current, pointerAction.shift, pointerAction.pivot);
    if (pointerAction?.kind === "move-selection") return translatedSketchSelection(profile, pointerAction.selection, pointerAction.current.x - pointerAction.origin.x, pointerAction.current.z - pointerAction.origin.z);
    if (pointerAction?.kind === "move-circle" || pointerAction?.kind === "resize-circle") {
      const next = structuredClone(profile);
      const circle = next.circles?.find((candidate) => candidate.id === pointerAction.circleId);
      if (!circle) return profile;
      if (pointerAction.kind === "move-circle") {
        circle.x = pointerAction.start.x + pointerAction.current.x - pointerAction.origin.x;
        circle.z = pointerAction.start.z + pointerAction.current.z - pointerAction.origin.z;
      } else {
        circle.radius = Math.max(0.01, Math.hypot(pointerAction.current.x - circle.x, pointerAction.current.z - circle.z));
        circle.radiusAngle = Math.atan2(pointerAction.current.z - circle.z, pointerAction.current.x - circle.x);
      }
      return solveSketchConstraints(next, `circle:${circle.id}:${pointerAction.kind === "move-circle" ? "center" : "radius"}`);
    }
    if (pointerAction?.kind === "move-arc-center") {
      const segment = profile.segments.find((candidate) => candidate.id === pointerAction.segmentId);
      if (!segment?.center) return profile;
      const dx = pointerAction.current.x - pointerAction.origin.x;
      const dz = pointerAction.current.z - pointerAction.origin.z;
      const next = structuredClone(profile);
      next.points = next.points.map((point) => point.id === segment.startId || point.id === segment.endId ? { ...point, x: point.x + dx, z: point.z + dz } : point);
      next.segments = next.segments.map((candidate) => candidate.id === segment.id ? { ...candidate, center: { x: pointerAction.startCenter.x + dx, z: pointerAction.startCenter.z + dz } } : candidate);
      return solveSketchConstraints(next, `${segment.id}:center`);
    }
    if (pointerAction?.kind === "move-point") {
      const source = profile.points.find((point) => point.id === pointerAction.pointId);
      if (!source) return profile;
      const deltaX = pointerAction.current.x - source.x;
      const deltaZ = pointerAction.current.z - source.z;
      const points = profile.points.map((point) => point.id === source.id ? {
        ...point,
        ...pointerAction.current,
        handleIn: point.handleIn ? { x: point.handleIn.x + deltaX, z: point.handleIn.z + deltaZ } : undefined,
        handleOut: point.handleOut ? { x: point.handleOut.x + deltaX, z: point.handleOut.z + deltaZ } : undefined,
      } : { ...point });
      const next = structuredClone(profile);
      next.points = points;
      const endingArc = next.segments.find((segment) => segment.kind === "arc" && segment.center && segment.endId === source.id);
      const target = next.points.find((point) => point.id === source.id)!;
      if (endingArc?.center) {
        const start = next.points.find((point) => point.id === endingArc.startId);
        if (start) {
          const radius = Math.hypot(start.x - endingArc.center.x, start.z - endingArc.center.z);
          const angle = Math.atan2(target.z - endingArc.center.z, target.x - endingArc.center.x);
          target.x = endingArc.center.x + Math.cos(angle) * radius;
          target.z = endingArc.center.z + Math.sin(angle) * radius;
        }
      }
      for (const arc of next.segments.filter((segment) => segment.kind === "arc" && segment.center && segment.startId === source.id)) {
        const end = next.points.find((point) => point.id === arc.endId);
        if (!end || !arc.center) continue;
        const radius = Math.hypot(target.x - arc.center.x, target.z - arc.center.z);
        const angle = Math.atan2(end.z - arc.center.z, end.x - arc.center.x);
        end.x = arc.center.x + Math.cos(angle) * radius;
        end.z = arc.center.z + Math.sin(angle) * radius;
      }
      return solveSketchConstraints(next, source.id);
    }
    if (pointerAction?.kind === "move-handle") {
      return {
        ...profile,
        points: profile.points.map((point) => {
          if (point.id !== pointerAction.pointId) return point;
          const next = { ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined };
          if (pointerAction.handle === "in") next.handleIn = { ...pointerAction.current };
          else next.handleOut = { ...pointerAction.current };
          if (point.mode === "autoSmooth") next.mode = "smooth";
          if (point.mode === "smooth" || point.mode === "autoSmooth") {
            const opposite = { x: point.x * 2 - pointerAction.current.x, z: point.z * 2 - pointerAction.current.z };
            if (pointerAction.handle === "in") next.handleOut = opposite;
            else next.handleIn = opposite;
          }
          return next;
        }),
      };
    }
    return profile;
  }, [pointerAction, profile]);
  const displayImages = useMemo(() => {
    const images = displayProfile.images ?? [];
    if (pointerAction?.kind === "move-image") {
      const deltaX = pointerAction.current.x - pointerAction.origin.x;
      const deltaZ = pointerAction.current.z - pointerAction.origin.z;
      return images.map((image) => image.id === pointerAction.imageId ? { ...image, x: pointerAction.start.x + deltaX, z: pointerAction.start.z + deltaZ } : image);
    }
    if (pointerAction?.kind === "resize-image") {
      return images.map((image) => image.id === pointerAction.imageId ? { ...image, ...resizeSketchImage(pointerAction.start, pointerAction.handle, pointerAction.current) } : image);
    }
    return images;
  }, [pointerAction, displayProfile.images]);
  const displayCircles = useMemo(() => {
    return displayProfile.circles ?? [];
  }, [displayProfile.circles]);
  const pointById = useMemo(() => new Map<string, SketchPoint>(([
    ...displayProfile.points,
    ...displayCircles.flatMap((circle) => {
      const angle = circle.radiusAngle ?? 0;
      return [
        { id: `circle:${circle.id}:center`, x: circle.x, z: circle.z },
        { id: `circle:${circle.id}:radius`, x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius },
      ];
    }),
    ...displayProfile.segments.filter((segment) => segment.kind === "arc" && segment.center).map((segment) => ({ id: `${segment.id}:center`, x: segment.center!.x, z: segment.center!.z })),
  ] as SketchPoint[]).map((point) => [point.id, point])), [displayCircles, displayProfile.points, displayProfile.segments]);
  const paths = useMemo(() => orderedPaths({ ...displayProfile, segments: displayProfile.segments.filter((segment) => !segment.construction && !segment.generatedTextId) }), [displayProfile]);
  const dimensionContours = useMemo(() => {
    const contours = new Map<string, Array<{ x: number; z: number }>>();
    for (const path of paths) {
      const outline = path.steps.flatMap(({ segment, from, to }) => {
        const points: Array<{ x: number; z: number }> = [from, to];
        if (segment.kind === "arc" && segment.center) {
          const radius = Math.hypot(from.x - segment.center.x, from.z - segment.center.z);
          points.push({ x: segment.center.x - radius, z: segment.center.z }, { x: segment.center.x + radius, z: segment.center.z }, { x: segment.center.x, z: segment.center.z - radius }, { x: segment.center.x, z: segment.center.z + radius });
        } else if (segment.kind !== "line") {
          const controls = curveControls({ segment, from, to });
          if (controls.first) points.push(controls.first);
          if (controls.second) points.push(controls.second);
        }
        return points;
      });
      for (const step of path.steps) contours.set(step.segment.id, outline);
    }
    return contours;
  }, [paths]);
  const activePoint = activePointId ? pointById.get(activePointId) ?? null : null;
  const selectedPoint = selected?.kind === "point" ? pointById.get(selected.id) ?? null : null;
  const selectedPointHandles = useMemo(() => {
    if (!selectedPoint) return null;
    const incoming = displayProfile.segments.find((segment) => segment.endId === selectedPoint.id && segment.kind !== "line" && segment.kind !== "arc");
    const outgoing = displayProfile.segments.find((segment) => segment.startId === selectedPoint.id && segment.kind !== "line" && segment.kind !== "arc");
    const previous = incoming ? pointById.get(incoming.startId) : null;
    const following = outgoing ? pointById.get(outgoing.endId) : null;
    const tangent = previous && following
      ? { x: (following.x - previous.x) / 6, z: (following.z - previous.z) / 6 }
      : previous
        ? { x: (selectedPoint.x - previous.x) / 3, z: (selectedPoint.z - previous.z) / 3 }
        : following
          ? { x: (following.x - selectedPoint.x) / 3, z: (following.z - selectedPoint.z) / 3 }
          : null;
    if (!tangent) return null;
    const usable = (handle: { x: number; z: number } | undefined) => handle && Math.hypot(handle.x - selectedPoint.x, handle.z - selectedPoint.z) > screenUnit;
    return {
      in: incoming ? usable(selectedPoint.handleIn) ? selectedPoint.handleIn! : { x: selectedPoint.x - tangent.x, z: selectedPoint.z - tangent.z } : null,
      out: outgoing ? usable(selectedPoint.handleOut) ? selectedPoint.handleOut! : { x: selectedPoint.x + tangent.x, z: selectedPoint.z + tangent.z } : null,
    };
  }, [displayProfile.segments, pointById, screenUnit, selectedPoint]);
  const smoothPreviewData = useMemo(() => {
    if (tool !== "smooth" || !activePoint || !hover) return null;
    const incoming = displayProfile.segments.find((segment) => segment.endId === activePoint.id);
    const previous = incoming ? pointById.get(incoming.startId) : null;
    const tangent = previous
      ? { x: (hover.x - previous.x) / 6, z: (hover.z - previous.z) / 6 }
      : { x: (hover.x - activePoint.x) / 6, z: (hover.z - activePoint.z) / 6 };
    const control1 = { x: activePoint.x + tangent.x, z: activePoint.z + tangent.z };
    const control2 = { x: hover.x - (hover.x - activePoint.x) / 6, z: hover.z - (hover.z - activePoint.z) / 6 };
    return `M ${activePoint.x} ${activePoint.z} C ${control1.x} ${control1.z} ${control2.x} ${control2.z} ${hover.x} ${hover.z}`;
  }, [activePoint, displayProfile.segments, hover, pointById, tool]);
  const selectedImage = selected?.kind === "image" ? displayImages.find((image) => image.id === selected.id) ?? null : null;
  const selectedVirtualCircleId = selected?.kind === "multiple"
    ? selected.pointIds.map((id) => /^circle:(.+):(center|radius)$/.exec(id)?.[1]).find(Boolean)
    : null;
  const selectedCircleId = selected?.kind === "circle" ? selected.id
    : selected?.kind === "circlePoint" ? selected.circleId
    : selectedVirtualCircleId;
  const selectedCircle = selectedCircleId ? displayCircles.find((circle) => circle.id === selectedCircleId) ?? null : null;
  const isPointSelected = (id: string) => selected?.kind === "point" ? selected.id === id : selected?.kind === "multiple" ? selected.pointIds.includes(id) : false;
  const isSegmentSelected = (id: string) => selected?.kind === "segment" ? selected.id === id : selected?.kind === "multiple" ? selected.segmentIds.includes(id) : false;
  const isCircleSelected = (id: string) => selected?.kind === "circle" ? selected.id === id : selected?.kind === "circlePoint" ? selected.circleId === id : selected?.kind === "multiple" ? (selected.circleIds?.includes(id) ?? false) || selected.pointIds.some((pointId) => pointId.startsWith(`circle:${id}:`)) : false;
  const isCirclePointSelected = (circleId: string, point: "center" | "radius") => selected?.kind === "circlePoint"
    ? selected.circleId === circleId && selected.point === point
    : selected?.kind === "multiple" ? selected.pointIds.includes(`circle:${circleId}:${point}`) : false;
  const isArcPointSelected = (segmentId: string) => selected?.kind === "arcPoint"
    ? selected.segmentId === segmentId
    : selected?.kind === "multiple" ? selected.pointIds.includes(`${segmentId}:center`) : false;
  const isReferencePointSelected = selected?.kind === "point" ? selected.id === SKETCH_ORIGIN_POINT_ID : selected?.kind === "multiple" ? selected.pointIds.includes(SKETCH_ORIGIN_POINT_ID) : false;
  const isReferenceAxisSelected = (axisId: string) => selected?.kind === "segment" ? selected.id === axisId : selected?.kind === "multiple" ? selected.segmentIds.includes(axisId) : false;
  const gridStep = clamp(workspace.gridBlockSize, 0.1, 200);
  const verticalLines = useMemo(() => {
    const lines: number[] = [];
    const start = Math.ceil((-workspace.width / 2) / gridStep) * gridStep;
    for (let x = start; x <= workspace.width / 2 + 0.0001; x += gridStep) lines.push(Number(x.toFixed(6)));
    return lines;
  }, [gridStep, workspace.width]);
  const horizontalLines = useMemo(() => {
    const lines: number[] = [];
    const start = Math.ceil((-workspace.depth / 2) / gridStep) * gridStep;
    for (let z = start; z <= workspace.depth / 2 + 0.0001; z += gridStep) lines.push(Number(z.toFixed(6)));
    return lines;
  }, [gridStep, workspace.depth]);

  const pivotSnapCandidates = useMemo(() => {
    const points: Array<{ x: number; z: number }> = profile.points.map((point) => ({ x: point.x, z: point.z }));
    const byId = new Map(profile.points.map((point) => [point.id, point]));
    for (const segment of profile.segments) {
      const dimension = segmentDimension(segment, byId);
      if (dimension) points.push(dimension.midpoint);
      if (segment.kind === "arc" && segment.center) points.push(segment.center);
    }
    for (const circle of profile.circles ?? []) {
      const angle = circle.radiusAngle ?? 0;
      points.push({ x: circle.x, z: circle.z }, { x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius });
    }
    return points;
  }, [profile]);

  const pointFromEvent = (event: { clientX: number; clientY: number }, constrainToGrid = true, snapEnabled = true) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const screenPoint = svg.createSVGPoint();
    screenPoint.x = event.clientX;
    screenPoint.y = event.clientY;
    const local = screenPoint.matrixTransform(matrix.inverse());
    const step = snapEnabled ? (exactSnapStep === undefined ? snapStep(snap) : Math.max(0, exactSnapStep)) : 0;
    const x = snapValue(local.x, step);
    const z = snapValue(-local.y, step);
    return constrainToGrid
      ? { x: clamp(x, -workspace.width / 2, workspace.width / 2), z: clamp(z, -workspace.depth / 2, workspace.depth / 2) }
      : { x, z };
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const bounds = svg.getBoundingClientRect();
      setSvgSize({ width: bounds.width, height: bounds.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const beginPan = (event: ReactPointerEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setPointerAction({ kind: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
  };

  const handlePlanePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      beginPan(event);
      return;
    }
    if (event.button !== 0 || (event.target !== event.currentTarget && (event.target as Element).closest("[data-sketch-entity]"))) return;
    const freehandTool = tool === "freehand" || tool === "freehandSmooth";
    const point = pointFromEvent(event, tool !== "select" && !freehandTool, true);
    if (!point) return;
    event.preventDefault();
    if (freehandTool) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPointerAction({ kind: "freehand", pointerId: event.pointerId, origin: point, current: point, points: [point], smooth: tool === "freehandSmooth" });
    } else if (tool === "bezier") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPointerAction({ kind: "bezier", pointerId: event.pointerId, origin: point, current: point });
    } else if (tool === "slot" || tool === "arcSlot") {
      const picks = [...slotPicks, point];
      if (picks.length === (tool === "slot" ? 3 : 4)) {
        const contour = sketchSlot(tool, picks);
        if (contour) { onAddSlot?.(contour); setSlotPicks([]); }
      } else if (!slotPicks.length || Math.hypot(point.x - slotPicks[slotPicks.length - 1].x, point.z - slotPicks[slotPicks.length - 1].z) > 0.001) {
        setSlotPicks(picks);
        setHover(point);
      }
    } else if (tool === "ellipse") {
      if (!pendingRectangleCorner) { setPendingRectangleCorner(point); setHover(point); }
      else {
        const contour = sketchEllipse(pendingRectangleCorner, point);
        if (contour) { onAddRectangleVariant?.(contour); setPendingRectangleCorner(null); }
      }
    } else if (tool === "rectangle" || tool === "centerRectangle" || tool === "roundedRectangle") {
      if (!pendingRectangleCorner) {
        setPendingRectangleCorner(point);
        setHover(point);
      } else if (Math.abs(point.x - pendingRectangleCorner.x) > 0.001 && Math.abs(point.z - pendingRectangleCorner.z) > 0.001) {
        if (tool === "rectangle") onAddRectangle?.([pendingRectangleCorner, { x: point.x, z: pendingRectangleCorner.z }, point, { x: pendingRectangleCorner.x, z: point.z }]);
        else {
          const contour = sketchRectangle(tool, pendingRectangleCorner, point);
          if (contour) onAddRectangleVariant?.(contour);
        }
        setPendingRectangleCorner(null);
      }
    } else if (tool === "circle" || tool === "polygon") {
      if (!pendingCircleCenter) {
        setPendingCircleCenter(point);
      } else {
        const radius = Math.hypot(point.x - pendingCircleCenter.x, point.z - pendingCircleCenter.z);
        if (radius > 0.001) {
          if (tool === "polygon") onAddPolygon?.(pendingCircleCenter, radius, event.shiftKey ? -Math.PI / 2 - Math.PI / polygonSides : Math.atan2(point.z - pendingCircleCenter.z, point.x - pendingCircleCenter.x));
          else onAddCircle?.({ x: pendingCircleCenter.x, z: pendingCircleCenter.z, radius });
        }
        setPendingCircleCenter(null);
      }
    } else if (tool === "arc") {
      if (!pendingArc) {
        setPendingArc({ center: point });
      } else if (!pendingArc.start) {
        if (Math.hypot(point.x - pendingArc.center.x, point.z - pendingArc.center.z) > 0.001) setPendingArc({ ...pendingArc, start: point });
      } else {
        const radius = Math.hypot(pendingArc.start.x - pendingArc.center.x, pendingArc.start.z - pendingArc.center.z);
        const angle = Math.atan2(point.z - pendingArc.center.z, point.x - pendingArc.center.x);
        const end = { x: pendingArc.center.x + Math.cos(angle) * radius, z: pendingArc.center.z + Math.sin(angle) * radius };
        const startAngle = Math.atan2(pendingArc.start.z - pendingArc.center.z, pendingArc.start.x - pendingArc.center.x);
        const positiveSweep = (angle - startAngle + Math.PI * 2) % (Math.PI * 2);
        onAddArc?.({ center: pendingArc.center, start: pendingArc.start, end, clockwise: positiveSweep <= Math.PI });
        setPendingArc(null);
      }
    } else if (tool === "select") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPointerAction({ kind: "marquee", pointerId: event.pointerId, origin: point, current: point });
    } else if (tool === "line" || tool === "smooth" || tool === "measure") {
      onPlanePoint(point);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    setCreationRotationLocked(event.shiftKey);
    if (pointerAction?.kind === "pan") {
      const matrix = svgRef.current?.getScreenCTM();
      const scaleX = matrix ? Math.max(0.0001, Math.hypot(matrix.a, matrix.b)) : 1;
      const scaleY = matrix ? Math.max(0.0001, Math.hypot(matrix.c, matrix.d)) : 1;
      const deltaX = event.clientX - pointerAction.clientX;
      const deltaY = event.clientY - pointerAction.clientY;
      setPan((current) => ({
        x: clamp(current.x - deltaX / scaleX, -workspace.width / 2, workspace.width / 2),
          z: clamp(current.z + deltaY / scaleY, -workspace.depth / 2, workspace.depth / 2),
      }));
      setPointerAction({ ...pointerAction, clientX: event.clientX, clientY: event.clientY });
      return;
    }
    const point = pointFromEvent(event, tool !== "freehand" && tool !== "freehandSmooth" && pointerAction?.kind !== "marquee" && pointerAction?.kind !== "freehand" && pointerAction?.kind !== "transform-selection" && pointerAction?.kind !== "move-selection-pivot", pointerAction?.kind !== "freehand" && !(pointerAction?.kind === "transform-selection" && pointerAction.handle === "rotate"));
    setHover(point);
    if (point && pointerAction?.kind === "move-selection-pivot") {
      const pointer = pointFromEvent(event, false, false);
      if (!pointer) return;
      const desired = { x: pointer.x + pointerAction.offset.x, z: pointer.z + pointerAction.offset.z };
      let snapTarget: { x: number; z: number } | undefined;
      let nearestDistance = 12 * screenUnit;
      for (const candidate of pivotSnapCandidates) {
        const distance = Math.hypot(candidate.x - desired.x, candidate.z - desired.z);
        if (distance < nearestDistance) { snapTarget = candidate; nearestDistance = distance; }
      }
      const step = exactSnapStep ?? snapStep(snap);
      setPointerAction({ ...pointerAction, snapTarget, current: snapTarget ? { ...snapTarget } : { x: snapValue(desired.x, step), z: snapValue(desired.z, step) } });
      return;
    }
    if (point && pointerAction?.kind === "freehand") {
      const last = pointerAction.points.at(-1)!;
      if (Math.hypot(point.x - last.x, point.z - last.z) >= screenUnit * 2) setPointerAction({ ...pointerAction, current: point, points: [...pointerAction.points, point] });
    } else if (point && pointerAction) setPointerAction(pointerAction.kind === "transform-selection" ? { ...pointerAction, current: point, shift: event.shiftKey } : { ...pointerAction, current: point });
  };

  const finishPointerAction = (event: ReactPointerEvent<SVGSVGElement>) => {
    const action = pointerAction;
    if (!action || action.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (action.kind === "pan") {
      setPointerAction(null);
      return;
    }
    if (action.kind === "transform-selection") {
      if (Math.hypot(action.current.x - action.origin.x, action.current.z - action.origin.z) > 0.001) onMoveSelection?.(transformSketchSelection(profile, action.selection, action.bounds, action.handle, action.origin, action.current, action.shift, action.pivot));
      setSelectionPivot({ key: selectionKey, point: action.pivot });
      setPointerAction(null);
      return;
    }
    if (action.kind === "move-selection-pivot") {
      setSelectionPivot({ key: selectionKey, point: action.current });
      setPointerAction(null);
      return;
    }
    if (action.kind === "freehand") {
      onFreehandContour?.([...action.points, action.current], action.smooth);
      setPointerAction(null);
      return;
    }
    if (action.kind === "marquee") {
      const minX = Math.min(action.origin.x, action.current.x);
      const maxX = Math.max(action.origin.x, action.current.x);
      const minZ = Math.min(action.origin.z, action.current.z);
      const maxZ = Math.max(action.origin.z, action.current.z);
      const contains = (point: { x: number; z: number }) => point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ;
      const crossing = action.current.x < action.origin.x;
      const crossesBox = (a: { x: number; z: number }, b: { x: number; z: number }) => {
        let low = 0, high = 1;
        for (const [start, delta, minimum, maximum] of [[a.x, b.x - a.x, minX, maxX], [a.z, b.z - a.z, minZ, maxZ]]) {
          if (Math.abs(delta) < 1e-12) { if (start < minimum || start > maximum) return false; }
          else {
            const first = (minimum - start) / delta, last = (maximum - start) / delta;
            low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
            if (low > high) return false;
          }
        }
        return true;
      };
      const pointIds = profile.points.filter((point) => !point.generatedTextId && contains(point)).map((point) => point.id);
      const segmentIds = profile.segments.filter((segment) => {
        if (segment.generatedTextId) return false;
        const start = pointById.get(segment.startId);
        const end = pointById.get(segment.endId);
        if (!start || !end) return false;
        const path = Array.from(svgRef.current?.querySelectorAll<SVGPathElement>('path[data-sketch-entity="segment"]') ?? []).find((element) => element.dataset.sketchId === segment.id);
        if (!path) return crossing ? crossesBox(start, end) : contains(start) && contains(end);
        const bounds = path.getBBox();
        if (!crossing) return contains({ x: bounds.x, z: bounds.y }) && contains({ x: bounds.x + bounds.width, z: bounds.y + bounds.height });
        if (bounds.x > maxX || bounds.x + bounds.width < minX || bounds.y > maxZ || bounds.y + bounds.height < minZ) return false;
        const length = path.getTotalLength();
        const steps = segment.kind === "line" ? 1 : Math.min(4096, Math.max(32, Math.ceil(length / Math.max(.001, screenUnit))));
        let previous = path.getPointAtLength(0);
        for (let i = 1; i <= steps; i++) {
          const current = path.getPointAtLength(length * i / steps);
          if (crossesBox({ x: previous.x, z: previous.y }, { x: current.x, z: current.y })) return true;
          previous = current;
        }
        return false;
      }).map((segment) => segment.id);
      const imageIds = (profile.images ?? []).filter((image) => {
        const imageMinX = image.x - image.width / 2;
        const imageMaxX = image.x + image.width / 2;
        const imageMinZ = image.z - image.depth / 2;
        const imageMaxZ = image.z + image.depth / 2;
        return crossing ? imageMaxX >= minX && imageMinX <= maxX && imageMaxZ >= minZ && imageMinZ <= maxZ : imageMinX >= minX && imageMaxX <= maxX && imageMinZ >= minZ && imageMaxZ <= maxZ;
      }).map((image) => image.id);
      const circleIds = (profile.circles ?? []).filter((circle) => {
        if (!crossing) return circle.x - circle.radius >= minX && circle.x + circle.radius <= maxX && circle.z - circle.radius >= minZ && circle.z + circle.radius <= maxZ;
        const nearest = Math.hypot(circle.x - Math.max(minX, Math.min(maxX, circle.x)), circle.z - Math.max(minZ, Math.min(maxZ, circle.z)));
        const farthest = Math.hypot(Math.max(Math.abs(circle.x - minX), Math.abs(circle.x - maxX)), Math.max(Math.abs(circle.z - minZ), Math.abs(circle.z - maxZ)));
        return nearest <= circle.radius && farthest >= circle.radius;
      }).map((circle) => circle.id);
      onSelectMany(pointIds, segmentIds, imageIds, circleIds);
      setPointerAction(null);
      return;
    }
    if (action.kind === "move-selection") {
      if (Math.hypot(action.current.x - action.origin.x, action.current.z - action.origin.z) > 0.001) onMoveSelection?.(translatedSketchSelection(profile, action.selection, action.current.x - action.origin.x, action.current.z - action.origin.z));
      else if (action.entityKind === "point") onPointPress(action.entityId, true);
      else if (action.entityKind === "segment") onSelectSegment(action.entityId, true);
      else if (action.entityKind === "circle") onSelectCircle?.(action.entityId, true);
    } else if (action.kind === "bezier") {
      const dx = action.current.x - action.origin.x;
      const dz = action.current.z - action.origin.z;
      onPlanePoint(action.origin, {
        handleIn: { x: action.origin.x - dx, z: action.origin.z - dz },
        handleOut: { x: action.origin.x + dx, z: action.origin.z + dz },
      });
    } else if (action.kind === "move-circle") {
      onMoveCircle?.(action.circleId, { x: action.start.x + action.current.x - action.origin.x, z: action.start.z + action.current.z - action.origin.z });
    } else if (action.kind === "resize-circle") {
      onResizeCircle?.(action.circleId, Math.max(0.01, Math.hypot(action.current.x - action.start.x, action.current.z - action.start.z)), Math.atan2(action.current.z - action.start.z, action.current.x - action.start.x));
    } else if (action.kind === "move-arc-center") {
      onMoveArcCenter?.(action.segmentId, { x: action.startCenter.x + action.current.x - action.origin.x, z: action.startCenter.z + action.current.z - action.origin.z });
    } else if (action.kind === "move-point") {
      onMovePoint(action.pointId, action.current);
    } else if (action.kind === "move-handle") {
      onMoveHandle(action.pointId, action.handle, action.current);
    } else if (action.kind === "move-image") {
      onUpdateImage(action.imageId, {
        x: action.start.x + action.current.x - action.origin.x,
        z: action.start.z + action.current.z - action.origin.z,
      }, uiText("ui.sketchworkspace.sketch.image.moved.ed55e6", {}, locale));
    } else if (action.kind === "resize-image") {
      onUpdateImage(action.imageId, resizeSketchImage(action.start, action.handle, action.current), uiText("ui.sketchworkspace.sketch.image.resized.4d3d1f", {}, locale));
    }
    setPointerAction(null);
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const physicalWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL
      || Math.abs(event.deltaX) < 0.5
      || (Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 40);
    if (event.ctrlKey || event.metaKey || physicalWheel) {
      const normalizedDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      const nextZoom = clamp(zoom * Math.exp(-normalizedDelta * 0.012), 0.75, 6);
      const anchor = pointFromEvent(event, false, false);
      if (anchor) {
        const ratio = zoom / nextZoom;
        setPan((current) => ({ x: anchor.x - (anchor.x - current.x) * ratio, z: anchor.z - (anchor.z - current.z) * ratio }));
      }
      setZoom(nextZoom);
      return;
    }
    const matrix = svgRef.current?.getScreenCTM();
    const scaleX = matrix ? Math.max(0.0001, Math.hypot(matrix.a, matrix.b)) : 1;
    const scaleY = matrix ? Math.max(0.0001, Math.hypot(matrix.c, matrix.d)) : 1;
    setPan((current) => ({
      x: clamp(current.x + event.deltaX / scaleX, -workspace.width / 2, workspace.width / 2),
      z: clamp(current.z - event.deltaY / scaleY, -workspace.depth / 2, workspace.depth / 2),
    }));
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const preventBrowserPinch = (event: Event) => event.preventDefault();
    svg.addEventListener("wheel", handleWheel, { passive: false });
    svg.addEventListener("gesturestart", preventBrowserPinch, { passive: false });
    svg.addEventListener("gesturechange", preventBrowserPinch, { passive: false });
    return () => {
      svg.removeEventListener("wheel", handleWheel);
      svg.removeEventListener("gesturestart", preventBrowserPinch);
      svg.removeEventListener("gesturechange", preventBrowserPinch);
    };
  });

  const beginEntityDrag = (event: ReactPointerEvent<SVGElement>, action: PointerAction) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setPointerAction(action);
  };

  const measurementLength = measurement ? Math.hypot(measurement.end.x - measurement.start.x, measurement.end.z - measurement.start.z) : 0;
  const geometrySelectionBounds = useMemo(() => tool === "select" && !annotationTool && !selectedAnnotationId && onMoveSelection ? sketchSelectionBounds(displayProfile, selected) : null, [displayProfile, selected, tool, annotationTool, selectedAnnotationId, onMoveSelection]);
  const transformFrame = geometrySelectionBounds ? {
    minX: geometrySelectionBounds.minX - (geometrySelectionBounds.maxX - geometrySelectionBounds.minX < screenUnit * 12 ? screenUnit * 6 : 0),
    maxX: geometrySelectionBounds.maxX + (geometrySelectionBounds.maxX - geometrySelectionBounds.minX < screenUnit * 12 ? screenUnit * 6 : 0),
    minZ: geometrySelectionBounds.minZ - (geometrySelectionBounds.maxZ - geometrySelectionBounds.minZ < screenUnit * 12 ? screenUnit * 6 : 0),
    maxZ: geometrySelectionBounds.maxZ + (geometrySelectionBounds.maxZ - geometrySelectionBounds.minZ < screenUnit * 12 ? screenUnit * 6 : 0),
  } : null;
  const transformPivot = pointerAction?.kind === "move-selection-pivot" ? pointerAction.current
    : pointerAction?.kind === "transform-selection" ? pointerAction.pivot
    : selectionPivot?.key === selectionKey ? selectionPivot.point
    : geometrySelectionBounds ? { x: (geometrySelectionBounds.minX + geometrySelectionBounds.maxX) / 2, z: (geometrySelectionBounds.minZ + geometrySelectionBounds.maxZ) / 2 } : null;
  const beginSelectionTransform = (event: ReactPointerEvent<SVGElement>, handle: SketchTransformHandle) => {
    if (event.button === 1) { beginPan(event); return; }
    if (!selected || !geometrySelectionBounds || !transformPivot || event.button !== 0) return;
    const origin = pointFromEvent(event, false, handle !== "rotate");
    if (!origin) return;
    beginEntityDrag(event, { kind: "transform-selection", pointerId: event.pointerId, selection: selected, bounds: geometrySelectionBounds, handle, origin, current: origin, shift: event.shiftKey, pivot: { ...transformPivot } });
  };
  const measurementLabel = formatLength(measurementLength, workspace.accuracy);
  const previewEndpoint = tool === "bezier" && pointerAction?.kind === "bezier" ? pointerAction.origin : hover;
  const bezierPreviewData = tool === "bezier" && activePoint && previewEndpoint ? (() => {
    const first = activePoint.handleOut ?? activePoint;
    const second = pointerAction?.kind === "bezier"
      ? { x: 2 * pointerAction.origin.x - pointerAction.current.x, z: 2 * pointerAction.origin.z - pointerAction.current.z }
      : previewEndpoint;
    return `M ${activePoint.x} ${activePoint.z} C ${first.x} ${first.z} ${second.x} ${second.z} ${previewEndpoint.x} ${previewEndpoint.z}`;
  })() : null;
  const previewLength = activePoint && previewEndpoint ? Math.hypot(previewEndpoint.x - activePoint.x, previewEndpoint.z - activePoint.z) : 0;
  const previewLabel = formatLength(previewLength, workspace.accuracy);
  const labelOffset = 22 * screenUnit;
  const pointRadius = 5 * screenUnit;
  const controlPointRadius = 6 * screenUnit;
  const hoverPointRadius = 5 * screenUnit;
  const handleSize = 12 * screenUnit;
  const handleRadius = 2 * screenUnit;
  const selectedImageBounds = selectedImage ? {
    minX: selectedImage.x - selectedImage.width / 2,
    maxX: selectedImage.x + selectedImage.width / 2,
    minZ: selectedImage.z - selectedImage.depth / 2,
    maxZ: selectedImage.z + selectedImage.depth / 2,
  } : null;
  const imageResizeHandles: Array<{ id: ResizeHandle; x: number; z: number }> = selectedImage && selectedImageBounds ? [
    { id: "nw", x: selectedImageBounds.minX, z: selectedImageBounds.maxZ },
    { id: "n", x: selectedImage.x, z: selectedImageBounds.maxZ },
    { id: "ne", x: selectedImageBounds.maxX, z: selectedImageBounds.maxZ },
    { id: "e", x: selectedImageBounds.maxX, z: selectedImage.z },
    { id: "se", x: selectedImageBounds.maxX, z: selectedImageBounds.minZ },
    { id: "s", x: selectedImage.x, z: selectedImageBounds.minZ },
    { id: "sw", x: selectedImageBounds.minX, z: selectedImageBounds.minZ },
    { id: "w", x: selectedImageBounds.minX, z: selectedImage.z },
  ] : [];
  const referenceFootprints = useMemo(
    () => new Map(referenceShapes.map((shape) => [shape.id, importedMeshFootprint(shape)])),
    [referenceShapes],
  );
  const sceneReferencePaths = useMemo(() => {
    if (!sceneReference) return null;
    const { positions, indices, edges } = sceneReference;
    const faceCommands: string[] = [];
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const a = indices[index] * 3;
      const b = indices[index + 1] * 3;
      const c = indices[index + 2] * 3;
      const signedArea = (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1])
        - (positions[b + 1] - positions[a + 1]) * (positions[c] - positions[a]);
      if (signedArea <= 1e-8) continue;
      faceCommands.push(`M ${positions[a]} ${positions[a + 1]} L ${positions[b]} ${positions[b + 1]} L ${positions[c]} ${positions[c + 1]} Z`);
    }
    const edgeCommands: string[] = [];
    for (let index = 0; index + 5 < edges.length; index += 6) {
      edgeCommands.push(`M ${edges[index]} ${edges[index + 1]} L ${edges[index + 3]} ${edges[index + 4]}`);
    }
    return { faces: faceCommands.join(" "), edges: edgeCommands.join(" ") };
  }, [sceneReference]);
  const editingGeometry = Boolean(pointerAction) || !["select", "measure"].includes(tool);
  const visibleValidation = editingGeometry ? null : profileValidation;
  const openSketch = isOpenSketchProfile(profileValidation);
  const invalidSegmentIds = useMemo(() => new Set(visibleValidation?.diagnostics.flatMap((diagnostic) => diagnostic.segmentIds ?? []) ?? []), [visibleValidation]);
  const invalidCircleIds = useMemo(() => new Set(visibleValidation?.diagnostics.flatMap((diagnostic) => diagnostic.circleIds ?? []) ?? []), [visibleValidation]);
  const invalidPointIds = useMemo(() => new Set(visibleValidation?.diagnostics.flatMap((diagnostic) => diagnostic.pointIds ?? []) ?? []), [visibleValidation]);

  return (
    <main className="sketch-workspace-stage">
      {profileValidation && !editingGeometry ? <aside className={`sketch-profile-status ${profileValidation.valid || openSketch ? "valid" : "invalid"}`}>
        <strong>{openSketch ? uiText("sketch.openDrawing", {}, locale) : profileValidation.valid ? uiText(pluralMessage(locale, "sketch.validProfile", profileValidation.closedContourCount), { count: profileValidation.closedContourCount }, locale) : uiText("ui.sketchworkspace.invalid.profile.ef4b23", {}, locale)}</strong>
        {!profileValidation.valid && !openSketch ? <span>{profileValidation.diagnostics[0]?.message}</span> : null}
        {profileValidation.diagnostics.length > 1 && !openSketch ? <small>{uiText(pluralMessage(locale, "sketch.moreProblems", profileValidation.diagnostics.length - 1), { count: profileValidation.diagnostics.length - 1 }, locale)}</small> : null}
      </aside> : null}
      {operation === "revolve" ? <SketchRevolvePreview positions={revolvePreviewPositions} /> : null}
      <div className="camera-controls sketch-camera-controls" aria-label={uiText("ui.sketchworkspace.sketch.view.controls.909bec", {}, locale)}>
        <button aria-label={uiText("ui.sketchworkspace.reset.sketch.view.96427e", {}, locale)} onClick={() => { setZoom(1); setPan({ x: 0, z: 0 }); }}><Home size={28} /></button>
        <button aria-label={uiText("camera.zoomIn", {}, locale)} onClick={() => setZoom((value) => clamp(value * 1.25, 0.75, 6))}><Plus size={33} /></button>
        <button aria-label={uiText("camera.zoomOut", {}, locale)} onClick={() => setZoom((value) => clamp(value / 1.25, 0.75, 6))}><Minus size={33} /></button>
        <span className="camera-control-separator" />
        <button className={showDimensionLabels ? "active" : ""} type="button" aria-label={uiText("ui.sketchworkspace.show.or.hide.lengths.8f1aaa", {}, locale)} title={uiText("ui.sketchworkspace.show.or.hide.lengths.8f1aaa", {}, locale)} aria-pressed={showDimensionLabels} onClick={() => setShowDimensionLabels((visible) => !visible)}><ViewToolbarIcon file="toggle-lengths" /></button>
        <button data-tutorial="sketch-visibility" className={showAnnotations ? "active" : ""} type="button" aria-label={uiText("ui.sketchworkspace.show.or.hide.annotations.e7f82f", {}, locale)} title={uiText("ui.sketchworkspace.show.or.hide.annotations.e7f82f", {}, locale)} aria-pressed={showAnnotations} onClick={() => { setShowAnnotations((visible) => !visible); if (showAnnotations) { onSelectAnnotation?.(null); if (annotationTool) onCancelActiveTool?.(); } }}><ViewToolbarIcon file="toggle-dimensions" /></button>
        <button className={showConstraintLabels ? "active" : ""} type="button" aria-label={uiText("ui.sketchworkspace.show.or.hide.constraint.labels.87746e", {}, locale)} title={uiText("ui.sketchworkspace.show.or.hide.constraint.labels.87746e", {}, locale)} aria-pressed={showConstraintLabels} onClick={() => setShowConstraintLabels((visible) => !visible)}><ViewToolbarIcon file="toggle-constraints" /></button>
      </div>
      <section className="sketch-plate-wrap" aria-label={uiText("ui.sketchworkspace.2d.sketch.plate.da6dc0", {}, locale)}>
        <svg
          ref={svgRef}
          className={`sketch-plate tool-${tool} ${pointerAction?.kind === "pan" ? "panning" : ""}`}
          viewBox={`${pan.x - viewWidth / 2} ${-pan.z - viewDepth / 2} ${viewWidth} ${viewDepth}`}
          preserveAspectRatio="none"
          onPointerDown={(event) => { if (selectedAnnotationId) onSelectAnnotation?.(null); handlePlanePointerDown(event); }}
          onPointerDownCapture={(event) => {
            if (annotationTool && event.button === 0) {
              const point = pointFromEvent(event, false, true); if (!point) return;
              event.preventDefault(); event.stopPropagation();
              const picks = [...annotationPicks, { x: point.x, y: point.z }];
              const required = annotationTool === "text" ? 1 : annotationTool === "angle" ? 3 : 2;
              if (picks.length === required) { onAddAnnotation?.(sketchAnnotationFromPicks(annotationTool, picks, locale)); setAnnotationPicks([]); setAnnotationHover(null); }
              else setAnnotationPicks(picks);
              return;
            }
            if ((event.target as Element).closest("[data-sketch-annotation]")) return;
            if (event.button !== 0 || tool !== "select" || !selected || !onMoveSelection) return;
            const entity = (event.target as Element).closest("[data-sketch-entity].selected");
            if (!entity || !["point", "segment", "circle"].includes(entity.getAttribute("data-sketch-entity") ?? "")) return;
            const origin = pointFromEvent(event);
            if (!origin) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setPointerAction({ kind: "move-selection", pointerId: event.pointerId, origin, current: origin, selection: selected, entityKind: entity.getAttribute("data-sketch-entity")!, entityId: entity.getAttribute("data-sketch-id")! });
          }}
          onPointerMove={(event) => { if (annotationTool) { const point = pointFromEvent(event, false, true); if (point) setAnnotationHover({ x: point.x, y: point.z }); } else handlePointerMove(event); }}
          onPointerUp={finishPointerAction}
          onPointerCancel={() => setPointerAction(null)}
          onPointerLeave={() => !pointerAction && setHover(null)}
          onContextMenu={(event) => {
            if (annotationTool) { event.preventDefault(); setAnnotationPicks([]); setAnnotationHover(null); onCancelActiveTool?.(); return; }
            if (!["line", "connect", "slot", "arcSlot", "rectangle", "centerRectangle", "roundedRectangle", "ellipse", "polygon"].includes(tool)) return;
            event.preventDefault();
            setPointerAction(null);
            setHover(null);
            onCancelActiveTool?.();
          }}
        >
          <g className="sketch-plate-world" transform="scale(1 -1)">
          <rect className="sketch-plate-background" x={-workspace.width / 2} y={-workspace.depth / 2} width={workspace.width} height={workspace.depth} />
          {pointerAction?.kind === "freehand" ? <polyline className="sketch-freehand-preview" points={[...pointerAction.points, pointerAction.current].map((point) => `${point.x},${point.z}`).join(" ")} /> : null}
          {workspace.showGrid ? (
            <g className="sketch-grid" pointerEvents="none">
              {verticalLines.map((x, index) => <line className={Math.abs(x) < 0.0001 ? "axis" : index % WORKPLANE_MAJOR_GRID_INTERVAL === 0 ? "major" : "minor"} key={`x-${x}`} x1={x} y1={-workspace.depth / 2} x2={x} y2={workspace.depth / 2} />)}
              {horizontalLines.map((z, index) => <line className={Math.abs(z) < 0.0001 ? "axis" : index % WORKPLANE_MAJOR_GRID_INTERVAL === 0 ? "major" : "minor"} key={`z-${z}`} x1={-workspace.width / 2} y1={z} x2={workspace.width / 2} y2={z} />)}
              {(() => {
                const side = Math.min(workspace.width, workspace.depth);
                const length = side * 0.09;
                const inset = side * 0.025;
                const head = length * 0.18;
                const originX = -workspace.width / 2 + inset;
                const originZ = -workspace.depth / 2 + inset;
                return <g className="sketch-grid-axis-indicator">
                  <line className="axis-x" x1={originX} y1={originZ} x2={originX + length} y2={originZ} />
                  <polygon className="axis-x" points={`${originX + length},${originZ} ${originX + length - head},${originZ - head * 0.55} ${originX + length - head},${originZ + head * 0.55}`} />
                  <line className="axis-y" x1={originX} y1={originZ} x2={originX} y2={originZ + length} />
                  <polygon className="axis-y" points={`${originX},${originZ + length} ${originX - head * 0.55},${originZ + length - head} ${originX + head * 0.55},${originZ + length - head}`} />
                </g>;
              })()}
            </g>
          ) : null}
          <g className="sketch-reference-axes" pointerEvents={tool === "select" ? "auto" : "none"}>
            <line data-sketch-entity="reference-axis" className={`reference-axis axis-x ${isReferenceAxisSelected(SKETCH_X_AXIS_ID) ? "selected" : ""}`} x1={-viewWidth} y1={0} x2={viewWidth} y2={0} onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onSelectSegment(SKETCH_X_AXIS_ID, true);
            }} />
            <line data-sketch-entity="reference-axis" className={`reference-axis axis-y ${isReferenceAxisSelected(SKETCH_Y_AXIS_ID) ? "selected" : ""}`} x1={0} y1={-viewDepth} x2={0} y2={viewDepth} onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onSelectSegment(SKETCH_Y_AXIS_ID, true);
            }} />
            <circle data-sketch-entity="reference-origin" className={`reference-origin ${isReferencePointSelected ? "selected" : ""}`} cx={0} cy={0} r={6 * screenUnit} onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onPointPress(SKETCH_ORIGIN_POINT_ID, true);
            }} />
          </g>
          {operation === "revolve" ? (
            <g className="sketch-revolve-guide" pointerEvents="none">
              <rect x={0} y={-workspace.depth / 2} width={workspace.width / 2} height={workspace.depth} />
              <line x1={0} y1={-workspace.depth / 2} x2={0} y2={workspace.depth / 2} />
              <text x={-5 * screenUnit} y={workspace.depth / 2 - 18 * screenUnit} fontSize={12 * screenUnit}>{uiText("ui.sketchworkspace.revolve.axis.96c40c", {}, locale)}</text>
            </g>
          ) : null}
          <g className="sketch-reference-images">
            {displayImages.map((image) => (
              <image
                key={image.id}
                data-sketch-entity="image"
                aria-label={image.name}
                href={image.dataUrl}
                x={image.x - image.width / 2}
                y={image.z - image.depth / 2}
                width={image.width}
                height={image.depth}
                opacity={image.opacity ?? 0.55}
                preserveAspectRatio="none"
                pointerEvents={tool === "select" ? "auto" : "none"}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.button === 1) {
                    beginPan(event);
                    return;
                  }
                  if (event.button !== 0 || tool !== "select") return;
                  const point = pointFromEvent(event);
                  if (!point) return;
                  onSelectImage(image.id);
                  beginEntityDrag(event, {
                    kind: "move-image",
                    pointerId: event.pointerId,
                    imageId: image.id,
                    origin: point,
                    current: point,
                    start: { ...image },
                  });
                }}
              />
            ))}
          </g>
          <g className="sketch-reference-shapes" pointerEvents="none">
            {sceneReference?.images?.map((image) => <image key={image.id} href={image.dataUrl} x={0} y={0} width={1} height={1} transform={image.transform} opacity={image.opacity} preserveAspectRatio="none" />)}
            {sceneReferencePaths ? <g className="sketch-scene-reference">
              <path className="faces" d={sceneReferencePaths.faces} />
              <path className="edges" d={sceneReferencePaths.edges} />
            </g> : null}
            {referenceShapes.filter((shape) => !shape.hidden).map((shape) => {
              const footprint = referenceFootprints.get(shape.id);
              return (
                <g key={shape.id} transform={`rotate(${shape.rotation ?? 0} ${shape.x} ${shape.z})`}>
                  {footprint?.fillD || footprint?.outlineD ? (
                    <>
                      {footprint.fillD ? <path className="sketch-reference-mesh-face" d={footprint.fillD} /> : null}
                      {footprint.outlineD ? <path className="sketch-reference-mesh-outline" d={footprint.outlineD} /> : null}
                    </>
                  ) : isRoundReference(shape) ? (
                    <ellipse cx={shape.x} cy={shape.z} rx={shape.width / 2} ry={shape.depth / 2} />
                  ) : (
                    <rect x={shape.x - shape.width / 2} y={shape.z - shape.depth / 2} width={shape.width} height={shape.depth} />
                  )}
                </g>
              );
            })}
          </g>
          <rect className="sketch-plate-border" x={-workspace.width / 2} y={-workspace.depth / 2} width={workspace.width} height={workspace.depth} pointerEvents="none" />
          {pointerAction?.kind === "marquee" ? (
            <rect
              className={`sketch-selection-marquee ${pointerAction.current.x >= pointerAction.origin.x ? "window-selection" : "crossing-selection"}`}
              x={Math.min(pointerAction.origin.x, pointerAction.current.x)}
              y={Math.min(pointerAction.origin.z, pointerAction.current.z)}
              width={Math.abs(pointerAction.current.x - pointerAction.origin.x)}
              height={Math.abs(pointerAction.current.z - pointerAction.origin.z)}
              pointerEvents="none"
            />
          ) : null}
          <g className="sketch-profile-fills" pointerEvents="none">
            {paths.some((path) => path.closed) || displayCircles.some((circle) => !circle.construction) ? <path fillRule="evenodd" d={[...paths.filter((path) => path.closed).map(pathData), ...displayCircles.filter((circle) => !circle.construction).map(circlePathData)].join(" ")} /> : null}
          </g>
          <g className="sketch-segments">
            {displayProfile.segments.filter((segment) => !segment.generatedTextId).map((segment) => (
              <path
                data-sketch-entity="segment"
                data-sketch-id={segment.id}
                className={`${isSegmentSelected(segment.id) ? "selected" : ""} ${segment.construction ? "construction" : ""} ${invalidSegmentIds.has(segment.id) ? "invalid" : ""}`}
                key={segment.id}
                d={segmentData(segment, pointById)}
                onPointerDown={(event) => {
                  const point = pointFromEvent(event, tool !== "trim");
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.button === 1) beginPan(event);
                  else if (tool === "erase") onDeleteSegment(segment.id);
                  else if (event.button === 0 && tool === "trim" && point) onTrimSegment?.(segment.id, point);
                  else if (event.button === 0 && tool === "refine" && point) onInsertPoint(segment.id, point);
                  else if (event.button === 0) onSelectSegment(segment.id, true);
                }}
              />
            ))}
            {displayCircles.map((circle) => <circle
              key={circle.id}
              data-sketch-entity="circle"
              data-sketch-id={circle.id}
              className={`${isCircleSelected(circle.id) ? "selected" : ""} ${circle.construction ? "construction" : ""} ${invalidCircleIds.has(circle.id) ? "invalid" : ""}`}
              cx={circle.x}
              cy={circle.z}
              r={circle.radius}
              onPointerDown={(event) => {
                const point = pointFromEvent(event, tool !== "trim");
                event.preventDefault();
                event.stopPropagation();
                if (event.button === 1) beginPan(event);
                else if (tool === "erase") onDeleteCircle?.(circle.id);
                else if (event.button === 0 && tool === "trim" && point) onTrimCircle?.(circle.id, point);
                else if (event.button === 0 && tool === "select" && point) {
                  onSelectCircle?.(circle.id, true);
                  beginEntityDrag(event, { kind: "move-circle", pointerId: event.pointerId, circleId: circle.id, origin: point, current: point, start: { ...circle } });
                } else if (event.button === 0) onSelectCircle?.(circle.id, true);
              }}
            />)}
          </g>
          {tool === "select" ? <g className="sketch-geometry-points">
            {displayCircles.map((circle) => {
              const angle = circle.radiusAngle ?? 0;
              const radiusPoint = { x: circle.x + Math.cos(angle) * circle.radius, z: circle.z + Math.sin(angle) * circle.radius };
              return <g className="sketch-circle-handles" key={`points-${circle.id}`}>
                {isCircleSelected(circle.id) ? <line x1={circle.x} y1={circle.z} x2={radiusPoint.x} y2={radiusPoint.z} pointerEvents="none" /> : null}
                <circle data-sketch-entity="circle-center" className={`sketch-circle-center ${isCirclePointSelected(circle.id, "center") ? "selected" : ""}`} cx={circle.x} cy={circle.z} r={pointRadius} onPointerDown={(event) => {
                  if (event.button === 1) { beginPan(event); return; }
                  if (event.button !== 0) return;
                  onSelectCirclePoint?.(circle.id, "center", true);
                  beginEntityDrag(event, { kind: "move-circle", pointerId: event.pointerId, circleId: circle.id, origin: { x: circle.x, z: circle.z }, current: { x: circle.x, z: circle.z }, start: { ...circle } });
                }} />
                <circle data-sketch-entity="circle-handle" className={`sketch-circle-radius-handle ${isCirclePointSelected(circle.id, "radius") ? "selected" : ""}`} cx={radiusPoint.x} cy={radiusPoint.z} r={controlPointRadius} onPointerDown={(event) => {
                  if (event.button === 1) { beginPan(event); return; }
                  if (event.button !== 0) return;
                  onSelectCirclePoint?.(circle.id, "radius", true);
                  beginEntityDrag(event, { kind: "resize-circle", pointerId: event.pointerId, circleId: circle.id, current: radiusPoint, start: { ...circle } });
                }} />
              </g>;
            })}
            {displayProfile.segments.filter((segment) => segment.kind === "arc" && segment.center).map((arc) => <circle key={`center-${arc.id}`} data-sketch-entity="arc-center" className={`sketch-circle-center sketch-arc-center ${isArcPointSelected(arc.id) ? "selected" : ""}`} cx={arc.center!.x} cy={arc.center!.z} r={pointRadius} onPointerDown={(event) => {
              if (event.button === 1) { beginPan(event); return; }
              if (event.button !== 0) return;
              onSelectArcPoint?.(arc.id, true);
              beginEntityDrag(event, { kind: "move-arc-center", pointerId: event.pointerId, segmentId: arc.id, origin: { ...arc.center! }, current: { ...arc.center! }, startCenter: { ...arc.center! } });
            }} />)}
          </g> : null}
          {showConstraintLabels ? <g className="sketch-constraints">
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind !== "horizontal" && constraint.kind !== "vertical") return null;
              const segment = displayProfile.segments.find((candidate) => candidate.id === constraint.segmentId);
              if (!segment) return null;
              const dimension = segmentDimension(segment, pointById);
              if (!dimension) return null;
              return <SketchConstraintBadge key={constraint.id} id={constraint.id} label={constraint.kind === "horizontal" ? "H" : "V"} x={dimension.midpoint.x} z={dimension.midpoint.z - 14 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
            })}
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind !== "parallel" && constraint.kind !== "perpendicular") return null;
              const dimensions = constraint.segmentIds.map((id) => {
                const segment = displayProfile.segments.find((candidate) => candidate.id === id);
                return segment ? segmentDimension(segment, pointById) : null;
              }).filter(Boolean) as Array<NonNullable<ReturnType<typeof segmentDimension>>>;
              if (dimensions.length !== 2) return null;
              const x = (dimensions[0].midpoint.x + dimensions[1].midpoint.x) / 2;
              const z = (dimensions[0].midpoint.z + dimensions[1].midpoint.z) / 2 - 14 * screenUnit;
              return <SketchConstraintBadge key={constraint.id} id={constraint.id} label={constraint.kind === "parallel" ? "∥" : "⊥"} x={x} z={z} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
            })}
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind !== "equalLength" && constraint.kind !== "equalArcRadius") return null;
              const dimensions = (constraint.kind === "equalArcRadius" ? constraint.arcIds : constraint.segmentIds).map((id) => {
                const segment = displayProfile.segments.find((candidate) => candidate.id === id);
                return segment ? segmentDimension(segment, pointById) : null;
              }).filter(Boolean) as Array<NonNullable<ReturnType<typeof segmentDimension>>>;
              if (dimensions.length !== 2) return null;
              const x = (dimensions[0].midpoint.x + dimensions[1].midpoint.x) / 2;
              const z = (dimensions[0].midpoint.z + dimensions[1].midpoint.z) / 2 + 14 * screenUnit;
              return <SketchConstraintBadge key={constraint.id} id={constraint.id} label="=" x={x} z={z} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
            })}
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind !== "concentric" && constraint.kind !== "equalRadius") return null;
              const circles = constraint.circleIds.map((id) => displayProfile.circles?.find((circle) => circle.id === id)).filter(Boolean) as NonNullable<typeof displayProfile.circles>;
              if (circles.length !== 2) return null;
              const x = (circles[0].x + circles[1].x) / 2 + 18 * screenUnit;
              const z = (circles[0].z + circles[1].z) / 2 - 12 * screenUnit;
              return <SketchConstraintBadge key={constraint.id} id={constraint.id} label={constraint.kind === "concentric" ? "◎" : "="} x={x} z={z} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
            })}
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind !== "midpoint" && constraint.kind !== "pointOnObject" && constraint.kind !== "pointOnCircle" && constraint.kind !== "pointOnArc") return null;
              const point = pointById.get(constraint.pointId);
              if (!point) return null;
              return <SketchConstraintBadge key={constraint.id} id={constraint.id} label={constraint.kind === "midpoint" ? "M" : "∈"} x={point.x + 18 * screenUnit} z={point.z + 13 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
            })}
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind === "tangentLineCircle") {
                const segment = displayProfile.segments.find((candidate) => candidate.id === constraint.segmentId);
                const dimension = segment ? segmentDimension(segment, pointById) : null;
                const circle = displayProfile.circles?.find((candidate) => candidate.id === constraint.circleId);
                if (!dimension || !circle) return null;
                return <SketchConstraintBadge key={constraint.id} id={constraint.id} label="T" x={(dimension.midpoint.x + circle.x) / 2} z={(dimension.midpoint.z + circle.z) / 2 - 14 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
              }
              if (constraint.kind === "tangentArcs") {
                const point = pointById.get(constraint.pointId);
                return point ? <SketchConstraintBadge key={constraint.id} id={constraint.id} label="T" x={point.x + 14 * screenUnit} z={point.z - 14 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} /> : null;
              }
              if (constraint.kind === "tangentLineArc") {
                const line = displayProfile.segments.find((candidate) => candidate.id === constraint.lineId);
                const arc = displayProfile.segments.find((candidate) => candidate.id === constraint.arcId && candidate.kind === "arc" && candidate.center);
                const dimension = line ? segmentDimension(line, pointById) : null;
                if (!dimension || !arc?.center) return null;
                return <SketchConstraintBadge key={constraint.id} id={constraint.id} label="T" x={(dimension.midpoint.x + arc.center.x) / 2} z={(dimension.midpoint.z + arc.center.z) / 2 - 14 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
              }
              if (constraint.kind === "tangentCircles") {
                const circles = constraint.circleIds.map((id) => displayProfile.circles?.find((circle) => circle.id === id)).filter(Boolean) as SketchCircle[];
                if (circles.length !== 2) return null;
                return <SketchConstraintBadge key={constraint.id} id={constraint.id} label="T" x={(circles[0].x + circles[1].x) / 2} z={(circles[0].z + circles[1].z) / 2 - 14 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
              }
              if (constraint.kind === "symmetric") {
                const points = constraint.pointIds.map((id) => pointById.get(id)).filter(Boolean) as SketchPoint[];
                if (points.length !== 2) return null;
                return <SketchConstraintBadge key={constraint.id} id={constraint.id} label="S" x={(points[0].x + points[1].x) / 2 + 18 * screenUnit} z={(points[0].z + points[1].z) / 2} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} />;
              }
              return null;
            })}
            {(displayProfile.constraints ?? []).filter((constraint) => constraint.kind === "fixed").map((constraint) => {
              const point = pointById.get(constraint.pointId);
              return point ? <SketchConstraintBadge key={constraint.id} id={constraint.id} label="F" x={point.x + 18 * screenUnit} z={point.z - 12 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} /> : null;
            })}
            {(displayProfile.constraints ?? []).filter((constraint) => constraint.kind === "coincident").map((constraint) => {
              const point = pointById.get(constraint.pointIds[0]);
              return point ? <SketchConstraintBadge key={constraint.id} id={constraint.id} label="C" x={point.x - 18 * screenUnit} z={point.z + 13 * screenUnit} screenUnit={screenUnit} locale={locale} onDelete={onDeleteConstraint} /> : null;
            })}
          </g> : null}
          {showDimensionLabels || showConstraintLabels ? <g className="sketch-segment-dimensions">
            {displayProfile.segments.filter((segment) => !segment.generatedTextId).map((segment) => {
              const dimension = segmentDimension(segment, pointById);
              if (!dimension) return null;
              const constraints = (displayProfile.constraints ?? []).filter((candidate): candidate is Extract<NonNullable<SketchProfile["constraints"]>[number], { kind: "distance" }> => candidate.kind === "distance" && candidate.segmentId === segment.id);
              const dimensionStart = pointById.get(segment.startId), dimensionEnd = pointById.get(segment.endId);
              if (constraints.length) return showConstraintLabels && dimensionStart && dimensionEnd ? constraints.map((constraint, index) => (
                <SketchFixedLengthDimension key={`dimension-${constraint.id}`} start={dimensionStart} end={dimensionEnd} contour={dimensionContours.get(segment.id)} axis={constraint.axis} screenUnit={screenUnit} index={index} labelWidth={dimensionPillSize(formatDimension(constraint.value / millimetersPerUnit, workspace.accuracy + Math.max(0, Math.ceil(Math.log10(millimetersPerUnit)))), screenUnit, 60).width}>
                  <SketchDimensionInput millimetersPerUnit={millimetersPerUnit} id={constraint.id} label={(constraint.axis === "x" ? uiText("sketch.distanceX", {}, locale) : constraint.axis === "z" ? uiText("sketch.distanceY", {}, locale) : uiText("sketch.dimensionLength", {}, locale))} indicator={constraint.axis === "x" ? "H" : constraint.axis === "z" ? "V" : "D"} value={constraint.value} accuracy={workspace.accuracy} screenUnit={screenUnit} locale={locale} onCommit={onUpdateConstraintValue} onDelete={onDeleteConstraint} />
                </SketchFixedLengthDimension>
              )) : null;
              if (!showDimensionLabels) return null;
              const label = formatLength(dimension.length, workspace.accuracy);
              const pill = dimensionPillSize(label, screenUnit, 18);
              return (
                <g key={`dimension-${segment.id}`} pointerEvents="none" transform={`translate(${dimension.midpoint.x} ${dimension.midpoint.z + labelOffset})`}>
                  <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                  <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                </g>
              );
            })}
          </g> : null}
          {showConstraintLabels ? <g className="sketch-angle-dimensions">
            {(displayProfile.constraints ?? []).map((constraint) => {
              if (constraint.kind !== "angle") return null;
              const dimensions = constraint.segmentIds.map((id) => {
                const segment = displayProfile.segments.find((candidate) => candidate.id === id);
                return segment ? segmentDimension(segment, pointById) : null;
              }).filter(Boolean) as Array<NonNullable<ReturnType<typeof segmentDimension>>>;
              if (!dimensions.length) return null;
              const x = dimensions.reduce((total, dimension) => total + dimension.midpoint.x, 0) / dimensions.length;
              const z = dimensions.reduce((total, dimension) => total + dimension.midpoint.z, 0) / dimensions.length + labelOffset + 30 * screenUnit;
              return <g key={`angle-${constraint.id}`} transform={`translate(${x} ${z})`}>
                <SketchDimensionInput id={constraint.id} label={uiText("sketch.angle", {}, locale)} indicator="A" value={constraint.value} accuracy={workspace.accuracy} screenUnit={screenUnit} locale={locale} allowSigned onCommit={onUpdateConstraintValue} onDelete={onDeleteConstraint} />
              </g>;
            })}
          </g> : null}
          {smoothPreviewData || bezierPreviewData ? <path className="sketch-preview-line" fill="none" d={(smoothPreviewData || bezierPreviewData)!} pointerEvents="none" /> : activePoint && hover && tool === "line" ? <line className="sketch-preview-line" x1={activePoint.x} y1={activePoint.z} x2={hover.x} y2={hover.z} pointerEvents="none" /> : null}
          {activePoint && previewEndpoint && ["line", "bezier", "smooth"].includes(tool) ? (
            <g className="sketch-segment-dimensions preview" pointerEvents="none" transform={`translate(${(activePoint.x + previewEndpoint.x) / 2} ${(activePoint.z + previewEndpoint.z) / 2 + labelOffset})`}>
              {(() => {
                const pill = dimensionPillSize(previewLabel, screenUnit, 18);
                return (
                  <>
                    <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                    <text y={5 * screenUnit} fontSize={13 * screenUnit}>{previewLabel}</text>
                  </>
                );
              })()}
            </g>
          ) : null}
          {pointerAction?.kind === "bezier" ? (
            <g className="sketch-drag-handles" pointerEvents="none">
              <line x1={pointerAction.origin.x * 2 - pointerAction.current.x} y1={pointerAction.origin.z * 2 - pointerAction.current.z} x2={pointerAction.current.x} y2={pointerAction.current.z} />
              <circle cx={pointerAction.origin.x} cy={pointerAction.origin.z} r={controlPointRadius} />
            </g>
          ) : null}
          {hover && !pointerAction && !annotationTool && (exactSnapStep === undefined ? snapStep(snap) : exactSnapStep) > 0 && ["line", "bezier", "smooth", "circle", "arc", "rectangle", "centerRectangle", "roundedRectangle", "ellipse", "polygon", "slot", "arcSlot", "freehand", "freehandSmooth"].includes(tool) ? <circle cx={hover.x} cy={hover.z} r={5 * screenUnit} fill="none" stroke="var(--accent-solid)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
          {pendingRectangleCorner && hover && tool === "rectangle" ? <rect className="sketch-preview-line" fill="none" x={Math.min(pendingRectangleCorner.x, hover.x)} y={Math.min(pendingRectangleCorner.z, hover.z)} width={Math.abs(hover.x - pendingRectangleCorner.x)} height={Math.abs(hover.z - pendingRectangleCorner.z)} pointerEvents="none" /> : null}
          {pendingRectangleCorner && hover && tool === "ellipse" ? <g pointerEvents="none">
            <rect className="sketch-preview-line" fill="none" opacity={.4} x={Math.min(pendingRectangleCorner.x, hover.x)} y={Math.min(pendingRectangleCorner.z, hover.z)} width={Math.abs(hover.x - pendingRectangleCorner.x)} height={Math.abs(hover.z - pendingRectangleCorner.z)} />
            <ellipse className="sketch-preview-line" fill="none" cx={(pendingRectangleCorner.x + hover.x) / 2} cy={(pendingRectangleCorner.z + hover.z) / 2} rx={Math.abs(hover.x - pendingRectangleCorner.x) / 2} ry={Math.abs(hover.z - pendingRectangleCorner.z) / 2} />
          </g> : null}
          {pendingRectangleCorner && hover && (tool === "centerRectangle" || tool === "roundedRectangle") ? (() => {
            const other = tool === "centerRectangle" ? { x: pendingRectangleCorner.x * 2 - hover.x, z: pendingRectangleCorner.z * 2 - hover.z } : pendingRectangleCorner;
            const width = Math.abs(hover.x - other.x), height = Math.abs(hover.z - other.z);
            return <g pointerEvents="none"><rect className="sketch-preview-line" fill="none" x={Math.min(other.x, hover.x)} y={Math.min(other.z, hover.z)} width={width} height={height} rx={tool === "roundedRectangle" ? Math.min(width, height) * .15 : 0} />{tool === "centerRectangle" && <circle cx={pendingRectangleCorner.x} cy={pendingRectangleCorner.z} r={4 * screenUnit} fill="none" stroke="#173b5a" vectorEffect="non-scaling-stroke" />}</g>;
          })() : null}
          {slotPicks.length > 0 && hover && (tool === "slot" || tool === "arcSlot") ? (() => {
            const contour = sketchSlot(tool, [...slotPicks, hover]);
            if (contour) {
              const points = new Map(contour.points.map((point) => [point.id, point]));
              return <g pointerEvents="none">{contour.segments.map((segment) => <path key={segment.id} className="sketch-preview-line" fill="none" d={segmentData(segment, points)} />)}</g>;
            }
            if (tool === "arcSlot" && slotPicks.length === 2) {
              const [center, start] = slotPicks;
              const radius = Math.hypot(start.x - center.x, start.z - center.z);
              const angle = Math.atan2(hover.z - center.z, hover.x - center.x);
              const end = { id: "end", x: center.x + radius * Math.cos(angle), z: center.z + radius * Math.sin(angle) };
              const positive = (angle - Math.atan2(start.z - center.z, start.x - center.x) + Math.PI * 2) % (Math.PI * 2) <= Math.PI;
              return <path className="sketch-preview-line" fill="none" pointerEvents="none" d={segmentData({ id: "guide", kind: "arc", startId: "start", endId: "end", center, clockwise: positive }, new Map([["start", { ...start, id: "start" }], ["end", end]]))} />;
            }
            return <line className="sketch-preview-line" x1={slotPicks[0].x} y1={slotPicks[0].z} x2={hover.x} y2={hover.z} pointerEvents="none" />;
          })() : null}
          {pendingCircleCenter && hover ? <>
            {tool === "polygon" ? (() => {
              const radius = Math.hypot(hover.x - pendingCircleCenter.x, hover.z - pendingCircleCenter.z);
              const angle = creationRotationLocked ? -Math.PI / 2 - Math.PI / polygonSides : Math.atan2(hover.z - pendingCircleCenter.z, hover.x - pendingCircleCenter.x);
              const vertices = Array.from({ length: polygonSides }, (_, index) => `${pendingCircleCenter.x + radius * Math.cos(angle + index * 2 * Math.PI / polygonSides)},${pendingCircleCenter.z + radius * Math.sin(angle + index * 2 * Math.PI / polygonSides)}`).join(" ");
              return <g pointerEvents="none"><circle className="sketch-preview-line" style={{ fill: "none" }} cx={pendingCircleCenter.x} cy={pendingCircleCenter.z} r={radius} /><polygon className="sketch-preview-line" fill="none" points={vertices} /></g>;
            })() : <circle className="sketch-preview-line" cx={pendingCircleCenter.x} cy={pendingCircleCenter.z} r={Math.hypot(hover.x - pendingCircleCenter.x, hover.z - pendingCircleCenter.z)} pointerEvents="none" />}
            <circle className="sketch-circle-center pending" cx={pendingCircleCenter.x} cy={pendingCircleCenter.z} r={pointRadius} pointerEvents="none" />
          </> : null}
          {pendingArc && hover ? <g className="sketch-arc-preview" pointerEvents="none">
            <circle className="sketch-circle-center pending" cx={pendingArc.center.x} cy={pendingArc.center.z} r={pointRadius} />
            {!pendingArc.start ? <line className="sketch-preview-line" x1={pendingArc.center.x} y1={pendingArc.center.z} x2={hover.x} y2={hover.z} /> : (() => {
              const radius = Math.hypot(pendingArc.start!.x - pendingArc.center.x, pendingArc.start!.z - pendingArc.center.z);
              const angle = Math.atan2(hover.z - pendingArc.center.z, hover.x - pendingArc.center.x);
              const end = { x: pendingArc.center.x + Math.cos(angle) * radius, z: pendingArc.center.z + Math.sin(angle) * radius };
              const startAngle = Math.atan2(pendingArc.start!.z - pendingArc.center.z, pendingArc.start!.x - pendingArc.center.x);
              const sweep = (angle - startAngle + Math.PI * 2) % (Math.PI * 2);
              return <path className="sketch-preview-line" d={`M ${pendingArc.start!.x} ${pendingArc.start!.z} A ${radius} ${radius} 0 ${Math.min(sweep, Math.PI * 2 - sweep) > Math.PI ? 1 : 0} ${sweep <= Math.PI ? 1 : 0} ${end.x} ${end.z}`} />;
            })()}
          </g> : null}
          {measurement ? (
            <g className="sketch-measurement">
              <line x1={measurement.start.x} y1={measurement.start.z} x2={measurement.end.x} y2={measurement.end.z} />
              <circle className="sketch-measurement-point" cx={measurement.start.x} cy={measurement.start.z} r={pointRadius} pointerEvents="none" />
              <circle className="sketch-measurement-point" cx={measurement.end.x} cy={measurement.end.z} r={pointRadius} pointerEvents="none" />
              <g
                className="sketch-measurement-pill"
                role="button"
                aria-label={uiText("ui.sketchworkspace.remove.measurement.0e1d09", {}, locale)}
                transform={`translate(${(measurement.start.x + measurement.end.x) / 2} ${(measurement.start.z + measurement.end.z) / 2 + labelOffset})`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClearMeasurement();
                }}
              >
                <rect x={-dimensionPillSize(measurementLabel, screenUnit, 30).width / 2} y={-dimensionPillSize(measurementLabel, screenUnit, 30).height / 2} width={dimensionPillSize(measurementLabel, screenUnit, 30).width} height={dimensionPillSize(measurementLabel, screenUnit, 30).height} rx={dimensionPillSize(measurementLabel, screenUnit, 30).radius} />
                <text x={-5 * screenUnit} y={5 * screenUnit} fontSize={13 * screenUnit}>{measurementLabel}</text>
                <text className="remove" x={dimensionPillSize(measurementLabel, screenUnit, 30).width / 2 - 8 * screenUnit} y={5 * screenUnit} fontSize={14 * screenUnit}>x</text>
              </g>
            </g>
          ) : null}
          {pendingMeasurementStart ? (
            <g className="sketch-measurement pending" pointerEvents="none">
              {hover ? <line x1={pendingMeasurementStart.x} y1={pendingMeasurementStart.z} x2={hover.x} y2={hover.z} /> : null}
              <circle className="sketch-measurement-point pending" cx={pendingMeasurementStart.x} cy={pendingMeasurementStart.z} r={pointRadius} />
              {hover ? <circle className="sketch-measurement-point hover" cx={hover.x} cy={hover.z} r={pointRadius} /> : null}
            </g>
          ) : null}
          {selectedPoint && tool === "select" ? (
            <g className="sketch-curve-handles">
              {selectedPointHandles?.in ? <><line x1={selectedPoint.x} y1={selectedPoint.z} x2={selectedPointHandles.in.x} y2={selectedPointHandles.in.z} /><circle data-sketch-entity="handle" cx={selectedPointHandles.in.x} cy={selectedPointHandles.in.z} r={controlPointRadius} onPointerDown={(event) => event.button === 1 ? beginPan(event) : beginEntityDrag(event, { kind: "move-handle", pointerId: event.pointerId, pointId: selectedPoint.id, handle: "in", current: selectedPointHandles.in! })} /></> : null}
              {selectedPointHandles?.out ? <><line x1={selectedPoint.x} y1={selectedPoint.z} x2={selectedPointHandles.out.x} y2={selectedPointHandles.out.z} /><circle data-sketch-entity="handle" cx={selectedPointHandles.out.x} cy={selectedPointHandles.out.z} r={controlPointRadius} onPointerDown={(event) => event.button === 1 ? beginPan(event) : beginEntityDrag(event, { kind: "move-handle", pointerId: event.pointerId, pointId: selectedPoint.id, handle: "out", current: selectedPointHandles.out! })} /></> : null}
            </g>
          ) : null}
          {showDimensionLabels || showConstraintLabels ? <g className="sketch-circle-dimensions">
            {displayCircles.map((circle) => {
              const constraint = (displayProfile.constraints ?? []).find((candidate) => (candidate.kind === "radius" || candidate.kind === "diameter") && candidate.circleId === circle.id);
              if (constraint ? !showConstraintLabels : !showDimensionLabels) return null;
              const radialPosition = { x: circle.x + circle.radius + 12 * screenUnit, z: circle.z + 18 * screenUnit };
              const label = `R ${formatLength(circle.radius, workspace.accuracy)}`;
              const pill = dimensionPillSize(label, screenUnit, 18);
              const labelWidth = constraint?.kind === "radius" || constraint?.kind === "diameter" ? dimensionPillSize(formatDimension(constraint.value / millimetersPerUnit, workspace.accuracy + Math.max(0, Math.ceil(Math.log10(millimetersPerUnit)))), screenUnit, 60).width : pill.width;
              const leader = <SketchRadialLeader center={circle} label={{ x: radialPosition.x + labelWidth / 2, z: radialPosition.z }} radius={circle.radius} screenUnit={screenUnit} />;
              if (constraint?.kind === "radius" || constraint?.kind === "diameter") return <g key={`radius-${constraint.id}`}>
                {leader}
                <g transform={`translate(${radialPosition.x} ${radialPosition.z})`}>
                <SketchDimensionInput millimetersPerUnit={millimetersPerUnit} id={constraint.id} label={(constraint.kind === "diameter" ? uiText("sidebar.diameter", {}, locale) : uiText("sidebar.radius", {}, locale))} indicator={constraint.kind === "diameter" ? "Ø" : "R"} value={constraint.value} accuracy={workspace.accuracy} screenUnit={screenUnit} locale={locale} align="start" onCommit={onUpdateConstraintValue} onDelete={onDeleteConstraint} />
                </g>
              </g>;
              return <g key={`radius-${circle.id}`} pointerEvents="none">
                {leader}
                <g transform={`translate(${radialPosition.x} ${radialPosition.z})`}>
                <rect x={0} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                <text x={pill.width / 2} y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                </g>
              </g>;
            })}
          </g> : null}
          {showDimensionLabels || showConstraintLabels ? <g className="sketch-circle-dimensions sketch-arc-dimensions">
            {displayProfile.segments.filter((segment) => segment.kind === "arc" && segment.center).map((segment) => {
              const arc = arcDimensionGeometry(segment, pointById);
              if (!arc) return null;
              const radialConstraint = (displayProfile.constraints ?? []).find((candidate): candidate is Extract<NonNullable<SketchProfile["constraints"]>[number], { kind: "arcRadius" | "arcDiameter" }> => (candidate.kind === "arcRadius" || candidate.kind === "arcDiameter") && candidate.segmentId === segment.id);
              const angleConstraint = (displayProfile.constraints ?? []).find((candidate): candidate is Extract<NonNullable<SketchProfile["constraints"]>[number], { kind: "arcAngle" }> => candidate.kind === "arcAngle" && candidate.segmentId === segment.id);
              const radialPosition = {
                x: arc.center.x + Math.cos(arc.middleAngle) * (arc.radius + 12 * screenUnit),
                z: arc.center.z + Math.sin(arc.middleAngle) * (arc.radius + 12 * screenUnit),
              };
              const anglePosition = {
                x: arc.center.x + Math.cos(arc.middleAngle) * arc.radius * 0.55,
                z: arc.center.z + Math.sin(arc.middleAngle) * arc.radius * 0.55,
              };
              const radialLabel = `R ${formatLength(arc.radius, workspace.accuracy)}`;
              const radialPill = dimensionPillSize(radialLabel, screenUnit, 18);
              const radialLabelWidth = radialConstraint ? dimensionPillSize(formatDimension(radialConstraint.value / millimetersPerUnit, workspace.accuracy + Math.max(0, Math.ceil(Math.log10(millimetersPerUnit)))), screenUnit, 60).width : radialPill.width;
              return <g key={`arc-dimensions-${segment.id}`}>
                {(radialConstraint ? showConstraintLabels : showDimensionLabels) && <SketchRadialLeader center={arc.center} label={{ x: radialPosition.x + radialLabelWidth / 2, z: radialPosition.z }} radius={arc.radius} screenUnit={screenUnit} />}
                {radialConstraint ? showConstraintLabels ? <g transform={`translate(${radialPosition.x} ${radialPosition.z})`}>
                  <SketchDimensionInput millimetersPerUnit={millimetersPerUnit} id={radialConstraint.id} label={(radialConstraint.kind === "arcDiameter" ? uiText("sidebar.diameter", {}, locale) : uiText("sidebar.radius", {}, locale))} indicator={radialConstraint.kind === "arcDiameter" ? "Ø" : "R"} value={radialConstraint.value} accuracy={workspace.accuracy} screenUnit={screenUnit} locale={locale} align="start" onCommit={onUpdateConstraintValue} onDelete={onDeleteConstraint} />
                </g> : null : showDimensionLabels ? <g pointerEvents="none" transform={`translate(${radialPosition.x} ${radialPosition.z})`}>
                  <rect x={0} y={-radialPill.height / 2} width={radialPill.width} height={radialPill.height} rx={radialPill.radius} />
                  <text x={radialPill.width / 2} y={5 * screenUnit} fontSize={13 * screenUnit}>{radialLabel}</text>
                </g> : null}
                {angleConstraint && showConstraintLabels ? <g transform={`translate(${anglePosition.x} ${anglePosition.z})`}>
                  <SketchDimensionInput id={angleConstraint.id} label={uiText("ui.sketchworkspace.arc.angle.90ac83", {}, locale)} indicator="A" value={angleConstraint.value} accuracy={workspace.accuracy} screenUnit={screenUnit} locale={locale} onCommit={onUpdateConstraintValue} onDelete={onDeleteConstraint} />
                </g> : null}
              </g>;
            })}
          </g> : null}
          <g className="sketch-points">
            {displayProfile.points.filter((point) => !point.generatedTextId).map((point) => (
              <path
                data-sketch-entity="point"
                data-sketch-id={point.id}
                className={`${isPointSelected(point.id) ? "selected" : ""} ${activePointId === point.id ? "active" : ""} ${invalidPointIds.has(point.id) ? "invalid" : ""} ${point.construction ? "construction" : ""}`}
                key={point.id}
                d={point.mode === "autoSmooth"
                  ? `M ${point.x - pointRadius} ${point.z} a ${pointRadius} ${pointRadius} 0 1 0 ${pointRadius * 2} 0 a ${pointRadius} ${pointRadius} 0 1 0 ${-pointRadius * 2} 0 Z`
                  : point.mode === "smooth"
                    ? `M ${point.x - pointRadius} ${point.z - pointRadius} h ${pointRadius * 2} v ${pointRadius * 2} h ${-pointRadius * 2} Z`
                    : `M ${point.x} ${point.z - pointRadius * Math.SQRT2} L ${point.x + pointRadius * Math.SQRT2} ${point.z} L ${point.x} ${point.z + pointRadius * Math.SQRT2} L ${point.x - pointRadius * Math.SQRT2} ${point.z} Z`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.button === 1) {
                    beginPan(event);
                  } else if (tool === "erase" || tool === "refine") {
                    onDeletePoint(point.id);
                  } else if (tool === "trim") {
                    return;
                  } else if (event.button === 0 && tool === "select") {
                    onPointPress(point.id, true);
                    beginEntityDrag(event, { kind: "move-point", pointerId: event.pointerId, pointId: point.id, current: { x: point.x, z: point.z } });
                  } else if (event.button === 0) {
                    onPointPress(point.id, event.ctrlKey || event.metaKey);
                  }
                }}
              />
            ))}
          </g>
          {selectedImage && selectedImageBounds && tool === "select" ? (
            <g className="sketch-image-selection">
              <rect
                className="sketch-image-selection-box"
                x={selectedImageBounds.minX}
                y={selectedImageBounds.minZ}
                width={selectedImage.width}
                height={selectedImage.depth}
                pointerEvents="none"
              />
              <g className="sketch-image-dimension width" pointerEvents="none" transform={`translate(${selectedImage.x} ${selectedImageBounds.maxZ + labelOffset})`}>
                {(() => {
                  const label = formatLength(selectedImage.width, workspace.accuracy);
                  const pill = dimensionPillSize(label, screenUnit, 18);
                  return (
                    <>
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </>
                  );
                })()}
              </g>
              <g className="sketch-image-dimension depth" pointerEvents="none" transform={`translate(${selectedImageBounds.maxX + 34 * screenUnit} ${selectedImage.z})`}>
                {(() => {
                  const label = formatLength(selectedImage.depth, workspace.accuracy);
                  const pill = dimensionPillSize(label, screenUnit, 18);
                  return (
                    <>
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </>
                  );
                })()}
              </g>
              {imageResizeHandles.map((handle) => (
                <rect
                  key={handle.id}
                  data-sketch-entity="image-handle"
                  className={`sketch-image-resize-handle handle-${handle.id}`}
                  x={handle.x - handleSize / 2}
                  y={handle.z - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  rx={handleRadius}
                  onPointerDown={(event) => {
                    if (event.button === 1) {
                      beginPan(event);
                      return;
                    }
                    if (event.button !== 0) return;
                    const point = pointFromEvent(event);
                    if (!point) return;
                    beginEntityDrag(event, {
                      kind: "resize-image",
                      pointerId: event.pointerId,
                      imageId: selectedImage.id,
                      handle: handle.id,
                      current: point,
                      start: { ...selectedImage },
                    });
                  }}
                />
              ))}
            </g>
          ) : null}
          {hover && ["line", "bezier", "smooth", "circle", "arc", "measure"].includes(tool) ? <circle className="sketch-cursor-point" cx={hover.x} cy={hover.z} r={hoverPointRadius} pointerEvents="none" /> : null}
          {showAnnotations && <SketchAnnotationLayer annotations={annotations} preview={annotationPreview} selectedId={selectedAnnotationId} screenUnit={screenUnit} zoom={zoom} snapSpacing={exactSnapStep ?? snapStep(snap)} displayUnit={annotationDisplayUnit} locale={locale} pointFromEvent={(event, snapEnabled = true) => pointFromEvent(event, false, snapEnabled)} onSelect={(id) => onSelectAnnotation?.(id)} onCommit={(annotation) => onCommitAnnotation?.(annotation)} />}
          {transformFrame && geometrySelectionBounds && (geometrySelectionBounds.maxX - geometrySelectionBounds.minX > 1e-8 || geometrySelectionBounds.maxZ - geometrySelectionBounds.minZ > 1e-8) && <g className="sketch-selection-transform">
            <rect className="sketch-selection-transform-box" x={transformFrame.minX} y={transformFrame.minZ} width={transformFrame.maxX - transformFrame.minX} height={transformFrame.maxZ - transformFrame.minZ} strokeWidth={screenUnit} pointerEvents="none" />
            <line className="sketch-selection-transform-connector" x1={(transformFrame.minX + transformFrame.maxX) / 2} x2={(transformFrame.minX + transformFrame.maxX) / 2} y1={transformFrame.maxZ} y2={transformFrame.maxZ + 28 * screenUnit} strokeWidth={screenUnit} pointerEvents="none" />
            {([
              ["nw", transformFrame.minX, transformFrame.maxZ], ["n", (transformFrame.minX + transformFrame.maxX) / 2, transformFrame.maxZ], ["ne", transformFrame.maxX, transformFrame.maxZ],
              ["w", transformFrame.minX, (transformFrame.minZ + transformFrame.maxZ) / 2], ["e", transformFrame.maxX, (transformFrame.minZ + transformFrame.maxZ) / 2],
              ["sw", transformFrame.minX, transformFrame.minZ], ["s", (transformFrame.minX + transformFrame.maxX) / 2, transformFrame.minZ], ["se", transformFrame.maxX, transformFrame.minZ],
            ] as Array<[SketchTransformHandle, number, number]>).map(([handle, x, z]) => <rect key={handle} data-sketch-entity="selection-handle" className={`sketch-selection-transform-handle handle-${handle}`} x={x + (handle.includes("w") ? -12.8 : handle.includes("e") ? 0 : -6.4) * screenUnit} y={z + (handle.includes("n") ? 0 : handle.includes("s") ? -12.8 : -6.4) * screenUnit} width={12.8 * screenUnit} height={12.8 * screenUnit} strokeWidth={1.5 * screenUnit} onPointerDown={(event) => beginSelectionTransform(event, handle)}><title>{uiText("ui.sketchworkspace.scale.selection.72f3e0", {}, locale)}</title></rect>)}
            <circle data-sketch-entity="selection-handle" className="sketch-selection-transform-handle handle-rotate" cx={(transformFrame.minX + transformFrame.maxX) / 2} cy={transformFrame.maxZ + 28 * screenUnit} r={6.4 * screenUnit} strokeWidth={1.5 * screenUnit} onPointerDown={(event) => beginSelectionTransform(event, "rotate")}><title>{uiText("ui.sketchworkspace.rotate.selection.8310b0", {}, locale)}</title></circle>
            {transformPivot && <g className="sketch-selection-pivot">
              {pointerAction?.kind === "move-selection-pivot" && pointerAction.snapTarget && <circle className="sketch-selection-pivot-snap" cx={pointerAction.snapTarget.x} cy={pointerAction.snapTarget.z} r={12 * screenUnit} strokeWidth={2 * screenUnit} pointerEvents="none" />}
              <circle data-sketch-entity="selection-handle" className="sketch-selection-transform-handle handle-pivot" cx={transformPivot.x} cy={transformPivot.z} r={8 * screenUnit} strokeWidth={1.5 * screenUnit} onDoubleClick={(event) => { event.stopPropagation(); setSelectionPivot(null); }} onPointerDown={(event) => {
                if (event.button === 1) { beginPan(event); return; }
                if (event.button !== 0) return;
                const pointer = pointFromEvent(event, false, false);
                if (!pointer) return;
                beginEntityDrag(event, { kind: "move-selection-pivot", pointerId: event.pointerId, current: { ...transformPivot }, offset: { x: transformPivot.x - pointer.x, z: transformPivot.z - pointer.z } });
              }}><title>{uiText("ui.sketchworkspace.rotation.origin.drag.to.move.double.click.to.cen.22268c", {}, locale)}</title></circle>
              <path d={`M ${transformPivot.x - 4 * screenUnit} ${transformPivot.z} h ${8 * screenUnit} M ${transformPivot.x} ${transformPivot.z - 4 * screenUnit} v ${8 * screenUnit}`} stroke="#1269eb" strokeWidth={screenUnit} pointerEvents="none" />
            </g>}
          </g>}
          </g>
        </svg>
      </section>
      {showAnnotations && annotationToolbar}
      {selectedImage && tool === "select" ? (
        <SketchImageInspector
          image={selectedImage}
          millimetersPerUnit={millimetersPerUnit}
          unitLabel={lengthDisplayUnit(workspace).label}
          accuracy={workspace.accuracy}
          onClose={() => onSelectMany([], [], [])}
          onUpdate={(patch, message) => onUpdateImage(selectedImage.id, patch, message)}
          onDelete={() => onDeleteImage(selectedImage.id)}
        />
      ) : null}
      {showPointActions && selectedPoint && tool === "select" ? (
        <div className="sketch-point-actions" aria-label={uiText("ui.sketchworkspace.point.actions.e96719", {}, locale)}>
          <button className={selectedPoint.mode === "corner" || !selectedPoint.mode ? "active" : ""} type="button" title={uiText("ui.sketchworkspace.make.corner.7d290b", {}, locale)} aria-pressed={selectedPoint.mode === "corner" || !selectedPoint.mode} onClick={() => onSetPointMode(selectedPoint.id, "corner")}><CornerDownRight /><span>{uiText("sketch.corner", {}, locale)}</span></button>
          <button className={selectedPoint.mode === "smooth" ? "active" : ""} type="button" title={uiText("ui.sketchworkspace.make.smooth.9174d5", {}, locale)} aria-pressed={selectedPoint.mode === "smooth"} onClick={() => onSetPointMode(selectedPoint.id, "smooth")}><Waves /><span>{uiText("sketch.smooth", {}, locale)}</span></button>
          <button className={selectedPoint.mode === "split" ? "active" : ""} type="button" title={uiText("sketch.splitHandles", {}, locale)} aria-pressed={selectedPoint.mode === "split"} onClick={() => onSetPointMode(selectedPoint.id, "split")}><Split /><span>{uiText("ui.sketchworkspace.split.fc8230", {}, locale)}</span></button>
        </div>
      ) : null}
      {showGridControls ? <div className="grid-settings sketch-grid-settings">
        <SnapGridControl snap={snap} snapOpen={snapOpen} onSnapChange={setSnap} onSnapOpenChange={setSnapOpen} />
      </div> : null}
    </main>
  );
}

function SketchImageInspector({
  image,
  accuracy,
  millimetersPerUnit,
  unitLabel,
  onClose,
  onUpdate,
  onDelete,
}: {
  image: SketchImage;
  accuracy: 1 | 2 | 3;
  millimetersPerUnit: number;
  unitLabel: string;
  onClose: () => void;
  onUpdate: (patch: Partial<SketchImage>, message?: string) => void;
  onDelete: () => void;
}) {
  const aspect = image.width / Math.max(0.5, image.depth);
  const displayAccuracy = accuracy + Math.max(0, Math.ceil(Math.log10(millimetersPerUnit)));
  const updateWidth = (width: number) => onUpdate({
    width,
    ...(image.lockAspect !== false ? { depth: Math.max(0.5, width / aspect) } : {}),
  }, uiText("ui.sketchworkspace.sketch.image.width.updated.97e8f7"));
  const updateDepth = (depth: number) => onUpdate({
    depth,
    ...(image.lockAspect !== false ? { width: Math.max(0.5, depth * aspect) } : {}),
  }, uiText("ui.sketchworkspace.sketch.image.height.updated.82a713"));

  return (
    <aside className="shape-inspector sketch-image-inspector" aria-label={uiText("ui.sketchworkspace.image.settings.5b79bd", { value0: image.name })} onPointerDown={(event) => event.stopPropagation()}>
      <div className="shape-inspector-header">
        <button className="inspector-header-icon" type="button" aria-label={uiText("ui.sketchworkspace.close.image.settings.4487d6")} onClick={onClose}>
          <ChevronUp size={26} strokeWidth={2.8} />
        </button>
        <strong>{image.name}</strong>
        <div className="inspector-header-actions">
          <button className="inspector-header-icon danger" type="button" aria-label={uiText("ui.sketchworkspace.delete.sketch.image.29418e")} title={uiText("ui.sketchworkspace.delete.image.ffc272")} onClick={onDelete}>
            <Trash2 size={25} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="sketch-image-preview-card">
        <img src={image.dataUrl} alt="" />
        <span>{image.pixelWidth} × {image.pixelHeight} px</span>
      </div>
      <div className="property-card">
        <div className="property-card-header static"><span>{uiText("ui.sketchworkspace.properties.bc6c88")}</span></div>
        <div className="property-list">
          <SketchImageRange label={uiText("sidebar.width")} value={image.width / millimetersPerUnit} min={0.5 / millimetersPerUnit} max={200 / millimetersPerUnit} accuracy={displayAccuracy} suffix={unitLabel} onChange={(value) => updateWidth(value * millimetersPerUnit)} />
          <SketchImageRange label={uiText("sidebar.height")} value={image.depth / millimetersPerUnit} min={0.5 / millimetersPerUnit} max={200 / millimetersPerUnit} accuracy={displayAccuracy} suffix={unitLabel} onChange={(value) => updateDepth(value * millimetersPerUnit)} />
          <SketchImageRange label={uiText("sidebar.opacity")} value={(image.opacity ?? 0.55) * 100} min={5} max={100} accuracy={1} suffix="%" onChange={(opacity) => onUpdate({ opacity: opacity / 100 }, uiText("ui.sketchworkspace.sketch.image.opacity.updated.0ef043"))} />
          <SketchImagePositionField label={uiText("ui.sketchworkspace.position.x.e24e60", { value0: unitLabel })} value={image.x / millimetersPerUnit} accuracy={displayAccuracy} onChange={(x) => onUpdate({ x: x * millimetersPerUnit }, uiText("ui.sketchworkspace.sketch.image.moved.ed55e6"))} />
          <SketchImagePositionField label={uiText("ui.sketchworkspace.position.y.144f14", { value0: unitLabel })} value={image.z / millimetersPerUnit} accuracy={displayAccuracy} onChange={(z) => onUpdate({ z: z * millimetersPerUnit }, uiText("ui.sketchworkspace.sketch.image.moved.ed55e6"))} />
          <button className={`sketch-image-aspect-toggle ${image.lockAspect !== false ? "active" : ""}`} type="button" onClick={() => onUpdate({ lockAspect: image.lockAspect === false }, uiText("ui.sketchworkspace.image.aspect.ratio.setting.updated.9461a3"))}>
            {image.lockAspect !== false ? <Link size={17} /> : <Link2Off size={17} />}
            <span>{image.lockAspect !== false ? uiText("ui.sketchworkspace.aspect.ratio.locked.a95ef9") : uiText("ui.sketchworkspace.aspect.ratio.unlocked.c8be6b")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function SketchImageRange({
  label,
  value,
  min,
  max,
  accuracy,
  suffix = "mm",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  accuracy: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max);
  const [draft, setDraft] = useState(formatDimension(safeValue, accuracy));
  useEffect(() => setDraft(formatDimension(safeValue, accuracy)), [accuracy, safeValue]);
  const commit = (event: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseNumericExpression(draft, suffix);
    if (!validateNumericExpression(event.currentTarget, parsed)) return;
    onChange(clamp(Number.isFinite(parsed) ? parsed : safeValue, min, max));
  };
  const position = ((safeValue - min) / Math.max(0.001, max - min)) * 100;
  return (
    <label className="range-property sketch-image-range" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span>{label}</span>
      <div className="sketch-image-range-row">
        <input
          className="sketch-image-number-input"
          type="text"
          inputMode="text"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
        <span>{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={10 ** -accuracy} value={safeValue} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function SketchImagePositionField({
  label,
  value,
  accuracy,
  onChange,
}: {
  label: string;
  value: number;
  accuracy: number;
  onChange: (value: number) => void;
}) {
  const formatted = formatDimension(value, accuracy);
  const [draft, setDraft] = useState(formatted);
  useEffect(() => setDraft(formatted), [formatted]);
  const commit = (event: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseNumericExpression(draft, label.match(/\(([^)]+)\)/)?.[1] ?? "mm");
    if (!validateNumericExpression(event.currentTarget, parsed)) return;
    const next = Number.isFinite(parsed) ? parsed : value;
    onChange(next);
    setDraft(formatDimension(next, accuracy));
  };

  return (
    <label className="sketch-image-position-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="text"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    </label>
  );
}
