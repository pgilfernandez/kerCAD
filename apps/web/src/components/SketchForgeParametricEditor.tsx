"use client";

import { Box, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, DraftingCompass, Eraser, Focus, Grid3X3, Home, Magnet, Maximize2, Minus, MousePointer2, PenLine, Plus, RotateCcw, Ruler, Spline, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParametricModelSidebar, type ModelSidebarMode, type ModelTreeSelection } from "@/components/ParametricModelSidebar";
import { ParametricViewport, type CameraOrientation, type CameraProjection, type CameraView, type TopologyEdgePick, type TopologyFacePick } from "@/components/ParametricViewport";
import { SketchWorkspace, type SketchMeasurement, type SketchSelection, type SketchTool } from "@/components/SketchWorkspace";
import {
  ToolbarAlignIcon,
  ToolbarBooleanModeIcon,
  ToolbarChamferIcon,
  ToolbarCopyIcon,
  ToolbarDropToWorkplaneIcon,
  ToolbarDuplicateIcon,
  ToolbarFilletIcon,
  ToolbarHomeIcon,
  ToolbarImportIcon,
  ToolbarMirrorIcon,
  ToolbarPasteIcon,
  ToolbarRedoIcon,
  ToolbarSettingsIcon,
  ToolbarShapeAddIcon,
  ToolbarSnapGridIcon,
  ToolbarTrashIcon,
  ToolbarUndoIcon,
  ToolbarVectorExportIcon,
  ToolbarWorkplaneIcon,
  ToolbarResetWorkplaneIcon,
} from "@/components/icons";
import { cloneDocument, createDrawnSketchFeature, createExtrudeFeature, createFaceExtrudeFeature, createFilletFeature, createRevolveFeature, createShellFeature, createStarterDocument, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { assertValidParametricDependencies } from "@/lib/parametricDependencyGraph";
import { assertValidParametricTopology, recoverParametricTopologyReferenceInRecords } from "@/lib/parametricTopology";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint } from "@/lib/parametricBuildState";
import { exportParametricStep } from "@/lib/parametricKernel";
import { ParametricBuildWorkerClient } from "@/lib/parametricBuildWorker";
import { binaryStlFromRenderMeshes } from "@/lib/stlExport";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import {
  beginHistoryTransaction,
  cancelHistoryTransaction,
  commitHistoryDocument,
  createParametricHistory,
  currentHistoryDocument,
  finishHistoryTransaction,
  redoParametricHistory,
  undoParametricHistory,
  type ParametricHistoryState,
} from "@/lib/parametricHistory";
import {
  addPrimitiveToSelection,
  addParametricObject,
  alignParametricSelections,
  applyParametricSelectionWorldDelta,
  applyWorkplanePatch,
  deleteParametricObject,
  deleteParametricFeature,
  deleteParametricSelection,
  duplicateParametricObject,
  lastOperationForObject,
  moveParametricObjectOrigin,
  objectIdForFeature,
  canReorderParametricSelection,
  renameParametricSelection,
  reorderParametricSelection,
  updateParametricShapeParameter,
  viewportSelectionForFeature,
  viewportSelectionForObject,
  workplaneShapeForObject,
  type ParametricAlignmentAnchor,
  type ParametricAlignmentAxis,
  type SupportedPrimitive,
} from "@/lib/parametricObjects";
import { globalParametricWorkplanePlacement, objectPlacementForWorkplane, parametricWorkplaneFromFace, parametricWorkplaneIsGlobal } from "@/lib/parametricWorkplane";
import { parametricOperationCatalog, parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import type { ViewportRenderQuality } from "@/lib/viewportPerformance";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricFeature, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference, PrimitiveFeature, SketchFeature } from "@/types/parametric";
import type { GridSize, SketchPoint, SketchProfile, WorkplaneShape } from "@/types/sketchforge";

const STORAGE_KEY = "educad.parametric.document.v1";
const RENDER_QUALITY_STORAGE_KEY = "educad.viewport.render-mode";
const FPS_VISIBLE_STORAGE_KEY = "educad.viewport.show-fps";
type Notice = { type: "ok" | "info" | "error"; text: string } | null;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(value: string) {
  return value.trim().replace(/\.(?:educad\.json|json|step|stp|stl)$/i, "").toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "") || "modelo";
}

function emptySketchProfile(): SketchProfile {
  return { points: [], segments: [], images: [] };
}

function cloneSketchProfile(profile: SketchProfile): SketchProfile {
  return {
    points: profile.points.map((point) => ({ ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined })),
    segments: profile.segments.map((segment) => ({ ...segment })),
    images: (profile.images ?? []).map((image) => ({ ...image })),
  };
}

function orderedSketchPaths(profile: SketchProfile) {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchProfile["segments"][number] }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const validSegments = profile.segments.filter((segment) => {
    if (!pointById.has(segment.startId) || !pointById.has(segment.endId) || segment.startId === segment.endId) return false;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(validSegments.map((segment) => segment.id));
  const paths: Array<{ points: SketchPoint[]; closed: boolean }> = [];
  while (unvisited.size) {
    const seed = validSegments.find((segment) => segment.id === unvisited.values().next().value);
    if (!seed) break;
    const componentIds = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length) {
      const id = queue.pop();
      if (!id || componentIds.has(id)) continue;
      componentIds.add(id);
      adjacency.get(id)?.forEach((entry) => queue.push(entry.pointId));
    }
    const startId = [...componentIds].find((id) => (adjacency.get(id)?.filter((entry) => unvisited.has(entry.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const first = pointById.get(startId);
    if (!first) { unvisited.delete(seed.id); continue; }
    const points = [first];
    let currentId = startId;
    for (let guard = 0; guard <= validSegments.length; guard += 1) {
      const edge = adjacency.get(currentId)?.find((entry) => unvisited.has(entry.segment.id));
      if (!edge) break;
      const to = pointById.get(edge.pointId);
      if (!to) break;
      unvisited.delete(edge.segment.id);
      currentId = to.id;
      if (currentId === startId) break;
      points.push(to);
    }
    paths.push({ points, closed: currentId === startId && points.length >= 3 });
  }
  return paths;
}

function sketchEntityId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function closestSketchGrid(step: number, enabled: boolean): GridSize {
  if (!enabled) return "Off";
  const options: Array<[number, GridSize]> = [[0.1, "0.1 mm"], [0.25, "0.25 mm"], [0.5, "0.5 mm"], [1, "1.0 mm"], [2, "2.0 mm"], [5, "5.0 mm"]];
  return options.reduce((closest, candidate) => Math.abs(candidate[0] - step) < Math.abs(closest[0] - step) ? candidate : closest, options[0])[1];
}

function isClosedSketch(profile: SketchProfile) {
  if (profile.segments.length < 3) return false;
  const degree = new Map<string, number>();
  for (const segment of profile.segments) {
    degree.set(segment.startId, (degree.get(segment.startId) ?? 0) + 1);
    degree.set(segment.endId, (degree.get(segment.endId) ?? 0) + 1);
  }
  if ([...degree.values()].some((value) => value !== 2)) return false;
  return orderedSketchPaths(profile).every((path) => path.closed);
}

function withSmoothSketchHandles(profile: SketchProfile) {
  const next = cloneSketchProfile(profile);
  const points = new Map(next.points.map((point) => [point.id, point]));
  orderedSketchPaths(next).forEach((path) => path.points.forEach((sourcePoint, index) => {
    const point = points.get(sourcePoint.id);
    if (!point) return;
    const previous = path.closed ? path.points[(index - 1 + path.points.length) % path.points.length] : path.points[Math.max(0, index - 1)];
    const following = path.closed ? path.points[(index + 1) % path.points.length] : path.points[Math.min(path.points.length - 1, index + 1)];
    const tangent = { x: (following.x - previous.x) / 6, z: (following.z - previous.z) / 6 };
    point.handleIn = { x: point.x - tangent.x, z: point.z - tangent.z };
    point.handleOut = { x: point.x + tangent.x, z: point.z + tangent.z };
    point.mode = "smooth";
  }));
  return next;
}

export function SketchForgeParametricEditor() {
  const initialDocument = useMemo(() => createStarterDocument(), []);
  const [history, setHistory] = useState<ParametricHistoryState>(() => createParametricHistory(initialDocument));
  const document = currentHistoryDocument(history);
  const [modelSelection, setModelSelection] = useState<ModelTreeSelection[]>(initialDocument.objects[0] ? [{ id: initialDocument.objects[0].id, kind: "object" }] : []);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, objectRecords: [], operationContext: null, completedFeatureIds: [], warning: null });
  const [operationContext, setOperationContext] = useState<BuildResult["operationContext"]>(null);
  const [kernelBusy, setKernelBusy] = useState(true);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [modelSidebarMode, setModelSidebarMode] = useState<ModelSidebarMode | "hidden">("normal");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState(document.name);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [workplaneOpen, setWorkplaneOpen] = useState(false);
  const [workplaneDraft, setWorkplaneDraft] = useState(document.workplane);
  const [placingWorkplane, setPlacingWorkplane] = useState(false);
  const [selectingTopologyFaces, setSelectingTopologyFaces] = useState(false);
  const [selectedTopologyFaces, setSelectedTopologyFaces] = useState<ParametricTopologyReference[]>([]);
  const [selectingTopologyEdges, setSelectingTopologyEdges] = useState(false);
  const [selectedTopologyEdges, setSelectedTopologyEdges] = useState<ParametricTopologyReference[]>([]);
  const [pendingEdgeTreatment, setPendingEdgeTreatment] = useState<"fillet" | "chamfer" | null>(null);
  const [editingEdgeTreatmentId, setEditingEdgeTreatmentId] = useState<string | null>(null);
  const [edgeTreatmentRadius, setEdgeTreatmentRadius] = useState(2);
  const [pendingFaceExtrude, setPendingFaceExtrude] = useState<{ operation: "add" | "cut"; distance: number } | null>(null);
  const [editingFaceExtrudeId, setEditingFaceExtrudeId] = useState<string | null>(null);
  const [pendingShell, setPendingShell] = useState<{ thickness: number } | null>(null);
  const [editingShellId, setEditingShellId] = useState<string | null>(null);
  const [pendingRevolve, setPendingRevolve] = useState<{ operation: "add" | "cut" | "intersect"; angle: number; axis: "x" | "y" | "z" | "edge" } | null>(null);
  const [editingRevolveId, setEditingRevolveId] = useState<string | null>(null);
  const [topologySelectionBuild, setTopologySelectionBuild] = useState<BuildResult | null>(null);
  const [topologyPreviewContext, setTopologyPreviewContext] = useState<BuildResult["operationContext"]>(null);
  const [view, setView] = useState<CameraView>({ name: "iso", token: 0 });
  const [projection, setProjection] = useState<CameraProjection>("orthographic");
  const [renderQuality, setRenderQuality] = useState<ViewportRenderQuality>("normal");
  const [showFps, setShowFps] = useState(false);
  const [originEditObjectId, setOriginEditObjectId] = useState<string | null>(null);
  const [alignOpen, setAlignOpen] = useState(false);
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>({ azimuth: Math.PI / 4, polar: 1.02 });
  const [clipboardId, setClipboardId] = useState<string | null>(null);
  const [sketchSession, setSketchSession] = useState<{ featureId: string | null; objectId: string | null; profile: SketchProfile } | null>(null);
  const [sketchTool, setSketchTool] = useState<SketchTool>("line");
  const [sketchActivePointId, setSketchActivePointId] = useState<string | null>(null);
  const [sketchSelection, setSketchSelection] = useState<SketchSelection>(null);
  const [sketchMeasurement, setSketchMeasurement] = useState<SketchMeasurement>(null);
  const [sketchMeasureStart, setSketchMeasureStart] = useState<SketchPoint | null>(null);
  const sketchHistoryRef = useRef<SketchProfile[]>([]);
  const sketchHistoryIndexRef = useRef(-1);
  const [sketchHistoryIndex, setSketchHistoryIndex] = useState(-1);

  useEffect(() => {
    const closePopoversOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const popup = target?.closest<HTMLElement>("[data-educad-popup]")?.dataset.educadPopup ?? null;
      if (popup !== "shapes") setShapesOpen(false);
      if (popup !== "align") setAlignOpen(false);
      if (popup !== "grid") setWorkplaneOpen(false);
      if (popup !== "export") setExportOpen(false);
      if (popup !== "settings") setSettingsOpen(false);
    };
    window.document.addEventListener("pointerdown", closePopoversOutside);
    return () => window.document.removeEventListener("pointerdown", closePopoversOutside);
  }, []);

  useEffect(() => {
    if (!placingWorkplane && !selectingTopologyFaces && !selectingTopologyEdges) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPlacingWorkplane(false);
      setSelectingTopologyFaces(false);
      setSelectingTopologyEdges(false);
      setSelectedTopologyFaces([]);
      setSelectedTopologyEdges([]);
      setPendingEdgeTreatment(null);
      setEditingEdgeTreatmentId(null);
      setPendingFaceExtrude(null);
      setEditingFaceExtrudeId(null);
      setPendingShell(null);
      setEditingShellId(null);
      setPendingRevolve(null);
      setEditingRevolveId(null);
      setNotice({ type: "info", text: placingWorkplane ? "Colocación del plano de trabajo cancelada" : "Selección topológica cancelada" });
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [placingWorkplane, selectingTopologyEdges, selectingTopologyFaces]);
  const [exporting, setExporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const buildCounter = useRef(0);
  const contextBuildCounter = useRef(0);
  const buildWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const contextWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const topologySelectionWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const topologyPreviewWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const geometryFingerprint = useMemo(() => parametricGeometryFingerprint(document), [document]);
  const objectColorFingerprint = useMemo(() => parametricObjectColorFingerprint(document), [document]);
  const objectColors = useMemo(() => objectColorsFromFingerprint(objectColorFingerprint), [objectColorFingerprint]);
  const buildDocumentRef = useRef(document);
  buildDocumentRef.current = document;
  const selectedOperationTimeline = useMemo(() => {
    if (modelSelection.length !== 1 || modelSelection[0]?.kind !== "feature") return null;
    const buildDocument = buildDocumentRef.current;
    const feature = buildDocument.features.find((candidate) => candidate.id === modelSelection[0]?.id);
    if ((feature?.kind !== "extrude" && feature?.kind !== "primitive" && feature?.kind !== "fillet" && feature?.kind !== "faceExtrude" && feature?.kind !== "shell" && feature?.kind !== "revolve") || !feature.objectId) return null;
    const operations = buildDocument.features.filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch");
    const index = operations.findIndex((candidate) => candidate.id === feature.id);
    return index < 0 ? null : { featureId: feature.id, objectId: feature.objectId, index, count: operations.length };
  }, [geometryFingerprint, modelSelection]);
  const viewportOperationContext = useMemo(() => operationContext ? {
    ...operationContext,
    color: objectColors[operationContext.objectId] ?? operationContext.color,
    opacity: selectedOperationTimeline && selectedOperationTimeline.index === selectedOperationTimeline.count - 1 ? 0 : 0.4,
  } : null, [objectColors, operationContext, selectedOperationTimeline]);
  const viewportTopologyPreviewContext = useMemo(() => topologyPreviewContext ? {
    ...topologyPreviewContext,
    color: objectColors[topologyPreviewContext.objectId] ?? topologyPreviewContext.color,
    opacity: 0,
  } : null, [objectColors, topologyPreviewContext]);
  const storedHistoricalTopologyReferences = useMemo(() => {
    if (!selectedOperationTimeline || selectedOperationTimeline.index >= selectedOperationTimeline.count - 1) return [];
    const feature = document.features.find((candidate) => candidate.id === selectedOperationTimeline.featureId);
    const ids = feature?.kind === "fillet" ? feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [] : feature?.kind === "faceExtrude" || feature?.kind === "revolve" ? [feature.faceReferenceId] : feature?.kind === "shell" ? feature.faceReferenceIds : [];
    return ids.map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter((reference): reference is ParametricTopologyReference => Boolean(reference));
  }, [document, selectedOperationTimeline]);
  const historicalTopologyRecords = useMemo<ParametricObjectRenderRecord[]>(() => {
    if (!operationContext?.selectionMesh) return [];
    const object = document.objects.find((candidate) => candidate.id === operationContext.objectId);
    if (!object) return [];
    return [{ objectId: object.id, renderId: `${operationContext.featureId}:selection-source`, geometryFingerprint: `${geometryFingerprint}:selection-source:${operationContext.featureId}`, color: object.color, worldTransform: object.transform, mesh: operationContext.selectionMesh }];
  }, [document.objects, geometryFingerprint, operationContext]);
  const historicalTopologyReferences = useMemo(() => storedHistoricalTopologyReferences
    .map((reference) => recoverParametricTopologyReferenceInRecords(reference, historicalTopologyRecords))
    .filter((reference): reference is ParametricTopologyReference => Boolean(reference)), [historicalTopologyRecords, storedHistoricalTopologyReferences]);

  useEffect(() => {
    try {
      const storedQuality = localStorage.getItem(RENDER_QUALITY_STORAGE_KEY);
      if (storedQuality === "normal" || storedQuality === "optimized") setRenderQuality(storedQuality);
      setShowFps(localStorage.getItem(FPS_VISIBLE_STORAGE_KEY) === "true");
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (validateDocument(parsed)) {
          const normalized = normalizeParametricDocument(parsed);
          setHistory(createParametricHistory(normalized));
          setModelSelection(normalized.objects[0] ? [{ id: normalized.objects[0].id, kind: "object" }] : []);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, renderQuality);
  }, [hydrated, renderQuality]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FPS_VISIBLE_STORAGE_KEY, String(showFps));
  }, [hydrated, showFps]);

  useEffect(() => {
    const createWorker = () => new Worker(new URL("../workers/parametricBuild.worker.ts", import.meta.url), { type: "module" });
    const buildWorker = new ParametricBuildWorkerClient(createWorker);
    const contextWorker = new ParametricBuildWorkerClient(createWorker);
    const topologySelectionWorker = new ParametricBuildWorkerClient(createWorker);
    const topologyPreviewWorker = new ParametricBuildWorkerClient(createWorker);
    buildWorkerRef.current = buildWorker;
    contextWorkerRef.current = contextWorker;
    topologySelectionWorkerRef.current = topologySelectionWorker;
    topologyPreviewWorkerRef.current = topologyPreviewWorker;
    return () => {
      buildWorker.dispose();
      contextWorker.dispose();
      topologySelectionWorker.dispose();
      topologyPreviewWorker.dispose();
      buildWorkerRef.current = null;
      contextWorkerRef.current = null;
      topologySelectionWorkerRef.current = null;
      topologyPreviewWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setTopologyPreviewContext(null);
    const references = [...selectedTopologyFaces, ...selectedTopologyEdges];
    if ((!pendingEdgeTreatment && !pendingFaceExtrude && !pendingShell && !pendingRevolve) || references.length === 0 || ((pendingFaceExtrude || pendingRevolve) && selectedTopologyFaces.length !== 1)) return;
    const preview = cloneDocument(document);
    let featureId = "";
    if (pendingEdgeTreatment) {
      const existing = editingEdgeTreatmentId ? preview.features.find((feature) => feature.id === editingEdgeTreatmentId && feature.kind === "fillet") : null;
      const feature = existing?.kind === "fillet" ? existing : createFilletFeature(preview.features.filter((candidate) => candidate.kind === "fillet").length + 1, pendingEdgeTreatment);
      const oldIds = new Set(feature.kind === "fillet" ? [...(feature.selectionReferenceIds ?? []), ...(feature.edgeReferenceIds ?? [])] : []);
      preview.topologyReferences = preview.topologyReferences.filter((reference) => !oldIds.has(reference.id));
      const stored = references.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:preview:${index + 1}` }));
      feature.objectId = references[0].objectId;
      feature.treatment = pendingEdgeTreatment;
      feature.radius = edgeTreatmentRadius;
      feature.selectionReferenceIds = stored.map((reference) => reference.id);
      feature.edgeReferenceIds = undefined;
      preview.topologyReferences.push(...stored);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    } else if (pendingFaceExtrude) {
      const reference = selectedTopologyFaces[0];
      const existing = editingFaceExtrudeId ? preview.features.find((feature) => feature.id === editingFaceExtrudeId && feature.kind === "faceExtrude") : null;
      const feature = existing?.kind === "faceExtrude" ? existing : createFaceExtrudeFeature(preview.features.filter((candidate) => candidate.kind === "faceExtrude").length + 1, pendingFaceExtrude.operation);
      if (existing?.kind === "faceExtrude") preview.topologyReferences = preview.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId);
      const stored = { ...structuredClone(reference), id: `${feature.id}:preview-face` };
      feature.objectId = reference.objectId;
      feature.operation = pendingFaceExtrude.operation;
      feature.distance = pendingFaceExtrude.distance;
      feature.faceReferenceId = stored.id;
      preview.topologyReferences.push(stored);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    } else if (pendingShell) {
      const existing = editingShellId ? preview.features.find((feature) => feature.id === editingShellId && feature.kind === "shell") : null;
      const feature = existing?.kind === "shell" ? existing : createShellFeature(preview.features.filter((candidate) => candidate.kind === "shell").length + 1);
      if (existing?.kind === "shell") preview.topologyReferences = preview.topologyReferences.filter((reference) => !existing.faceReferenceIds.includes(reference.id));
      const stored = selectedTopologyFaces.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:preview-face:${index + 1}` }));
      feature.objectId = selectedTopologyFaces[0].objectId;
      feature.thickness = pendingShell.thickness;
      feature.faceReferenceIds = stored.map((reference) => reference.id);
      preview.topologyReferences.push(...stored);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    } else if (pendingRevolve) {
      const reference = selectedTopologyFaces[0];
      const existing = editingRevolveId ? preview.features.find((feature) => feature.id === editingRevolveId && feature.kind === "revolve") : null;
      const feature = existing?.kind === "revolve" ? existing : createRevolveFeature(preview.features.filter((candidate) => candidate.kind === "revolve").length + 1, pendingRevolve.operation);
      if (existing?.kind === "revolve") preview.topologyReferences = preview.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId && candidate.id !== existing.axisReferenceId);
      const stored = { ...structuredClone(reference), id: `${feature.id}:preview-face` };
      const storedAxis = pendingRevolve.axis === "edge" && selectedTopologyEdges[0] ? { ...structuredClone(selectedTopologyEdges[0]), id: `${feature.id}:preview-axis` } : null;
      feature.objectId = reference.objectId;
      feature.source = "face";
      feature.operation = pendingRevolve.operation;
      feature.angle = pendingRevolve.angle;
      feature.axis = pendingRevolve.axis;
      feature.faceReferenceId = stored.id;
      preview.topologyReferences.push(stored);
      feature.axisReferenceId = storedAxis?.id;
      if (storedAxis) preview.topologyReferences.push(storedAxis);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    }
    if (!featureId) return;
    let active = true;
    const timeout = window.setTimeout(() => topologyPreviewWorkerRef.current?.buildContext(preview, featureId).then((result) => { if (active) setTopologyPreviewContext(result); }).catch(() => { if (active) setTopologyPreviewContext(null); }), 80);
    return () => { active = false; window.clearTimeout(timeout); topologyPreviewWorkerRef.current?.cancel(); };
  }, [document, edgeTreatmentRadius, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, pendingEdgeTreatment, pendingFaceExtrude, pendingRevolve, pendingShell, selectedTopologyEdges, selectedTopologyFaces]);

  useEffect(() => {
    setTopologySelectionBuild(null);
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    if (!editingFeatureId) return;
    const target = document.features.find((feature) => feature.id === editingFeatureId);
    if (!target?.objectId) return;
    const preview = cloneDocument(document);
    const operations = preview.features.filter((feature) => feature.objectId === target.objectId && feature.kind !== "sketch");
    const targetIndex = operations.findIndex((feature) => feature.id === editingFeatureId);
    for (const feature of operations.slice(Math.max(0, targetIndex))) feature.suppressed = true;
    let active = true;
    topologySelectionWorkerRef.current?.buildModel(preview).then((result) => { if (active) setTopologySelectionBuild(result); }).catch(() => { if (active) setTopologySelectionBuild(null); });
    return () => { active = false; topologySelectionWorkerRef.current?.cancel(); };
  }, [document, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId]);

  useEffect(() => {
    const counter = ++buildCounter.current;
    setKernelBusy(true);
    const buildDocument = buildDocumentRef.current;
    const timeout = window.setTimeout(() => {
      buildWorkerRef.current?.buildModel(buildDocument).then((result) => {
        if (counter !== buildCounter.current) return;
        setBuild(result);
        setKernelBusy(false);
      }).catch((error: unknown) => {
        if (counter !== buildCounter.current) return;
        setBuild((current) => ({ ...current, warning: error instanceof Error ? error.message : String(error) }));
        setKernelBusy(false);
      });
    }, 140);
    return () => {
      window.clearTimeout(timeout);
      buildWorkerRef.current?.cancel();
    };
  }, [geometryFingerprint]);

  useEffect(() => {
    const counter = ++contextBuildCounter.current;
    setOperationContext(null);
    if (!selectedOperationTimeline) return;
    const buildDocument = buildDocumentRef.current;
    const timeout = window.setTimeout(() => {
      contextWorkerRef.current?.buildContext(buildDocument, selectedOperationTimeline.featureId).then((result) => {
        if (counter === contextBuildCounter.current) setOperationContext(result);
      }).catch(() => {
        if (counter === contextBuildCounter.current) setOperationContext(null);
      });
    }, 80);
    return () => {
      window.clearTimeout(timeout);
      contextWorkerRef.current?.cancel();
    };
  }, [geometryFingerprint, selectedOperationTimeline]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (selectedTopologyFaces.length === 0 && selectedTopologyEdges.length === 0) return;
    const editingTopology = Boolean(editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId);
    if (editingTopology && !topologySelectionBuild) return;
    const topologyRecords = editingTopology ? topologySelectionBuild?.objectRecords ?? [] : build.objectRecords;
    const availableFaces = selectedTopologyFaces.map((reference) => recoverParametricTopologyReferenceInRecords(reference, topologyRecords)).filter((reference): reference is ParametricTopologyReference => Boolean(reference));
    const availableEdges = selectedTopologyEdges.map((reference) => recoverParametricTopologyReferenceInRecords(reference, topologyRecords)).filter((reference): reference is ParametricTopologyReference => Boolean(reference));
    const removed = selectedTopologyFaces.length - availableFaces.length + selectedTopologyEdges.length - availableEdges.length;
    const changed = availableFaces.some((reference, index) => reference !== selectedTopologyFaces[index]) || availableEdges.some((reference, index) => reference !== selectedTopologyEdges[index]);
    if (removed === 0 && !changed) return;
    setSelectedTopologyFaces(availableFaces);
    setSelectedTopologyEdges(availableEdges);
    if (removed === 0) return;
    setNotice({ type: "error", text: `${removed} referencia${removed === 1 ? "" : "s"} topológica${removed === 1 ? "" : "s"} ya no existe${removed === 1 ? "" : "n"} tras reconstruir la pieza` });
  }, [build.objectRecords, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, selectedTopologyEdges, selectedTopologyFaces, topologySelectionBuild]);

  const commit = useCallback((next: ParametricDocument) => {
    next.updatedAt = Date.now();
    setHistory((current) => commitHistoryDocument(current, next));
  }, []);

  const beginTransaction = useCallback(() => setHistory(beginHistoryTransaction), []);
  const finishTransaction = useCallback(() => setHistory((current) => finishHistoryTransaction(current)), []);
  const cancelTransaction = useCallback(() => setHistory(cancelHistoryTransaction), []);

  const mutate = useCallback((mutator: (draft: ParametricDocument) => void) => {
    const next = cloneDocument(document);
    try {
      mutator(next);
      assertValidParametricDependencies(next);
      assertValidParametricTopology(next);
      commit(next);
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "La operación crearía una dependencia no válida." });
      return false;
    }
  }, [commit, document]);

  const primarySelection = modelSelection.at(-1) ?? null;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";
  const selectedObjectId = objectIdForFeature(document, selectedId);
  const selectedFeature = selectionKind === "feature" ? document.features.find((feature) => feature.id === selectedId) ?? null : null;
  const selectedOperationId = selectionKind === "feature" && document.features.some((feature) => feature.id === selectedId && (feature.kind === "extrude" || feature.kind === "primitive")) ? selectedId : null;
  const selectedOperation = selectedOperationId ? document.features.find((feature): feature is ExtrudeFeature | PrimitiveFeature => feature.id === selectedOperationId && (feature.kind === "extrude" || feature.kind === "primitive")) : null;
  const selectedShape = useMemo(() => workplaneShapeForObject(document, selectedObjectId), [document, selectedObjectId]);
  const selectedBox = useMemo(() => modelSelection.length === 1 ? (selectedOperationId ? viewportSelectionForFeature(document, selectedOperationId) : viewportSelectionForObject(document, selectedObjectId)) : null, [document, modelSelection.length, selectedObjectId, selectedOperationId]);
  const selectedOriginObjectId = modelSelection.length === 1 && selectionKind === "object" ? selectedObjectId : null;
  const selectedOperationOriginId = modelSelection.length === 1 ? selectedOperationId : null;
  const viewportSelectedObjectIds = useMemo(() => [...new Set(modelSelection.flatMap((item) => {
    const objectId = objectIdForFeature(document, item.id);
    return objectId ? [objectId] : [];
  }))], [document, modelSelection]);
  const viewportObjectOrigins = useMemo(() => document.objects.map((object) => ({
    objectId: object.id,
    visible: object.id === selectedOriginObjectId,
    position: object.transform.position,
    rotation: object.transform.rotation,
  })), [document.objects, selectedOriginObjectId]);
  const viewportOperationOrigins = useMemo(() => selectedOperationOriginId && selectedBox ? [{
    featureId: selectedOperationOriginId,
    visible: true,
    position: selectedBox.origin ?? { x: selectedBox.x, y: selectedBox.y, z: selectedBox.baseZ },
    rotation: selectedBox.rotation3d ?? { x: 0, y: 0, z: selectedBox.rotation },
  }] : [], [selectedBox, selectedOperationOriginId]);
  const snapAmount = document.workplane.snapToGrid ? document.workplane.gridStep : 0.01;

  const beginSketch = (featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === featureId && candidate.profile.shape === "drawn") : null;
    const profile = feature?.profile.shape === "drawn" ? cloneSketchProfile(feature.profile.geometry) : emptySketchProfile();
    setSketchSession({ featureId: feature?.id ?? null, objectId: feature?.objectId ?? selectedObjectId, profile });
    sketchHistoryRef.current = [cloneSketchProfile(profile)];
    sketchHistoryIndexRef.current = 0;
    setSketchHistoryIndex(0);
    setSketchTool(feature ? "select" : "line");
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    setModelSidebarMode("hidden");
    setNotice({ type: "info", text: feature ? "Editando boceto" : "Dibuja un contorno cerrado" });
  };

  const cancelSketch = () => {
    setSketchSession(null);
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    sketchHistoryRef.current = [];
    sketchHistoryIndexRef.current = -1;
    setSketchHistoryIndex(-1);
    setModelSidebarMode("normal");
    setNotice({ type: "info", text: "Edición de boceto cancelada" });
  };

  const acceptSketch = () => {
    if (!sketchSession || !isClosedSketch(sketchSession.profile)) {
      setNotice({ type: "error", text: "Cierra todos los contornos antes de aceptar el boceto." });
      return;
    }
    let featureId = sketchSession.featureId ?? "";
    let objectId = sketchSession.objectId;
    const changed = mutate((draft) => {
      if (featureId) {
        const feature = draft.features.find((candidate) => candidate.id === featureId);
        if (feature?.kind === "sketch" && feature.profile.shape === "drawn") feature.profile.geometry = structuredClone(sketchSession.profile);
        return;
      }
      if (!objectId || !draft.objects.some((object) => object.id === objectId)) {
        objectId = addParametricObject(draft, draft.workplane.origin);
        const object = draft.objects.find((candidate) => candidate.id === objectId);
        if (object) {
          const placement = objectPlacementForWorkplane(draft.workplane);
          object.transform.position = placement.position;
          object.transform.rotation = placement.rotation;
        }
      }
      const feature = createDrawnSketchFeature(draft.features.filter((candidate) => candidate.kind === "sketch" && candidate.purpose === "user").length + 1, sketchSession.profile);
      feature.objectId = objectId ?? undefined;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setSketchSession(null);
    sketchHistoryRef.current = [];
    sketchHistoryIndexRef.current = -1;
    setSketchHistoryIndex(-1);
    setModelSidebarMode("normal");
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setNotice({ type: "ok", text: sketchSession.featureId ? "Boceto actualizado" : "Boceto añadido al historial" });
  };

  const setSketchProfile = (update: (profile: SketchProfile) => SketchProfile) => {
    if (!sketchSession) return;
    const nextProfile = update(cloneSketchProfile(sketchSession.profile));
    if (JSON.stringify(nextProfile) === JSON.stringify(sketchSession.profile)) return;
    const nextHistory = [...sketchHistoryRef.current.slice(0, sketchHistoryIndexRef.current + 1), cloneSketchProfile(nextProfile)];
    sketchHistoryRef.current = nextHistory;
    sketchHistoryIndexRef.current = nextHistory.length - 1;
    setSketchHistoryIndex(sketchHistoryIndexRef.current);
    setSketchSession({ ...sketchSession, profile: nextProfile });
  };

  const sketchUndo = () => {
    if (sketchHistoryIndexRef.current <= 0) return;
    const index = sketchHistoryIndexRef.current - 1;
    sketchHistoryIndexRef.current = index;
    setSketchHistoryIndex(index);
    setSketchSession((current) => current ? { ...current, profile: cloneSketchProfile(sketchHistoryRef.current[index]) } : current);
    setSketchSelection(null);
    setSketchActivePointId(null);
  };

  const sketchRedo = () => {
    if (sketchHistoryIndexRef.current >= sketchHistoryRef.current.length - 1) return;
    const index = sketchHistoryIndexRef.current + 1;
    sketchHistoryIndexRef.current = index;
    setSketchHistoryIndex(index);
    setSketchSession((current) => current ? { ...current, profile: cloneSketchProfile(sketchHistoryRef.current[index]) } : current);
    setSketchSelection(null);
    setSketchActivePointId(null);
  };

  const chooseSketchTool = (tool: SketchTool) => {
    setSketchTool(tool);
    setSketchActivePointId(null);
    setSketchSelection(null);
    if (tool !== "measure") setSketchMeasureStart(null);
  };

  const connectSketchPoint = (pointId: string) => {
    if (!sketchSession || !["line", "bezier", "smooth"].includes(sketchTool)) return;
    if (!sketchActivePointId) {
      setSketchActivePointId(pointId);
      setSketchSelection({ kind: "point", id: pointId });
      return;
    }
    if (sketchActivePointId === pointId) return;
    const duplicate = sketchSession.profile.segments.some((segment) => (segment.startId === sketchActivePointId && segment.endId === pointId) || (segment.startId === pointId && segment.endId === sketchActivePointId));
    if (!duplicate) setSketchProfile((profile) => {
      const next = { ...profile, segments: [...profile.segments, { id: sketchEntityId("segment"), startId: sketchActivePointId, endId: pointId, kind: sketchTool as "line" | "bezier" | "smooth" }] };
      return sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
    });
    const firstPointId = sketchSession.profile.segments.length ? sketchSession.profile.segments[0].startId : null;
    const closed = pointId === firstPointId;
    setSketchActivePointId(closed ? null : pointId);
    setSketchSelection({ kind: "point", id: pointId });
    if (closed) setSketchTool("select");
  };

  const addSketchPoint = (position: { x: number; z: number }, handles?: { handleIn: { x: number; z: number }; handleOut: { x: number; z: number } }) => {
    if (!sketchSession) return;
    if (sketchTool === "measure") {
      const point = { id: "measure", ...position };
      if (sketchMeasureStart) { setSketchMeasurement({ start: sketchMeasureStart, end: point }); setSketchMeasureStart(null); }
      else { setSketchMeasureStart(point); setSketchMeasurement(null); }
      return;
    }
    if (!["line", "bezier", "smooth"].includes(sketchTool)) return;
    const existing = sketchSession.profile.points.find((point) => Math.hypot(point.x - position.x, point.z - position.z) < 0.0001);
    if (existing) { connectSketchPoint(existing.id); return; }
    const point: SketchPoint = { id: sketchEntityId("point"), ...position, ...handles, mode: sketchTool === "line" ? "corner" : "smooth" };
    setSketchProfile((profile) => {
      const next = { ...profile, points: [...profile.points, point], segments: sketchActivePointId ? [...profile.segments, { id: sketchEntityId("segment"), startId: sketchActivePointId, endId: point.id, kind: sketchTool as "line" | "bezier" | "smooth" }] : profile.segments };
      return sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
    });
    setSketchActivePointId(point.id);
    setSketchSelection({ kind: "point", id: point.id });
  };

  const pressSketchPoint = (id: string) => {
    const point = sketchSession?.profile.points.find((candidate) => candidate.id === id);
    if (!point) return;
    if (sketchTool === "measure") {
      if (sketchMeasureStart) { setSketchMeasurement({ start: sketchMeasureStart, end: point }); setSketchMeasureStart(null); }
      else { setSketchMeasureStart(point); setSketchMeasurement(null); }
    } else if (sketchTool === "select") { setSketchSelection({ kind: "point", id }); setSketchActivePointId(null); }
    else connectSketchPoint(id);
  };

  const deleteSketchPoint = (id: string) => {
    setSketchProfile((profile) => {
      const connected = profile.segments.filter((segment) => segment.startId === id || segment.endId === id);
      const neighborIds = connected.map((segment) => segment.startId === id ? segment.endId : segment.startId);
      const remaining = profile.segments.filter((segment) => segment.startId !== id && segment.endId !== id);
      if (neighborIds.length === 2 && neighborIds[0] !== neighborIds[1] && !remaining.some((segment) => (segment.startId === neighborIds[0] && segment.endId === neighborIds[1]) || (segment.startId === neighborIds[1] && segment.endId === neighborIds[0]))) {
        remaining.push({ id: sketchEntityId("segment"), startId: neighborIds[0], endId: neighborIds[1], kind: connected.every((segment) => segment.kind === "line") ? "line" : connected.some((segment) => segment.kind === "smooth") ? "smooth" : "bezier" });
      }
      const next = { ...profile, points: profile.points.filter((point) => point.id !== id), segments: remaining };
      return next.segments.some((segment) => segment.kind === "smooth") ? withSmoothSketchHandles(next) : next;
    });
    if (sketchActivePointId === id) setSketchActivePointId(null);
    setSketchSelection(null);
  };

  const deleteSketchSegment = (id: string) => {
    setSketchProfile((profile) => ({ ...profile, segments: profile.segments.filter((segment) => segment.id !== id) }));
    setSketchActivePointId(null);
    setSketchSelection(null);
  };

  const insertSketchPoint = (segmentId: string, position: { x: number; z: number }) => {
    const insertedId = sketchEntityId("point");
    setSketchProfile((profile) => {
      const segment = profile.segments.find((candidate) => candidate.id === segmentId);
      if (!segment) return profile;
      const inserted: SketchPoint = { id: insertedId, ...position, mode: segment.kind === "line" ? "corner" : "smooth" };
      const next = { ...profile, points: [...profile.points, inserted], segments: profile.segments.flatMap((candidate) => candidate.id === segmentId ? [{ ...candidate, id: sketchEntityId("segment"), endId: inserted.id }, { ...candidate, id: sketchEntityId("segment"), startId: inserted.id }] : [candidate]) };
      return segment.kind === "smooth" ? withSmoothSketchHandles(next) : next;
    });
    setSketchSelection({ kind: "point", id: insertedId });
    setSketchTool("select");
  };

  const moveSketchHandle = (id: string, handle: "in" | "out", position: { x: number; z: number }) => setSketchProfile((profile) => {
    const next = cloneSketchProfile(profile);
    const point = next.points.find((candidate) => candidate.id === id);
    if (!point) return profile;
    if (handle === "in") point.handleIn = { ...position };
    else point.handleOut = { ...position };
    if (point.mode === "smooth") {
      const opposite = { x: point.x * 2 - position.x, z: point.z * 2 - position.z };
      if (handle === "in") point.handleOut = opposite;
      else point.handleIn = opposite;
    }
    return next;
  });

  const setSketchPointMode = (id: string, mode: "corner" | "smooth" | "split") => setSketchProfile((profile) => {
    let next = cloneSketchProfile(profile);
    const point = next.points.find((candidate) => candidate.id === id);
    if (!point) return profile;
    point.mode = mode;
    if (mode === "corner") {
      point.handleIn = undefined;
      point.handleOut = undefined;
      next.segments = next.segments.map((segment) => segment.startId === id || segment.endId === id ? { ...segment, kind: "line" as const } : segment);
    } else {
      next.segments = next.segments.map((segment) => segment.startId === id || segment.endId === id ? { ...segment, kind: "bezier" as const } : segment);
      if (!point.handleIn || !point.handleOut) next = withSmoothSketchHandles(next);
      const updated = next.points.find((candidate) => candidate.id === id);
      if (updated) updated.mode = mode;
    }
    return next;
  });

  const addExtrudeFromSketch = (sketch: SketchFeature) => {
    let featureId = "";
    const changed = mutate((draft) => {
      if (!sketch.objectId) return;
      const feature = createExtrudeFeature(sketch.id, draft.features.filter((candidate) => candidate.kind === "extrude").length + 1, false);
      feature.objectId = sketch.objectId;
      feature.dependencies = [{ type: "feature", id: sketch.id }];
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) { setModelSelection([{ id: featureId, kind: "feature" }]); setNotice({ type: "ok", text: "Extrusión creada desde el boceto" }); }
  };

  const addRevolveFromSketch = (sketch: SketchFeature) => {
    let featureId = "";
    const changed = mutate((draft) => {
      if (!sketch.objectId) return;
      const feature = createRevolveFeature(draft.features.filter((candidate) => candidate.kind === "revolve").length + 1, "add");
      feature.objectId = sketch.objectId;
      feature.source = "sketch";
      feature.sketchId = sketch.id;
      feature.faceReferenceId = undefined;
      feature.axis = "y";
      feature.dependencies = [{ type: "feature", id: sketch.id }];
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) { setModelSelection([{ id: featureId, kind: "feature" }]); setNotice({ type: "ok", text: "Revolución creada desde el boceto" }); }
  };
  const faceExtrudeHandle = useMemo(() => {
    const pendingReference = pendingFaceExtrude ? selectedTopologyFaces[0] : null;
    const selectedFeature = !pendingFaceExtrude && modelSelection.length === 1 && modelSelection[0]?.kind === "feature"
      ? document.features.find((feature) => feature.id === modelSelection[0]?.id && feature.kind === "faceExtrude")
      : null;
    const reference = pendingReference ?? (selectedFeature?.kind === "faceExtrude" ? document.topologyReferences.find((candidate) => candidate.id === selectedFeature.faceReferenceId) : null);
    const hint = reference?.reference.hint;
    if (!hint || hint.entityType !== "face" || !hint.centroid || !hint.normal) return null;
    return {
      origin: { x: hint.centroid[0], y: hint.centroid[1], z: hint.centroid[2] },
      normal: { x: hint.normal[0], y: hint.normal[1], z: hint.normal[2] },
      distance: pendingFaceExtrude?.distance ?? (selectedFeature?.kind === "faceExtrude" ? selectedFeature.distance : 0),
      operation: pendingFaceExtrude?.operation ?? (selectedFeature?.kind === "faceExtrude" ? selectedFeature.operation : "add" as const),
      featureId: selectedFeature?.kind === "faceExtrude" ? selectedFeature.id : null,
    };
  }, [document, modelSelection, pendingFaceExtrude, selectedTopologyFaces]);
  const hasActiveWorkplane = !parametricWorkplaneIsGlobal(document.workplane);
  const updateGridSettings = (patch: Partial<Pick<ParametricDocument["workplane"], "width" | "depth" | "gridStep" | "gridVisible" | "activeSizePercent">>) => {
    setWorkplaneDraft((current) => ({ ...current, ...patch }));
    mutate((draft) => { Object.assign(draft.workplane, patch); });
  };

  useEffect(() => {
    if (!originEditObjectId) return;
    const selectedObject = modelSelection.length === 1 && selectionKind === "object" && selectedId === originEditObjectId;
    const originAvailable = document.objects.some((object) => object.id === originEditObjectId && !object.locked);
    if (!selectedObject || !originAvailable) setOriginEditObjectId(null);
  }, [document.objects, modelSelection.length, originEditObjectId, selectedId, selectionKind]);

  useEffect(() => {
    if (modelSelection.length < 2) setAlignOpen(false);
  }, [modelSelection.length]);

  const addShape = (kind: SupportedPrimitive) => {
    let result: ReturnType<typeof addPrimitiveToSelection> = { objectId: "", featureId: null, createdObject: false };
    mutate((draft) => {
      result = addPrimitiveToSelection(draft, selectedObjectId, kind);
    });
    if (result.featureId) {
      setModelSelection([{ id: result.featureId, kind: "feature" }]);
    }
    setShapesOpen(false);
    setNotice({ type: "ok", text: `${parametricOperationDefinition(kind).name} ${result.createdObject ? "creada en un objeto nuevo" : "añadida al final del objeto activo"}` });
  };

  const removeSelected = useCallback(() => {
    if (!selectedObjectId) return;
    const ids = document.objects.map((object) => object.id);
    const index = ids.indexOf(selectedObjectId);
    if (!mutate((draft) => deleteParametricObject(draft, selectedObjectId))) return;
    const nextId = ids[index - 1] ?? ids[index + 1] ?? null;
    setModelSelection(nextId ? [{ id: nextId, kind: "object" }] : []);
  }, [document, mutate, selectedObjectId]);

  const duplicateSelected = useCallback((sourceId = selectedObjectId) => {
    if (!sourceId) return;
    let nextId: string | null = null;
    mutate((draft) => { nextId = duplicateParametricObject(draft, sourceId); });
    if (nextId) {
      setModelSelection([{ id: nextId, kind: "object" }]);
    }
    setNotice({ type: "ok", text: "Forma duplicada" });
  }, [mutate, selectedObjectId]);

  const deleteFeature = useCallback((id: string) => {
    let result: ReturnType<typeof deleteParametricFeature> = { objectId: null, nextId: null };
    const deleted = mutate((draft) => {
      result = deleteParametricFeature(draft, id);
    });
    if (!deleted) return;
    const nextId = result.nextId ?? result.objectId;
    setModelSelection(nextId ? [{ id: nextId, kind: result.nextId && result.nextId !== result.objectId ? "feature" : "object" }] : []);
    setNotice({ type: "ok", text: "Operación eliminada" });
  }, [mutate]);

  const deleteCurrentSelection = useCallback(() => {
    if (modelSelection.length === 0) return;
    if (modelSelection.length === 1) {
      const item = modelSelection[0];
      if (item.kind === "feature") deleteFeature(item.id);
      else removeSelected();
      return;
    }
    if (!mutate((draft) => deleteParametricSelection(draft, modelSelection))) return;
    setModelSelection([]);
    setNotice({ type: "ok", text: `${modelSelection.length} elementos eliminados` });
  }, [deleteFeature, modelSelection, mutate, removeSelected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if (sketchSession) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) sketchRedo();
          else sketchUndo();
          return;
        }
        if (event.key === "Escape") cancelSketch();
        if (event.key === "Delete" || event.key === "Backspace") {
          const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
          const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
          const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
          if (pointIds.length || segmentIds.length || imageIds.length) {
            event.preventDefault();
            setSketchProfile((profile) => ({ ...profile, points: profile.points.filter((point) => !pointIds.includes(point.id)), segments: profile.segments.filter((segment) => !segmentIds.includes(segment.id) && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId)), images: (profile.images ?? []).filter((image) => !imageIds.includes(image.id)) }));
            setSketchSelection(null);
          }
        }
        return;
      }
      if (event.key === "Escape") {
        setModelSelection([]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteCurrentSelection();
        return;
      }
      if (!selectedObjectId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? snapAmount * 5 : snapAmount;
      const x = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const y = event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0;
      const plane = document.workplane;
      mutate((draft) => applyParametricSelectionWorldDelta(draft, selectedId!, selectionKind, {
        x: plane.xAxis.x * x + plane.yAxis.x * y,
        y: plane.xAxis.y * x + plane.yAxis.y * y,
        z: plane.xAxis.z * x + plane.yAxis.z * y,
      }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteCurrentSelection, document.workplane, mutate, selectedId, selectedObjectId, selectionKind, sketchSelection, sketchSession, snapAmount]);

  const updateSelected = (patch: Partial<WorkplaneShape>) => {
    if (!selectedObjectId) return;
    mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, patch));
  };

  const updateFeature = (id: string, update: (feature: ParametricFeature) => void) => {
    mutate((draft) => {
      const feature = draft.features.find((candidate) => candidate.id === id);
      if (feature) update(feature);
    });
  };

  const setSelectedOperationMode = (operation: "add" | "cut" | "intersect") => {
    if (!selectedOperationId || !selectedOperation || selectedOperation.operation === operation) return;
    updateFeature(selectedOperationId, (feature) => {
      if (feature.kind === "extrude" || feature.kind === "primitive") feature.operation = operation;
    });
  };

  const updateObject = (id: string, update: (object: ParametricObject) => void) => {
    mutate((draft) => {
      const object = draft.objects.find((candidate) => candidate.id === id);
      if (object) update(object);
    });
  };

  const toggleOriginEdit = (objectId: string) => {
    if (originEditObjectId === objectId) {
      setOriginEditObjectId(null);
      return;
    }
    const object = document.objects.find((candidate) => candidate.id === objectId);
    if (!object || object.locked) return;
    setModelSelection([{ id: objectId, kind: "object" }]);
    setOriginEditObjectId(objectId);
  };

  const reorderSelection = (direction: "up" | "down") => {
    if (!canReorderParametricSelection(document, modelSelection, direction)) return;
    mutate((draft) => { reorderParametricSelection(draft, modelSelection, direction); });
  };

  const renameSelection = (name: string) => {
    if (!name.trim() || modelSelection.length === 0) return;
    mutate((draft) => { renameParametricSelection(draft, modelSelection, name); });
  };

  const alignSelection = (axis: ParametricAlignmentAxis, anchor: ParametricAlignmentAnchor) => {
    let moved = 0;
    let referenceId: string | null = null;
    mutate((draft) => {
      const result = alignParametricSelections(draft, modelSelection, axis, anchor);
      moved = result.moved;
      referenceId = result.referenceId;
    });
    setAlignOpen(false);
    const reference = document.objects.find((object) => object.id === referenceId)
      ?? document.features.find((feature) => feature.id === referenceId);
    setNotice(moved > 0
      ? { type: "ok", text: `${moved} elemento${moved === 1 ? "" : "s"} alineado${moved === 1 ? "" : "s"} con ${reference?.name ?? "la referencia"}` }
      : { type: "info", text: "No hay elementos móviles que alinear con esa referencia." });
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));
  const undo = () => setHistory(undoParametricHistory);
  const redo = () => setHistory(redoParametricHistory);

  const newDocument = () => {
    const next = createStarterDocument();
    setHistory(createParametricHistory(next));
    setModelSelection(next.objects[0] ? [{ id: next.objects[0].id, kind: "object" }] : []);
    setNotice({ type: "info", text: "Nuevo diseño" });
  };

  const beginEdgeTreatment = (treatment: "fillet" | "chamfer", featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "fillet") : null;
    const savedReferences = feature?.kind === "fillet"
      ? (feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? []).map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter((reference): reference is ParametricTopologyReference => Boolean(reference))
      : [];
    setPendingEdgeTreatment(treatment);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingShell(null);
    setEditingShellId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setModelSidebarMode("normal");
    setEdgeTreatmentRadius(feature?.kind === "fillet" ? feature.radius : 2);
    setEditingEdgeTreatmentId(featureId);
    setSelectingTopologyFaces(true);
    setSelectingTopologyEdges(true);
    setSelectedTopologyFaces(savedReferences.filter((reference) => reference.reference.hint.entityType === "face"));
    setSelectedTopologyEdges(savedReferences.filter((reference) => reference.reference.hint.entityType === "edge"));
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: "Pulsa caras o aristas para añadirlas o retirarlas de la selección" });
  };

  const cancelEdgeTreatment = () => {
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setNotice({ type: "info", text: "Operación temporal cancelada" });
  };

  const acceptEdgeTreatment = () => {
    const selection = [...selectedTopologyFaces, ...selectedTopologyEdges];
    const objectIds = [...new Set(selection.map((reference) => reference.objectId))];
    if (!pendingEdgeTreatment || selection.length === 0 || objectIds.length !== 1) {
      setNotice({ type: "error", text: "Selecciona una o varias caras o aristas del mismo objeto." });
      return;
    }
    let featureId = "";
    const created = mutate((draft) => {
      const existing = editingEdgeTreatmentId ? draft.features.find((candidate) => candidate.id === editingEdgeTreatmentId && candidate.kind === "fillet") : null;
      const feature = existing && existing.kind === "fillet" ? existing : createFilletFeature(draft.features.filter((candidate) => candidate.kind === "fillet").length + 1, pendingEdgeTreatment);
      const previousIds = new Set(feature.kind === "fillet" ? [...(feature.selectionReferenceIds ?? []), ...(feature.edgeReferenceIds ?? [])] : []);
      draft.topologyReferences = draft.topologyReferences.filter((reference) => !previousIds.has(reference.id));
      feature.treatment = pendingEdgeTreatment;
      feature.radius = Math.max(0.01, edgeTreatmentRadius);
      feature.objectId = objectIds[0];
      featureId = feature.id;
      const references = selection.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:selection:${index + 1}` }));
      feature.selectionReferenceIds = references.map((reference) => reference.id);
      feature.edgeReferenceIds = undefined;
      draft.topologyReferences.push(...references);
      if (!existing) draft.features.push(feature);
    });
    if (!created || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setNotice({ type: "ok", text: `${pendingEdgeTreatment === "chamfer" ? "Chaflán" : "Redondeo"} paramétrico ${editingEdgeTreatmentId ? "actualizado" : "añadido"} sobre ${selection.length} elemento${selection.length === 1 ? "" : "s"}` });
  };

  const beginFaceExtrude = (operation: "add" | "cut" = "add", featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "faceExtrude") : null;
    const saved = feature?.kind === "faceExtrude" ? document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId) : null;
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setPendingShell(null);
    setEditingShellId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setPendingFaceExtrude({ operation: feature?.kind === "faceExtrude" ? feature.operation : operation, distance: feature?.kind === "faceExtrude" ? feature.distance : 10 });
    setEditingFaceExtrudeId(featureId);
    setModelSidebarMode("normal");
    setSelectingTopologyFaces(true);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces(saved ? [saved] : []);
    setSelectedTopologyEdges([]);
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: "Selecciona una cara plana para extruir o ahuecar" });
  };

  const cancelFaceExtrude = () => {
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "info", text: "Extrusión temporal cancelada" });
  };

  const acceptFaceExtrude = () => {
    const reference = selectedTopologyFaces[0];
    if (!pendingFaceExtrude || !reference) {
      setNotice({ type: "error", text: "Selecciona una cara plana." });
      return;
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const existing = editingFaceExtrudeId ? draft.features.find((candidate) => candidate.id === editingFaceExtrudeId && candidate.kind === "faceExtrude") : null;
      const feature = existing?.kind === "faceExtrude" ? existing : createFaceExtrudeFeature(draft.features.filter((candidate) => candidate.kind === "faceExtrude").length + 1, pendingFaceExtrude.operation);
      if (existing?.kind === "faceExtrude") draft.topologyReferences = draft.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId);
      feature.objectId = reference.objectId;
      feature.operation = pendingFaceExtrude.operation;
      feature.distance = Math.max(0.01, pendingFaceExtrude.distance);
      featureId = feature.id;
      const stored = { ...structuredClone(reference), id: `${feature.id}:face` };
      feature.faceReferenceId = stored.id;
      draft.topologyReferences.push(stored);
      if (!existing) draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "ok", text: `${pendingFaceExtrude.operation === "cut" ? "Hueco" : "Extrusión"} de cara ${editingFaceExtrudeId ? "actualizado" : "añadido"}` });
  };

  const beginShell = (featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "shell") : null;
    const saved = feature?.kind === "shell" ? feature.faceReferenceIds.map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter((reference): reference is ParametricTopologyReference => Boolean(reference)) : [];
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setPendingShell({ thickness: feature?.kind === "shell" ? feature.thickness : 2 });
    setEditingShellId(featureId);
    setModelSidebarMode("normal");
    setSelectingTopologyFaces(true);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces(saved);
    setSelectedTopologyEdges([]);
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: "Selecciona las caras que quedarán abiertas" });
  };

  const cancelShell = () => {
    setPendingShell(null);
    setEditingShellId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "info", text: "Vaciado temporal cancelado" });
  };

  const acceptShell = () => {
    if (!pendingShell || selectedTopologyFaces.length === 0 || new Set(selectedTopologyFaces.map((reference) => reference.objectId)).size !== 1) {
      setNotice({ type: "error", text: "Selecciona una o varias caras del mismo objeto." });
      return;
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const existing = editingShellId ? draft.features.find((candidate) => candidate.id === editingShellId && candidate.kind === "shell") : null;
      const feature = existing?.kind === "shell" ? existing : createShellFeature(draft.features.filter((candidate) => candidate.kind === "shell").length + 1);
      if (existing?.kind === "shell") draft.topologyReferences = draft.topologyReferences.filter((reference) => !existing.faceReferenceIds.includes(reference.id));
      const stored = selectedTopologyFaces.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:face:${index + 1}` }));
      feature.objectId = selectedTopologyFaces[0].objectId;
      feature.thickness = Math.max(0.01, pendingShell.thickness);
      feature.faceReferenceIds = stored.map((reference) => reference.id);
      featureId = feature.id;
      draft.topologyReferences.push(...stored);
      if (!existing) draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setPendingShell(null);
    setEditingShellId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "ok", text: `Vaciado ${editingShellId ? "actualizado" : "añadido"}` });
  };

  const beginRevolve = (featureId: string | null = null, target: "face" | "axis" | "both" = "both") => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "revolve") : null;
    const saved = feature?.kind === "revolve" ? document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId) : null;
    const savedAxis = feature?.kind === "revolve" && feature.axisReferenceId ? document.topologyReferences.find((reference) => reference.id === feature.axisReferenceId) : null;
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingShell(null);
    setEditingShellId(null);
    setPendingRevolve({ operation: feature?.kind === "revolve" ? feature.operation : "add", angle: feature?.kind === "revolve" ? feature.angle : 360, axis: feature?.kind === "revolve" ? feature.axis : "z" });
    setEditingRevolveId(featureId);
    setModelSidebarMode("normal");
    setSelectingTopologyFaces(target !== "axis");
    setSelectingTopologyEdges(target !== "face");
    setSelectedTopologyFaces(saved ? [saved] : []);
    setSelectedTopologyEdges(savedAxis ? [savedAxis] : []);
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: "Selecciona una cara plana para revolucionar" });
  };

  const cancelRevolve = () => {
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "info", text: "Revolución temporal cancelada" });
  };

  const acceptRevolve = () => {
    const reference = selectedTopologyFaces[0];
    if (!pendingRevolve || !reference || (pendingRevolve.axis === "edge" && selectedTopologyEdges.length !== 1)) {
      setNotice({ type: "error", text: pendingRevolve?.axis === "edge" ? "Selecciona una cara plana y una arista recta como eje." : "Selecciona una cara plana." });
      return;
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const existing = editingRevolveId ? draft.features.find((candidate) => candidate.id === editingRevolveId && candidate.kind === "revolve") : null;
      const feature = existing?.kind === "revolve" ? existing : createRevolveFeature(draft.features.filter((candidate) => candidate.kind === "revolve").length + 1, pendingRevolve.operation);
      if (existing?.kind === "revolve") draft.topologyReferences = draft.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId && candidate.id !== existing.axisReferenceId);
      feature.objectId = reference.objectId;
      feature.source = "face";
      feature.operation = pendingRevolve.operation;
      feature.angle = Math.abs(pendingRevolve.angle) < 1 ? (pendingRevolve.angle < 0 ? -1 : 1) : Math.min(360, Math.max(-360, pendingRevolve.angle));
      feature.axis = pendingRevolve.axis;
      featureId = feature.id;
      const stored = { ...structuredClone(reference), id: `${feature.id}:face` };
      const storedAxis = pendingRevolve.axis === "edge" && selectedTopologyEdges[0] ? { ...structuredClone(selectedTopologyEdges[0]), id: `${feature.id}:axis` } : null;
      feature.faceReferenceId = stored.id;
      draft.topologyReferences.push(stored);
      feature.axisReferenceId = storedAxis?.id;
      if (storedAxis) draft.topologyReferences.push(storedAxis);
      if (!existing) draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "ok", text: `Revolución ${editingRevolveId ? "actualizada" : "añadida"}` });
  };

  const selectTopologyFace = (face: TopologyFacePick) => {
    if ((pendingFaceExtrude || pendingRevolve) && !face.planar) {
      setNotice({ type: "error", text: pendingRevolve ? "La revolución requiere una cara plana." : "La extrusión desde cara requiere una cara plana." });
      return;
    }
    const objectOperations = document.features.filter((feature) => feature.objectId === face.objectId && feature.kind !== "sketch");
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    const editingIndex = editingFeatureId ? objectOperations.findIndex((feature) => feature.id === editingFeatureId) : -1;
    const source = editingIndex >= 0 ? objectOperations[editingIndex - 1] ?? null : lastOperationForObject(document, face.objectId);
    if (!source) return;
    const reference: ParametricTopologyReference = {
      id: `selected-face-${face.key}`,
      name: `Cara de ${source.name}`,
      objectId: face.objectId,
      sourceFeatureId: source.id,
      reference: {
        origin: `${source.id}:result`,
        role: `planar:${face.key}`,
        hint: {
          entityType: "face",
          ...(face.faceId === undefined ? { surfaceType: "plane" } : {}),
          normal: [face.normal.x, face.normal.y, face.normal.z],
          centroid: [face.centroid.x, face.centroid.y, face.centroid.z],
          area: face.area,
          ...(face.faceId === undefined ? {} : { topologyId: face.faceId, originId: face.origin }),
        },
      },
    };
    if (pendingRevolve) {
      setSelectedTopologyFaces(face.selected ? [reference] : []);
      return;
    }
    if (!face.additive) setSelectedTopologyEdges([]);
    setSelectedTopologyFaces((current) => {
      if (!face.additive) return face.selected ? [reference] : [];
      if (!face.selected) return current.filter((candidate) => candidate.id !== reference.id);
      return current.some((candidate) => candidate.id === reference.id) ? current : [...current, reference];
    });
  };

  const selectTopologyEdge = (edge: TopologyEdgePick) => {
    if (pendingRevolve && !edge.straight) {
      setNotice({ type: "error", text: "El eje de revolución debe ser una arista recta." });
      return;
    }
    const objectOperations = document.features.filter((feature) => feature.objectId === edge.objectId && feature.kind !== "sketch");
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    const editingIndex = editingFeatureId ? objectOperations.findIndex((feature) => feature.id === editingFeatureId) : -1;
    const source = editingIndex >= 0 ? objectOperations[editingIndex - 1] ?? null : lastOperationForObject(document, edge.objectId);
    if (!source) return;
    const reference: ParametricTopologyReference = {
      id: `selected-edge-${edge.key}`,
      name: `Arista de ${source.name}`,
      objectId: edge.objectId,
      sourceFeatureId: source.id,
      reference: {
        origin: `${source.id}:result`,
        faceRoles: [`edge:${edge.edgeId}:side-a`, `edge:${edge.edgeId}:side-b`],
        hint: {
          entityType: "edge",
          length: edge.length,
          midpoint: [edge.midpoint.x, edge.midpoint.y, edge.midpoint.z],
          direction: [edge.direction.x, edge.direction.y, edge.direction.z],
          topologyId: edge.edgeId,
        },
      },
    };
    if (pendingRevolve) {
      setSelectedTopologyEdges(edge.selected ? [reference] : []);
      if (edge.selected) setPendingRevolve((current) => current ? { ...current, axis: "edge" } : current);
      return;
    }
    if (!edge.additive) setSelectedTopologyFaces([]);
    setSelectedTopologyEdges((current) => {
      if (!edge.additive) return edge.selected ? [reference] : [];
      if (!edge.selected) return current.filter((candidate) => candidate.id !== reference.id);
      return current.some((candidate) => candidate.id === reference.id) ? current : [...current, reference];
    });
  };

  const exportProject = () => {
    downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }), `${fileName(exportFileName)}.educad.json`);
    setNotice({ type: "ok", text: "Proyecto paramétrico exportado" });
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      downloadBlob(await exportParametricStep(document), `${fileName(exportFileName)}.step`);
      setNotice({ type: "ok", text: "STEP B-Rep exportado" });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo exportar" });
    } finally {
      setExporting(false);
    }
  };

  const exportStl = () => {
    try {
      const buffer = binaryStlFromRenderMeshes(build.objectRecords.map((item) => item.mesh), exportFileName);
      downloadBlob(new Blob([buffer], { type: "model/stl" }), `${fileName(exportFileName)}.stl`);
      setNotice({ type: "ok", text: `STL binario exportado · ${build.objectRecords.length} objeto${build.objectRecords.length === 1 ? "" : "s"}` });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo exportar el STL" });
    }
  };

  const importProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateDocument(parsed)) throw new Error("Este no es un proyecto eduCAD compatible.");
      const normalized = normalizeParametricDocument(parsed);
      setHistory(createParametricHistory(normalized));
      setModelSelection(normalized.objects[0] ? [{ id: normalized.objects[0].id, kind: "object" }] : []);
      setNotice({ type: "ok", text: "Proyecto abierto" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo abrir" });
    }
  };

  if (!hydrated) {
    return <main className="educad-reference-shell"><div className="editor-loading-screen"><div className="editor-loading-toolbar" /><div className="educad-initial-loading">Preparando el espacio de trabajo…</div></div></main>;
  }

  return (
    <main className="educad-reference-shell">
      <div className="secondary-toolbar">
        {sketchSession ? <div className="sketch-toolbar-ribbon educad-parametric-sketch-toolbar" aria-label="Herramientas de boceto">
          <ToolbarSection label="Dibujar">
            <Tool label="Línea" active={sketchTool === "line"} onClick={() => chooseSketchTool("line")}><PenLine /></Tool>
            <Tool label="Curva Bézier" active={sketchTool === "bezier"} onClick={() => chooseSketchTool("bezier")}><Spline /></Tool>
            <Tool label="Curva suave" active={sketchTool === "smooth"} onClick={() => chooseSketchTool("smooth")}><Spline /></Tool>
          </ToolbarSection>
          <ToolbarSection label="Editar">
            <Tool label="Seleccionar" active={sketchTool === "select"} onClick={() => chooseSketchTool("select")}><MousePointer2 /></Tool>
            <Tool label="Refinar" active={sketchTool === "refine"} onClick={() => chooseSketchTool("refine")}><Plus /></Tool>
            <Tool label="Borrar" active={sketchTool === "erase"} onClick={() => chooseSketchTool("erase")}><Eraser /></Tool>
          </ToolbarSection>
          <ToolbarSection label="Historial">
            <Tool label="Deshacer boceto" enabled={sketchHistoryIndex > 0} onClick={sketchUndo}><ToolbarUndoIcon /></Tool>
            <Tool label="Rehacer boceto" enabled={sketchHistoryIndex >= 0 && sketchHistoryIndex < sketchHistoryRef.current.length - 1} onClick={sketchRedo}><ToolbarRedoIcon /></Tool>
          </ToolbarSection>
          <ToolbarSection label="Inspeccionar">
            <Tool label="Medir" active={sketchTool === "measure"} onClick={() => chooseSketchTool("measure")}><Ruler /></Tool>
          </ToolbarSection>
          <div className="toolbar-spacer" />
          <div className="educad-sketch-finish-actions"><button className="sketch-command-button primary" type="button" onClick={acceptSketch}><Check size={18} /><span>Aceptar boceto</span></button><button className="sketch-command-button cancel" type="button" onClick={cancelSketch}><X size={18} /><span>Cancelar</span></button></div>
        </div> : <>
        <div className="toolbar-workspace-tabs">
          <button className="active">Diseño 3D</button>
          <button onClick={() => beginSketch(selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? selectedFeature.id : null)}>Boceto</button>
          <span className="educad-project-name">eduCAD · {document.name}</span>
        </div>
        <div className="toolbar-mode-content geometry">
          <ToolbarSection label="Home" className="toolbar-home-section"><Tool label="Nuevo diseño" onClick={newDocument}><ToolbarHomeIcon /></Tool></ToolbarSection>
          <div className="tool-group left">
            <ToolbarSection label="Clipboard">
              <Tool label="Copiar" enabled={Boolean(selectedObjectId)} onClick={() => { setClipboardId(selectedObjectId); setNotice({ type: "info", text: "Objeto copiado" }); }}><ToolbarCopyIcon /></Tool>
              <Tool label="Pegar" enabled={Boolean(clipboardId)} onClick={() => duplicateSelected(clipboardId)}><ToolbarPasteIcon /></Tool>
              <Tool label="Duplicar" enabled={Boolean(selectedObjectId)} onClick={() => duplicateSelected()}><ToolbarDuplicateIcon /></Tool>
              <Tool label={modelSelection.length > 1 ? "Eliminar selección" : selectionKind === "feature" ? "Eliminar operación" : "Eliminar objeto"} enabled={modelSelection.length > 0} onClick={deleteCurrentSelection}><ToolbarTrashIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="History">
              <Tool label="Deshacer" enabled={history.index > 0} onClick={undo}><ToolbarUndoIcon /></Tool>
              <Tool label="Rehacer" enabled={history.index < history.entries.length - 1} onClick={redo}><ToolbarRedoIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Shapes" className="toolbar-shapes-section">
              <button data-educad-popup="shapes" className={`shape-menu-trigger ${shapesOpen ? "active" : ""}`} aria-label="Añadir forma" onClick={() => setShapesOpen((value) => !value)}><ToolbarShapeAddIcon /></button>
              {shapesOpen && (
                <div data-educad-popup="shapes" className="shape-menu-dropdown">
                  <div className="shape-menu-title">Formas</div>
                  <div className="shape-menu-list">
                    <div className="educad-shape-target">{selectedObjectId ? `Añadir al final de ${document.objects.find((object) => object.id === selectedObjectId)?.name ?? "objeto activo"}` : "Se creará un objeto nuevo"}</div>
                    {parametricOperationCatalog.map((asset) => <button className="shape-menu-item" key={asset.kind} onClick={() => addShape(asset.kind)}><img src={asset.menuIcon} alt="" /><span>{asset.name}<small>{selectedObjectId ? "Nueva operación en el objeto" : asset.description}</small></span></button>)}
                    <div className="educad-shape-coming"><strong>Más operaciones CAD</strong><span>Tubo, toro y otras formas llegarán como operaciones paramétricas.</span></div>
                  </div>
                </div>
              )}
            </ToolbarSection>
          </div>
          <div className="toolbar-spacer" />
          <div className="tool-group right">
            <ToolbarSection label="Modify">
              <Tool label="Añadir" enabled={Boolean(selectedOperationId)} active={selectedOperation?.operation === "add"} onClick={() => setSelectedOperationMode("add")}><ToolbarBooleanModeIcon mode="add" /></Tool>
              <Tool label="Hueco" enabled={Boolean(selectedOperationId)} active={selectedOperation?.operation === "cut"} onClick={() => setSelectedOperationMode("cut")}><ToolbarBooleanModeIcon mode="hole" /></Tool>
              <Tool label="Común" enabled={Boolean(selectedOperationId)} active={selectedOperation?.operation === "intersect"} onClick={() => setSelectedOperationMode("intersect")}><ToolbarBooleanModeIcon mode="common" /></Tool>
              <div data-educad-popup="align" className="educad-align-tool">
                <Tool label="Alinear" enabled={modelSelection.length > 1} active={alignOpen} onClick={() => setAlignOpen((value) => !value)}><ToolbarAlignIcon /></Tool>
                {alignOpen ? <div className="educad-align-popover" role="dialog" aria-label="Alinear selección">
                  <header><strong>Alinear</strong><span>Referencia: último seleccionado</span></header>
                  <div className="educad-align-grid"><div className="educad-align-head"><span /><strong>Mín.</strong><strong>Centro</strong><strong>Máx.</strong></div>
                    {(["x", "y", "z"] as const).map((axis) => <div className="educad-align-row" key={axis}><strong className={`axis-${axis}`}>{axis.toUpperCase()}</strong>{(["min", "center", "max"] as const).map((anchor) => <button key={anchor} onClick={() => alignSelection(axis, anchor)} aria-label={`Alinear ${axis.toUpperCase()} por ${anchor === "min" ? "mínimos" : anchor === "center" ? "centros" : "máximos"}`}>{anchor === "min" ? "◧←" : anchor === "center" ? "◫" : "→◧"}</button>)}</div>)}
                  </div>
                </div> : null}
              </div>
              <Tool label="Simetría" enabled={Boolean(selectedShape)} onClick={() => selectedObjectId && mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, { x: -(selectedShape?.x ?? 0) }))}><ToolbarMirrorIcon /></Tool>
              <Tool label="Ajustar a rejilla" enabled={Boolean(selectedShape && document.workplane.snapToGrid)} onClick={() => selectedObjectId && mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, { x: Math.round((selectedShape?.x ?? 0) / snapAmount) * snapAmount, z: Math.round((selectedShape?.z ?? 0) / snapAmount) * snapAmount }))}><ToolbarSnapGridIcon /></Tool>
              <Tool label="Chaflán" active={pendingEdgeTreatment === "chamfer"} onClick={() => beginEdgeTreatment("chamfer")}><ToolbarChamferIcon /></Tool>
              <Tool label="Redondeo" active={pendingEdgeTreatment === "fillet"} onClick={() => beginEdgeTreatment("fillet")}><ToolbarFilletIcon /></Tool>
              <Tool label={selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? "Extruir boceto" : "Extruir cara"} active={Boolean(pendingFaceExtrude)} onClick={() => selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? addExtrudeFromSketch(selectedFeature) : beginFaceExtrude("add")}><ToolbarShapeAddIcon /></Tool>
              <Tool label="Vaciado" active={Boolean(pendingShell)} onClick={() => beginShell()}><img className="educad-toolbar-operation-icon" src="/assets/educad/operations/shell.svg" alt="" /></Tool>
              <Tool label={selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? "Revolucionar boceto" : "Revolución"} active={Boolean(pendingRevolve)} onClick={() => selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? addRevolveFromSketch(selectedFeature) : beginRevolve()}><img className="educad-toolbar-operation-icon" src="/assets/educad/operations/revolve.svg" alt="" /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Arrange">
              <Tool label={hasActiveWorkplane ? "Restaurar plano global" : placingWorkplane ? "Cancelar plano de trabajo" : "Colocar plano de trabajo"} active={placingWorkplane || hasActiveWorkplane} onClick={() => {
                if (hasActiveWorkplane) {
                  mutate((draft) => { Object.assign(draft.workplane, globalParametricWorkplanePlacement()); });
                  setPlacingWorkplane(false);
                  setSelectingTopologyFaces(false);
                  setSelectingTopologyEdges(false);
                  setSelectedTopologyFaces([]);
                  setSelectedTopologyEdges([]);
                  setNotice({ type: "ok", text: "Plano de trabajo global restaurado" });
                  return;
                }
                setPlacingWorkplane((current) => !current);
                setSelectingTopologyFaces(false);
                setSelectingTopologyEdges(false);
                setSelectedTopologyFaces([]);
                setSelectedTopologyEdges([]);
                setWorkplaneOpen(false);
                setNotice({ type: "info", text: placingWorkplane ? "Colocación cancelada" : "Pasa sobre una cara y haz clic para colocar el plano de trabajo" });
              }}>{hasActiveWorkplane ? <ToolbarResetWorkplaneIcon /> : <ToolbarWorkplaneIcon />}</Tool>
              <Tool label="Bajar al plano" enabled={Boolean(selectedShape)} onClick={() => updateSelected({ elevation: 0 })}><ToolbarDropToWorkplaneIcon /></Tool>
            </ToolbarSection>
          </div>
          <ToolbarSection label="Manage" className="toolbar-actions-section">
            <div className="action-buttons">
              <button className="action-icon-button" aria-label="Importar" onClick={() => importRef.current?.click()}><ToolbarImportIcon /></button>
              <button data-educad-popup="export" className="action-icon-button" aria-label="Exportar" onClick={() => { if (!exportOpen) setExportFileName(document.name); setExportOpen((value) => !value); }}><ToolbarVectorExportIcon /></button>
              <button data-educad-popup="settings" className="action-icon-button" aria-label="Ajustes" onClick={() => setSettingsOpen((value) => !value)}><ToolbarSettingsIcon /></button>
            </div>
          </ToolbarSection>
        </div></>}
      </div>

      <section className={`educad-workplane-stage ${sketchSession ? "sketch-active" : ""}`}>
        {showFps ? <FpsCounter rightOffset={modelSidebarMode === "normal" ? 332 : modelSidebarMode === "simplified" ? 80 : 12} /> : null}
        {sketchSession ? <SketchWorkspace
          profile={sketchSession.profile}
          operation="extrude"
          referenceShapes={[]}
          tool={sketchTool}
          activePointId={sketchActivePointId}
          selected={sketchSelection}
          measurement={sketchMeasurement}
          pendingMeasurementStart={sketchMeasureStart}
          initialSnap={closestSketchGrid(document.workplane.gridStep, document.workplane.snapToGrid)}
          exactSnapStep={document.workplane.snapToGrid ? document.workplane.gridStep : 0}
          initialWorkspace={{ ...DEFAULT_WORKPLANE_WORKSPACE, width: document.workplane.width, depth: document.workplane.depth, sizePreset: `${document.workplane.width} x ${document.workplane.depth} mm`, gridBlockSize: document.workplane.gridStep, gridBlockPreset: `${document.workplane.gridStep} mm`, showGrid: document.workplane.gridVisible }}
          onPlanePoint={addSketchPoint}
          onPointPress={pressSketchPoint}
          onSelectSegment={(id) => { setSketchSelection({ kind: "segment", id }); setSketchActivePointId(null); }}
          onSelectMany={(pointIds, segmentIds, imageIds) => setSketchSelection(pointIds.length || segmentIds.length || imageIds.length ? { kind: "multiple", pointIds, segmentIds, imageIds } : null)}
          onSelectImage={(id) => setSketchSelection({ kind: "image", id })}
          onUpdateImage={(id, update) => setSketchProfile((profile) => ({ ...profile, images: (profile.images ?? []).map((image) => image.id === id ? { ...image, ...update } : image) }))}
          onDeleteImage={(id) => setSketchProfile((profile) => ({ ...profile, images: (profile.images ?? []).filter((image) => image.id !== id) }))}
          onDeletePoint={deleteSketchPoint}
          onDeleteSegment={deleteSketchSegment}
          onMovePoint={(id, point) => setSketchProfile((profile) => ({ ...profile, points: profile.points.map((candidate) => {
            if (candidate.id !== id) return candidate;
            const dx = point.x - candidate.x;
            const dz = point.z - candidate.z;
            return { ...candidate, ...point, handleIn: candidate.handleIn ? { x: candidate.handleIn.x + dx, z: candidate.handleIn.z + dz } : undefined, handleOut: candidate.handleOut ? { x: candidate.handleOut.x + dx, z: candidate.handleOut.z + dz } : undefined };
          }) }))}
          onMoveHandle={moveSketchHandle}
          onInsertPoint={insertSketchPoint}
          onSetPointMode={setSketchPointMode}
          onClearMeasurement={() => { setSketchMeasurement(null); setSketchMeasureStart(null); }}
        /> : <ParametricViewport
          mesh={((editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && topologySelectionBuild ? topologySelectionBuild : build).mesh}
          objectRecords={((editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && topologySelectionBuild ? topologySelectionBuild : build).objectRecords}
          objectColors={objectColors}
          objectOrigins={viewportObjectOrigins}
          operationOrigins={viewportOperationOrigins}
          editableOriginId={originEditObjectId}
          selectedObjectOriginId={selectedOriginObjectId}
          selectedOperationOriginId={selectedOperationOriginId}
          selectedObjectIds={viewportSelectedObjectIds}
          operationContext={pendingEdgeTreatment || pendingFaceExtrude || pendingShell || pendingRevolve ? viewportTopologyPreviewContext : viewportOperationContext}
          isolatedHistoryObjectId={!editingEdgeTreatmentId && !editingFaceExtrudeId && !editingShellId && !editingRevolveId && selectedOperationTimeline && selectedOperationTimeline.index < selectedOperationTimeline.count - 1 ? selectedOperationTimeline.objectId : null}
          color={document.color}
          workplane={document.workplane}
          view={view}
          projection={projection}
          renderQuality={renderQuality}
          selection={originEditObjectId || placingWorkplane || selectingTopologyFaces || selectingTopologyEdges ? null : selectedBox}
          snap={snapAmount}
          onShapeParameterChange={(parameter, value) => {
            if (!selectedOperationId) return;
            mutate((draft) => updateParametricShapeParameter(draft, selectedOperationId, parameter, value));
          }}
          onObjectOriginMove={(objectId, position) => mutate((draft) => moveParametricObjectOrigin(draft, objectId, position))}
          onObjectAxisMove={(objectId, position) => mutate((draft) => {
            const object = draft.objects.find((candidate) => candidate.id === objectId);
            if (object) object.transform.position = { ...position };
          })}
          onOperationAxisMove={(featureId, delta) => mutate((draft) => applyParametricSelectionWorldDelta(draft, featureId, "feature", delta))}
          onCameraOrientation={setCameraOrientation}
          onObjectSelect={(objectId) => {
            const object = document.objects.find((candidate) => candidate.id === objectId);
            if (!object || object.locked || !object.visible) return;
            const operation = lastOperationForObject(document, objectId);
            setModelSelection([{ id: operation?.id ?? objectId, kind: operation ? "feature" : "object" }]);
          }}
          onObjectsSelect={(objectIds) => {
            const selected = objectIds.flatMap<ModelTreeSelection>((objectId) => {
              const object = document.objects.find((candidate) => candidate.id === objectId);
              if (!object || object.locked || !object.visible) return [];
              const operation = lastOperationForObject(document, objectId);
              return [{ id: operation?.id ?? objectId, kind: operation ? "feature" : "object" }];
            });
            setModelSelection(selected);
          }}
          onEmptySelect={() => {
            setModelSelection([]);
          }}
          workplaneFaceSelection={placingWorkplane}
          onWorkplaneFaceSelect={({ origin, normal }) => {
            mutate((draft) => { Object.assign(draft.workplane, parametricWorkplaneFromFace(origin, normal)); });
            setPlacingWorkplane(false);
            setNotice({ type: "ok", text: "Plano de trabajo colocado sobre la cara" });
          }}
          topologyFaceSelection={selectingTopologyFaces}
          onTopologyFaceSelect={selectTopologyFace}
          topologyEdgeSelection={selectingTopologyEdges}
          onTopologyEdgeSelect={selectTopologyEdge}
          topologySelections={(editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && !topologySelectionBuild ? [] : [...selectedTopologyFaces, ...selectedTopologyEdges]}
          topologyMultiSelection={!pendingFaceExtrude && !pendingRevolve}
          historicalTopologySelections={editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId || operationContext?.detailMesh ? [] : historicalTopologyReferences}
          historicalTopologyRecords={editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId || operationContext?.detailMesh ? [] : historicalTopologyRecords}
          faceExtrudeHandle={faceExtrudeHandle}
          onFaceExtrudeDistanceChange={(distance, operation) => {
            if (pendingFaceExtrude) setPendingFaceExtrude((current) => current ? { ...current, distance, operation } : current);
            else if (faceExtrudeHandle?.featureId) updateFeature(faceExtrudeHandle.featureId, (feature) => { if (feature.kind === "faceExtrude") { feature.distance = distance; feature.operation = operation; } });
          }}
        />}
        <ViewCube orientation={cameraOrientation} onDirection={(direction) => setView((current) => ({ name: "custom", direction, token: current.token + 1 }))} />
        <button data-educad-popup="grid" className={`educad-workplane-settings-button ${workplaneOpen ? "active" : ""}`} aria-label="Ajustes de rejilla" title="Rejilla" onClick={() => { setWorkplaneDraft(document.workplane); setWorkplaneOpen((value) => !value); }}><Grid3X3 size={22} /></button>
        <button
          className={`educad-workplane-snap-button ${document.workplane.snapToGrid ? "active" : ""}`}
          aria-label={document.workplane.snapToGrid ? "Desactivar ajuste a rejilla" : "Activar ajuste a rejilla"}
          aria-pressed={document.workplane.snapToGrid}
          title={document.workplane.snapToGrid ? "Snap to grid: activado" : "Snap to grid: desactivado"}
          onClick={() => {
            const enabled = !document.workplane.snapToGrid;
            mutate((draft) => { draft.workplane.snapToGrid = enabled; });
            setWorkplaneDraft((current) => ({ ...current, snapToGrid: enabled }));
          }}
        ><Magnet size={21} /></button>
        {workplaneOpen ? <div data-educad-popup="grid" className="educad-workplane-popover">
          <header><div><strong>Rejilla</strong><span>Suelo global y tamaño del plano activo</span></div><button type="button" aria-label="Cerrar" onClick={() => setWorkplaneOpen(false)}><X size={17} /></button></header>
          <label><span>Mostrar suelo XY</span><input type="checkbox" checked={workplaneDraft.gridVisible} onChange={(event) => updateGridSettings({ gridVisible: event.target.checked })} /></label>
          <label><span>Tamaño del plano activo</span><span className="educad-number-input"><input type="number" min="2" max="100" step="1" value={workplaneDraft.activeSizePercent} onChange={(event) => updateGridSettings({ activeSizePercent: Math.min(100, Math.max(2, Number(event.target.value) || 10)) })} /><small>%</small></span></label>
          <label><span>Ancho</span><span className="educad-number-input"><input type="number" min="60" max="2000" step="1" value={workplaneDraft.width} onChange={(event) => updateGridSettings({ width: Math.min(2000, Math.max(60, Number(event.target.value) || 60)) })} /><small>mm</small></span></label>
          <label><span>Largo</span><span className="educad-number-input"><input type="number" min="60" max="2000" step="1" value={workplaneDraft.depth} onChange={(event) => updateGridSettings({ depth: Math.min(2000, Math.max(60, Number(event.target.value) || 60)) })} /><small>mm</small></span></label>
          <label><span>Paso de líneas</span><span className="educad-number-input"><input type="number" min="0.1" max="200" step="0.1" value={workplaneDraft.gridStep} onChange={(event) => updateGridSettings({ gridStep: Math.min(200, Math.max(0.1, Number(event.target.value) || 0.1)) })} /><small>mm</small></span></label>
        </div> : null}
        <button
          className={`educad-sidebar-mode-control ${modelSidebarMode}`}
          aria-label={modelSidebarMode === "normal" ? "Simplificar jerarquía" : modelSidebarMode === "simplified" ? "Ocultar jerarquía" : "Mostrar jerarquía"}
          title={modelSidebarMode === "normal" ? "Panel visible" : modelSidebarMode === "simplified" ? "Panel simplificado" : "Panel oculto"}
          onClick={() => setModelSidebarMode((current) => current === "normal" ? "simplified" : current === "simplified" ? "hidden" : "normal")}
        >
          {modelSidebarMode === "normal" ? <ChevronLeft size={23} /> : modelSidebarMode === "simplified" ? <ChevronDown size={23} /> : <ChevronRight size={23} />}
        </button>
        <div className="camera-controls" aria-label="Controles de cámara">
          <button aria-label={projection === "perspective" ? "Cambiar a vista ortográfica" : "Cambiar a perspectiva"} title={projection === "perspective" ? "Perspectiva" : "Ortográfica"} aria-pressed={projection === "orthographic"} onClick={() => setProjection((current) => current === "perspective" ? "orthographic" : "perspective")}><Box size={22} /></button>
          <button aria-label="Vista inicial" onClick={() => setCamera("home")}><Home size={24} /></button>
          <button aria-label="Encuadrar todo" title="Encuadrar todo" onClick={() => setCamera("fit")}><Maximize2 size={21} /></button>
          <button aria-label="Zoom a la selección" title="Zoom a la selección" disabled={!selectedBox} onClick={() => setCamera("selection")}><Focus size={21} /></button>
          <button aria-label="Acercar" onClick={() => setCamera("zoom-in")}><Plus size={28} /></button>
          <button aria-label="Alejar" onClick={() => setCamera("zoom-out")}><Minus size={28} /></button>
        </div>
        {kernelBusy && <div className="educad-kernel-pill">Reconstruyendo OpenCascade…</div>}
        {build.warning && <div className="educad-rebuild-error"><strong>El historial se detuvo aquí</strong><span>{build.warning}</span></div>}
        {notice && <div className={`educad-reference-toast ${notice.type}`}>{notice.text}</div>}
        {modelSidebarMode !== "hidden" ? <ParametricModelSidebar
          document={document}
          selection={modelSelection}
          mode={modelSidebarMode}
          gridStep={document.workplane.gridStep}
          editingOriginObjectId={originEditObjectId}
          onSelectionChange={setModelSelection}
          onReorderSelection={reorderSelection}
          onRenameSelection={renameSelection}
          onDeleteSelection={deleteCurrentSelection}
          onToggleOriginEdit={toggleOriginEdit}
          onEditFeatureSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "fillet") beginEdgeTreatment(feature.treatment, feature.id);
          }}
          onEditSketch={beginSketch}
          onEditFaceExtrudeSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "faceExtrude") beginFaceExtrude(feature.operation, feature.id);
          }}
          onEditShellSelection={(featureId) => beginShell(featureId)}
          onEditRevolveFace={(featureId) => beginRevolve(featureId, "face")}
          onEditRevolveAxis={(featureId) => beginRevolve(featureId, "axis")}
          edgeTreatmentDraft={pendingEdgeTreatment ? { treatment: pendingEdgeTreatment, radius: edgeTreatmentRadius, faceCount: selectedTopologyFaces.length, edgeCount: selectedTopologyEdges.length, editing: Boolean(editingEdgeTreatmentId) } : null}
          onEdgeTreatmentDraftChange={(update) => {
            if (update.treatment) setPendingEdgeTreatment(update.treatment);
            if (update.radius !== undefined) setEdgeTreatmentRadius(Math.max(0.01, update.radius));
          }}
          onAcceptEdgeTreatment={acceptEdgeTreatment}
          onCancelEdgeTreatment={cancelEdgeTreatment}
          faceExtrudeDraft={pendingFaceExtrude ? { ...pendingFaceExtrude, faceCount: selectedTopologyFaces.length, editing: Boolean(editingFaceExtrudeId) } : null}
          onFaceExtrudeDraftChange={(update) => setPendingFaceExtrude((current) => current ? { ...current, ...update } : current)}
          onAcceptFaceExtrude={acceptFaceExtrude}
          onCancelFaceExtrude={cancelFaceExtrude}
          shellDraft={pendingShell ? { thickness: pendingShell.thickness, faceCount: selectedTopologyFaces.length, editing: Boolean(editingShellId) } : null}
          onShellDraftChange={(thickness) => setPendingShell((current) => current ? { ...current, thickness: Math.max(0.01, thickness) } : current)}
          onAcceptShell={acceptShell}
          onCancelShell={cancelShell}
          revolveDraft={pendingRevolve ? { ...pendingRevolve, faceCount: selectedTopologyFaces.length, edgeCount: selectedTopologyEdges.length, editing: Boolean(editingRevolveId) } : null}
          onRevolveDraftChange={(update) => setPendingRevolve((current) => current ? { ...current, ...update } : current)}
          onAcceptRevolve={acceptRevolve}
          onCancelRevolve={cancelRevolve}
          onUpdateObject={updateObject}
          onUpdateFeature={updateFeature}
        /> : null}
      </section>

      {exportOpen && (
        <aside data-educad-popup="export" className="top-action-panel export-action-panel educad-export-panel">
          <header><div className="top-action-heading"><strong>Exportar</strong><span>Conserva los parámetros o fabrica la pieza</span></div><button onClick={() => setExportOpen(false)}><X /></button></header>
          <label className="educad-export-name"><span>Nombre del archivo</span><input type="text" value={exportFileName} maxLength={120} placeholder="modelo" onChange={(event) => setExportFileName(event.target.value)} /></label>
          <div className="educad-export-options">
            <button onClick={exportProject}><span className="export-format-icon">JSON</span><strong>Proyecto eduCAD</strong><small>Historial editable y parámetros</small></button>
            <button onClick={() => void exportStep()} disabled={exporting || kernelBusy || !build.mesh}><span className="export-format-icon step">STEP</span><strong>{exporting ? "Exportando…" : "Modelo STEP"}</strong><small>B-Rep exacto para fabricación</small></button>
            <button onClick={exportStl} disabled={kernelBusy || build.objectRecords.length === 0}><span className="export-format-icon">STL</span><strong>Modelo STL</strong><small>Binario, en milímetros y listo para imprimir</small></button>
          </div>
        </aside>
      )}

      {settingsOpen && (
        <aside data-educad-popup="settings" className="top-action-panel educad-settings-panel">
          <header><strong>Ajustes del diseño</strong><button onClick={() => setSettingsOpen(false)}><X /></button></header>
          <label><span>Nombre</span><input value={document.name} onFocus={beginTransaction} onBlur={finishTransaction} onChange={(event) => mutate((draft) => { draft.name = event.target.value; })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelTransaction(); event.currentTarget.blur(); } }} /></label>
          <label><span>Renderizado</span><select value={renderQuality} onChange={(event) => setRenderQuality(event.target.value as ViewportRenderQuality)}><option value="normal">Normal (suavizado)</option><option value="optimized">Optimizar rendimiento</option></select></label>
          <label className="educad-settings-toggle"><span>Mostrar FPS</span><input type="checkbox" checked={showFps} onChange={(event) => setShowFps(event.target.checked)} /></label>
          <p>El proyecto se guarda automáticamente. El renderizado y el contador FPS se recuerdan en este dispositivo.</p>
        </aside>
      )}

      <input ref={importRef} hidden type="file" accept=".json,.educad" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProject(file); event.target.value = ""; }} />
    </main>
  );
}

function FpsCounter({ rightOffset }: { rightOffset: number }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frame = 0;
    let frames = 0;
    let sampleStarted = performance.now();
    const measure = (now: number) => {
      frames += 1;
      const elapsed = now - sampleStarted;
      if (elapsed >= 500) {
        setFps(Math.round(frames * 1000 / elapsed));
        frames = 0;
        sampleStarted = now;
      }
      frame = window.requestAnimationFrame(measure);
    };
    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const tone = fps > 0 && fps < 20 ? "low" : fps < 40 ? "medium" : "high";
  return <output className={`educad-fps-counter ${tone}`} aria-label={`Rendimiento: ${fps} fotogramas por segundo`} style={{ right: rightOffset }}>{fps} FPS</output>;
}

function ToolbarSection({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`toolbar-section ${className}`}><div className="toolbar-section-label">{label}</div><div className="toolbar-section-tools">{children}</div></div>;
}

function Tool({ label, enabled = true, active, onClick, children }: { label: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`toolbar-icon ${enabled ? "" : "disabled"} ${active ? "active" : ""}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} title={label} disabled={!enabled} onClick={onClick}>{children}</button>;
}

function ViewCube({ orientation, onDirection }: { orientation: CameraOrientation; onDirection: (direction: [number, number, number]) => void }) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; azimuth: number; polar: number } | null>(null);
  const draggedRef = useRef(false);
  const cubeTransform = `rotateX(${orientation.polar * 180 / Math.PI - 90}deg) rotateY(${-orientation.azimuth * 180 / Math.PI}deg)`;
  const chooseDirection = (direction: [number, number, number]) => {
    if (!draggedRef.current) onDirection(direction);
    draggedRef.current = false;
  };
  return <div
    className="view-cube"
    aria-label="Cubo de vistas interactivo"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, azimuth: orientation.azimuth, polar: orientation.polar };
      draggedRef.current = false;
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      draggedRef.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      const azimuth = drag.azimuth - dx * 0.012;
      const polar = Math.min(Math.PI - 0.03, Math.max(0.03, drag.polar - dy * 0.012));
      onDirection([Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)]);
    }}
    onPointerUp={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      window.setTimeout(() => { draggedRef.current = false; }, 0);
    }}
    onPointerCancel={() => { dragRef.current = null; draggedRef.current = false; }}
  ><div className="view-cube-inner" style={{ transform: cubeTransform }}><button type="button" className="cube-face cube-top" aria-label="Vista inferior" onClick={() => chooseDirection([0, -1, 0.001])}>BOTTOM</button><button type="button" className="cube-face cube-bottom" aria-label="Vista superior" onClick={() => chooseDirection([0, 1, 0.001])}>TOP</button><button type="button" className="cube-face cube-front" aria-label="Vista frontal" onClick={() => chooseDirection([0, 0.001, 1])}>FRONT</button><button type="button" className="cube-face cube-back" aria-label="Vista trasera" onClick={() => chooseDirection([0, 0.001, -1])}>BACK</button><button type="button" className="cube-face cube-right" aria-label="Vista derecha" onClick={() => chooseDirection([1, 0.001, 0])}>RIGHT</button><button type="button" className="cube-face cube-left" aria-label="Vista izquierda" onClick={() => chooseDirection([-1, 0.001, 0])}>LEFT</button></div></div>;
}
