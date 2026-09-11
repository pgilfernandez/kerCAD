"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Focus, Grid3X3, Home, Magnet, Maximize2, Minus, Plus, Trash2, X } from "lucide-react";
import { ChallengeEditor, type ChallengeDock } from "@/components/ChallengeEditor";
import { ChallengePlayer } from "@/components/ChallengePlayer";
import type { EducadChallenge } from "@/lib/challengeLibrary";
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent } from "react";
import * as THREE from "three";
import { ParametricModelSidebar, type ModelSidebarMode, type ModelTreeSelection } from "@/components/ParametricModelSidebar";
import { ParametricViewport, type CameraOrientation, type CameraProjection, type CameraView, type TopologyEdgePick, type TopologyFacePick, type ViewportDisplayMode, type ViewportShadingMode } from "@/components/ParametricViewport";
import { SketchWorkspace, type SketchMeasurement, type SketchSceneReference, type SketchSelection, type SketchTool } from "@/components/SketchWorkspace";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import {
  ToolbarAlignIcon,
  ToolbarChamferIcon,
  ToolbarCopyIcon,
  ToolbarDropToWorkplaneIcon,
  ToolbarDuplicateIcon,
  ToolbarExtrudeIcon,
  ToolbarFilletIcon,
  ToolbarImportIcon,
  ToolbarMirrorIcon,
  ToolbarLinearPatternIcon,
  ToolbarPolarPatternIcon,
  ToolbarObjectBooleanIcon,
  ToolbarOrthographicIcon,
  ToolbarParameterManipulatorIcon,
  ToolbarPasteIcon,
  ToolbarPositionManipulatorIcon,
  ToolbarPerspectiveIcon,
  ToolbarRedoIcon,
  ToolbarRotationManipulatorIcon,
  ToolbarRevolveIcon,
  ToolbarSettingsIcon,
  ToolbarShellIcon,
  SketchConstraintIcon,
  SketchToolbarIcon,
  ToolbarShapeAddIcon,
  ToolbarSketchIcon,
  ToolbarSnapGridIcon,
  ToolbarTrashIcon,
  ToolbarUndoIcon,
  ToolbarVectorExportIcon,
  ToolbarWorkplaneIcon,
  ToolbarResetWorkplaneIcon,
} from "@/components/icons";
import { cloneDocument, createDrawnSketchFeature, createEmptyDocument, createExtrudeFeature, createFaceExtrudeFeature, createFilletFeature, createLinearPatternFeature, createMirrorFeature, createObjectBooleanFeature, createPolarPatternFeature, createRevolveFeature, createShellFeature, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { assertValidParametricDependencies } from "@/lib/parametricDependencyGraph";
import { assertValidParametricTopology, parametricTopologyEditingSourceFeature, parametricTopologySelectionsMatch, recoverParametricTopologyReferenceInRecords, transformParametricObjectTopologyHints } from "@/lib/parametricTopology";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint } from "@/lib/parametricBuildState";
import { buildParametricStlMeshes, exportParametricStep, type StlTessellationQuality } from "@/lib/parametricKernel";
import { ParametricBuildWorkerClient } from "@/lib/parametricBuildWorker";
import { binaryStlFromRenderMeshes } from "@/lib/stlExport";
import { sketchProfileFromSvg } from "@/lib/svgImport";
import { importSvgAsParametricExtrusion } from "@/lib/svgParametricImport";
import { addParametricText } from "@/lib/parametricText";
import { appendScribbleContour } from "@/lib/parametricScribble";
import { EDUCAD_PACKAGE_LIMITS, EDUCAD_PACKAGE_MEDIA_TYPE, exportEducadProject, importEducadProject } from "@/lib/educadProject";
import { mergeParametricProjects } from "@/lib/parametricProjectMerge";
import { importStepAsParametricObject } from "@/lib/parametricStepImport";
import { importReferenceMesh, parametricReferenceRenderRecords } from "@/lib/parametricReferenceImport";
import { assertImportByteLimit } from "@/lib/parametricImportLimits";
import { displayLengthToMillimeters, displayUnitLabel, millimetersToDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { educadTranslate, normalizeEducadLocale, type EducadLocale, type EducadTranslationKey } from "@/lib/educadI18n";
import { parametricRebuildSuggestion } from "@/lib/parametricRebuildDiagnostics";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { arcSketchPointId, circleSketchPointId, SKETCH_REFERENCE_AXES, sketchConstraintConflict, sketchConstraintPoint, sketchConstraintUsesPoint, sketchConstraintUsesSegment, sketchReferenceAxis, solveSketchConstraints } from "@/lib/sketchConstraints";
import { analyzeSketchConstraints } from "@/lib/sketchConstraintAnalysis";
import { validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";
import { trimSketchGeometry } from "@/lib/sketchTrim";
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
  applyParametricSelectionWorkplaneRotation,
  rotateParametricObjectAroundLocalAxis,
  applyWorkplanePatch,
  deleteParametricObject,
  deleteParametricFeature,
  deleteParametricSelection,
  duplicateParametricObject,
  duplicateParametricSelection,
  lastOperationForObject,
  moveParametricObjectOrigin,
  objectIdForFeature,
  canReorderParametricSelection,
  renameParametricSelection,
  resetParametricFeature,
  reorderParametricSelection,
  updateParametricShapeParameter,
  viewportSelectionForFeature,
  viewportSelectionForObject,
  viewportPlacementForSketchFeature,
  workplaneShapeForObject,
  type ParametricAlignmentAnchor,
  type ParametricAlignmentAxis,
  type SupportedPrimitive,
} from "@/lib/parametricObjects";
import { globalParametricWorkplanePlacement, objectPlacementForWorkplane, operationPlacementForWorkplane, parametricTransformMatrix, parametricWorkplaneFromFace, parametricWorkplaneIsGlobal } from "@/lib/parametricWorkplane";
import { localizedParametricOperationDefinition, parametricOperationCatalog, parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import type { ViewportRenderQuality } from "@/lib/viewportPerformance";
import type { BuildResult, ExtrudeFeature, ParametricDocument, ParametricFeature, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference, PrimitiveFeature, RevolveFeature, SketchFeature } from "@/types/parametric";
import type { GridSize, SketchConstraint, SketchPoint, SketchProfile, WorkplaneShape } from "@/types/sketchforge";

const RENDER_QUALITY_STORAGE_KEY = "educad.viewport.render-mode";
const FPS_VISIBLE_STORAGE_KEY = "educad.viewport.show-fps";
const POSITION_TRIAD_VISIBLE_STORAGE_KEY = "educad.viewport.position-triad";
const ROTATION_TRIAD_VISIBLE_STORAGE_KEY = "educad.viewport.rotation-triad";
const PARAMETER_HANDLES_VISIBLE_STORAGE_KEY = "educad.viewport.parameter-handles";
const DISPLAY_MODE_STORAGE_KEY = "educad.viewport.display-mode";
const SHADING_MODE_STORAGE_KEY = "educad.viewport.shading-mode";

function localizeNewDocumentEntries(previous: ParametricDocument, next: ParametricDocument, locale: EducadLocale) {
  const previousObjectIds = new Set(previous.objects.map((object) => object.id));
  next.objects.filter((object) => !previousObjectIds.has(object.id)).forEach((object, index) => { object.name = `${locale === "es" ? "Objeto" : "Object"} ${previous.objects.length + index + 1}`; });
  const previousFeatureIds = new Set(previous.features.map((feature) => feature.id));
  next.features.filter((feature) => !previousFeatureIds.has(feature.id)).forEach((feature) => {
    const index = next.features.filter((candidate) => candidate.kind === feature.kind).findIndex((candidate) => candidate.id === feature.id) + 1;
    const en = locale === "en";
    if (feature.kind === "primitive") feature.name = localizedParametricOperationDefinition(feature.primitive, locale).name;
    else if (feature.kind === "sketch") {
      const generator = feature.profile.shape === "drawn" ? feature.profile.geometry.generator?.kind : null;
      feature.name = generator === "text" ? (en ? "Text profile" : "Perfil de texto") : generator === "scribble" ? "Scribble profile" : `${en ? "Sketch" : "Boceto"} ${index}`;
    } else if (feature.kind === "extrude") {
      const sketch = next.features.find((candidate) => candidate.kind === "sketch" && candidate.id === feature.sketchId);
      const generator = sketch?.kind === "sketch" && sketch.profile.shape === "drawn" ? sketch.profile.geometry.generator?.kind : null;
      feature.name = generator === "text" ? (en ? "Text" : "Texto") : generator === "scribble" ? "Scribble" : `${en ? "Extrusion" : "Extrusión"} ${index}`;
    }
    else if (feature.kind === "hole") feature.name = `${en ? "Hole" : "Taladro"} ${index}`;
    else if (feature.kind === "fillet") feature.name = `${feature.treatment === "chamfer" ? (en ? "Chamfer" : "Chaflán") : (en ? "Fillet" : "Redondeo")} ${index}`;
    else if (feature.kind === "faceExtrude") feature.name = `${feature.operation === "cut" ? (en ? "Face cut" : "Hueco de cara") : (en ? "Face extrusion" : "Extrusión de cara")} ${index}`;
    else if (feature.kind === "shell") feature.name = `${en ? "Shell" : "Vaciado"} ${index}`;
    else if (feature.kind === "revolve") feature.name = `${en ? "Revolution" : "Revolución"} ${index}`;
    else if (feature.kind === "mirror") feature.name = `${en ? "Mirror" : "Espejo"} ${index}`;
    else if (feature.kind === "linearPattern") feature.name = `${en ? "Linear pattern" : "Matriz lineal"} ${index}`;
    else if (feature.kind === "polarPattern") feature.name = `${en ? "Polar pattern" : "Matriz polar"} ${index}`;
    else if (feature.kind === "objectBoolean") feature.name = `${en ? "Object boolean" : "Booleana de objeto"} ${index}`;
  });
}
const DISPLAY_UNIT_STORAGE_KEY = "educad.display-unit";
const LOCALE_STORAGE_KEY = "educad.locale";
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
  return value.trim().replace(/\.(?:educad\.json|json|step|stp|stl)$/i, "").toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "") || "model";
}

function emptySketchProfile(): SketchProfile {
  return { points: [], segments: [], circles: [], images: [], texts: [], constraints: [] };
}

function cloneSketchProfile(profile: SketchProfile): SketchProfile {
  return {
    points: profile.points.map((point) => ({ ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined })),
    segments: profile.segments.map((segment) => ({ ...segment })),
    circles: (profile.circles ?? []).map((circle) => ({ ...circle })),
    images: (profile.images ?? []).map((image) => ({ ...image })),
    texts: (profile.texts ?? []).map((text) => ({ ...text })),
    constraints: (profile.constraints ?? []).map((constraint) => ({ ...constraint })),
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

function withSmoothSketchHandles(profile: SketchProfile) {
  const next = cloneSketchProfile(profile);
  const points = new Map(next.points.map((point) => [point.id, point]));
  next.points.forEach((point) => {
    if (point.mode === "split" && point.handleIn && point.handleOut) return;
    const incoming = next.segments.find((segment) => segment.endId === point.id);
    const outgoing = next.segments.find((segment) => segment.startId === point.id);
    const previous = incoming ? points.get(incoming.startId) : null;
    const following = outgoing ? points.get(outgoing.endId) : null;
    if (!previous && !following) return;
    const tangent = previous && following
      ? { x: (following.x - previous.x) / 6, z: (following.z - previous.z) / 6 }
      : previous
        ? { x: (point.x - previous.x) / 6, z: (point.z - previous.z) / 6 }
        : { x: (following!.x - point.x) / 6, z: (following!.z - point.z) / 6 };
    point.handleIn = { x: point.x - tangent.x, z: point.z - tangent.z };
    point.handleOut = { x: point.x + tangent.x, z: point.z + tangent.z };
    point.mode = "smooth";
  });
  return next;
}

type SketchForgeParametricEditorProps = {
  initialProject?: ParametricDocument;
  sharedFileName?: string;
  onSaveShared?: (document: ParametricDocument, fileName: string, author: string) => Promise<void>;
  onProjectChange?: (document: ParametricDocument) => void;
  onProjectThumbnail?: (dataUrl: string) => void;
  onExitToProjects?: (document: ParametricDocument) => void;
  challenge?: EducadChallenge | null;
  challengeEditor?: EducadChallenge | null;
  onSaveChallenge?: (challenge: EducadChallenge, document: ParametricDocument) => void;
  onCancelChallengeEdit?: () => void;
};

export function SketchForgeParametricEditor({ initialProject, sharedFileName, onSaveShared, onProjectChange, onProjectThumbnail, onExitToProjects, challenge, challengeEditor, onSaveChallenge, onCancelChallengeEdit }: SketchForgeParametricEditorProps = {}) {
  const initialDocument = useMemo(() => initialProject ? normalizeParametricDocument(structuredClone(initialProject)) : createEmptyDocument(), [initialProject]);
  const [history, setHistory] = useState<ParametricHistoryState>(() => createParametricHistory(initialDocument));
  const document = currentHistoryDocument(history);
  const latestDocumentRef = useRef(document);
  latestDocumentRef.current = document;
  const [modelSelection, setModelSelection] = useState<ModelTreeSelection[]>(initialDocument.objects[0] ? [{ id: initialDocument.objects[0].id, kind: "object" }] : []);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, objectRecords: [], operationContext: null, completedFeatureIds: [], failedFeatureId: null, warning: null });
  const [operationContext, setOperationContext] = useState<BuildResult["operationContext"]>(null);
  const [kernelBusy, setKernelBusy] = useState(true);
  const [contextBusy, setContextBusy] = useState(false);
  const [topologyPreviewBusy, setTopologyPreviewBusy] = useState(false);
  const [topologySelectionBusy, setTopologySelectionBusy] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [shapeMenuPosition, setShapeMenuPosition] = useState({ top: 0, left: 10 });
  const shapeMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [modelSidebarMode, setModelSidebarMode] = useState<ModelSidebarMode | "hidden">("normal");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState(document.name);
  const [stlQuality, setStlQuality] = useState<StlTessellationQuality>("medium");
  const [stlExporting, setStlExporting] = useState(false);
  const [newDocumentOpen, setNewDocumentOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [workplaneOpen, setWorkplaneOpen] = useState(false);
  const [workplaneDraft, setWorkplaneDraft] = useState(document.workplane);
  const [placingWorkplane, setPlacingWorkplane] = useState(false);
  const [editingMirrorPlaneId, setEditingMirrorPlaneId] = useState<string | null>(null);
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
  const [view, setView] = useState<CameraView>({ name: "home", token: 0 });
  const [projection, setProjection] = useState<CameraProjection>("orthographic");
  const [renderQuality, setRenderQuality] = useState<ViewportRenderQuality>("normal");
  const [displayMode, setDisplayMode] = useState<ViewportDisplayMode>("solid");
  const [shadingMode, setShadingMode] = useState<ViewportShadingMode>("shadows");
  const [displayUnit, setDisplayUnit] = useState<ParametricDisplayUnit>("mm");
  const [locale, setLocale] = useState<EducadLocale>("en");
  const [showFps, setShowFps] = useState(false);
  const [showPositionTriad, setShowPositionTriad] = useState(true);
  const [showRotationTriad, setShowRotationTriad] = useState(true);
  const [showParameterHandles, setShowParameterHandles] = useState(true);
  const [challengeOpen, setChallengeOpen] = useState(Boolean(challenge || challengeEditor));
  const [challengeDock, setChallengeDock] = useState<ChallengeDock>(() => {
    if (typeof window === "undefined") return "left";
    const saved = window.localStorage.getItem("educad.challenge-dock");
    return saved === "floating" || saved === "left" || saved === "right" ? saved : "left";
  });
  const [challengeCaptureToken, setChallengeCaptureToken] = useState(0);
  const [challengeCapture, setChallengeCapture] = useState<{ stepId: string; dataUrl: string; token: number } | null>(null);
  const challengeCaptureStepRef = useRef<string | null>(null);
  const [originEditObjectId, setOriginEditObjectId] = useState<string | null>(null);
  const [alignOpen, setAlignOpen] = useState(false);
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>({ azimuth: -Math.PI / 4, polar: 1.02 });
  const [clipboardId, setClipboardId] = useState<string | null>(null);
  const [sketchSession, setSketchSession] = useState<{ featureId: string | null; objectId: string | null; profile: SketchProfile; mode: "sketch" | "scribble"; revolveAxisFeatureId?: string } | null>(null);
  const [sketchTool, setSketchTool] = useState<SketchTool>("line");
  const [sketchActivePointId, setSketchActivePointId] = useState<string | null>(null);
  const [sketchSelection, setSketchSelection] = useState<SketchSelection>(null);
  const [sketchMeasurement, setSketchMeasurement] = useState<SketchMeasurement>(null);
  const [sketchMeasureStart, setSketchMeasureStart] = useState<SketchPoint | null>(null);
  const sketchHistoryRef = useRef<SketchProfile[]>([]);
  const sketchHistoryIndexRef = useRef(-1);
  const [sketchHistoryIndex, setSketchHistoryIndex] = useState(-1);
  const activeSketchProfileValidation = useMemo(() => {
    if (!sketchSession) return null;
    const profile = sketchSession.profile;
    const hasGeometry = profile.points.length > 0
      || profile.segments.length > 0
      || (profile.circles?.length ?? 0) > 0
      || (profile.texts?.length ?? 0) > 0
      || (profile.images?.length ?? 0) > 0;
    return hasGeometry ? validateDrawnSketchProfile(profile) : null;
  }, [sketchSession]);
  const t = useCallback((key: EducadTranslationKey) => educadTranslate(locale, key), [locale]);

  useEffect(() => {
    const preferredDock = challengeDock.startsWith("compact-") ? challengeDock.replace("compact-", "") : challengeDock;
    if (preferredDock === "floating" || preferredDock === "left" || preferredDock === "right") window.localStorage.setItem("educad.challenge-dock", preferredDock);
  }, [challengeDock]);

  useEffect(() => {
    const closePopoversOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const popup = target?.closest<HTMLElement>("[data-educad-popup]")?.dataset.educadPopup ?? null;
      if (popup !== "shapes") setShapesOpen(false);
      if (popup !== "align") setAlignOpen(false);
      if (popup !== "grid") {
        const activeElement = window.document.activeElement;
        if (activeElement instanceof HTMLInputElement && activeElement.closest('[data-educad-popup="grid"]')) activeElement.blur();
        setWorkplaneOpen(false);
      }
      if (popup !== "export") setExportOpen(false);
      if (popup !== "settings") setSettingsOpen(false);
    };
    window.document.addEventListener("pointerdown", closePopoversOutside);
    return () => window.document.removeEventListener("pointerdown", closePopoversOutside);
  }, []);

  useEffect(() => {
    if (!shapesOpen) return;
    const positionMenu = () => {
      const trigger = shapeMenuTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const menuWidth = Math.min(264, window.innerWidth - 20);
      setShapeMenuPosition({
        top: bounds.bottom,
        left: Math.max(10, Math.min(bounds.left, window.innerWidth - menuWidth - 10)),
      });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [shapesOpen]);

  useEffect(() => {
    if (!placingWorkplane && !editingMirrorPlaneId && !selectingTopologyFaces && !selectingTopologyEdges) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPlacingWorkplane(false);
      setEditingMirrorPlaneId(null);
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
      setNotice({ type: "info", text: placingWorkplane || editingMirrorPlaneId ? t("notice.workplaneCancelled") : t("notice.topologyCancelled") });
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [editingMirrorPlaneId, placingWorkplane, selectingTopologyEdges, selectingTopologyFaces, t]);
  const [exporting, setExporting] = useState(false);
  const [projectExporting, setProjectExporting] = useState(false);
  const [sharedSaveOpen, setSharedSaveOpen] = useState(false);
  const [sharedSaving, setSharedSaving] = useState(false);
  const [sharedName, setSharedName] = useState(sharedFileName?.replace(/\.educad$/i, "") ?? initialDocument.name);
  const [sharedAuthor, setSharedAuthor] = useState("");
  const [sharedSaveMessage, setSharedSaveMessage] = useState("");
  useEffect(() => {
    try { setSharedAuthor(localStorage.getItem("educad.shared-author") ?? ""); } catch {}
  }, []);
  const publishShared = async () => {
    if (!onSaveShared || sharedSaving || !sharedName.trim() || !sharedAuthor.trim()) return;
    setSharedSaving(true); setSharedSaveMessage("");
    try {
      await onSaveShared(structuredClone(latestDocumentRef.current), `${sharedName.trim().replace(/\.educad$/i, "")}.educad`, sharedAuthor.trim());
      try { localStorage.setItem("educad.shared-author", sharedAuthor.trim()); } catch {}
      setSharedSaveMessage(locale === "es" ? "Proyecto guardado en compartidos." : "Project saved to shared.");
    } catch (error) { setSharedSaveMessage(error instanceof Error ? error.message : "Could not save shared project."); }
    finally { setSharedSaving(false); }
  };
  const [pendingProjectImport, setPendingProjectImport] = useState<{ document: ParametricDocument; assetCount: number; fileName: string } | null>(null);
  const newDocumentDialogRef = useAccessibleDialog(newDocumentOpen, () => setNewDocumentOpen(false));
  const importProjectDialogRef = useAccessibleDialog(Boolean(pendingProjectImport), () => setPendingProjectImport(null));
  const [hydrated, setHydrated] = useState(false);
  const [buildWorkersReady, setBuildWorkersReady] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const sketchSvgImportRef = useRef<HTMLInputElement>(null);
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
    if ((feature?.kind !== "extrude" && feature?.kind !== "primitive" && feature?.kind !== "fillet" && feature?.kind !== "faceExtrude" && feature?.kind !== "shell" && feature?.kind !== "revolve" && feature?.kind !== "mirror" && feature?.kind !== "linearPattern" && feature?.kind !== "polarPattern" && feature?.kind !== "objectBoolean") || !feature.objectId) return null;
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
      const storedDisplayMode = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
      if (storedDisplayMode === "solid" || storedDisplayMode === "wireframe") setDisplayMode(storedDisplayMode);
      const storedShadingMode = localStorage.getItem(SHADING_MODE_STORAGE_KEY);
      if (storedShadingMode === "shadows" || storedShadingMode === "basic" || storedShadingMode === "noShadows") setShadingMode(storedShadingMode);
      else if (storedShadingMode === "unlit") setShadingMode("noShadows");
      if (localStorage.getItem(DISPLAY_UNIT_STORAGE_KEY) === "in") setDisplayUnit("in");
      setLocale(normalizeEducadLocale(localStorage.getItem(LOCALE_STORAGE_KEY)));
      setShowFps(localStorage.getItem(FPS_VISIBLE_STORAGE_KEY) === "true");
      setShowPositionTriad(localStorage.getItem(POSITION_TRIAD_VISIBLE_STORAGE_KEY) !== "false");
      setShowRotationTriad(localStorage.getItem(ROTATION_TRIAD_VISIBLE_STORAGE_KEY) !== "false");
      setShowParameterHandles(localStorage.getItem(PARAMETER_HANDLES_VISIBLE_STORAGE_KEY) !== "false");
    } catch {}
    setHydrated(true);
  }, [initialProject]);

  useEffect(() => {
    if (hydrated) onProjectChange?.(document);
  }, [document, hydrated, onProjectChange]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, renderQuality);
  }, [hydrated, renderQuality]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(SHADING_MODE_STORAGE_KEY, shadingMode);
  }, [hydrated, shadingMode]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(DISPLAY_UNIT_STORAGE_KEY, displayUnit);
  }, [displayUnit, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.document.documentElement.lang = locale;
  }, [hydrated, locale]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FPS_VISIBLE_STORAGE_KEY, String(showFps));
  }, [hydrated, showFps]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(POSITION_TRIAD_VISIBLE_STORAGE_KEY, String(showPositionTriad));
  }, [hydrated, showPositionTriad]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(ROTATION_TRIAD_VISIBLE_STORAGE_KEY, String(showRotationTriad));
  }, [hydrated, showRotationTriad]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(PARAMETER_HANDLES_VISIBLE_STORAGE_KEY, String(showParameterHandles));
  }, [hydrated, showParameterHandles]);

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
    setBuildWorkersReady(true);
    return () => {
      setBuildWorkersReady(false);
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
    setTopologyPreviewBusy(false);
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
    setTopologyPreviewBusy(true);
    const timeout = window.setTimeout(() => topologyPreviewWorkerRef.current?.buildContext(preview, featureId).then((result) => { if (active) { setTopologyPreviewContext(result); setTopologyPreviewBusy(false); } }).catch(() => { if (active) { setTopologyPreviewContext(null); setTopologyPreviewBusy(false); } }), 80);
    return () => { active = false; window.clearTimeout(timeout); topologyPreviewWorkerRef.current?.cancel(); setTopologyPreviewBusy(false); };
  }, [document, edgeTreatmentRadius, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, pendingEdgeTreatment, pendingFaceExtrude, pendingRevolve, pendingShell, selectedTopologyEdges, selectedTopologyFaces]);

  useEffect(() => {
    setTopologySelectionBuild(null);
    setTopologySelectionBusy(false);
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    if (!editingFeatureId) return;
    const target = document.features.find((feature) => feature.id === editingFeatureId);
    if (!target?.objectId) return;
    const previousFeature = parametricTopologyEditingSourceFeature(document, editingFeatureId);
    if (!previousFeature) return;
    let active = true;
    setTopologySelectionBusy(true);
    topologySelectionWorkerRef.current?.buildContext(document, previousFeature.id).then((context) => {
      if (!active) return;
      if (!context) {
        setTopologySelectionBuild(null);
        setTopologySelectionBusy(false);
        return;
      }
      const object = document.objects.find((candidate) => candidate.id === target.objectId);
      const currentRecord = build.objectRecords.find((record) => record.objectId === target.objectId);
      if (!object) {
        setTopologySelectionBuild(null);
        setTopologySelectionBusy(false);
        return;
      }
      const previousRecord: ParametricObjectRenderRecord = {
        objectId: object.id,
        renderId: currentRecord?.renderId ?? `object:${object.id}`,
        geometryFingerprint: `${geometryFingerprint}:before:${editingFeatureId}`,
        color: object.color,
        worldTransform: object.transform,
        mesh: context.mesh,
      };
      const objectRecords = currentRecord
        ? build.objectRecords.map((record) => record.objectId === object.id ? previousRecord : record)
        : [...build.objectRecords, previousRecord];
      setTopologySelectionBuild({
        mesh: null,
        objectRecords,
        operationContext: null,
        completedFeatureIds: [],
        failedFeatureId: null,
        warning: null,
      });
      setTopologySelectionBusy(false);
    }).catch(() => { if (active) { setTopologySelectionBuild(null); setTopologySelectionBusy(false); } });
    return () => { active = false; topologySelectionWorkerRef.current?.cancel(); setTopologySelectionBusy(false); };
  }, [build.objectRecords, document, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, geometryFingerprint]);

  useEffect(() => {
    if (!hydrated || !buildWorkersReady || !buildWorkerRef.current) return;
    const counter = ++buildCounter.current;
    setKernelBusy(true);
    const buildDocument = buildDocumentRef.current;
    const timeout = window.setTimeout(() => {
      buildWorkerRef.current!.buildModel(buildDocument).then((result) => {
        if (counter !== buildCounter.current) return;
        setBuild(result);
        if (result.failedFeatureId && buildDocument.features.some((feature) => feature.id === result.failedFeatureId)) {
          setModelSelection([{ id: result.failedFeatureId, kind: "feature" }]);
          setModelSidebarMode("normal");
        }
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
  }, [buildWorkersReady, geometryFingerprint, hydrated]);

  useEffect(() => {
    const counter = ++contextBuildCounter.current;
    setOperationContext(null);
    setContextBusy(false);
    if (!selectedOperationTimeline) return;
    const buildDocument = buildDocumentRef.current;
    setContextBusy(true);
    const timeout = window.setTimeout(() => {
      contextWorkerRef.current?.buildContext(buildDocument, selectedOperationTimeline.featureId).then((result) => {
        if (counter === contextBuildCounter.current) { setOperationContext(result); setContextBusy(false); }
      }).catch(() => {
        if (counter === contextBuildCounter.current) { setOperationContext(null); setContextBusy(false); }
      });
    }, 80);
    return () => {
      window.clearTimeout(timeout);
      contextWorkerRef.current?.cancel();
      setContextBusy(false);
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
    setNotice({ type: "error", text: `${removed} ${t(removed === 1 ? "notice.topologyReferenceRemoved" : "notice.topologyReferencesRemoved")}` });
  }, [build.objectRecords, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, selectedTopologyEdges, selectedTopologyFaces, topologySelectionBuild]);

  const commit = useCallback((next: ParametricDocument) => {
    next.updatedAt = Date.now();
    // Keep the newest committed document available synchronously. A numeric
    // field commits on blur immediately before the brand button's click, so a
    // render-based closure can otherwise still contain the preceding value.
    latestDocumentRef.current = next;
    setHistory((current) => commitHistoryDocument(current, next));
  }, []);

  const beginTransaction = useCallback(() => setHistory(beginHistoryTransaction), []);
  const finishTransaction = useCallback(() => setHistory((current) => finishHistoryTransaction(current)), []);
  const cancelTransaction = useCallback(() => setHistory(cancelHistoryTransaction), []);

  const mutate = useCallback((mutator: (draft: ParametricDocument) => void) => {
    const next = cloneDocument(document);
    try {
      mutator(next);
      localizeNewDocumentEntries(document, next, locale);
      assertValidParametricDependencies(next);
      assertValidParametricTopology(next);
      commit(next);
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.invalidDependency") });
      return false;
    }
  }, [commit, document, locale]);

  const primarySelection = modelSelection.at(-1) ?? null;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";
  const selectedObjectId = objectIdForFeature(document, selectedId);
  const selectedFeature = selectionKind === "feature" ? document.features.find((feature) => feature.id === selectedId) ?? null : null;
  const selectedEdgeTreatmentFeature = selectedFeature?.kind === "fillet" ? selectedFeature : null;
  const selectedOperationId = selectionKind === "feature" && document.features.some((feature) => feature.id === selectedId && (feature.kind === "extrude" || feature.kind === "primitive")) ? selectedId : null;
  const selectedOperation = selectedOperationId ? document.features.find((feature): feature is ExtrudeFeature | PrimitiveFeature => feature.id === selectedOperationId && (feature.kind === "extrude" || feature.kind === "primitive")) : null;
  const selectedSketchId = selectedFeature?.kind === "sketch" && selectedFeature.purpose === "user" ? selectedFeature.id : null;
  const selectedTransformOperationId = selectedOperationId ?? selectedSketchId;
  const selectedShape = useMemo(() => workplaneShapeForObject(document, selectedObjectId), [document, selectedObjectId]);
  const selectedBox = useMemo(() => modelSelection.length === 1 ? (selectionKind === "feature" ? selectedOperationId ? viewportSelectionForFeature(document, selectedOperationId) : null : viewportSelectionForObject(document, selectedObjectId)) : null, [document, modelSelection.length, selectedObjectId, selectedOperationId, selectionKind]);
  const selectedSketchPlacement = useMemo(() => selectedSketchId ? viewportPlacementForSketchFeature(document, selectedSketchId) : null, [document, selectedSketchId]);
  const selectedOriginObjectId = modelSelection.length === 1 && selectionKind === "object" ? selectedObjectId : null;
  const selectedOperationOriginId = modelSelection.length === 1 ? selectedTransformOperationId : null;
  const selectedObjectVisible = Boolean(selectedObjectId && document.objects.find((object) => object.id === selectedObjectId)?.visible);
  const viewportSelectedObjectIds = useMemo(() => [...new Set(modelSelection.flatMap((item) => {
    const objectId = objectIdForFeature(document, item.id);
    return objectId ? [objectId] : [];
  }))], [document, modelSelection]);
  const viewportObjectOrigins = useMemo(() => document.objects.map((object) => ({
    objectId: object.id,
    visible: object.visible !== false && object.id === selectedOriginObjectId && (showPositionTriad || showRotationTriad || object.id === originEditObjectId),
    position: object.transform.position,
    rotation: object.transform.rotation,
    positionVisible: showPositionTriad || object.id === originEditObjectId,
    rotationEditable: object.id === selectedOriginObjectId && showRotationTriad,
  })), [document.objects, originEditObjectId, selectedOriginObjectId, showPositionTriad, showRotationTriad]);
  const referenceObjectRecords = useMemo(() => parametricReferenceRenderRecords(document), [document]);
  const viewportObjectRecords = useMemo(() => {
    const visibleObjectIds = new Set(document.objects.filter((object) => object.visible !== false).map((object) => object.id));
    return [
      ...((editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && topologySelectionBuild ? topologySelectionBuild : build).objectRecords,
      ...referenceObjectRecords,
    ].filter((record) => visibleObjectIds.has(record.objectId));
  }, [build, document.objects, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, referenceObjectRecords, topologySelectionBuild]);
  const selectedOperationVisible = selectedFeature?.kind !== "sketch" || selectedFeature.visible;
  const viewportOperationOrigins = useMemo(() => selectedObjectVisible && selectedOperationVisible && selectedOperationOriginId && (selectedBox || selectedSketchPlacement) ? [{
    featureId: selectedOperationOriginId,
    visible: showPositionTriad || showRotationTriad,
    position: selectedSketchPlacement?.position ?? selectedBox?.origin ?? { x: selectedBox?.x ?? 0, y: selectedBox?.y ?? 0, z: selectedBox?.baseZ ?? 0 },
    rotation: selectedSketchPlacement?.rotation ?? selectedBox?.rotation3d ?? { x: 0, y: 0, z: selectedBox?.rotation ?? 0 },
    positionVisible: showPositionTriad,
    rotationEditable: showRotationTriad,
  }] : [], [selectedBox, selectedObjectVisible, selectedOperationVisible, selectedOperationOriginId, selectedSketchPlacement, showPositionTriad, showRotationTriad]);
  const viewportSketchOverlays = useMemo(() => document.features.flatMap((feature) => {
    if (feature.kind !== "sketch" || feature.purpose !== "user" || feature.suppressed || !feature.visible) return [];
    const object = feature.objectId ? document.objects.find((candidate) => candidate.id === feature.objectId) ?? null : null;
    if (object?.visible === false) return [];
    return [{ feature, object, selected: modelSelection.some((item) => item.kind === "feature" && item.id === feature.id) }];
  }), [document.features, document.objects, modelSelection]);
  const edgeTreatmentHandle = useMemo(() => {
    const editingReferences = [...selectedTopologyFaces, ...selectedTopologyEdges];
    const feature = selectedEdgeTreatmentFeature;
    const useDraft = Boolean(pendingEdgeTreatment && editingReferences.length > 0);
    if (!useDraft && !feature) return null;
    const references = useDraft
      ? editingReferences
      : (feature?.selectionReferenceIds ?? feature?.edgeReferenceIds ?? [])
          .map((id) => document.topologyReferences.find((reference) => reference.id === id))
          .filter((reference): reference is ParametricTopologyReference => Boolean(reference));
    const objectId = references[0]?.objectId ?? feature?.objectId ?? null;
    const object = objectId ? document.objects.find((candidate) => candidate.id === objectId) ?? null : null;
    if (!object || object.visible === false) return null;
    const points = references.flatMap((reference) => {
      const hint = reference.reference.hint;
      const point = hint.entityType === "edge" ? hint.midpoint : hint.centroid;
      return point ? [new THREE.Vector3(...point)] : [];
    });
    const origin = points.length > 0
      ? points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length)
      : new THREE.Vector3(object.transform.position.x, object.transform.position.y, object.transform.position.z);
    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      radius: useDraft ? edgeTreatmentRadius : feature!.radius,
      treatment: useDraft ? pendingEdgeTreatment! : feature!.treatment,
    };
  }, [document.objects, document.topologyReferences, edgeTreatmentRadius, pendingEdgeTreatment, selectedEdgeTreatmentFeature, selectedTopologyEdges, selectedTopologyFaces]);
  const sketchSceneReference = useMemo<SketchSceneReference | null>(() => {
    const mesh = build.mesh;
    if (!sketchSession || !mesh?.positions.length) return null;
    const feature = sketchSession.featureId
      ? document.features.find((candidate): candidate is SketchFeature => candidate.id === sketchSession.featureId && candidate.kind === "sketch") ?? null
      : null;
    const objectId = feature?.objectId ?? sketchSession.objectId;
    const object = objectId ? document.objects.find((candidate) => candidate.id === objectId) ?? null : null;
    const sketchWorldPlacement = feature
      ? (object ? parametricTransformMatrix(object.transform) : new THREE.Matrix4()).multiply(parametricTransformMatrix({
          position: { x: feature.x, y: feature.y, z: feature.offset },
          rotation: feature.rotation,
        }))
      : parametricTransformMatrix(objectPlacementForWorkplane(document.workplane));
    const worldToSketch = sketchWorldPlacement.invert();
    const transformPositions = (source: Float32Array) => {
      const transformed = new Float32Array(source.length);
      const point = new THREE.Vector3();
      for (let index = 0; index + 2 < source.length; index += 3) {
        point.set(source[index], source[index + 1], source[index + 2]).applyMatrix4(worldToSketch);
        transformed[index] = point.x;
        transformed[index + 1] = point.y;
        transformed[index + 2] = point.z;
      }
      return transformed;
    };
    return {
      positions: transformPositions(mesh.positions),
      indices: mesh.indices,
      edges: transformPositions(mesh.edges),
    };
  }, [build.mesh, document.features, document.objects, document.workplane, sketchSession?.featureId, sketchSession?.objectId]);
  const snapAmount = document.workplane.snapToGrid ? document.workplane.snapSpacing : 0.01;
  const viewportOverlayRightOffset = sketchSession ? 12 : modelSidebarMode === "normal" ? 302 : modelSidebarMode === "simplified" ? 80 : 12;
  const backgroundProcessLabel = stlExporting
    ? `${t("dialog.exporting")} STL…`
    : exporting
    ? t("status.exportingStep")
    : kernelBusy
      ? t("status.regenerating")
      : topologyPreviewBusy || topologySelectionBusy || contextBusy
        ? t("status.updatingView")
        : null;
  const failedFeature = build.failedFeatureId ? document.features.find((feature) => feature.id === build.failedFeatureId) ?? null : null;
  const rebuildSuggestion = build.warning ? t(parametricRebuildSuggestion(failedFeature, build.warning)) : null;

  const beginSketch = (featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === featureId && candidate.profile.shape === "drawn") : null;
    const profile = feature?.profile.shape === "drawn" ? cloneSketchProfile(feature.profile.geometry) : emptySketchProfile();
    const mode = feature?.profile.shape === "drawn" && feature.profile.geometry.generator?.kind === "scribble" ? "scribble" : "sketch";
    setSketchSession({ featureId: feature?.id ?? null, objectId: feature?.objectId ?? selectedObjectId, profile, mode });
    sketchHistoryRef.current = [cloneSketchProfile(profile)];
    sketchHistoryIndexRef.current = 0;
    setSketchHistoryIndex(0);
    setSketchTool(mode === "scribble" ? "freehand" : feature ? "select" : "line");
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    setModelSidebarMode("hidden");
    setNotice({ type: "info", text: feature ? t("notice.editingSketch") : t("notice.drawClosedContour") });
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
    setNotice({ type: "info", text: t("notice.sketchCancelled") });
  };

  const importSvgIntoSketch = async (file: File) => {
    if (!sketchSession) return;
    try {
      assertImportByteLimit("SVG", file.size);
      const imported = sketchProfileFromSvg(await file.text());
      const pointIds = imported.points.map((point) => point.id);
      const segmentIds = imported.segments.map((segment) => segment.id);
      const circleIds = (imported.circles ?? []).map((circle) => circle.id);
      setSketchProfile((profile) => ({
        ...profile,
        points: [...profile.points, ...imported.points],
        segments: [...profile.segments, ...imported.segments],
        circles: [...(profile.circles ?? []), ...(imported.circles ?? [])],
      }));
      setSketchSelection({ kind: "multiple", pointIds, segmentIds, circleIds, imageIds: [] });
      setSketchActivePointId(null);
      setSketchTool("select");
      setNotice({ type: "ok", text: `${t("notice.svgSketchImported")} · ${segmentIds.length} / ${circleIds.length}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.svgSketchFailed") });
    }
  };

  const acceptSketch = () => {
    const validation = sketchSession ? validateDrawnSketchProfile(sketchSession.profile) : null;
    if (!sketchSession || !validation?.valid) {
      setNotice({ type: "error", text: validation?.diagnostics[0]?.message ?? t("notice.closeContours") });
      return;
    }
    if (sketchSession.revolveAxisFeatureId) {
      const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
      const axisSegment = segmentIds.length === 1 ? sketchSession.profile.segments.find((segment) => segment.id === segmentIds[0]) : null;
      if (!axisSegment || (axisSegment.kind !== "line" && axisSegment.kind !== undefined)) {
        setNotice({ type: "error", text: locale === "es" ? "Selecciona una única arista recta del boceto como eje." : "Select one straight sketch edge as the axis." });
        return;
      }
      const revolveFeatureId = sketchSession.revolveAxisFeatureId;
      const changed = mutate((draft) => {
        const sketch = draft.features.find((candidate): candidate is SketchFeature => candidate.id === sketchSession.featureId && candidate.kind === "sketch");
        const revolve = draft.features.find((candidate): candidate is RevolveFeature => candidate.id === revolveFeatureId && candidate.kind === "revolve");
        if (!sketch || sketch.profile.shape !== "drawn" || !revolve || revolve.source !== "sketch") return;
        sketch.profile.geometry = structuredClone(sketchSession.profile);
        revolve.axis = "edge";
        revolve.sketchAxisSegmentId = axisSegment.id;
        revolve.axisReferenceId = undefined;
      });
      if (!changed) return;
      setSketchSession(null);
      setSketchSelection(null);
      setSketchActivePointId(null);
      sketchHistoryRef.current = [];
      sketchHistoryIndexRef.current = -1;
      setSketchHistoryIndex(-1);
      setModelSidebarMode("normal");
      setModelSelection([{ id: revolveFeatureId, kind: "feature" }]);
      setNotice({ type: "ok", text: locale === "es" ? "Eje de revolución actualizado." : "Revolve axis updated." });
      return;
    }
    let featureId = sketchSession.featureId ?? "";
    let selectedFeatureId = featureId;
    let objectId = sketchSession.objectId;
    const changed = mutate((draft) => {
      if (featureId) {
        const feature = draft.features.find((candidate) => candidate.id === featureId);
        if (feature?.kind === "sketch" && feature.profile.shape === "drawn") feature.profile.geometry = structuredClone(sketchSession.profile);
        return;
      }
      const usesExistingObject = Boolean(objectId && draft.objects.some((object) => object.id === objectId));
      if (!usesExistingObject) {
        objectId = addParametricObject(draft, draft.workplane.origin);
        const object = draft.objects.find((candidate) => candidate.id === objectId);
        if (object) {
          const placement = objectPlacementForWorkplane(draft.workplane);
          object.transform.position = placement.position;
          object.transform.rotation = placement.rotation;
        }
      }
      const feature = createDrawnSketchFeature(draft.features.filter((candidate) => candidate.kind === "sketch" && candidate.purpose === "user").length + 1, sketchSession.profile);
      feature.name = `${locale === "es" ? "Boceto" : "Sketch"} ${draft.features.filter((candidate) => candidate.kind === "sketch" && candidate.purpose === "user").length + 1}`;
      feature.objectId = objectId ?? undefined;
      if (usesExistingObject && objectId) {
        const object = draft.objects.find((candidate) => candidate.id === objectId);
        if (object) {
          const placement = operationPlacementForWorkplane(draft.workplane, object);
          feature.x = placement.position.x;
          feature.y = placement.position.y;
          feature.offset = placement.position.z;
          feature.rotation = placement.rotation;
        }
      }
      if (sketchSession.mode === "scribble") {
        feature.name = locale === "es" ? "Perfil Scribble" : "Scribble profile";
        feature.purpose = "primitive";
        feature.visible = false;
      }
      featureId = feature.id;
      draft.features.push(feature);
      if (sketchSession.mode === "scribble") {
        const extrusion = createExtrudeFeature(feature.id, draft.features.filter((candidate) => candidate.kind === "extrude").length + 1, false);
        extrusion.objectId = objectId ?? undefined;
        extrusion.name = "Scribble";
        extrusion.distance = 4;
        extrusion.dependencies = [{ type: "feature", id: feature.id }];
        draft.features.push(extrusion);
        selectedFeatureId = extrusion.id;
      } else selectedFeatureId = feature.id;
    });
    if (!changed || !featureId) return;
    setSketchSession(null);
    sketchHistoryRef.current = [];
    sketchHistoryIndexRef.current = -1;
    setSketchHistoryIndex(-1);
    setModelSidebarMode("normal");
    if (sketchSession.featureId && sketchSession.mode === "scribble") selectedFeatureId = document.features.find((candidate) => candidate.kind === "extrude" && candidate.sketchId === sketchSession.featureId)?.id ?? sketchSession.featureId;
    setModelSelection([{ id: selectedFeatureId || featureId, kind: "feature" }]);
    setNotice({ type: "ok", text: sketchSession.mode === "scribble" ? (sketchSession.featureId ? t("notice.scribbleUpdated") : t("notice.scribbleAdded")) : sketchSession.featureId ? t("notice.sketchUpdated") : t("notice.sketchAdded") });
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

  const selectedConstructionIds = useMemo(() => {
    if (!sketchSession || !sketchSelection) return { segmentIds: [] as string[], circleIds: [] as string[], allConstruction: false };
    const segmentIds = sketchSelection.kind === "segment" ? [sketchSelection.id]
      : sketchSelection.kind === "point" ? sketchSession.profile.segments.filter((segment) => segment.startId === sketchSelection.id || segment.endId === sketchSelection.id).map((segment) => segment.id)
      : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds : [];
    const circleIds = sketchSelection.kind === "circle" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    const entities = [...sketchSession.profile.segments.filter((segment) => segmentIds.includes(segment.id)), ...(sketchSession.profile.circles ?? []).filter((circle) => circleIds.includes(circle.id))];
    return { segmentIds, circleIds, allConstruction: entities.length > 0 && entities.every((entity) => entity.construction) };
  }, [sketchSelection, sketchSession]);

  const toggleSketchConstruction = () => {
    if (!selectedConstructionIds.segmentIds.length && !selectedConstructionIds.circleIds.length) return;
    const construction = !selectedConstructionIds.allConstruction;
    setSketchProfile((profile) => ({
      ...profile,
      segments: profile.segments.map((segment) => selectedConstructionIds.segmentIds.includes(segment.id) ? { ...segment, construction } : segment),
      circles: (profile.circles ?? []).map((circle) => selectedConstructionIds.circleIds.includes(circle.id) ? { ...circle, construction } : circle),
    }));
  };

  const selectedConstraintSegments = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "segment" ? [sketchSelection.id]
      : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds
      : [];
    return [...sketchSession.profile.segments, ...SKETCH_REFERENCE_AXES].filter((segment) => ids.includes(segment.id) && segment.kind === "line");
  }, [sketchSelection, sketchSession]);

  const selectedConstraintKind = (kind: "horizontal" | "vertical") => selectedConstraintSegments.length > 0
    && selectedConstraintSegments.every((segment) => sketchSession?.profile.constraints?.some((constraint) => constraint.kind === kind && constraint.segmentId === segment.id));

  const toggleSketchConstraint = (kind: "horizontal" | "vertical") => {
    if (!selectedConstraintSegments.length) return;
    const segmentIds = new Set(selectedConstraintSegments.map((segment) => segment.id));
    const remove = selectedConstraintKind(kind);
    if (!remove && sketchSession) {
      for (const segment of selectedConstraintSegments) {
        const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind, segmentId: segment.id });
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
      }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => {
        if ((constraint.kind === "horizontal" || constraint.kind === "vertical") && segmentIds.has(constraint.segmentId)) return false;
        return true;
      });
      const constraints = remove ? retained : [
        ...retained,
        ...selectedConstraintSegments.map((segment) => ({ id: sketchEntityId("constraint"), kind, segmentId: segment.id } as const)),
      ];
      return solveSketchConstraints({ ...profile, constraints });
    });
  };

  const selectedLinePair = selectedConstraintSegments.length === 2 ? selectedConstraintSegments as [typeof selectedConstraintSegments[number], typeof selectedConstraintSegments[number]] : null;
  const selectedPairConstraintKind = (kind: "parallel" | "perpendicular") => Boolean(selectedLinePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === kind && constraint.segmentIds.every((id) => selectedLinePair.some((segment) => segment.id === id))));

  const toggleSketchPairConstraint = (kind: "parallel" | "perpendicular") => {
    if (!selectedLinePair || !sketchSession) return;
    const segmentIds: [string, string] = [selectedLinePair[0].id, selectedLinePair[1].id];
    const remove = selectedPairConstraintKind(kind);
    if (!remove) {
      const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind, segmentIds });
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== kind || !constraint.segmentIds.every((id) => segmentIds.includes(id)));
      return solveSketchConstraints({ ...profile, constraints: remove ? retained : [...retained, { id: sketchEntityId("constraint"), kind, segmentIds }] });
    });
  };

  const selectedConstraintCircles = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "circle" ? [sketchSelection.id]
      : sketchSelection.kind === "multiple" ? sketchSelection.circleIds ?? []
      : [];
    return (sketchSession.profile.circles ?? []).filter((circle) => ids.includes(circle.id));
  }, [sketchSelection, sketchSession]);
  const selectedConstraintArcs = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "segment" ? [sketchSelection.id]
      : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds
      : [];
    return sketchSession.profile.segments.filter((segment) => ids.includes(segment.id) && segment.kind === "arc" && segment.center);
  }, [sketchSelection, sketchSession]);
  const selectedCirclePair = selectedConstraintCircles.length === 2 ? selectedConstraintCircles as [typeof selectedConstraintCircles[number], typeof selectedConstraintCircles[number]] : null;
  const selectedConcentricActive = Boolean(selectedCirclePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "concentric" && constraint.circleIds.every((id) => selectedCirclePair.some((circle) => circle.id === id))));
  const selectedEqualLinePairs = selectedConstraintSegments.length >= 2
    ? selectedConstraintSegments.slice(1).map((segment) => [selectedConstraintSegments[0].id, segment.id] as [string, string])
    : [];
  const selectedLinesEqual = selectedEqualLinePairs.length > 0 && selectedEqualLinePairs.every((pair) => sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "equalLength" && constraint.segmentIds.every((id) => pair.includes(id))));
  const selectedEqualActive = Boolean(
    selectedLinesEqual
    || (selectedCirclePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "equalRadius" && constraint.circleIds.every((id) => selectedCirclePair.some((circle) => circle.id === id)))),
  );

  const toggleSketchConcentric = () => {
    if (!selectedCirclePair || !sketchSession) return;
    const circleIds: [string, string] = [selectedCirclePair[0].id, selectedCirclePair[1].id];
    if (!selectedConcentricActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind: "concentric", circleIds });
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "concentric" || !constraint.circleIds.every((id) => circleIds.includes(id)));
      return solveSketchConstraints({ ...profile, constraints: selectedConcentricActive ? retained : [...retained, { id: sketchEntityId("constraint"), kind: "concentric", circleIds }] });
    });
  };

  const toggleSketchEqual = () => {
    if (!sketchSession || (!selectedEqualLinePairs.length && !selectedCirclePair)) return;
    const candidates: SketchConstraint[] = selectedEqualLinePairs.length
      ? selectedEqualLinePairs.map((segmentIds, index) => ({ id: `constraint-preview-${index}`, kind: "equalLength", segmentIds }))
      : [{ id: "constraint-preview", kind: "equalRadius", circleIds: [selectedCirclePair![0].id, selectedCirclePair![1].id] }];
    if (!selectedEqualActive) {
      const preview = cloneSketchProfile(sketchSession.profile);
      const selectedLineIds = new Set(selectedConstraintSegments.map((segment) => segment.id));
      const selectedCircleIds = new Set(selectedConstraintCircles.map((circle) => circle.id));
      preview.constraints = (preview.constraints ?? []).filter((constraint) => {
        if (constraint.kind === "equalLength") return !constraint.segmentIds.every((id) => selectedLineIds.has(id));
        if (constraint.kind === "equalRadius") return !constraint.circleIds.every((id) => selectedCircleIds.has(id));
        return true;
      });
      for (const candidate of candidates) {
        const conflict = sketchConstraintConflict(preview, candidate);
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
        preview.constraints = [...(preview.constraints ?? []), candidate];
      }
    }
    setSketchProfile((profile) => {
      const selectedLineIds = new Set(selectedConstraintSegments.map((segment) => segment.id));
      const selectedCircleIds = new Set(selectedConstraintCircles.map((circle) => circle.id));
      const retained = (profile.constraints ?? []).filter((constraint) => {
        if (constraint.kind === "equalLength") return !constraint.segmentIds.every((id) => selectedLineIds.has(id));
        if (constraint.kind === "equalRadius") return !constraint.circleIds.every((id) => selectedCircleIds.has(id));
        return true;
      });
      return solveSketchConstraints({ ...profile, constraints: selectedEqualActive ? retained : [...retained, ...candidates.map((candidate) => ({ ...candidate, id: sketchEntityId("constraint") }))] });
    });
  };

  const selectedConstraintPoints = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "point" ? [sketchSelection.id]
      : sketchSelection.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
      : sketchSelection.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
      : sketchSelection.kind === "multiple" ? sketchSelection.pointIds
      : [];
    return ids.map((id) => sketchConstraintPoint(sketchSession.profile, id)).filter((point): point is SketchPoint => Boolean(point));
  }, [sketchSelection, sketchSession]);

  const selectedPointLinePair = selectedConstraintPoints.length === 1 && selectedConstraintSegments.length === 1
    ? { point: selectedConstraintPoints[0], segment: selectedConstraintSegments[0] }
    : null;
  const selectedPointLineActive = (kind: "midpoint" | "pointOnObject") => Boolean(selectedPointLinePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === kind && constraint.pointId === selectedPointLinePair.point.id && constraint.segmentId === selectedPointLinePair.segment.id));

  const toggleSketchPointLineConstraint = (kind: "midpoint" | "pointOnObject") => {
    if (!selectedPointLinePair || !sketchSession) return;
    const candidate: SketchConstraint = { id: "constraint-preview", kind, pointId: selectedPointLinePair.point.id, segmentId: selectedPointLinePair.segment.id };
    const remove = selectedPointLineActive(kind);
    const withoutPairRelations = (sketchSession.profile.constraints ?? []).filter((constraint) => (constraint.kind !== "midpoint" && constraint.kind !== "pointOnObject") || constraint.pointId !== candidate.pointId || constraint.segmentId !== candidate.segmentId);
    if (!remove) {
      const conflict = sketchConstraintConflict({ ...sketchSession.profile, constraints: withoutPairRelations }, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => (constraint.kind !== "midpoint" && constraint.kind !== "pointOnObject") || constraint.pointId !== candidate.pointId || constraint.segmentId !== candidate.segmentId);
      return solveSketchConstraints({ ...profile, constraints: remove ? retained : [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const selectedPointGeometryConstraint: Extract<SketchConstraint, { kind: "pointOnCircle" | "pointOnArc" }> | null = selectedConstraintPoints.length === 1 && selectedConstraintCircles.length === 1 && selectedConstraintArcs.length === 0
    ? { id: "constraint-preview", kind: "pointOnCircle", pointId: selectedConstraintPoints[0].id, circleId: selectedConstraintCircles[0].id }
    : selectedConstraintPoints.length === 1 && selectedConstraintArcs.length === 1 && selectedConstraintCircles.length === 0
      ? { id: "constraint-preview", kind: "pointOnArc", pointId: selectedConstraintPoints[0].id, arcId: selectedConstraintArcs[0].id }
      : null;
  const selectedPointGeometryActive = Boolean(selectedPointGeometryConstraint && sketchSession?.profile.constraints?.some((constraint) =>
    selectedPointGeometryConstraint.kind === "pointOnCircle"
      ? constraint.kind === "pointOnCircle" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.circleId === selectedPointGeometryConstraint.circleId
      : constraint.kind === "pointOnArc" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.arcId === selectedPointGeometryConstraint.arcId));
  const toggleSketchPointOnGeometry = () => {
    if (selectedPointLinePair) { toggleSketchPointLineConstraint("pointOnObject"); return; }
    if (!selectedPointGeometryConstraint || !sketchSession) return;
    if (!selectedPointGeometryActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, selectedPointGeometryConstraint);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.id !== selectedPointGeometryConstraint.id && !(
        selectedPointGeometryConstraint.kind === "pointOnCircle"
          ? constraint.kind === "pointOnCircle" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.circleId === selectedPointGeometryConstraint.circleId
          : constraint.kind === "pointOnArc" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.arcId === selectedPointGeometryConstraint.arcId
      ));
      return solveSketchConstraints({ ...profile, constraints: selectedPointGeometryActive ? retained : [...retained, { ...selectedPointGeometryConstraint, id: sketchEntityId("constraint") }] });
    });
  };

  const selectedTangentConstraint = selectedConstraintSegments.length === 1 && selectedConstraintCircles.length === 1
    ? { kind: "tangentLineCircle" as const, segmentId: selectedConstraintSegments[0].id, circleId: selectedConstraintCircles[0].id }
    : selectedConstraintSegments.length === 1 && selectedConstraintArcs.length === 1 && selectedConstraintCircles.length === 0
      ? { kind: "tangentLineArc" as const, lineId: selectedConstraintSegments[0].id, arcId: selectedConstraintArcs[0].id }
    : selectedConstraintSegments.length === 0 && selectedConstraintCircles.length === 2
      ? { kind: "tangentCircles" as const, circleIds: [selectedConstraintCircles[0].id, selectedConstraintCircles[1].id] as [string, string] }
      : null;
  const selectedTangentActive = Boolean(selectedTangentConstraint && sketchSession?.profile.constraints?.some((constraint) => {
    if (selectedTangentConstraint.kind === "tangentLineCircle" && constraint.kind === "tangentLineCircle") return constraint.segmentId === selectedTangentConstraint.segmentId && constraint.circleId === selectedTangentConstraint.circleId;
    if (selectedTangentConstraint.kind === "tangentLineArc" && constraint.kind === "tangentLineArc") return constraint.lineId === selectedTangentConstraint.lineId && constraint.arcId === selectedTangentConstraint.arcId;
    return selectedTangentConstraint.kind === "tangentCircles" && constraint.kind === "tangentCircles" && constraint.circleIds.every((id) => selectedTangentConstraint.circleIds.includes(id));
  }));
  const toggleSketchTangent = () => {
    if (!selectedTangentConstraint || !sketchSession) return;
    const candidate: SketchConstraint = { id: "constraint-preview", ...selectedTangentConstraint };
    if (!selectedTangentActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => {
        if (candidate.kind === "tangentLineCircle" && constraint.kind === "tangentLineCircle") return constraint.segmentId !== candidate.segmentId || constraint.circleId !== candidate.circleId;
        if (candidate.kind === "tangentLineArc" && constraint.kind === "tangentLineArc") return constraint.lineId !== candidate.lineId || constraint.arcId !== candidate.arcId;
        if (candidate.kind === "tangentCircles" && constraint.kind === "tangentCircles") return !constraint.circleIds.every((id) => candidate.circleIds.includes(id));
        return true;
      });
      return solveSketchConstraints({ ...profile, constraints: selectedTangentActive ? retained : [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const selectedSymmetrySet = selectedConstraintPoints.length === 2 && selectedConstraintSegments.length === 1
    ? { pointIds: [selectedConstraintPoints[0].id, selectedConstraintPoints[1].id] as [string, string], segmentId: selectedConstraintSegments[0].id }
    : null;
  const selectedSymmetryActive = Boolean(selectedSymmetrySet && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "symmetric" && constraint.segmentId === selectedSymmetrySet.segmentId && constraint.pointIds.every((id) => selectedSymmetrySet.pointIds.includes(id))));
  const toggleSketchSymmetry = () => {
    if (!selectedSymmetrySet || !sketchSession) return;
    const candidate: SketchConstraint = { id: "constraint-preview", kind: "symmetric", ...selectedSymmetrySet };
    if (!selectedSymmetryActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "symmetric" || constraint.segmentId !== candidate.segmentId || !constraint.pointIds.every((id) => candidate.pointIds.includes(id)));
      return solveSketchConstraints({ ...profile, constraints: selectedSymmetryActive ? retained : [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const selectSketchCirclePoint = (circleId: string, point: "center" | "radius", additive: boolean) => {
    const id = circleSketchPointId(circleId, point);
    if (!additive || !sketchSelection) {
      setSketchSelection({ kind: "circlePoint", circleId, point });
      setSketchActivePointId(null);
      return;
    }
    if (sketchSelection.kind === "circlePoint" && sketchSelection.circleId === circleId && sketchSelection.point === point) {
      setSketchSelection(null);
      setSketchActivePointId(null);
      return;
    }
    const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
      : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
      : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
      : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds
      : [];
    const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
    const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
    const nextPointIds = pointIds.includes(id) ? pointIds.filter((candidate) => candidate !== id) : [...pointIds, id];
    setSketchSelection(nextPointIds.length || segmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds: nextPointIds, segmentIds, circleIds, imageIds } : null);
    setSketchActivePointId(null);
  };

  const selectSketchArcPoint = (segmentId: string, additive: boolean) => {
    const id = arcSketchPointId(segmentId);
    if (!additive || !sketchSelection) {
      setSketchSelection({ kind: "arcPoint", segmentId });
      setSketchActivePointId(null);
      return;
    }
    if (sketchSelection.kind === "arcPoint" && sketchSelection.segmentId === segmentId) {
      setSketchSelection(null);
      setSketchActivePointId(null);
      return;
    }
    const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
      : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
      : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
      : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
    const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
    const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
    const nextPointIds = pointIds.includes(id) ? pointIds.filter((candidate) => candidate !== id) : [...pointIds, id];
    setSketchSelection(nextPointIds.length || segmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds: nextPointIds, segmentIds, circleIds, imageIds } : null);
    setSketchActivePointId(null);
  };

  const selectedPointsFixed = selectedConstraintPoints.length > 0 && selectedConstraintPoints.every((point) => sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "fixed" && constraint.pointId === point.id));

  const selectedPointsCoincident = useMemo(() => {
    if (!sketchSession || selectedConstraintPoints.length < 2) return false;
    const selectedIds = new Set(selectedConstraintPoints.map((point) => point.id));
    const reached = new Set<string>();
    const pending = [selectedConstraintPoints[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (!id || reached.has(id)) continue;
      reached.add(id);
      for (const constraint of sketchSession.profile.constraints ?? []) {
        if (constraint.kind !== "coincident" || !constraint.pointIds.includes(id)) continue;
        pending.push(constraint.pointIds[0] === id ? constraint.pointIds[1] : constraint.pointIds[0]);
      }
    }
    return [...selectedIds].every((id) => reached.has(id));
  }, [selectedConstraintPoints, sketchSession]);

  const toggleFixedSketchPoints = () => {
    if (!selectedConstraintPoints.length) return;
    const ids = new Set(selectedConstraintPoints.map((point) => point.id));
    if (!selectedPointsFixed && sketchSession) {
      const preview = cloneSketchProfile(sketchSession.profile);
      for (const point of selectedConstraintPoints) {
        const candidate = { id: sketchEntityId("constraint"), kind: "fixed" as const, pointId: point.id, x: point.x, z: point.z };
        const conflict = sketchConstraintConflict(preview, candidate);
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
        preview.constraints = [...(preview.constraints ?? []), candidate];
      }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "fixed" || !ids.has(constraint.pointId));
      const constraints = selectedPointsFixed ? retained : [...retained, ...selectedConstraintPoints.map((point) => ({ id: sketchEntityId("constraint"), kind: "fixed" as const, pointId: point.id, x: point.x, z: point.z }))];
      return solveSketchConstraints({ ...profile, constraints });
    });
  };

  const toggleCoincidentSketchPoints = () => {
    if (selectedConstraintPoints.length < 2) return;
    const ids = new Set(selectedConstraintPoints.map((point) => point.id));
    if (!selectedPointsCoincident && sketchSession) {
      const anchor = selectedConstraintPoints[0];
      for (const point of selectedConstraintPoints.slice(1)) {
        const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind: "coincident", pointIds: [anchor.id, point.id] });
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
      }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "coincident" || !constraint.pointIds.every((id) => ids.has(id)));
      if (selectedPointsCoincident) return { ...profile, constraints: retained };
      const anchor = selectedConstraintPoints[0];
      const constraints = [
        ...retained,
        ...selectedConstraintPoints.slice(1).map((point) => ({ id: sketchEntityId("constraint"), kind: "coincident" as const, pointIds: [anchor.id, point.id] as [string, string] })),
      ];
      return solveSketchConstraints({ ...profile, constraints }, anchor.id);
    });
  };

  const sketchConstraintStatus = useMemo(() => {
    if (!sketchSession) return { kind: "under", label: locale === "es" ? "Boceto libre" : "Free sketch" };
    const analysis = analyzeSketchConstraints(sketchSession.profile);
    if (analysis.status === "over") return { kind: "over", label: `${locale === "es" ? "Conflicto" : "Conflict"} · ${analysis.conflictingConstraintIds.length}` };
    if (analysis.status === "full") return { kind: "full", label: locale === "es" ? "Totalmente restringido" : "Fully constrained" };
    return { kind: "under", label: `${analysis.degreesOfFreedom} ${locale === "es" ? "GDL" : "DOF"}` };
  }, [locale, sketchSession]);

  const selectedDimensionSegment = selectedConstraintSegments.length === 1 && !sketchReferenceAxis(selectedConstraintSegments[0].id) ? selectedConstraintSegments[0] : null;
  const selectedDimensionCircle = sketchSession && sketchSelection?.kind === "circle"
    ? sketchSession.profile.circles?.find((circle) => circle.id === sketchSelection.id) ?? null
    : null;
  const selectedDimensionArcId = sketchSelection?.kind === "segment"
    ? sketchSelection.id
    : sketchSelection?.kind === "multiple" && sketchSelection.segmentIds.length === 1
      ? sketchSelection.segmentIds[0]
      : null;
  const selectedDimensionArc = sketchSession && selectedDimensionArcId
    ? sketchSession.profile.segments.find((segment) => segment.id === selectedDimensionArcId && segment.kind === "arc" && segment.center) ?? null
    : null;
  const selectedArcStart = selectedDimensionArc && sketchSession ? sketchSession.profile.points.find((point) => point.id === selectedDimensionArc.startId) ?? null : null;
  const selectedArcEnd = selectedDimensionArc && sketchSession ? sketchSession.profile.points.find((point) => point.id === selectedDimensionArc.endId) ?? null : null;
  const selectedArcRadius = selectedDimensionArc?.center && selectedArcStart ? Math.hypot(selectedArcStart.x - selectedDimensionArc.center.x, selectedArcStart.z - selectedDimensionArc.center.z) : null;
  const selectedDimensionActive = (axis: "aligned" | "x" | "z") => Boolean(selectedDimensionSegment && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "distance" && constraint.segmentId === selectedDimensionSegment.id && constraint.axis === axis));
  const selectedRadiusActive = Boolean(
    selectedDimensionCircle
      ? sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "radius" && constraint.circleId === selectedDimensionCircle.id)
      : selectedDimensionArc && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "arcRadius" && constraint.segmentId === selectedDimensionArc.id),
  );
  const selectedDiameterActive = Boolean(
    selectedDimensionCircle
      ? sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "diameter" && constraint.circleId === selectedDimensionCircle.id)
      : selectedDimensionArc && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "arcDiameter" && constraint.segmentId === selectedDimensionArc.id),
  );
  const selectedArcAngleActive = Boolean(selectedDimensionArc && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "arcAngle" && constraint.segmentId === selectedDimensionArc.id));
  const selectedAngleSegments = selectedConstraintSegments.length >= 1 && selectedConstraintSegments.length <= 2 ? selectedConstraintSegments : [];
  const selectedAngleActive = selectedAngleSegments.length > 0 && Boolean(sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "angle" && constraint.segmentIds.length === selectedAngleSegments.length && constraint.segmentIds.every((id, index) => id === selectedAngleSegments[index].id)));

  const toggleSketchDimension = (axis: "aligned" | "x" | "z") => {
    if (!selectedDimensionSegment || !sketchSession) return;
    const start = sketchSession.profile.points.find((point) => point.id === selectedDimensionSegment.startId);
    const end = sketchSession.profile.points.find((point) => point.id === selectedDimensionSegment.endId);
    if (!start || !end) return;
    const active = selectedDimensionActive(axis);
    const value = axis === "x" ? Math.abs(end.x - start.x) : axis === "z" ? Math.abs(end.z - start.z) : Math.hypot(end.x - start.x, end.z - start.z);
    const candidate = { id: "constraint-preview", kind: "distance" as const, segmentId: selectedDimensionSegment.id, axis, value: Math.max(0.001, value) };
    if (!active) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => {
        return constraint.kind !== "distance" || constraint.segmentId !== selectedDimensionSegment.id || constraint.axis !== axis;
      });
      if (active) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchRadius = () => {
    if ((!selectedDimensionCircle && (!selectedDimensionArc || selectedArcRadius === null)) || !sketchSession) return;
    const candidate: SketchConstraint = selectedDimensionCircle
      ? { id: "constraint-preview", kind: "radius", circleId: selectedDimensionCircle.id, value: selectedDimensionCircle.radius }
      : { id: "constraint-preview", kind: "arcRadius", segmentId: selectedDimensionArc!.id, value: selectedArcRadius! };
    if (!selectedRadiusActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => selectedDimensionCircle
        ? constraint.kind !== "radius" || constraint.circleId !== selectedDimensionCircle.id
        : constraint.kind !== "arcRadius" || constraint.segmentId !== selectedDimensionArc!.id);
      if (selectedRadiusActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchDiameter = () => {
    if ((!selectedDimensionCircle && (!selectedDimensionArc || selectedArcRadius === null)) || !sketchSession) return;
    const candidate: SketchConstraint = selectedDimensionCircle
      ? { id: "constraint-preview", kind: "diameter", circleId: selectedDimensionCircle.id, value: selectedDimensionCircle.radius * 2 }
      : { id: "constraint-preview", kind: "arcDiameter", segmentId: selectedDimensionArc!.id, value: selectedArcRadius! * 2 };
    if (!selectedDiameterActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => selectedDimensionCircle
        ? constraint.kind !== "diameter" || constraint.circleId !== selectedDimensionCircle.id
        : constraint.kind !== "arcDiameter" || constraint.segmentId !== selectedDimensionArc!.id);
      if (selectedDiameterActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchArcAngle = () => {
    if (!selectedDimensionArc?.center || !selectedArcStart || !selectedArcEnd || !sketchSession) return;
    const startAngle = Math.atan2(selectedArcStart.z - selectedDimensionArc.center.z, selectedArcStart.x - selectedDimensionArc.center.x);
    const endAngle = Math.atan2(selectedArcEnd.z - selectedDimensionArc.center.z, selectedArcEnd.x - selectedDimensionArc.center.x);
    const sweep = selectedDimensionArc.clockwise !== false
      ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2)
      : (startAngle - endAngle + Math.PI * 2) % (Math.PI * 2);
    const candidate: SketchConstraint = { id: "constraint-preview", kind: "arcAngle", segmentId: selectedDimensionArc.id, value: Math.max(0.001, sweep * 180 / Math.PI) };
    if (!selectedArcAngleActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "arcAngle" || constraint.segmentId !== selectedDimensionArc.id);
      if (selectedArcAngleActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchAngle = () => {
    if (!sketchSession || !selectedAngleSegments.length) return;
    const segmentAngle = (segment: typeof selectedAngleSegments[number]) => {
      const start = sketchConstraintPoint(sketchSession.profile, segment.startId);
      const end = sketchConstraintPoint(sketchSession.profile, segment.endId);
      return start && end ? Math.atan2(end.z - start.z, end.x - start.x) * 180 / Math.PI : 0;
    };
    let value = segmentAngle(selectedAngleSegments[selectedAngleSegments.length - 1]) - (selectedAngleSegments.length === 2 ? segmentAngle(selectedAngleSegments[0]) : 0);
    value = ((value + 180) % 360 + 360) % 360 - 180;
    const candidate = { id: "constraint-preview", kind: "angle" as const, segmentIds: selectedAngleSegments.map((segment) => segment.id) as [string] | [string, string], value };
    if (!selectedAngleActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "angle" || constraint.segmentIds.length !== candidate.segmentIds.length || !constraint.segmentIds.every((id, index) => id === candidate.segmentIds[index]));
      if (selectedAngleActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const updateSketchConstraintValue = (constraintId: string, value: number) => {
    const constraint = sketchSession?.profile.constraints?.find((candidate) => candidate.id === constraintId);
    const signed = constraint?.kind === "angle";
    if (constraint?.kind === "arcAngle" && (!Number.isFinite(value) || value <= 0 || value >= 360)) { setNotice({ type: "error", text: t("notice.invalidArcAngle") }); return; }
    if (!Number.isFinite(value) || (!signed && value <= 0)) { setNotice({ type: "error", text: signed ? t("notice.invalidAngle") : t("notice.positiveDimension") }); return; }
    setSketchProfile((profile) => solveSketchConstraints({
      ...profile,
      constraints: (profile.constraints ?? []).map((constraint) => constraint.id === constraintId && (constraint.kind === "distance" || constraint.kind === "radius" || constraint.kind === "diameter" || constraint.kind === "arcRadius" || constraint.kind === "arcDiameter" || constraint.kind === "arcAngle" || constraint.kind === "angle") ? { ...constraint, value } : constraint),
    }));
  };

  const deleteSketchConstraint = (constraintId: string) => {
    setSketchProfile((profile) => ({ ...profile, constraints: (profile.constraints ?? []).filter((constraint) => constraint.id !== constraintId) }));
    setNotice({ type: "info", text: t("notice.constraintDeleted") });
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
    let closed = false;
    if (!duplicate) setSketchProfile((profile) => {
      const next = { ...profile, segments: [...profile.segments, { id: sketchEntityId("segment"), startId: sketchActivePointId, endId: pointId, kind: sketchTool as "line" | "bezier" | "smooth" }] };
      const prepared = sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
      closed = orderedSketchPaths(prepared).some((path) => path.closed && path.points.some((point) => point.id === sketchActivePointId) && path.points.some((point) => point.id === pointId));
      return prepared;
    });
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

  const pressSketchPoint = (id: string, additive = false) => {
    const point = sketchSession ? sketchConstraintPoint(sketchSession.profile, id) : null;
    if (!point) return;
    if (sketchTool === "measure") {
      if (sketchMeasureStart) { setSketchMeasurement({ start: sketchMeasureStart, end: point }); setSketchMeasureStart(null); }
      else { setSketchMeasureStart(point); setSketchMeasurement(null); }
    } else if (sketchTool === "select") {
      if (!additive || !sketchSelection) setSketchSelection({ kind: "point", id });
      else if (sketchSelection.kind === "point" && sketchSelection.id === id) setSketchSelection(null);
      else {
        const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
          : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
          : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
          : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds
          : [];
        const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
        const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
        const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
        const nextPointIds = pointIds.includes(id) ? pointIds.filter((candidate) => candidate !== id) : [...pointIds, id];
        setSketchSelection(nextPointIds.length || segmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds: nextPointIds, segmentIds, circleIds, imageIds } : null);
      }
      setSketchActivePointId(null);
    }
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
      const remainingIds = new Set(remaining.map((segment) => segment.id));
      const next = { ...profile, points: profile.points.filter((point) => point.id !== id), segments: remaining, constraints: (profile.constraints ?? []).filter((constraint) => {
        if (sketchConstraintUsesPoint(constraint, id)) return false;
        if (profile.segments.some((segment) => !remainingIds.has(segment.id) && sketchConstraintUsesSegment(constraint, segment.id))) return false;
        if (constraint.kind === "angle") return constraint.segmentIds.every((segmentId) => remainingIds.has(segmentId));
        if (constraint.kind === "horizontal" || constraint.kind === "vertical" || constraint.kind === "distance") return remainingIds.has(constraint.segmentId);
        return true;
      }) };
      return next.segments.some((segment) => segment.kind === "smooth") ? withSmoothSketchHandles(next) : next;
    });
    if (sketchActivePointId === id) setSketchActivePointId(null);
    setSketchSelection(null);
  };

  const deleteSketchSegment = (id: string) => {
    setSketchProfile((profile) => ({ ...profile, segments: profile.segments.filter((segment) => segment.id !== id), constraints: (profile.constraints ?? []).filter((constraint) => !sketchConstraintUsesSegment(constraint, id)) }));
    setSketchActivePointId(null);
    setSketchSelection(null);
  };

  const trimSketchEntity = (target: { kind: "segment" | "circle"; id: string }, point: { x: number; z: number }) => {
    if (!sketchSession) return;
    const result = trimSketchGeometry(sketchSession.profile, target, point, sketchEntityId);
    setNotice({ type: result.trimmed ? "ok" : "info", text: result.message });
    if (!result.trimmed) return;
    setSketchProfile(() => result.profile);
    setSketchSelection(null);
    setSketchActivePointId(null);
  };

  const insertSketchPoint = (segmentId: string, position: { x: number; z: number }) => {
    const insertedId = sketchEntityId("point");
    setSketchProfile((profile) => {
      const segment = profile.segments.find((candidate) => candidate.id === segmentId);
      if (!segment) return profile;
      const inserted: SketchPoint = { id: insertedId, ...position, mode: segment.kind === "line" ? "corner" : "smooth" };
      const firstId = sketchEntityId("segment");
      const secondId = sketchEntityId("segment");
      const inherited = (profile.constraints ?? []).filter((constraint): constraint is Extract<NonNullable<SketchProfile["constraints"]>[number], { kind: "horizontal" | "vertical" }> => (constraint.kind === "horizontal" || constraint.kind === "vertical") && constraint.segmentId === segmentId);
      const next = {
        ...profile,
        points: [...profile.points, inserted],
        segments: profile.segments.flatMap((candidate) => candidate.id === segmentId ? [{ ...candidate, id: firstId, endId: inserted.id }, { ...candidate, id: secondId, startId: inserted.id }] : [candidate]),
        constraints: [
          ...(profile.constraints ?? []).filter((constraint) => !sketchConstraintUsesSegment(constraint, segmentId)),
          ...inherited.flatMap((constraint) => [
            { ...constraint, id: sketchEntityId("constraint"), segmentId: firstId },
            { ...constraint, id: sketchEntityId("constraint"), segmentId: secondId },
          ]),
        ],
      };
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
      next.segments = next.segments.map((segment) => (segment.startId === id || segment.endId === id) && segment.kind !== "arc" ? { ...segment, kind: "line" as const } : segment);
    } else {
      const convertedIds = new Set(next.segments.filter((segment) => (segment.startId === id || segment.endId === id) && segment.kind !== "arc").map((segment) => segment.id));
      next.segments = next.segments.map((segment) => convertedIds.has(segment.id) ? { ...segment, kind: "bezier" as const } : segment);
      next.constraints = (next.constraints ?? []).filter((constraint) => ![...convertedIds].some((segmentId) => sketchConstraintUsesSegment(constraint, segmentId)));
      const points = new Map(next.points.map((candidate) => [candidate.id, candidate]));
      const incoming = next.segments.find((segment) => segment.endId === id);
      const outgoing = next.segments.find((segment) => segment.startId === id);
      const previous = incoming ? points.get(incoming.startId) : null;
      const following = outgoing ? points.get(outgoing.endId) : null;
      const tangent = previous && following
        ? { x: (following.x - previous.x) / 6, z: (following.z - previous.z) / 6 }
        : previous
          ? { x: (point.x - previous.x) / 6, z: (point.z - previous.z) / 6 }
          : following
            ? { x: (following.x - point.x) / 6, z: (following.z - point.z) / 6 }
            : { x: 0, z: 0 };
      point.handleIn = { x: point.x - tangent.x, z: point.z - tangent.z };
      point.handleOut = { x: point.x + tangent.x, z: point.z + tangent.z };
      for (const segment of next.segments.filter((candidate) => convertedIds.has(candidate.id))) {
        const other = points.get(segment.startId === id ? segment.endId : segment.startId);
        if (!other) continue;
        const control = { x: other.x + (point.x - other.x) / 3, z: other.z + (point.z - other.z) / 3 };
        if (segment.startId === id) other.handleIn = control;
        else other.handleOut = control;
      }
      point.mode = mode;
    }
    return next;
  });

  const selectedSketchPoint = sketchSession && sketchSelection?.kind === "point"
    ? sketchSession.profile.points.find((point) => point.id === sketchSelection.id) ?? null
    : null;

  const mergeableSketchPointIds = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "point" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.pointIds : [];
    return ids.filter((id) => sketchSession.profile.points.some((point) => point.id === id)
      && sketchSession.profile.segments.filter((segment) => segment.startId === id || segment.endId === id).length === 1);
  }, [sketchSelection, sketchSession]);

  const mergeSelectedSketchPoints = () => {
    if (!sketchSession || mergeableSketchPointIds.length !== 2) return;
    const incidentSegments = mergeableSketchPointIds.map((id) => sketchSession.profile.segments.find((segment) => segment.startId === id || segment.endId === id));
    if (!incidentSegments[0] || !incidentSegments[1] || incidentSegments[0].id === incidentSegments[1].id) {
      setNotice({ type: "error", text: t("notice.mergeDistinctEdges") });
      return;
    }
    const anchorId = mergeableSketchPointIds[0];
    setSketchProfile((profile) => {
      const next = cloneSketchProfile(profile);
      const selectedPoints = next.points.filter((point) => mergeableSketchPointIds.includes(point.id));
      if (selectedPoints.length < 2) return profile;
      const removedIds = new Set(selectedPoints.slice(1).map((point) => point.id));
      const anchor = next.points.find((point) => point.id === anchorId);
      if (!anchor) return profile;
      anchor.x = selectedPoints.reduce((sum, point) => sum + point.x, 0) / selectedPoints.length;
      anchor.z = selectedPoints.reduce((sum, point) => sum + point.z, 0) / selectedPoints.length;
      const remap = (id: string) => removedIds.has(id) ? anchorId : id;
      next.points = next.points.filter((point) => !removedIds.has(point.id));
      next.segments = next.segments
        .map((segment) => ({ ...segment, startId: remap(segment.startId), endId: remap(segment.endId) }))
        .filter((segment) => segment.startId !== segment.endId);
      let joinedSegments = next.segments.filter((segment) => segment.startId === anchorId || segment.endId === anchorId);
      if (joinedSegments.length === 2 && (joinedSegments[0].startId === anchorId) === (joinedSegments[1].startId === anchorId)) {
        const reverseId = joinedSegments[1].id;
        next.segments = next.segments.map((segment) => segment.id !== reverseId ? segment : {
          ...segment,
          startId: segment.endId,
          endId: segment.startId,
          ...(segment.kind === "arc" ? { clockwise: segment.clockwise === false } : {}),
        });
        joinedSegments = next.segments.filter((segment) => segment.startId === anchorId || segment.endId === anchorId);
      }
      if (joinedSegments.length === 2 && joinedSegments.some((segment) => segment.kind !== "line" && segment.kind !== "arc")) {
        anchor.handleIn = undefined;
        anchor.handleOut = undefined;
        anchor.mode = "smooth";
        const smoothed = withSmoothSketchHandles(next);
        Object.assign(next, smoothed);
      } else {
        anchor.handleIn = undefined;
        anchor.handleOut = undefined;
        anchor.mode = "corner";
      }
      const validSegments = new Set(next.segments.map((segment) => segment.id));
      next.constraints = (next.constraints ?? []).flatMap((constraint): SketchConstraint[] => {
        let updated = constraint;
        if (constraint.kind === "coincident") {
          const pointIds = constraint.pointIds.map(remap) as [string, string];
          if (pointIds[0] === pointIds[1]) return [];
          updated = { ...constraint, pointIds };
        } else if (constraint.kind === "symmetric") updated = { ...constraint, pointIds: constraint.pointIds.map(remap) as [string, string] };
        else if (constraint.kind === "fixed" || constraint.kind === "midpoint" || constraint.kind === "pointOnObject" || constraint.kind === "pointOnCircle" || constraint.kind === "pointOnArc") updated = { ...constraint, pointId: remap(constraint.pointId) };
        if ("segmentId" in updated && !validSegments.has(updated.segmentId)) return [];
        if ("segmentIds" in updated && !updated.segmentIds.every((id) => validSegments.has(id))) return [];
        return [updated];
      });
      return solveSketchConstraints(next, anchorId);
    });
    setSketchSelection({ kind: "point", id: anchorId });
    setSketchActivePointId(null);
  };

  const deleteCurrentSketchSelection = () => {
    if (!sketchSelection) return false;
    const selectedPointIds = sketchSelection.kind === "point" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.pointIds : [];
    const pointIds = selectedPointIds.filter((id) => sketchSession?.profile.points.some((point) => point.id === id));
    const segmentIds = sketchSelection.kind === "segment" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds : [];
    const imageIds = sketchSelection.kind === "image" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
    const circleIds = sketchSelection.kind === "circle" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    if (!pointIds.length && !segmentIds.length && !imageIds.length && !circleIds.length) return false;
    setSketchProfile((profile) => ({
      ...profile,
      points: profile.points.filter((point) => !pointIds.includes(point.id)),
      segments: profile.segments.filter((segment) => !segmentIds.includes(segment.id) && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId)),
      circles: (profile.circles ?? []).filter((circle) => !circleIds.includes(circle.id)),
      images: (profile.images ?? []).filter((image) => !imageIds.includes(image.id)),
      constraints: (profile.constraints ?? []).filter((constraint) => {
        if ((constraint.kind === "radius" || constraint.kind === "diameter") && circleIds.includes(constraint.circleId)) return false;
        if ((constraint.kind === "concentric" || constraint.kind === "equalRadius") && constraint.circleIds.some((circleId) => circleIds.includes(circleId))) return false;
        if (circleIds.some((circleId) => sketchConstraintUsesPoint(constraint, circleSketchPointId(circleId, "center")) || sketchConstraintUsesPoint(constraint, circleSketchPointId(circleId, "radius")))) return false;
        if (pointIds.some((id) => sketchConstraintUsesPoint(constraint, id))) return false;
        if (profile.segments.some((segment) => (segmentIds.includes(segment.id) || pointIds.includes(segment.startId) || pointIds.includes(segment.endId)) && sketchConstraintUsesSegment(constraint, segment.id))) return false;
        if (constraint.kind === "angle") return constraint.segmentIds.every((segmentId) => {
          if (segmentIds.includes(segmentId)) return false;
          const segment = profile.segments.find((candidate) => candidate.id === segmentId);
          return Boolean(segment && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId));
        });
        if (constraint.kind !== "horizontal" && constraint.kind !== "vertical" && constraint.kind !== "distance") return true;
        if (segmentIds.includes(constraint.segmentId)) return false;
        const segment = profile.segments.find((candidate) => candidate.id === constraint.segmentId);
        return Boolean(segment && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId));
      }),
    }));
    setSketchActivePointId(null);
    setSketchSelection(null);
    return true;
  };

  const addExtrudeFromSketch = (sketch: SketchFeature) => {
    if (sketch.profile.shape !== "drawn") return;
    const validation = validateDrawnSketchProfile(sketch.profile.geometry);
    if (!validation.valid) { setNotice({ type: "error", text: `${t("notice.cannotExtrude")}: ${validation.diagnostics[0]?.message ?? t("notice.invalidProfile")}` }); return; }
    let featureId = "";
    const changed = mutate((draft) => {
      if (!sketch.objectId) return;
      const feature = createExtrudeFeature(sketch.id, draft.features.filter((candidate) => candidate.kind === "extrude").length + 1, false);
      feature.objectId = sketch.objectId;
      feature.dependencies = [{ type: "feature", id: sketch.id }];
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) { setModelSelection([{ id: featureId, kind: "feature" }]); setNotice({ type: "ok", text: t("notice.sketchExtruded") }); }
  };

  const addRevolveFromSketch = (sketch: SketchFeature) => {
    if (sketch.profile.shape !== "drawn") return;
    const validation = validateDrawnSketchProfile(sketch.profile.geometry);
    if (!validation.valid) { setNotice({ type: "error", text: `${t("notice.cannotRevolve")}: ${validation.diagnostics[0]?.message ?? t("notice.invalidProfile")}` }); return; }
    let featureId = "";
    const changed = mutate((draft) => {
      if (!sketch.objectId) return;
      const feature = createRevolveFeature(draft.features.filter((candidate) => candidate.kind === "revolve").length + 1, "add");
      feature.objectId = sketch.objectId;
      feature.source = "sketch";
      feature.sketchId = sketch.id;
      feature.faceReferenceId = undefined;
      const constructionAxes = sketch.profile.shape === "drawn"
        ? sketch.profile.geometry.segments.filter((segment) => segment.construction && (segment.kind === "line" || segment.kind === undefined))
        : [];
      feature.axis = constructionAxes.length === 1 ? "edge" : "y";
      feature.sketchAxisSegmentId = constructionAxes.length === 1 ? constructionAxes[0].id : undefined;
      feature.dependencies = [{ type: "feature", id: sketch.id }];
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) { setModelSelection([{ id: featureId, kind: "feature" }]); setNotice({ type: "ok", text: t("notice.sketchRevolved") }); }
  };
  const addMirrorOperation = () => {
    if (!selectedObjectId) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const hasResult = draft.features.some((feature) => feature.objectId === selectedObjectId && feature.kind !== "sketch" && !feature.suppressed);
      if (!hasResult) return;
      const feature = createMirrorFeature(draft.features.filter((candidate) => candidate.kind === "mirror").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.mirrorCreated") });
    }
  };
  const addLinearPatternOperation = () => {
    if (!selectedObjectId) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const hasResult = draft.features.some((feature) => feature.objectId === selectedObjectId && feature.kind !== "sketch" && !feature.suppressed);
      if (!hasResult) return;
      const feature = createLinearPatternFeature(draft.features.filter((candidate) => candidate.kind === "linearPattern").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.linearPatternCreated") });
    }
  };
  const addPolarPatternOperation = () => {
    if (!selectedObjectId) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const hasResult = draft.features.some((feature) => feature.objectId === selectedObjectId && feature.kind !== "sketch" && !feature.suppressed);
      if (!hasResult) return;
      const feature = createPolarPatternFeature(draft.features.filter((candidate) => candidate.kind === "polarPattern").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.polarPatternCreated") });
    }
  };
  const addObjectBooleanOperation = () => {
    if (!selectedObjectId) return;
    const sourceObject = document.objects.find((object) => object.id !== selectedObjectId);
    if (!sourceObject) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const feature = createObjectBooleanFeature(draft.features.filter((candidate) => candidate.kind === "objectBoolean").length + 1, sourceObject.id);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.objectBooleanCreated") });
    }
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
  const revolveHandle = useMemo(() => {
    if (selectedFeature?.kind !== "revolve" || !selectedFeature.objectId) return null;
    const object = document.objects.find((candidate) => candidate.id === selectedFeature.objectId);
    if (!object || object.visible === false) return null;
    const objectMatrix = parametricTransformMatrix(object.transform);
    let origin = new THREE.Vector3().applyMatrix4(objectMatrix);
    let axis = new THREE.Vector3(selectedFeature.axis === "x" ? 1 : 0, selectedFeature.axis === "y" ? 1 : 0, selectedFeature.axis === "z" ? 1 : 0);
    if (selectedFeature.axis === "edge") {
      if (selectedFeature.source === "sketch" && selectedFeature.sketchId && selectedFeature.sketchAxisSegmentId) {
        const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === selectedFeature.sketchId);
        if (sketch?.profile.shape === "drawn") {
          const segment = sketch.profile.geometry.segments.find((candidate) => candidate.id === selectedFeature.sketchAxisSegmentId);
          const start = segment ? sketch.profile.geometry.points.find((point) => point.id === segment.startId) : null;
          const end = segment ? sketch.profile.geometry.points.find((point) => point.id === segment.endId) : null;
          if (start && end) {
            const sketchMatrix = objectMatrix.clone().multiply(parametricTransformMatrix({ position: { x: sketch.x, y: sketch.y, z: sketch.offset }, rotation: sketch.rotation }));
            origin = new THREE.Vector3(start.x, start.z, 0).applyMatrix4(sketchMatrix);
            axis = new THREE.Vector3(end.x - start.x, end.z - start.z, 0).transformDirection(sketchMatrix);
          }
        }
      } else if (selectedFeature.axisReferenceId) {
        const reference = document.topologyReferences.find((candidate) => candidate.id === selectedFeature.axisReferenceId);
        const hint = reference?.reference.hint;
        if (hint?.entityType === "edge" && hint.midpoint && hint.direction) {
          origin = new THREE.Vector3(...hint.midpoint);
          axis = new THREE.Vector3(...hint.direction);
        }
      }
    } else {
      axis.transformDirection(objectMatrix);
    }
    if (axis.lengthSq() < 1e-8) return null;
    const radius = Math.max(8, Math.min(40, Math.max(selectedBox?.width ?? 0, selectedBox?.depth ?? 0, selectedBox?.height ?? 0) * 0.6));
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, axis: { x: axis.x, y: axis.y, z: axis.z }, angle: selectedFeature.angle, radius };
  }, [document.features, document.objects, document.topologyReferences, selectedBox, selectedFeature]);
  const shellHandle = useMemo(() => {
    if (selectedFeature?.kind !== "shell" || !selectedFeature.objectId) return null;
    const object = document.objects.find((candidate) => candidate.id === selectedFeature.objectId);
    if (!object || object.visible === false) return null;
    const reference = selectedFeature.faceReferenceIds
      .map((id) => document.topologyReferences.find((candidate) => candidate.id === id))
      .find((candidate) => candidate?.reference.hint.entityType === "face" && candidate.reference.hint.centroid && candidate.reference.hint.normal);
    const hint = reference?.reference.hint;
    if (!hint || hint.entityType !== "face" || !hint.centroid || !hint.normal) return null;
    return {
      origin: { x: hint.centroid[0], y: hint.centroid[1], z: hint.centroid[2] },
      direction: { x: -hint.normal[0], y: -hint.normal[1], z: -hint.normal[2] },
      thickness: selectedFeature.thickness,
    };
  }, [document.objects, document.topologyReferences, selectedFeature]);
  const viewportFloatingFeature = !sketchSession && !pendingEdgeTreatment && !pendingFaceExtrude && !pendingShell && !pendingRevolve && !editingMirrorPlaneId && modelSelection.length === 1 && selectedFeature && selectedObjectVisible && (
    (selectedFeature.kind === "sketch" && selectedFeature.purpose === "user" && selectedFeature.profile.shape === "drawn")
    || selectedFeature.kind === "fillet"
    || selectedFeature.kind === "faceExtrude"
    || selectedFeature.kind === "revolve"
    || selectedFeature.kind === "shell"
    || selectedFeature.kind === "mirror"
  ) ? selectedFeature : null;
  const hasActiveWorkplane = !parametricWorkplaneIsGlobal(document.workplane);
  const beginMirrorPlaneSelection = (featureId: string) => {
    setEditingMirrorPlaneId(featureId);
    setPlacingWorkplane(false);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "info", text: t("notice.selectMirrorPlane") });
  };
  const toggleWorkplanePlacement = () => {
    if (hasActiveWorkplane) {
      mutate((draft) => { Object.assign(draft.workplane, globalParametricWorkplanePlacement()); });
      setPlacingWorkplane(false);
      setSelectingTopologyFaces(false);
      setSelectingTopologyEdges(false);
      setSelectedTopologyFaces([]);
      setSelectedTopologyEdges([]);
      setNotice({ type: "ok", text: t("notice.workplaneRestored") });
      return;
    }
    setPlacingWorkplane((current) => !current);
    setEditingMirrorPlaneId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setWorkplaneOpen(false);
    setNotice({ type: "info", text: placingWorkplane ? t("notice.placementCancelled") : t("notice.workplanePlaceHint") });
  };
  const updateGridSettings = (patch: Partial<Pick<ParametricDocument["workplane"], "width" | "depth" | "gridStep" | "snapSpacing" | "gridVisible" | "activeSizePercent">>) => {
    setWorkplaneDraft((current) => ({ ...current, ...patch }));
    mutate((draft) => { Object.assign(draft.workplane, patch); });
  };
  const commitGridNumber = (event: ReactFocusEvent<HTMLInputElement>, key: "width" | "depth" | "gridStep" | "snapSpacing" | "activeSizePercent", minimum: number, maximum: number, fallback: number) => {
    const parsed = Number(event.currentTarget.value.replace(",", "."));
    const entered = key === "activeSizePercent" ? parsed : displayLengthToMillimeters(parsed, displayUnit);
    const value = Math.min(maximum, Math.max(minimum, Number.isFinite(entered) ? entered : fallback));
    event.currentTarget.value = String(key === "activeSizePercent" ? value : millimetersToDisplayLength(value, displayUnit));
    updateGridSettings({ [key]: value });
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

  const toggleShapeMenu = () => {
    if (!shapesOpen) {
      const bounds = shapeMenuTriggerRef.current?.getBoundingClientRect();
      if (bounds) {
        const menuWidth = Math.min(264, window.innerWidth - 20);
        setShapeMenuPosition({
          top: bounds.bottom,
          left: Math.max(10, Math.min(bounds.left, window.innerWidth - menuWidth - 10)),
        });
      }
    }
    setShapesOpen((value) => !value);
  };

  const addShape = (kind: SupportedPrimitive) => {
    let result: ReturnType<typeof addPrimitiveToSelection> = { objectId: "", featureId: null, createdObject: false };
    mutate((draft) => {
      result = addPrimitiveToSelection(draft, selectedObjectId, kind);
      const feature = draft.features.find((candidate) => candidate.id === result.featureId);
      if (feature) feature.name = localizedParametricOperationDefinition(kind, locale).name;
    });
    if (result.featureId) {
      setModelSelection([{ id: result.featureId, kind: "feature" }]);
    }
    setShapesOpen(false);
    setNotice({ type: "ok", text: `${localizedParametricOperationDefinition(kind, locale).name} ${result.createdObject ? t("notice.createdInNewObject") : t("notice.addedToActiveObject")}` });
  };

  const addText = () => {
    let result: ReturnType<typeof addParametricText> | null = null;
    const changed = mutate((draft) => { result = addParametricText(draft, selectedObjectId); });
    const completed = result as ReturnType<typeof addParametricText> | null;
    if (!changed || !completed) return;
    setModelSelection([{ id: completed.extrusionId, kind: "feature" }]);
    setShapesOpen(false);
    setNotice({ type: "ok", text: selectedObjectId ? t("notice.textAdded") : t("notice.textCreated") });
  };

  const removeSelected = useCallback(() => {
    if (!selectedObjectId) return;
    const ids = document.objects.map((object) => object.id);
    const index = ids.indexOf(selectedObjectId);
    if (!mutate((draft) => deleteParametricObject(draft, selectedObjectId))) return;
    const nextId = ids[index - 1] ?? ids[index + 1] ?? null;
    setModelSelection(nextId ? [{ id: nextId, kind: "object" }] : []);
  }, [document, mutate, selectedObjectId]);

  const duplicateSelected = useCallback((sourceId?: string | null) => {
    if (sourceId) {
      let nextId: string | null = null;
      const changed = mutate((draft) => { nextId = duplicateParametricObject(draft, sourceId); });
      if (changed && nextId) {
        setModelSelection([{ id: nextId, kind: "object" }]);
        setNotice({ type: "ok", text: t("notice.shapeDuplicated") });
      }
      return;
    }
    if (modelSelection.length === 0) return;
    let duplicated: ModelTreeSelection[] = [];
    const changed = mutate((draft) => { duplicated = duplicateParametricSelection(draft, modelSelection); });
    if (changed && duplicated.length > 0) {
      setModelSelection(duplicated);
      setNotice({ type: "ok", text: t("notice.shapeDuplicated") });
    }
  }, [modelSelection, mutate]);

  const deleteFeature = useCallback((id: string) => {
    let result: ReturnType<typeof deleteParametricFeature> = { objectId: null, nextId: null };
    const deleted = mutate((draft) => {
      result = deleteParametricFeature(draft, id);
    });
    if (!deleted) return;
    const nextId = result.nextId ?? result.objectId;
    setModelSelection(nextId ? [{ id: nextId, kind: result.nextId && result.nextId !== result.objectId ? "feature" : "object" }] : []);
    setNotice({ type: "ok", text: t("notice.operationDeleted") });
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
    setNotice({ type: "ok", text: `${modelSelection.length} ${t("notice.itemsDeleted")}` });
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
          if (deleteCurrentSketchSelection()) event.preventDefault();
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
      if (object) {
        const previousTransform = structuredClone(object.transform);
        update(object);
        transformParametricObjectTopologyHints(draft, id, previousTransform);
      }
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

  const resetSelectedFeature = (featureId: string) => {
    if (!mutate((draft) => resetParametricFeature(draft, featureId))) return;
    setNotice({ type: "ok", text: t("notice.operationReset") });
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
      ? { type: "ok", text: `${moved} ${t(moved === 1 ? "notice.alignedWithSingle" : "notice.alignedWith")} ${reference?.name ?? t("notice.reference")}` }
      : { type: "info", text: t("notice.noMovableAlignment") });
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));
  const undo = () => setHistory(undoParametricHistory);
  const redo = () => setHistory(redoParametricHistory);

  const newDocument = () => {
    const next = createEmptyDocument();
    localizeNewDocumentEntries({ ...next, objects: [], features: [] }, next, locale);
    next.name = locale === "es" ? "Nuevo diseño" : "New design";
    setHistory(createParametricHistory(next));
    setModelSelection(next.objects[0] ? [{ id: next.objects[0].id, kind: "object" }] : []);
    setCamera("home");
    setNotice({ type: "info", text: t("notice.newDesign") });
    setNewDocumentOpen(false);
  };

  const openExportFromNewDocumentWarning = () => {
    setNewDocumentOpen(false);
    setExportFileName(document.name);
    setExportOpen(true);
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
    setNotice({ type: "info", text: t("notice.topologyHint") });
  };

  const cancelEdgeTreatment = () => {
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setNotice({ type: "info", text: t("notice.temporaryCancelled") });
  };

  const acceptEdgeTreatment = () => {
    const selection = [...selectedTopologyFaces, ...selectedTopologyEdges];
    const objectIds = [...new Set(selection.map((reference) => reference.objectId))];
    if (!pendingEdgeTreatment || selection.length === 0 || objectIds.length !== 1) {
      setNotice({ type: "error", text: t("notice.selectTopologySameObject") });
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
    setNotice({ type: "ok", text: `${t(pendingEdgeTreatment === "chamfer" ? "operation.chamfer" : "operation.fillet")} ${t("notice.parametric")} ${t(editingEdgeTreatmentId ? "notice.updated" : "notice.added")} · ${selection.length} ${t(selection.length === 1 ? "notice.element" : "notice.elements")}` });
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
    setNotice({ type: "info", text: t("notice.selectPlanarFaceExtrude") });
  };

  const cancelFaceExtrude = () => {
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "info", text: t("notice.faceExtrudeCancelled") });
  };

  const acceptFaceExtrude = () => {
    const reference = selectedTopologyFaces[0];
    if (!pendingFaceExtrude || !reference) {
      setNotice({ type: "error", text: t("notice.selectPlanarFace") });
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
    setNotice({ type: "ok", text: `${t(pendingFaceExtrude.operation === "cut" ? "operation.facePocket" : "operation.faceExtrude")} ${t(editingFaceExtrudeId ? "notice.updated" : "notice.added")}` });
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
    setNotice({ type: "info", text: t("notice.selectOpenFaces") });
  };

  const cancelShell = () => {
    setPendingShell(null);
    setEditingShellId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "info", text: t("notice.temporaryCancelled") });
  };

  const acceptShell = () => {
    if (!pendingShell || selectedTopologyFaces.length === 0 || new Set(selectedTopologyFaces.map((reference) => reference.objectId)).size !== 1) {
      setNotice({ type: "error", text: t("notice.selectFacesSameObject") });
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
    setNotice({ type: "ok", text: `${t("toolbar.shell")} ${t(editingShellId ? "notice.updated" : "notice.added")}` });
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
    setNotice({ type: "info", text: t("notice.selectPlanarFaceRevolve") });
  };

  const beginRevolveAxisEdit = (featureId: string) => {
    const revolve = document.features.find((candidate): candidate is RevolveFeature => candidate.id === featureId && candidate.kind === "revolve");
    const sketch = revolve?.kind === "revolve" && revolve.source === "sketch"
      ? document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === revolve.sketchId && candidate.profile.shape === "drawn")
      : null;
    if (!revolve || revolve.source !== "sketch" || !sketch || sketch.profile.shape !== "drawn") {
      beginRevolve(featureId, "axis");
      return;
    }
    const profile = cloneSketchProfile(sketch.profile.geometry);
    setSketchSession({ featureId: sketch.id, objectId: sketch.objectId ?? null, profile, mode: "sketch", revolveAxisFeatureId: revolve.id });
    sketchHistoryRef.current = [cloneSketchProfile(profile)];
    sketchHistoryIndexRef.current = 0;
    setSketchHistoryIndex(0);
    setSketchTool("select");
    setSketchActivePointId(null);
    setSketchSelection(revolve.sketchAxisSegmentId ? { kind: "segment", id: revolve.sketchAxisSegmentId } : null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    setModelSidebarMode("hidden");
    setNotice({ type: "info", text: locale === "es" ? "Selecciona una arista recta del boceto y acepta." : "Select a straight sketch edge and accept." });
  };

  const cancelRevolve = () => {
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "info", text: t("notice.revolveCancelled") });
  };

  const acceptRevolve = () => {
    const reference = selectedTopologyFaces[0];
    if (!pendingRevolve || !reference || (pendingRevolve.axis === "edge" && selectedTopologyEdges.length !== 1)) {
      setNotice({ type: "error", text: t(pendingRevolve?.axis === "edge" ? "notice.selectPlanarFaceAndAxis" : "notice.selectPlanarFace") });
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
    setNotice({ type: "ok", text: `${t("operation.revolve")} ${t(editingRevolveId ? "notice.updatedFeminine" : "notice.addedFeminine")}` });
  };

  const selectTopologyFace = (face: TopologyFacePick) => {
    if ((pendingFaceExtrude || pendingRevolve) && !face.planar) {
      setNotice({ type: "error", text: pendingRevolve ? t("notice.revolvePlanar") : t("notice.faceExtrudePlanar") });
      return;
    }
    const objectOperations = document.features.filter((feature) => feature.objectId === face.objectId && feature.kind !== "sketch");
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    const editingIndex = editingFeatureId ? objectOperations.findIndex((feature) => feature.id === editingFeatureId) : -1;
    const source = editingIndex >= 0 ? objectOperations[editingIndex - 1] ?? null : lastOperationForObject(document, face.objectId);
    if (!source) return;
    const reference: ParametricTopologyReference = {
      id: `selected-face-${face.key}`,
      name: `${locale === "es" ? "Cara de" : "Face of"} ${source.name}`,
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
      if (!face.selected) return current.filter((candidate) => !parametricTopologySelectionsMatch(candidate, reference));
      return current.some((candidate) => parametricTopologySelectionsMatch(candidate, reference)) ? current : [...current, reference];
    });
  };

  const selectTopologyEdge = (edge: TopologyEdgePick) => {
    if (pendingRevolve && !edge.straight) {
      setNotice({ type: "error", text: t("notice.revolveStraightAxis") });
      return;
    }
    const objectOperations = document.features.filter((feature) => feature.objectId === edge.objectId && feature.kind !== "sketch");
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    const editingIndex = editingFeatureId ? objectOperations.findIndex((feature) => feature.id === editingFeatureId) : -1;
    const source = editingIndex >= 0 ? objectOperations[editingIndex - 1] ?? null : lastOperationForObject(document, edge.objectId);
    if (!source) return;
    const reference: ParametricTopologyReference = {
      id: `selected-edge-${edge.key}`,
      name: `${locale === "es" ? "Arista de" : "Edge of"} ${source.name}`,
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
      if (!edge.selected) return current.filter((candidate) => !parametricTopologySelectionsMatch(candidate, reference));
      return current.some((candidate) => parametricTopologySelectionsMatch(candidate, reference)) ? current : [...current, reference];
    });
  };

  const exportProject = async () => {
    setProjectExporting(true);
    try {
      const bytes = await exportEducadProject(document);
      const archive = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      downloadBlob(new Blob([archive], { type: EDUCAD_PACKAGE_MEDIA_TYPE }), `${fileName(exportFileName)}.educad`);
      setNotice({ type: "ok", text: t("notice.projectSaved") });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.saveFailed") });
    } finally {
      setProjectExporting(false);
    }
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      downloadBlob(await exportParametricStep(document), `${fileName(exportFileName)}.step`);
      setNotice({ type: "ok", text: t("notice.stepExported") });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.exportFailed") });
    } finally {
      setExporting(false);
    }
  };

  const exportStl = async () => {
    setStlExporting(true);
    try {
      const meshes = await buildParametricStlMeshes(document, stlQuality);
      if (meshes.length === 0) {
        setNotice({ type: "error", text: t("notice.noObjectsToExport") });
        return;
      }
      const buffer = binaryStlFromRenderMeshes(meshes, exportFileName);
      downloadBlob(new Blob([buffer], { type: "model/stl" }), `${fileName(exportFileName)}.stl`);
      setNotice({ type: "ok", text: `${t("notice.binaryStlExported")} · ${build.objectRecords.length} ${t(build.objectRecords.length === 1 ? "dialog.object" : "dialog.objects")}` });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.stlExportFailed") });
    } finally {
      setStlExporting(false);
    }
  };

  const importProject = async (file: File) => {
    try {
      const packagedByName = file.name.toLowerCase().endsWith(".educad");
      if (packagedByName ? file.size > EDUCAD_PACKAGE_LIMITS.archiveBytes : file.size > EDUCAD_PACKAGE_LIMITS.projectBytes) throw new Error(t(packagedByName ? "notice.archiveTooLarge" : "notice.documentTooLarge"));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const packaged = file.name.toLowerCase().endsWith(".educad") || bytes[0] === 0x50 && bytes[1] === 0x4b;
      let normalized: ParametricDocument;
      let assetCount = 0;
      if (packaged) {
        const restored = await importEducadProject(bytes);
        normalized = restored.document;
        assetCount = restored.assets.length;
      } else {
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        if (!validateDocument(parsed)) throw new Error(t("notice.incompatibleProject"));
        normalized = normalizeParametricDocument(parsed);
      }
      setPendingProjectImport({ document: normalized, assetCount, fileName: file.name });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.openFailed") });
    }
  };

  const openPendingProject = () => {
    if (!pendingProjectImport) return;
    const opened = pendingProjectImport.document;
    setHistory(createParametricHistory(opened));
    setModelSelection(opened.objects[0] ? [{ id: opened.objects[0].id, kind: "object" }] : []);
    setNotice({ type: "ok", text: pendingProjectImport.assetCount ? `${t("notice.projectOpened")} · ${pendingProjectImport.assetCount} ${t(pendingProjectImport.assetCount === 1 ? "notice.resource" : "notice.resources")}` : t("notice.projectOpened") });
    setPendingProjectImport(null);
  };

  const mergePendingProject = () => {
    if (!pendingProjectImport) return;
    try {
      const merged = mergeParametricProjects(document, pendingProjectImport.document);
      commit(merged.document);
      setModelSelection(merged.importedObjectIds.map((id) => ({ id, kind: "object" as const })));
      setNotice({ type: "ok", text: `${merged.importedObjectIds.length} ${t(merged.importedObjectIds.length === 1 ? "notice.projectAddedSingle" : "notice.projectAdded")}` });
      setPendingProjectImport(null);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.addProjectFailed") });
    }
  };

  const importManagedFile = async (file: File) => {
    if (/\.(?:stl|obj)$/i.test(file.name)) {
      try {
        assertImportByteLimit("reference", file.size);
        const draft = cloneDocument(document);
        const objectId = importReferenceMesh(draft, file.name, await file.arrayBuffer());
        commit(draft);
        setModelSelection([{ id: objectId, kind: "object" }]);
        setNotice({ type: "ok", text: `${file.name.toLowerCase().endsWith(".obj") ? "OBJ" : "STL"} ${t("notice.referenceImported")}` });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.referenceImportFailed") });
      }
      return;
    }
    if (/\.(?:step|stp)$/i.test(file.name)) {
      try {
        assertImportByteLimit("STEP", file.size);
        setNotice({ type: "info", text: t("notice.importingStep") });
        const draft = cloneDocument(document);
        const imported = await importStepAsParametricObject(draft, file.name, await file.arrayBuffer());
        commit(draft);
        setModelSelection([{ id: imported.featureId, kind: "feature" }]);
        setNotice({ type: "ok", text: t("notice.stepImported") });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.stepImportFailed") });
      }
      return;
    }
    if (file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml") {
      try {
        assertImportByteLimit("SVG", file.size);
        const awaitSource = await file.text();
        let result: ReturnType<typeof importSvgAsParametricExtrusion> | null = null;
        const changed = mutate((draft) => { result = importSvgAsParametricExtrusion(draft, awaitSource, file.name, selectedObjectId); });
        const completed = result as ReturnType<typeof importSvgAsParametricExtrusion> | null;
        if (!changed || !completed) return;
        setModelSelection([{ id: completed.extrusionId, kind: "feature" }]);
        setNotice({ type: "ok", text: `${t("notice.svgImported")} · ${completed.segmentCount} ${t("notice.segments")} · ${completed.circleCount} ${t("notice.circles")}` });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.svgImportFailed") });
      }
      return;
    }
    await importProject(file);
  };

  if (!hydrated) {
    return <main className="educad-reference-shell" aria-busy="true"><div className="editor-loading-screen"><div className="editor-loading-toolbar" /><div className="educad-initial-loading" role="status" aria-live="polite" aria-atomic="true">{t("status.loadingWorkspace")}</div></div></main>;
  }

  return (
    <main className={`educad-reference-shell sidebar-${modelSidebarMode}`}>
      <div className="secondary-toolbar">
        <div className="toolbar-workspace-tabs educad-toolbar-titlebar">
          {onExitToProjects ? <button className="educad-toolbar-brand educad-toolbar-brand-button" type="button" onClick={() => onExitToProjects(latestDocumentRef.current)} title="Back to projects">{'<'} back</button> : null}
          <span className="educad-project-name"><img src="/assets/educad/logo.svg" alt="" /><strong>eduCAD</strong><span> - {document.name}</span></span>
        </div>
        {sketchSession ? <div className="sketch-toolbar-ribbon educad-parametric-sketch-toolbar" aria-label={t("sketch.tools")}>
          <ToolbarSection label={t("sketch.history")}>
            <Tool label={t("sketch.undo")} enabled={sketchHistoryIndex > 0} onClick={sketchUndo}><SketchToolbarIcon file="undo" /></Tool>
            <Tool label={t("sketch.redo")} enabled={sketchHistoryIndex >= 0 && sketchHistoryIndex < sketchHistoryRef.current.length - 1} onClick={sketchRedo}><SketchToolbarIcon file="redo" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.draw")}>
            <Tool label={t("sketch.line")} active={sketchTool === "line"} onClick={() => chooseSketchTool("line")}><SketchToolbarIcon file="line" /></Tool>
            <Tool label={t("sketch.bezier")} active={sketchTool === "bezier"} onClick={() => chooseSketchTool("bezier")}><SketchToolbarIcon file="bezier" /></Tool>
            <Tool label={t("sketch.smoothCurve")} active={sketchTool === "smooth"} onClick={() => chooseSketchTool("smooth")}><SketchToolbarIcon file="smooth-curve" /></Tool>
            <Tool label={t("sketch.freehand")} active={sketchTool === "freehand"} onClick={() => chooseSketchTool("freehand")}><SketchToolbarIcon file="freehand" /></Tool>
            <Tool label={t("sketch.smoothFreehand")} active={sketchTool === "freehandSmooth"} onClick={() => chooseSketchTool("freehandSmooth")}><SketchToolbarIcon file="smooth-freehand" /></Tool>
            <Tool label={t("sketch.circle")} active={sketchTool === "circle"} onClick={() => chooseSketchTool("circle")}><SketchToolbarIcon file="circle" /></Tool>
            <Tool label={t("sketch.centerArc")} active={sketchTool === "arc"} onClick={() => chooseSketchTool("arc")}><SketchToolbarIcon file="center-arc" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.edit")}>
            <Tool label={t("sketch.select")} active={sketchTool === "select"} onClick={() => chooseSketchTool("select")}><SketchToolbarIcon file="select" /></Tool>
            <Tool label={t("sketch.refine")} active={sketchTool === "refine"} onClick={() => chooseSketchTool("refine")}><SketchToolbarIcon file="refine" /></Tool>
            <Tool label={t("sketch.trim")} active={sketchTool === "trim"} onClick={() => chooseSketchTool("trim")}><SketchToolbarIcon file="trim" /></Tool>
            <Tool label={sketchSelection ? t("sketch.eraseSelection") : t("sketch.erase")} active={!sketchSelection && sketchTool === "erase"} onClick={() => { if (!deleteCurrentSketchSelection()) chooseSketchTool("erase"); }}><SketchToolbarIcon file="erase" /></Tool>
            <Tool label={t("sketch.construction")} enabled={selectedConstructionIds.segmentIds.length + selectedConstructionIds.circleIds.length > 0} active={selectedConstructionIds.allConstruction} onClick={toggleSketchConstruction}><SketchToolbarIcon file="construction" /></Tool>
            <Tool label={t("sketch.mergePoints")} enabled={mergeableSketchPointIds.length === 2} onClick={mergeSelectedSketchPoints}><SketchToolbarIcon file="merge-points" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.point")}>
            <Tool label={t("sketch.corner")} enabled={Boolean(selectedSketchPoint)} active={selectedSketchPoint?.mode === "corner" || Boolean(selectedSketchPoint && !selectedSketchPoint.mode)} onClick={() => selectedSketchPoint && setSketchPointMode(selectedSketchPoint.id, "corner")}><SketchToolbarIcon file="corner" /></Tool>
            <Tool label={t("sketch.smooth")} enabled={Boolean(selectedSketchPoint)} active={selectedSketchPoint?.mode === "smooth"} onClick={() => selectedSketchPoint && setSketchPointMode(selectedSketchPoint.id, "smooth")}><SketchToolbarIcon file="smooth-point" /></Tool>
            <Tool label={t("sketch.splitHandles")} enabled={Boolean(selectedSketchPoint)} active={selectedSketchPoint?.mode === "split"} onClick={() => selectedSketchPoint && setSketchPointMode(selectedSketchPoint.id, "split")}><SketchToolbarIcon file="split-handles" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.inspect")}>
            <Tool label={t("sketch.measure")} active={sketchTool === "measure"} onClick={() => chooseSketchTool("measure")}><SketchToolbarIcon file="measure" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.import")}>
            <Tool label={t("sketch.importSvg")} onClick={() => sketchSvgImportRef.current?.click()}><SketchToolbarIcon file="import-svg" /></Tool>
          </ToolbarSection>
          <div className="toolbar-spacer" />
          <div className="educad-sketch-finish-actions"><button className="educad-sketch-action primary" type="button" onClick={acceptSketch}><SketchToolbarIcon file="accept" /><span>{t("sketch.accept")}</span></button><button className="educad-sketch-action" type="button" onClick={cancelSketch}><SketchToolbarIcon file="cancel" /><span>{t("common.cancel")}</span></button></div>
        </div> :
        <div className="toolbar-mode-content geometry">
          <div className="tool-group left">
            <ToolbarSection label={t("toolbar.history")}>
              <Tool label={t("toolbar.undo")} enabled={history.index > 0} onClick={undo}><ToolbarUndoIcon /></Tool>
              <Tool label={t("toolbar.redo")} enabled={history.index < history.entries.length - 1} onClick={redo}><ToolbarRedoIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label={t("toolbar.clipboard")}>
              <Tool label={t("toolbar.copy")} enabled={Boolean(selectedObjectId)} onClick={() => { setClipboardId(selectedObjectId); setNotice({ type: "info", text: t("notice.objectCopied") }); }}><ToolbarCopyIcon /></Tool>
              <Tool label={t("toolbar.paste")} enabled={Boolean(clipboardId)} onClick={() => duplicateSelected(clipboardId)}><ToolbarPasteIcon /></Tool>
              <Tool label={t("toolbar.duplicate")} enabled={Boolean(selectedObjectId)} onClick={() => duplicateSelected()}><ToolbarDuplicateIcon /></Tool>
              <Tool label={modelSelection.length > 1 ? t("toolbar.deleteSelection") : selectionKind === "feature" ? t("toolbar.deleteOperation") : t("toolbar.deleteObject")} enabled={modelSelection.length > 0} onClick={deleteCurrentSelection}><ToolbarTrashIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label={t("toolbar.manipulators")}>
              <Tool label={t("camera.positionTriad")} active={showPositionTriad} onClick={() => setShowPositionTriad((visible) => !visible)}><ToolbarPositionManipulatorIcon /></Tool>
              <Tool label={t("camera.rotationTriad")} active={showRotationTriad} onClick={() => setShowRotationTriad((visible) => !visible)}><ToolbarRotationManipulatorIcon /></Tool>
              <Tool className="educad-parameter-handles-toggle" label={t("camera.parameterHandles")} active={showParameterHandles} onClick={() => setShowParameterHandles((visible) => !visible)}><ToolbarParameterManipulatorIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label={t("toolbar.shapes")} className="toolbar-shapes-section">
              <button ref={shapeMenuTriggerRef} data-educad-popup="shapes" className={`shape-menu-trigger ${shapesOpen ? "active" : ""}`} aria-label={t("toolbar.addShape")} title={t("toolbar.addShape")} aria-expanded={shapesOpen} aria-controls="educad-shape-menu" onClick={toggleShapeMenu}><ToolbarShapeAddIcon /></button>
              <Tool label={t("toolbar.createSketch")} onClick={() => { setShapesOpen(false); beginSketch(null); }}><ToolbarSketchIcon /></Tool>
            </ToolbarSection>
          </div>
            <ToolbarSection label={t("toolbar.modify")} className="toolbar-modify-section">
              <Tool label={t("toolbar.chamfer")} active={pendingEdgeTreatment === "chamfer"} onClick={() => beginEdgeTreatment("chamfer")}><ToolbarChamferIcon /></Tool>
              <Tool label={t("toolbar.fillet")} active={pendingEdgeTreatment === "fillet"} onClick={() => beginEdgeTreatment("fillet")}><ToolbarFilletIcon /></Tool>
              <Tool label={selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? t("toolbar.extrudeSketch") : t("toolbar.extrudeFace")} active={Boolean(pendingFaceExtrude)} onClick={() => selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? addExtrudeFromSketch(selectedFeature) : beginFaceExtrude("add")}><ToolbarExtrudeIcon /></Tool>
              <Tool label={selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? t("toolbar.revolveSketch") : t("toolbar.revolve")} active={Boolean(pendingRevolve)} onClick={() => selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? addRevolveFromSketch(selectedFeature) : beginRevolve()}><ToolbarRevolveIcon /></Tool>
              <Tool label={t("toolbar.shell")} active={Boolean(pendingShell)} onClick={() => beginShell()}><ToolbarShellIcon /></Tool>
              <Tool label={t("toolbar.mirror")} enabled={Boolean(selectedObjectId)} onClick={addMirrorOperation}><ToolbarMirrorIcon /></Tool>
              <Tool label={t("toolbar.linearPattern")} enabled={Boolean(selectedObjectId)} onClick={addLinearPatternOperation}><ToolbarLinearPatternIcon /></Tool>
              <Tool label={t("toolbar.polarPattern")} enabled={Boolean(selectedObjectId)} onClick={addPolarPatternOperation}><ToolbarPolarPatternIcon /></Tool>
              <Tool label={t("toolbar.objectBoolean")} enabled={Boolean(selectedObjectId && document.objects.some((object) => object.id !== selectedObjectId))} onClick={addObjectBooleanOperation}><ToolbarObjectBooleanIcon /></Tool>
              <div data-educad-popup="align" className="educad-align-tool">
                <Tool label={t("toolbar.align")} enabled={modelSelection.length > 1} active={alignOpen} onClick={() => setAlignOpen((value) => !value)}><ToolbarAlignIcon /></Tool>
                {alignOpen ? <div className="educad-align-popover" role="dialog" aria-label={t("align.title")}>
                  <header><strong>{t("align.action")}</strong><span>{t("align.referenceLast")}</span></header>
                  <div className="educad-align-grid"><div className="educad-align-head"><span /><strong>{t("align.minimum")}</strong><strong>{t("align.center")}</strong><strong>{t("align.maximum")}</strong></div>
                    {(["x", "y", "z"] as const).map((axis) => <div className="educad-align-row" key={axis}><strong className={`axis-${axis}`}>{axis.toUpperCase()}</strong>{(["min", "center", "max"] as const).map((anchor) => <button key={anchor} onClick={() => alignSelection(axis, anchor)} aria-label={`${t("align.action")} ${axis.toUpperCase()} · ${anchor === "min" ? t("align.minimum") : anchor === "center" ? t("align.center") : t("align.maximum")}`}>{anchor === "min" ? "◧←" : anchor === "center" ? "◫" : "→◧"}</button>)}</div>)}
                  </div>
                </div> : null}
              </div>
              <Tool label={t("toolbar.snapGrid")} enabled={Boolean(selectedShape && document.workplane.snapToGrid)} onClick={() => selectedObjectId && mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, { x: Math.round((selectedShape?.x ?? 0) / snapAmount) * snapAmount, z: Math.round((selectedShape?.z ?? 0) / snapAmount) * snapAmount }))}><ToolbarSnapGridIcon /></Tool>
              <Tool label={t("toolbar.dropToWorkplane")} enabled={Boolean(selectedShape)} onClick={() => updateSelected({ elevation: 0 })}><ToolbarDropToWorkplaneIcon /></Tool>
            </ToolbarSection>
          <div className="toolbar-spacer" />
          <ToolbarSection label={t("toolbar.manage")} className="toolbar-actions-section">
            <div className="action-buttons">
              <button className="action-icon-button" aria-label={t("toolbar.import")} title={t("toolbar.import")} onClick={() => importRef.current?.click()}><ToolbarImportIcon /></button>
              <button data-educad-popup="export" className="action-icon-button" aria-label={t("toolbar.export")} title={t("toolbar.export")} onClick={() => { if (!exportOpen) setExportFileName(document.name); setExportOpen((value) => !value); }}><ToolbarVectorExportIcon /></button>
              <button data-educad-popup="settings" className="action-icon-button" aria-label={t("toolbar.settings")} title={t("toolbar.settings")} onClick={() => setSettingsOpen((value) => !value)}><ToolbarSettingsIcon /></button>
            </div>
          </ToolbarSection>
        </div>}
      </div>

      {shapesOpen ? <div id="educad-shape-menu" data-educad-popup="shapes" className="shape-menu-dropdown detached" style={{ top: shapeMenuPosition.top, left: shapeMenuPosition.left }}>
        <div className="shape-menu-title">{t("toolbar.shapes")}</div>
        <div className="shape-menu-list">
          {parametricOperationCatalog.map((asset) => { const localized = localizedParametricOperationDefinition(asset.kind, locale); return <button className="shape-menu-item" key={asset.kind} onClick={() => addShape(asset.kind)}><img src={asset.menuIcon} alt="" /><span>{localized.name}<small>{selectedObjectId ? t("notice.newOperationInObject") : localized.description}</small></span></button>; })}
          <button className="shape-menu-item" onClick={addText}><img src="/assets/sketchforge/shape-icons-gray/raw/text.png" alt="" /><span>{t("toolbar.text")}<small>{selectedObjectId ? t("toolbar.textInObject") : t("toolbar.extrudedText")}</small></span></button>
        </div>
      </div> : null}

      <section className={`educad-workplane-stage ${sketchSession ? "sketch-active" : ""} ${challengeEditor ? "challenge-authoring" : ""} ${(challenge || challengeEditor) && challengeOpen && !sketchSession ? `challenge-docked-${challengeDock}` : ""}`}>
        {showFps ? <FpsCounter /> : null}
        {backgroundProcessLabel ? <BackgroundProcessIndicator label={backgroundProcessLabel} rightOffset={viewportOverlayRightOffset} regenerating={!stlExporting && !exporting && kernelBusy} /> : null}
        {sketchSession ? <SketchWorkspace
          locale={locale}
          profile={sketchSession.profile}
          profileValidation={activeSketchProfileValidation}
          operation="extrude"
          referenceShapes={[]}
          sceneReference={sketchSceneReference}
          tool={sketchTool}
          activePointId={sketchActivePointId}
          selected={sketchSelection}
          measurement={sketchMeasurement}
          pendingMeasurementStart={sketchMeasureStart}
          onCancelActiveTool={() => chooseSketchTool("select")}
          initialSnap={closestSketchGrid(document.workplane.snapSpacing, document.workplane.snapToGrid)}
          exactSnapStep={document.workplane.snapToGrid ? document.workplane.snapSpacing : 0}
          initialWorkspace={{ ...DEFAULT_WORKPLANE_WORKSPACE, units: displayUnit === "in" ? "Imperial" : "Metric (Default)", scale: displayUnit === "in" ? "1:1 (inches)" : "1:1 (millimeters)", width: document.workplane.width, depth: document.workplane.depth, sizePreset: `${document.workplane.width} x ${document.workplane.depth} mm`, gridBlockSize: document.workplane.gridStep, gridBlockPreset: `${document.workplane.gridStep} mm`, showGrid: document.workplane.gridVisible }}
          onPlanePoint={addSketchPoint}
          onFreehandContour={(points, smooth) => {
            try {
              setSketchProfile((profile) => appendScribbleContour(profile, points, profile.generator?.kind === "scribble" ? profile.generator.smoothing : 0.8, smooth));
              setSketchTool(smooth ? "freehandSmooth" : "freehand");
            } catch (error) {
              setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.freehandFailed") });
            }
          }}
          onPointPress={pressSketchPoint}
          onSelectSegment={(id, additive = false) => {
            if (!additive || !sketchSelection) setSketchSelection({ kind: "segment", id });
            else if (sketchSelection.kind === "segment" && sketchSelection.id === id) setSketchSelection(null);
            else {
              const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
                : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
                : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
                : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
              const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
              const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
              const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
              const nextSegmentIds = segmentIds.includes(id) ? segmentIds.filter((candidate) => candidate !== id) : [...segmentIds, id];
              setSketchSelection(pointIds.length || nextSegmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds, segmentIds: nextSegmentIds, circleIds, imageIds } : null);
            }
            setSketchActivePointId(null);
          }}
          onSelectMany={(pointIds, segmentIds, imageIds, circleIds = []) => setSketchSelection(pointIds.length || segmentIds.length || imageIds.length || circleIds.length ? { kind: "multiple", pointIds, segmentIds, imageIds, circleIds } : null)}
          onAddCircle={(circle) => {
            const id = sketchEntityId("circle");
            setSketchProfile((profile) => ({ ...profile, circles: [...(profile.circles ?? []), { ...circle, id }] }));
            setSketchSelection({ kind: "circle", id });
            setSketchTool("select");
          }}
          onAddArc={({ center, start, end, clockwise }) => {
            const segmentId = sketchEntityId("arc");
            setSketchProfile((profile) => {
              const findOrAddPoint = (position: { x: number; z: number }) => {
                const existing = profile.points.find((point) => Math.hypot(point.x - position.x, point.z - position.z) < 0.0001);
                if (existing) return existing.id;
                const point: SketchPoint = { id: sketchEntityId("point"), ...position, mode: "corner" };
                profile.points.push(point);
                return point.id;
              };
              const startId = findOrAddPoint(start);
              const endId = findOrAddPoint(end);
              return { ...profile, segments: [...profile.segments, { id: segmentId, startId, endId, kind: "arc", center: { ...center }, clockwise }] };
            });
            setSketchSelection({ kind: "segment", id: segmentId });
            setSketchTool("select");
          }}
          onMoveArcCenter={(segmentId, center) => setSketchProfile((profile) => {
            const next = cloneSketchProfile(profile);
            const segment = next.segments.find((candidate) => candidate.id === segmentId && candidate.kind === "arc" && candidate.center);
            if (!segment?.center) return profile;
            const dx = center.x - segment.center.x;
            const dz = center.z - segment.center.z;
            segment.center = { ...center };
            for (const point of next.points) {
              if (point.id !== segment.startId && point.id !== segment.endId) continue;
              point.x += dx;
              point.z += dz;
            }
            return solveSketchConstraints(next, arcSketchPointId(segmentId));
          })}
          onSelectArcPoint={selectSketchArcPoint}
          onSelectCircle={(id, additive = false) => {
            if (!additive || !sketchSelection) setSketchSelection({ kind: "circle", id });
            else if (sketchSelection.kind === "circle" && sketchSelection.id === id) setSketchSelection(null);
            else {
              const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
                : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
                : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
                : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
              const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
              const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
              const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
              const nextCircleIds = circleIds.includes(id) ? circleIds.filter((candidate) => candidate !== id) : [...circleIds, id];
              setSketchSelection(pointIds.length || segmentIds.length || nextCircleIds.length || imageIds.length ? { kind: "multiple", pointIds, segmentIds, circleIds: nextCircleIds, imageIds } : null);
            }
            setSketchActivePointId(null);
          }}
          onSelectCirclePoint={selectSketchCirclePoint}
          onDeleteCircle={(id) => { setSketchProfile((profile) => {
            const virtualIds = new Set([circleSketchPointId(id, "center"), circleSketchPointId(id, "radius")]);
            return { ...profile, circles: (profile.circles ?? []).filter((circle) => circle.id !== id), constraints: (profile.constraints ?? []).filter((constraint) => {
              if ((constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === id) return false;
              if ((constraint.kind === "concentric" || constraint.kind === "equalRadius") && constraint.circleIds.includes(id)) return false;
              return ![...virtualIds].some((pointId) => sketchConstraintUsesPoint(constraint, pointId));
            }) };
          }); setSketchSelection(null); }}
          onTrimCircle={(id, point) => trimSketchEntity({ kind: "circle", id }, point)}
          onMoveCircle={(id, center) => setSketchProfile((profile) => {
            const next = cloneSketchProfile(profile);
            const circle = next.circles?.find((candidate) => candidate.id === id);
            if (!circle) return profile;
            Object.assign(circle, center);
            return solveSketchConstraints(next, circleSketchPointId(id, "center"));
          })}
          onResizeCircle={(id, radius, angle) => setSketchProfile((profile) => {
            const value = Math.max(0.01, radius);
            const next = cloneSketchProfile(profile);
            const circle = next.circles?.find((candidate) => candidate.id === id);
            if (!circle) return profile;
            circle.radius = value;
            circle.radiusAngle = angle;
            next.constraints = (next.constraints ?? []).map((constraint) => (constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === id ? { ...constraint, value: constraint.kind === "diameter" ? value * 2 : value } : constraint);
            return solveSketchConstraints(next, circleSketchPointId(id, "radius"));
          })}
          onSelectImage={(id) => setSketchSelection({ kind: "image", id })}
          onUpdateImage={(id, update) => setSketchProfile((profile) => ({ ...profile, images: (profile.images ?? []).map((image) => image.id === id ? { ...image, ...update } : image) }))}
          onDeleteImage={(id) => setSketchProfile((profile) => ({ ...profile, images: (profile.images ?? []).filter((image) => image.id !== id) }))}
          onDeletePoint={deleteSketchPoint}
          onDeleteSegment={deleteSketchSegment}
          onTrimSegment={(id, point) => trimSketchEntity({ kind: "segment", id }, point)}
          onMovePoint={(id, position) => setSketchProfile((profile) => {
            const next = cloneSketchProfile(profile);
            const source = next.points.find((point) => point.id === id);
            if (!source) return profile;
            let target = { ...position };
            const endingArc = next.segments.find((segment) => segment.kind === "arc" && segment.center && segment.endId === id);
            if (endingArc?.center) {
              const start = next.points.find((point) => point.id === endingArc.startId);
              if (start) {
                const radius = Math.hypot(start.x - endingArc.center.x, start.z - endingArc.center.z);
                const angle = Math.atan2(target.z - endingArc.center.z, target.x - endingArc.center.x);
                target = { x: endingArc.center.x + Math.cos(angle) * radius, z: endingArc.center.z + Math.sin(angle) * radius };
              }
            }
            const dx = target.x - source.x;
            const dz = target.z - source.z;
            Object.assign(source, target, { handleIn: source.handleIn ? { x: source.handleIn.x + dx, z: source.handleIn.z + dz } : undefined, handleOut: source.handleOut ? { x: source.handleOut.x + dx, z: source.handleOut.z + dz } : undefined });
            for (const arc of next.segments.filter((segment) => segment.kind === "arc" && segment.center && segment.startId === id)) {
              const end = next.points.find((point) => point.id === arc.endId);
              if (!end || !arc.center) continue;
              const radius = Math.hypot(source.x - arc.center.x, source.z - arc.center.z);
              const angle = Math.atan2(end.z - arc.center.z, end.x - arc.center.x);
              end.x = arc.center.x + Math.cos(angle) * radius;
              end.z = arc.center.z + Math.sin(angle) * radius;
            }
            return solveSketchConstraints(next, id);
          })}
          onMoveHandle={moveSketchHandle}
          onInsertPoint={insertSketchPoint}
          onSetPointMode={setSketchPointMode}
          onUpdateConstraintValue={updateSketchConstraintValue}
          onDeleteConstraint={deleteSketchConstraint}
          onClearMeasurement={() => { setSketchMeasurement(null); setSketchMeasureStart(null); }}
          showPointActions={false}
          showGridControls={false}
        /> : <ParametricViewport
          onThumbnail={(dataUrl) => {
            const stepId = challengeCaptureStepRef.current;
            if (stepId) {
              challengeCaptureStepRef.current = null;
              setChallengeCapture({ stepId, dataUrl, token: challengeCaptureToken });
            } else onProjectThumbnail?.(dataUrl);
          }}
          thumbnailRequestToken={challengeCaptureToken}
          thumbnailRequestOptions={challengeEditor ? { includeOverlays: true, width: 1200, height: 750, quality: 0.92 } : undefined}
          mesh={viewportObjectRecords.length > 0 ? ((editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && topologySelectionBuild ? topologySelectionBuild : build).mesh : null}
          objectRecords={viewportObjectRecords}
          objectColors={objectColors}
          objectOrigins={viewportObjectOrigins}
          operationOrigins={viewportOperationOrigins}
          sketchOverlays={viewportSketchOverlays}
          editableOriginId={originEditObjectId}
          selectedObjectOriginId={selectedOriginObjectId}
          selectedOperationOriginId={selectedOperationOriginId}
          selectedObjectIds={viewportSelectedObjectIds}
          operationContext={pendingEdgeTreatment || pendingFaceExtrude || pendingShell || pendingRevolve ? viewportTopologyPreviewContext : viewportOperationContext}
          isolatedHistoryObjectId={!editingEdgeTreatmentId && !editingFaceExtrudeId && !editingShellId && !editingRevolveId && selectedOperationTimeline && selectedOperationTimeline.index < selectedOperationTimeline.count - 1 ? selectedOperationTimeline.objectId : null}
          color={document.color}
          projectName={document.name}
          workplane={document.workplane}
          view={view}
          projection={projection}
          renderQuality={renderQuality}
          displayMode={displayMode}
          shadingMode={shadingMode}
          displayUnit={displayUnit}
          locale={locale}
          parameterHandlesVisible={showParameterHandles}
          selection={originEditObjectId || placingWorkplane || editingMirrorPlaneId || selectingTopologyFaces || selectingTopologyEdges ? null : selectedBox}
          snap={snapAmount}
          onOperationModeChange={setSelectedOperationMode}
          onShapeParameterChange={(parameter, value) => {
            if (!selectedOperationId) return;
            mutate((draft) => updateParametricShapeParameter(draft, selectedOperationId, parameter, value));
          }}
          onObjectOriginMove={(objectId, position) => mutate((draft) => moveParametricObjectOrigin(draft, objectId, position))}
          onObjectAxisMove={(objectId, position) => mutate((draft) => {
            const object = draft.objects.find((candidate) => candidate.id === objectId);
            if (object) {
              const previousTransform = structuredClone(object.transform);
              object.transform.position = { ...position };
              transformParametricObjectTopologyHints(draft, objectId, previousTransform);
            }
          })}
          onObjectRotate={(objectId, _axis, deltaDegrees, localAxis) => mutate((draft) => rotateParametricObjectAroundLocalAxis(draft, objectId, localAxis, deltaDegrees))}
          onOperationAxisMove={(featureId, delta) => mutate((draft) => applyParametricSelectionWorldDelta(draft, featureId, "feature", delta))}
          onOperationRotate={(featureId, axis, deltaDegrees) => mutate((draft) => applyParametricSelectionWorkplaneRotation(draft, featureId, "feature", axis, deltaDegrees))}
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
          workplaneFaceSelection={placingWorkplane || Boolean(editingMirrorPlaneId)}
          onWorkplaneFaceSelect={({ origin, normal }) => {
            if (editingMirrorPlaneId) {
              mutate((draft) => {
                const feature = draft.features.find((candidate) => candidate.id === editingMirrorPlaneId);
                if (feature?.kind !== "mirror") return;
                const object = draft.objects.find((candidate) => candidate.id === feature.objectId);
                if (!object) return;
                const objectMatrix = parametricTransformMatrix(object.transform);
                const localOrigin = new THREE.Vector3(origin.x, origin.y, origin.z).applyMatrix4(objectMatrix.clone().invert());
                const localNormal = new THREE.Vector3(normal.x, normal.y, normal.z)
                  .applyMatrix3(new THREE.Matrix3().setFromMatrix4(objectMatrix).transpose())
                  .normalize();
                feature.planeOrigin = { x: localOrigin.x, y: localOrigin.y, z: localOrigin.z };
                feature.planeNormal = { x: localNormal.x, y: localNormal.y, z: localNormal.z };
              });
              setEditingMirrorPlaneId(null);
              setNotice({ type: "ok", text: t("notice.mirrorPlaneSet") });
            } else {
              mutate((draft) => { Object.assign(draft.workplane, parametricWorkplaneFromFace(origin, normal)); });
              setPlacingWorkplane(false);
              setNotice({ type: "ok", text: t("notice.workplanePlaced") });
            }
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
          edgeTreatmentHandle={edgeTreatmentHandle}
          onEdgeTreatmentRadiusChange={(radius) => {
            if (pendingEdgeTreatment) setEdgeTreatmentRadius(radius);
            else if (selectedEdgeTreatmentFeature) updateFeature(selectedEdgeTreatmentFeature.id, (feature) => { if (feature.kind === "fillet") feature.radius = radius; });
          }}
          onEdgeTreatmentTypeChange={(treatment) => {
            if (pendingEdgeTreatment) setPendingEdgeTreatment(treatment);
            else if (selectedEdgeTreatmentFeature) updateFeature(selectedEdgeTreatmentFeature.id, (feature) => { if (feature.kind === "fillet") feature.treatment = treatment; });
          }}
          onEdgeTreatmentAccept={pendingEdgeTreatment ? acceptEdgeTreatment : undefined}
          onEdgeTreatmentCancel={pendingEdgeTreatment ? cancelEdgeTreatment : undefined}
          edgeTreatmentCanAccept={selectedTopologyFaces.length + selectedTopologyEdges.length > 0}
          revolveHandle={revolveHandle}
          onRevolveAngleDragStart={beginTransaction}
          onRevolveAnglePreview={(angle) => {
            if (selectedFeature?.kind !== "revolve") return;
            mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "revolve") feature.angle = angle;
            });
          }}
          onRevolveAngleChange={(angle) => {
            if (selectedFeature?.kind === "revolve") mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "revolve") feature.angle = Math.min(360, Math.max(-360, Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle));
            });
            finishTransaction();
          }}
          onRevolveAngleCancel={cancelTransaction}
          shellHandle={shellHandle}
          onShellThicknessDragStart={beginTransaction}
          onShellThicknessPreview={(thickness) => {
            if (selectedFeature?.kind !== "shell") return;
            mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "shell") feature.thickness = Math.max(0.01, thickness);
            });
          }}
          onShellThicknessChange={(thickness) => {
            if (selectedFeature?.kind === "shell") mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "shell") feature.thickness = Math.max(0.01, thickness);
            });
            finishTransaction();
          }}
          onShellThicknessCancel={cancelTransaction}
          floatingFeature={viewportFloatingFeature}
          onEditSketch={beginSketch}
          onEditEdgeTreatmentSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "fillet") beginEdgeTreatment(feature.treatment, feature.id);
          }}
          onEditFaceExtrudeSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "faceExtrude") beginFaceExtrude(feature.operation, feature.id);
          }}
          onEditShellSelection={(featureId) => beginShell(featureId)}
          onEditRevolveFace={(featureId) => beginRevolve(featureId, "face")}
          onEditRevolveAxis={beginRevolveAxisEdit}
          onEditMirrorPlane={beginMirrorPlaneSelection}
          onFloatingFeatureChange={(featureId, update) => updateFeature(featureId, (feature) => {
            if (feature.kind === "faceExtrude" && update.distance !== undefined) feature.distance = Math.max(0.01, update.distance);
            if (feature.kind === "revolve" && update.angle !== undefined) feature.angle = Math.min(360, Math.max(-360, update.angle));
            if (feature.kind === "shell" && update.thickness !== undefined) feature.thickness = Math.max(0.01, update.thickness);
            if (feature.kind === "mirror" && update.duplicate !== undefined) feature.duplicate = update.duplicate;
          })}
        />}
        {sketchSession ? <aside className="educad-sketch-constraints-panel" aria-label={t("sketch.constraints")}>
          <header>
            <div><strong>{t("sketch.constraints")}</strong><span>{t("sketch.constraintHint")}</span></div>
            <output className={`educad-sketch-constraint-status ${sketchConstraintStatus.kind}`} role="status" aria-live="polite" aria-atomic="true">{sketchConstraintStatus.label}</output>
          </header>
          <section>
            <h2>{t("sketch.geometric")}</h2>
            <div className="educad-sketch-side-tool-grid">
              <SketchSideTool label={t("sketch.horizontal")} enabled={selectedConstraintSegments.length > 0} active={selectedConstraintKind("horizontal")} onClick={() => toggleSketchConstraint("horizontal")}><SketchConstraintIcon file="horizontal" /></SketchSideTool>
              <SketchSideTool label={t("sketch.vertical")} enabled={selectedConstraintSegments.length > 0} active={selectedConstraintKind("vertical")} onClick={() => toggleSketchConstraint("vertical")}><SketchConstraintIcon file="vertical" /></SketchSideTool>
              <SketchSideTool label={t("sketch.parallel")} enabled={Boolean(selectedLinePair)} active={selectedPairConstraintKind("parallel")} onClick={() => toggleSketchPairConstraint("parallel")}><SketchConstraintIcon file="parallel" /></SketchSideTool>
              <SketchSideTool label={t("sketch.perpendicular")} enabled={Boolean(selectedLinePair)} active={selectedPairConstraintKind("perpendicular")} onClick={() => toggleSketchPairConstraint("perpendicular")}><SketchConstraintIcon file="perpendicular" /></SketchSideTool>
              <SketchSideTool label={t("sketch.concentric")} enabled={Boolean(selectedCirclePair)} active={selectedConcentricActive} onClick={toggleSketchConcentric}><SketchConstraintIcon file="concentric" /></SketchSideTool>
              <SketchSideTool label={t("sketch.equal")} enabled={selectedEqualLinePairs.length > 0 || Boolean(selectedCirclePair)} active={selectedEqualActive} onClick={toggleSketchEqual}><SketchConstraintIcon file="equal" /></SketchSideTool>
              <SketchSideTool label={t("sketch.midpoint")} enabled={Boolean(selectedPointLinePair)} active={selectedPointLineActive("midpoint")} onClick={() => toggleSketchPointLineConstraint("midpoint")}><SketchConstraintIcon file="midpoint" /></SketchSideTool>
              <SketchSideTool label={t("sketch.pointOnGeometry")} enabled={Boolean(selectedPointLinePair || selectedPointGeometryConstraint)} active={selectedPointLinePair ? selectedPointLineActive("pointOnObject") : selectedPointGeometryActive} onClick={toggleSketchPointOnGeometry}><SketchConstraintIcon file="point-on-geometry" /></SketchSideTool>
              <SketchSideTool label={t("sketch.tangent")} enabled={Boolean(selectedTangentConstraint)} active={selectedTangentActive} onClick={toggleSketchTangent}><SketchConstraintIcon file="tangent" /></SketchSideTool>
              <SketchSideTool label={t("sketch.symmetry")} enabled={Boolean(selectedSymmetrySet)} active={selectedSymmetryActive} onClick={toggleSketchSymmetry}><SketchConstraintIcon file="symmetry" /></SketchSideTool>
              <SketchSideTool label={t("sketch.coincident")} enabled={selectedConstraintPoints.length >= 2} active={selectedPointsCoincident} onClick={toggleCoincidentSketchPoints}><SketchConstraintIcon file="coincident" /></SketchSideTool>
              <SketchSideTool label={t("sketch.fixPoint")} enabled={selectedConstraintPoints.length > 0} active={selectedPointsFixed} onClick={toggleFixedSketchPoints}><SketchConstraintIcon file="fix-point" /></SketchSideTool>
            </div>
          </section>
          <section>
            <h2>{t("sketch.dimensions")}</h2>
            <div className="educad-sketch-side-tool-grid">
              <SketchSideTool label={t("sketch.distanceX")} enabled={Boolean(selectedDimensionSegment)} active={selectedDimensionActive("x")} onClick={() => toggleSketchDimension("x")}><SketchConstraintIcon file="distance-x" /></SketchSideTool>
              <SketchSideTool label={t("sketch.distanceY")} enabled={Boolean(selectedDimensionSegment)} active={selectedDimensionActive("z")} onClick={() => toggleSketchDimension("z")}><SketchConstraintIcon file="distance-y" /></SketchSideTool>
              <SketchSideTool label={t("sketch.dimensionLength")} enabled={Boolean(selectedDimensionSegment)} active={selectedDimensionActive("aligned")} onClick={() => toggleSketchDimension("aligned")}><SketchConstraintIcon file="length" /></SketchSideTool>
              <SketchSideTool label={t("sketch.radius")} enabled={Boolean(selectedDimensionCircle || selectedDimensionArc)} active={selectedRadiusActive} onClick={toggleSketchRadius}><SketchConstraintIcon file="radius" /></SketchSideTool>
              <SketchSideTool label={t("sketch.diameter")} enabled={Boolean(selectedDimensionCircle || selectedDimensionArc)} active={selectedDiameterActive} onClick={toggleSketchDiameter}><SketchConstraintIcon file="diameter" /></SketchSideTool>
              <SketchSideTool label={t("sketch.angle")} enabled={selectedAngleSegments.length > 0 || Boolean(selectedDimensionArc)} active={selectedDimensionArc ? selectedArcAngleActive : selectedAngleActive} onClick={selectedDimensionArc ? toggleSketchArcAngle : toggleSketchAngle}><SketchConstraintIcon file="angle" /></SketchSideTool>
            </div>
          </section>
        </aside> : null}
        <ViewCube orientation={cameraOrientation} onDirection={(direction, smooth = true) => setView((current) => ({ name: "custom", direction, smooth, token: current.token + 1 }))} />
        {challengeEditor && challengeOpen && !sketchSession ? <ChallengeEditor
          challenge={challengeEditor}
          dock={challengeDock}
          capture={challengeCapture}
          onDockChange={setChallengeDock}
          onCapture={(stepId) => {
            challengeCaptureStepRef.current = stepId;
            setChallengeCaptureToken((current) => current + 1);
          }}
          onCancel={() => onCancelChallengeEdit?.()}
          onSave={(edited) => onSaveChallenge?.(edited, structuredClone(latestDocumentRef.current))}
        /> : null}
        {challenge && challengeOpen && !sketchSession ? <ChallengePlayer challenge={challenge} dock={challengeDock} onDockChange={setChallengeDock} onClose={() => { setChallengeOpen(false); setChallengeDock("left"); }} /> : null}
        {challenge && !challengeOpen && !sketchSession ? <button className="educad-challenge-reopen" type="button" onClick={() => { setChallengeDock("left"); setChallengeOpen(true); }}><Grid3X3 size={19} /> Challenge</button> : null}
        <button data-educad-popup="grid" className={`educad-workplane-settings-button ${workplaneOpen ? "active" : ""}`} aria-label={t("grid.settings")} title={t("grid.title")} onClick={() => { setWorkplaneDraft(document.workplane); setWorkplaneOpen((value) => !value); }}><Grid3X3 size={22} /></button>
        <button
          className={`educad-workplane-snap-button ${document.workplane.snapToGrid ? "active" : ""}`}
          aria-label={document.workplane.snapToGrid ? t("grid.disableSnap") : t("grid.enableSnap")}
          aria-pressed={document.workplane.snapToGrid}
          title={document.workplane.snapToGrid ? t("grid.snapEnabled") : t("grid.snapDisabled")}
          onClick={() => {
            const enabled = !document.workplane.snapToGrid;
            mutate((draft) => { draft.workplane.snapToGrid = enabled; });
            setWorkplaneDraft((current) => ({ ...current, snapToGrid: enabled }));
          }}
        ><Magnet size={21} /></button>
        {workplaneOpen ? <div data-educad-popup="grid" className="educad-workplane-popover">
          <header><div><strong>{t("grid.title")}</strong></div><button type="button" aria-label={t("common.close")} onClick={() => setWorkplaneOpen(false)}><X size={17} /></button></header>
          <label><span>{t("grid.showFloor")}</span><input type="checkbox" checked={workplaneDraft.gridVisible} onChange={(event) => updateGridSettings({ gridVisible: event.target.checked })} /></label>
          <label><span>{t("grid.activeSize")}</span><span className="educad-number-input"><input type="number" min="2" max="100" step="1" defaultValue={workplaneDraft.activeSizePercent} onBlur={(event) => commitGridNumber(event, "activeSizePercent", 2, 100, workplaneDraft.activeSizePercent)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>%</small></span></label>
          <label><span>{t("grid.width")}</span><span className="educad-number-input"><input key={`width-${displayUnit}`} type="number" min={millimetersToDisplayLength(1, displayUnit)} max={millimetersToDisplayLength(2000, displayUnit)} step={millimetersToDisplayLength(1, displayUnit)} defaultValue={millimetersToDisplayLength(workplaneDraft.width, displayUnit)} onBlur={(event) => commitGridNumber(event, "width", 1, 2000, workplaneDraft.width)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{displayUnitLabel(displayUnit)}</small></span></label>
          <label><span>{t("grid.depth")}</span><span className="educad-number-input"><input key={`depth-${displayUnit}`} type="number" min={millimetersToDisplayLength(1, displayUnit)} max={millimetersToDisplayLength(2000, displayUnit)} step={millimetersToDisplayLength(1, displayUnit)} defaultValue={millimetersToDisplayLength(workplaneDraft.depth, displayUnit)} onBlur={(event) => commitGridNumber(event, "depth", 1, 2000, workplaneDraft.depth)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{displayUnitLabel(displayUnit)}</small></span></label>
          <label><span>{t("grid.step")}</span><span className="educad-number-input"><input key={`step-${displayUnit}`} type="number" min={millimetersToDisplayLength(0.1, displayUnit)} max={millimetersToDisplayLength(200, displayUnit)} step={millimetersToDisplayLength(0.1, displayUnit)} defaultValue={millimetersToDisplayLength(workplaneDraft.gridStep, displayUnit)} onBlur={(event) => commitGridNumber(event, "gridStep", 0.1, 200, workplaneDraft.gridStep)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{displayUnitLabel(displayUnit)}</small></span></label>
          <label><span>{t("grid.snapSpacing")}</span><span className="educad-number-input"><input key={`snap-spacing-${displayUnit}`} type="number" min={millimetersToDisplayLength(0.1, displayUnit)} max={millimetersToDisplayLength(200, displayUnit)} step={millimetersToDisplayLength(0.1, displayUnit)} defaultValue={millimetersToDisplayLength(workplaneDraft.snapSpacing, displayUnit)} onBlur={(event) => commitGridNumber(event, "snapSpacing", 0.1, 200, workplaneDraft.snapSpacing)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{displayUnitLabel(displayUnit)}</small></span></label>
        </div> : null}
        <button
          className={`educad-sidebar-mode-control ${modelSidebarMode}`}
          aria-label={modelSidebarMode === "normal" ? t("sidebar.simplify") : modelSidebarMode === "simplified" ? t("sidebar.hide") : t("sidebar.show")}
          title={modelSidebarMode === "normal" ? t("sidebar.visible") : modelSidebarMode === "simplified" ? t("sidebar.simplified") : t("sidebar.hidden")}
          onClick={() => setModelSidebarMode((current) => current === "normal" ? "simplified" : current === "simplified" ? "hidden" : "normal")}
        >
          {modelSidebarMode === "normal" ? <ChevronLeft size={23} /> : modelSidebarMode === "simplified" ? <ChevronDown size={23} /> : <ChevronRight size={23} />}
        </button>
        <div className="camera-controls" aria-label={t("camera.controls")}>
          <button aria-label={t("camera.home")} title={t("camera.home")} onClick={() => setCamera("home")}><Home size={24} /></button>
          <span className="camera-control-separator" aria-hidden="true" />
          <button className={displayMode === "wireframe" ? "active" : ""} aria-label={t("camera.wireframe")} aria-pressed={displayMode === "wireframe"} title={t("camera.wireframe")} onClick={() => setDisplayMode((current) => current === "solid" ? "wireframe" : "solid")}>
            <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Zm0 0v9m8-4.5-8 4.5-8-4.5M12 11v11m-8-4.5 8-4.5 8 4.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" /></svg>
          </button>
          <button aria-label={projection === "orthographic" ? t("camera.perspective") : t("camera.orthographic")} title={projection === "orthographic" ? t("camera.perspective") : t("camera.orthographic")} onClick={() => setProjection((current) => current === "orthographic" ? "perspective" : "orthographic")}>
            {projection === "orthographic" ? <ToolbarPerspectiveIcon /> : <ToolbarOrthographicIcon />}
          </button>
          <span className="camera-control-separator" aria-hidden="true" />
          <button aria-label={t("camera.fit")} title={t("camera.fit")} onClick={() => setCamera("fit")}><Maximize2 size={21} /></button>
          <button aria-label={t("camera.selection")} title={t("camera.selection")} disabled={!selectedBox} onClick={() => setCamera("selection")}><Focus size={21} /></button>
          <button aria-label={t("camera.zoomIn")} title={t("camera.zoomIn")} onClick={() => setCamera("zoom-in")}><Plus size={28} /></button>
          <button aria-label={t("camera.zoomOut")} title={t("camera.zoomOut")} onClick={() => setCamera("zoom-out")}><Minus size={28} /></button>
          <span className="camera-control-separator" aria-hidden="true" />
          <button className={placingWorkplane || hasActiveWorkplane ? "active" : ""} aria-label={hasActiveWorkplane ? t("toolbar.resetWorkplane") : placingWorkplane ? t("toolbar.cancelWorkplane") : t("toolbar.placeWorkplane")} aria-pressed={placingWorkplane || hasActiveWorkplane} title={hasActiveWorkplane ? t("toolbar.resetWorkplane") : placingWorkplane ? t("toolbar.cancelWorkplane") : t("toolbar.placeWorkplane")} onClick={toggleWorkplanePlacement}>{hasActiveWorkplane ? <ToolbarResetWorkplaneIcon /> : <ToolbarWorkplaneIcon />}</button>
        </div>
        {build.warning && <div className="educad-rebuild-error" role="alert" aria-live="assertive" aria-atomic="true"><strong>{t("history.stopped")}</strong><span>{build.warning}</span>{rebuildSuggestion ? <small><b>{t("rebuild.suggestionLabel")}:</b> {rebuildSuggestion}</small> : null}</div>}
        {notice && <div className={`educad-reference-toast ${notice.type}`} role={notice.type === "error" ? "alert" : "status"} aria-live={notice.type === "error" ? "assertive" : "polite"} aria-atomic="true">{notice.text}</div>}
        {modelSidebarMode !== "hidden" ? <ParametricModelSidebar
          document={document}
          selection={modelSelection}
          mode={modelSidebarMode}
          gridStep={document.workplane.gridStep}
          displayUnit={displayUnit}
          locale={locale}
          editingOriginObjectId={originEditObjectId}
          failedFeatureId={build.failedFeatureId}
          onSelectionChange={setModelSelection}
          onReorderSelection={reorderSelection}
          onRenameSelection={renameSelection}
          onResetFeature={resetSelectedFeature}
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
          onEditRevolveAxis={beginRevolveAxisEdit}
          onEditMirrorPlane={beginMirrorPlaneSelection}
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
          <header><div className="top-action-heading"><strong>{t("dialog.exportTitle")}</strong></div><button aria-label={t("common.close")} onClick={() => setExportOpen(false)}><X /></button></header>
          <label className="educad-export-name"><span>{t("dialog.fileName")}</span><input type="text" value={exportFileName} maxLength={120} placeholder="model" onChange={(event) => setExportFileName(event.target.value)} /></label>
          {onSaveShared ? <>
            <button type="button" onClick={() => setSharedSaveOpen(current => !current)} aria-expanded={sharedSaveOpen}>{locale === "es" ? "Guardar en compartidos" : "Save to shared"}</button>
            {sharedSaveOpen ? <form className="educad-editor-share-form" onSubmit={event => { event.preventDefault(); void publishShared(); }}>
              <p>{locale === "es" ? "Guarda una copia en el servidor accesible para todos. Tus cambios locales no se publican automáticamente." : "Save a copy on the server for everyone. Local changes are not published automatically."}</p>
              <label>{locale === "es" ? "Nombre compartido" : "Shared file name"}<input autoFocus value={sharedName} required maxLength={100} pattern={'[^<>:"/\\\\|?*]+'} disabled={sharedSaving} onChange={event => setSharedName(event.target.value)} /></label>
              <label>{locale === "es" ? "Tu nombre" : "Your name"}<input value={sharedAuthor} required maxLength={80} disabled={sharedSaving} onChange={event => setSharedAuthor(event.target.value)} /></label>
              <button type="submit" disabled={sharedSaving || !sharedName.trim() || !sharedAuthor.trim()}>{sharedSaving ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Publicar proyecto" : "Publish project")}</button>
              {sharedSaveMessage ? <p role="status">{sharedSaveMessage}</p> : null}
            </form> : null}
          </> : null}
          <div className="educad-export-options">
            <button onClick={() => void exportProject()} disabled={projectExporting}><span className="export-format-icon">edu</span><strong>{projectExporting ? t("dialog.saving") : t("dialog.projectFormat")}</strong><small>{t("dialog.projectFormatHint")}</small></button>
            <button onClick={() => void exportStep()} disabled={exporting || kernelBusy || !build.mesh}><span className="export-format-icon step">STEP</span><strong>{exporting ? t("dialog.exporting") : t("dialog.stepFormat")}</strong><small>{t("dialog.stepFormatHint")}</small></button>
            <div className="educad-stl-export-option">
              <button onClick={() => void exportStl()} disabled={stlExporting || kernelBusy || build.objectRecords.length === 0}><span className="export-format-icon">STL</span><strong>{stlExporting ? t("dialog.exporting") : t("dialog.stlFormat")}</strong><small>{t("dialog.stlFormatHint")}</small></button>
              <label className="educad-stl-quality"><span>{t("dialog.stlQuality")}: <strong>{t(stlQuality === "low" ? "dialog.qualityLow" : stlQuality === "medium" ? "dialog.qualityMedium" : stlQuality === "high" ? "dialog.qualityHigh" : "dialog.qualityVeryHigh")}</strong></span><input type="range" min={0} max={3} step={1} value={(["low", "medium", "high", "veryHigh"] as const).indexOf(stlQuality)} aria-valuetext={t(stlQuality === "low" ? "dialog.qualityLow" : stlQuality === "medium" ? "dialog.qualityMedium" : stlQuality === "high" ? "dialog.qualityHigh" : "dialog.qualityVeryHigh")} onChange={(event) => setStlQuality((["low", "medium", "high", "veryHigh"] as const)[Number(event.target.value)])} /><span className="educad-stl-quality-labels" aria-hidden="true"><small>{t("dialog.qualityLow")}</small><small>{t("dialog.qualityMedium")}</small><small>{t("dialog.qualityHigh")}</small><small>{t("dialog.qualityVeryHigh")}</small></span></label>
            </div>
          </div>
        </aside>
      )}

      {newDocumentOpen ? (
        <div className="educad-dialog-backdrop" role="presentation" onPointerDown={() => setNewDocumentOpen(false)}>
          <section ref={newDocumentDialogRef} className="educad-new-document-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-new-document-title" aria-describedby="educad-new-document-description" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()}>
            <header><strong id="educad-new-document-title">{t("dialog.newTitle")}</strong><button type="button" aria-label={t("common.cancel")} onClick={() => setNewDocumentOpen(false)}><X size={18} /></button></header>
            <p id="educad-new-document-description">{t("dialog.newWarning")}</p>
            <footer><button type="button" onClick={() => setNewDocumentOpen(false)}>{t("common.cancel")}</button><button type="button" className="danger" onClick={newDocument}>{t("dialog.createNew")}</button><button type="button" className="primary" onClick={openExportFromNewDocumentWarning}>{t("dialog.save")}</button></footer>
          </section>
        </div>
      ) : null}

      {pendingProjectImport ? (
        <div className="educad-dialog-backdrop" role="presentation" onPointerDown={() => setPendingProjectImport(null)}>
          <section ref={importProjectDialogRef} className="educad-new-document-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-import-project-title" aria-describedby="educad-import-project-description" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()}>
            <header><strong id="educad-import-project-title">{t("dialog.importProject")}</strong><button type="button" aria-label={t("common.cancel")} onClick={() => setPendingProjectImport(null)}><X size={18} /></button></header>
            <p id="educad-import-project-description"><strong>{pendingProjectImport.document.name || pendingProjectImport.fileName}</strong> {t("dialog.contains")} {pendingProjectImport.document.objects.length} {t(pendingProjectImport.document.objects.length === 1 ? "dialog.object" : "dialog.objects")}. {t("dialog.importChoice")}</p>
            <footer><button type="button" onClick={() => setPendingProjectImport(null)}>{t("common.cancel")}</button><button type="button" onClick={openPendingProject}>{t("common.open")}</button><button type="button" className="primary" onClick={mergePendingProject}>{t("dialog.addToCurrent")}</button></footer>
          </section>
        </div>
      ) : null}

      {settingsOpen && (
        <aside data-educad-popup="settings" className="top-action-panel educad-settings-panel">
          <header><strong>{t("settings.title")}</strong><button aria-label={t("common.close")} onClick={() => setSettingsOpen(false)}><X /></button></header>
          <label><span>{t("settings.name")}</span><input value={document.name} onFocus={beginTransaction} onBlur={finishTransaction} onChange={(event) => mutate((draft) => { draft.name = event.target.value; })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelTransaction(); event.currentTarget.blur(); } }} /></label>
          <label><span>{t("settings.language")}</span><select value={locale} onChange={(event) => setLocale(event.target.value as EducadLocale)}><option value="es">{t("settings.spanish")}</option><option value="en">{t("settings.english")}</option></select></label>
          <label><span>{t("settings.rendering")}</span><select value={renderQuality} onChange={(event) => setRenderQuality(event.target.value as ViewportRenderQuality)}><option value="normal">{t("settings.renderNormal")}</option><option value="optimized">{t("settings.renderOptimized")}</option></select></label>
          <label><span>{t("settings.shading")}</span><select value={shadingMode} onChange={(event) => setShadingMode(event.target.value as ViewportShadingMode)}><option value="shadows">{t("settings.shadows")}</option><option value="basic">{t("settings.basicShadows")}</option><option value="noShadows">{t("settings.noShadows")}</option></select></label>
          <label><span>{t("settings.units")}</span><select value={displayUnit} onChange={(event) => setDisplayUnit(event.target.value as ParametricDisplayUnit)}><option value="mm">{t("settings.millimeters")}</option><option value="in">{t("settings.inches")}</option></select></label>
          <label className="educad-settings-toggle"><span>{t("settings.showFps")}</span><input type="checkbox" checked={showFps} onChange={(event) => setShowFps(event.target.checked)} /></label>
          <p>{t("settings.autosave")}</p>
        </aside>
      )}

      <input ref={importRef} hidden type="file" accept=".educad,.educad.json,.json,.svg,.step,.stp,.stl,.obj,application/vnd.educad.project+zip,application/json,image/svg+xml,model/step,model/stl,model/obj" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importManagedFile(file); event.target.value = ""; }} />
      <input ref={sketchSvgImportRef} hidden type="file" accept=".svg,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSvgIntoSketch(file); event.target.value = ""; }} />
    </main>
  );
}

function FpsCounter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const update = () => setFps(Math.round(window.educadParametricPerf?.get().fps ?? 0));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, []);
  const tone = fps > 0 && fps < 20 ? "low" : fps < 40 ? "medium" : "high";
  return <output className={`educad-fps-counter ${tone}`} aria-label={`${fps} frames per second`}>{fps} FPS</output>;
}

function BackgroundProcessIndicator({ label, rightOffset, regenerating = false }: { label: string; rightOffset: number; regenerating?: boolean }) {
  return <output className={`educad-background-process ${regenerating ? "regenerating" : ""}`} role="status" aria-live="polite" aria-atomic="true" aria-busy="true" aria-label={label} style={{ right: rightOffset }}><span aria-hidden="true" />{label}</output>;
}

function ToolbarSection({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`toolbar-section ${className}`}><div className="toolbar-section-label">{label}</div><div className="toolbar-section-tools">{children}</div></div>;
}

function Tool({ label, className = "", enabled = true, active, onClick, children }: { label: string; className?: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`toolbar-icon ${className} ${enabled ? "" : "disabled"} ${active ? "active" : ""}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} title={label} disabled={!enabled} onClick={onClick}>{children}</button>;
}

function SketchSideTool({ label, enabled = true, active, onClick, children }: { label: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`educad-sketch-side-tool ${active ? "active" : ""}`} type="button" aria-label={label} aria-pressed={active} disabled={!enabled} title={label} onClick={onClick}><span className="educad-sketch-side-tool-icon">{children}</span></button>;
}

function ViewCube({ orientation, onDirection }: { orientation: CameraOrientation; onDirection: (direction: [number, number, number], smooth?: boolean) => void }) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; azimuth: number; polar: number } | null>(null);
  const draggedRef = useRef(false);
  const [hoveredSurfaceId, setHoveredSurfaceId] = useState<string | null>(null);
  const chooseDirection = (direction: [number, number, number]) => {
    if (!draggedRef.current) onDirection(direction, true);
    draggedRef.current = false;
  };
  type CubePoint = [number, number, number];
  type CubeSurface = { id: string; kind: "face" | "edge" | "corner"; points: CubePoint[]; direction: CubePoint; label?: string; textRight?: CubePoint; textDown?: CubePoint };
  const half = 29;
  const faceHalf = 20;
  const axes = [0, 1, 2] as const;
  const point = (values: Partial<Record<(typeof axes)[number], number>>): CubePoint => [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
  const faceLabels = new Map<string, string>([
    ["0:1", "LEFT"], ["0:-1", "RIGHT"], ["1:1", "TOP"], ["1:-1", "BOTTOM"], ["2:1", "FRONT"], ["2:-1", "BACK"],
  ]);
  const faceTextBasis = (axis: number, sign: number): { textRight: CubePoint; textDown: CubePoint } => {
    if (axis === 0) return { textRight: [0, 0, -sign], textDown: [0, -1, 0] };
    if (axis === 1) return { textRight: [1, 0, 0], textDown: [0, 0, sign] };
    return { textRight: [sign, 0, 0], textDown: [0, -1, 0] };
  };
  const surfaces: CubeSurface[] = [];
  for (const axis of axes) for (const sign of [-1, 1] as const) {
    const [first, second] = axes.filter((candidate) => candidate !== axis);
    surfaces.push({
      id: `face-${axis}-${sign}`,
      kind: "face",
      direction: point({ [axis]: sign }),
      label: faceLabels.get(`${axis}:${sign}`),
      ...faceTextBasis(axis, sign),
      points: [
        point({ [axis]: sign * half, [first]: -faceHalf, [second]: -faceHalf }),
        point({ [axis]: sign * half, [first]: faceHalf, [second]: -faceHalf }),
        point({ [axis]: sign * half, [first]: faceHalf, [second]: faceHalf }),
        point({ [axis]: sign * half, [first]: -faceHalf, [second]: faceHalf }),
      ],
    });
  }
  for (let firstAxis = 0; firstAxis < 3; firstAxis += 1) for (let secondAxis = firstAxis + 1; secondAxis < 3; secondAxis += 1) {
    const lengthAxis = axes.find((axis) => axis !== firstAxis && axis !== secondAxis)!;
    for (const firstSign of [-1, 1] as const) for (const secondSign of [-1, 1] as const) surfaces.push({
      id: `edge-${firstAxis}-${firstSign}-${secondAxis}-${secondSign}`,
      kind: "edge",
      direction: point({ [firstAxis]: firstSign, [secondAxis]: secondSign }),
      points: [
        point({ [firstAxis]: firstSign * half, [secondAxis]: secondSign * faceHalf, [lengthAxis]: -faceHalf }),
        point({ [firstAxis]: firstSign * half, [secondAxis]: secondSign * faceHalf, [lengthAxis]: faceHalf }),
        point({ [firstAxis]: firstSign * faceHalf, [secondAxis]: secondSign * half, [lengthAxis]: faceHalf }),
        point({ [firstAxis]: firstSign * faceHalf, [secondAxis]: secondSign * half, [lengthAxis]: -faceHalf }),
      ],
    });
  }
  for (const x of [-1, 1] as const) for (const y of [-1, 1] as const) for (const z of [-1, 1] as const) surfaces.push({
    id: `corner-${x}-${y}-${z}`,
    kind: "corner",
    direction: [x, y, z],
    points: [[x * half, y * faceHalf, z * faceHalf], [x * faceHalf, y * half, z * faceHalf], [x * faceHalf, y * faceHalf, z * half]],
  });
  const rotate = ([x, logicalY, z]: CubePoint): CubePoint => {
    const y = -logicalY;
    const yaw = -orientation.azimuth;
    const pitch = orientation.polar - Math.PI / 2;
    const yawX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const yawZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [yawX, y * Math.cos(pitch) - yawZ * Math.sin(pitch), y * Math.sin(pitch) + yawZ * Math.cos(pitch)];
  };
  const projectPoint = (source: CubePoint) => {
    const [x, y, z] = rotate(source);
    const perspective = 420 / (420 - z);
    return [41 + x * perspective, 41 + y * perspective] as const;
  };
  const projected = surfaces.filter((surface) => rotate(surface.direction)[2] > 0.001).map((surface) => {
    const transformed = surface.points.map(rotate);
    const points = surface.points.map(projectPoint);
    const center = points.reduce((sum, current) => [sum[0] + current[0] / points.length, sum[1] + current[1] / points.length], [0, 0]);
    const center3d = surface.points.reduce<CubePoint>((sum, current) => [sum[0] + current[0] / surface.points.length, sum[1] + current[1] / surface.points.length, sum[2] + current[2] / surface.points.length], [0, 0, 0]);
    const textTransform = surface.textRight && surface.textDown ? (() => {
      const origin = projectPoint(center3d);
      const right = projectPoint([center3d[0] + surface.textRight![0], center3d[1] + surface.textRight![1], center3d[2] + surface.textRight![2]]);
      const down = projectPoint([center3d[0] + surface.textDown![0], center3d[1] + surface.textDown![1], center3d[2] + surface.textDown![2]]);
      return `matrix(${(right[0] - origin[0]).toFixed(5)} ${(right[1] - origin[1]).toFixed(5)} ${(down[0] - origin[0]).toFixed(5)} ${(down[1] - origin[1]).toFixed(5)} ${origin[0].toFixed(3)} ${origin[1].toFixed(3)})`;
    })() : undefined;
    return { ...surface, points, center, textTransform, depth: transformed.reduce((sum, current) => sum + current[2], 0) / transformed.length };
  }).sort((first, second) => first.depth - second.depth);
  const pointInPolygon = (x: number, y: number, polygon: ReadonlyArray<readonly [number, number]>) => {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [currentX, currentY] = polygon[index];
      const [previousX, previousY] = polygon[previous];
      if ((currentY > y) !== (previousY > y) && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX) inside = !inside;
    }
    return inside;
  };
  const distanceToPolygon = (x: number, y: number, polygon: ReadonlyArray<readonly [number, number]>) => {
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 0; index < polygon.length; index += 1) {
      const [startX, startY] = polygon[index];
      const [endX, endY] = polygon[(index + 1) % polygon.length];
      const dx = endX - startX;
      const dy = endY - startY;
      const lengthSquared = dx * dx + dy * dy;
      const amount = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared)) : 0;
      minimum = Math.min(minimum, Math.hypot(x - (startX + dx * amount), y - (startY + dy * amount)));
    }
    return minimum;
  };
  const surfaceAt = (clientX: number, clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const x = (clientX - bounds.left) * 82 / Math.max(1, bounds.width);
    const y = (clientY - bounds.top) * 82 / Math.max(1, bounds.height);
    const priority = { face: 0, edge: 1, corner: 2 } as const;
    return projected.filter((surface) => pointInPolygon(x, y, surface.points) || (surface.kind !== "face" && distanceToPolygon(x, y, surface.points) <= 1.25))
      .sort((first, second) => priority[second.kind] - priority[first.kind] || second.depth - first.depth)[0] ?? null;
  };
  return <div
    className="view-cube"
    aria-label="Cubo de vistas interactivo"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      setHoveredSurfaceId(surfaceAt(event.clientX, event.clientY, event.currentTarget)?.id ?? null);
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, azimuth: orientation.azimuth, polar: orientation.polar };
      draggedRef.current = false;
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        setHoveredSurfaceId(surfaceAt(event.clientX, event.clientY, event.currentTarget)?.id ?? null);
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      draggedRef.current = true;
      setHoveredSurfaceId(null);
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      const azimuth = drag.azimuth - dx * 0.012;
      const polar = Math.min(Math.PI - 0.03, Math.max(0.03, drag.polar - dy * 0.012));
      onDirection([Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)], false);
    }}
    onPointerUp={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      window.setTimeout(() => { draggedRef.current = false; }, 0);
    }}
    onPointerCancel={() => { dragRef.current = null; draggedRef.current = false; setHoveredSurfaceId(null); }}
    onPointerLeave={() => { if (!dragRef.current) setHoveredSurfaceId(null); }}
    onClick={() => {
      const surface = projected.find((candidate) => candidate.id === hoveredSurfaceId);
      if (surface) chooseDirection(surface.direction);
    }}
  ><svg className="educad-navicube" viewBox="0 0 82 82" role="group" aria-label="View directions">
    {projected.map((surface) => <g key={surface.id} className={`educad-navicube-surface ${surface.kind} ${hoveredSurfaceId === surface.id ? "hovered" : ""}`} pointerEvents="none" role="button" tabIndex={0} aria-label={surface.label ? `${surface.label} view` : `${surface.kind} view ${surface.direction.join(", ")}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseDirection(surface.direction); } }}>
      <polygon points={surface.points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")} />
      {surface.label && surface.textTransform ? <text x={0} y={0} transform={surface.textTransform}>{surface.label}</text> : null}
    </g>)}
  </svg></div>;
}
